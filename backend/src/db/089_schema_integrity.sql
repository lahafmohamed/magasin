-- ============================================================
-- 089_schema_integrity.sql
-- Schema-integrity hardening pass (2026-07-19 audit, PLAN.md P0/P1 DB items):
--
--  A. Financial FKs: ON DELETE CASCADE -> RESTRICT so a hard delete of a
--     facture / tiers / produit / session can never silently destroy payment,
--     acompte, ledger, or stock-audit history. Also collapses the duplicate
--     session FK on mouvements_caisse (two constraints on the same column).
--  B. Recreate commissions_ventes: dropped by 043's rebuild and never
--     recreated, yet EmployeService/PayrollService still read/write it.
--     facture_id is RESTRICT here (was CASCADE in 019) - commissions are
--     payroll inputs and must not vanish with an invoice.
--  C. ecritures_comptables hardening: NOT NULL + >= 0 on debit/credit,
--     single-side CHECK, journal CHECK (071 dropped the legacy one on some
--     DBs), drop the duplicate compte_numero FK left by 079.
--  D. montant > 0 CHECKs on the money tables that lack them (pattern already
--     used by depenses / compensations / acompte_applications).
--  E. NOT NULL on mouvements_caisse.type/categorie and
--     sessions_caisse.magasin_id (backfilled by 046/045; CHECK passes NULL).
--  F. Missing hot-path indexes (predicates verified against services), and
--     drop of 023's misplaced idx_sessions_caisse_id (created on caisses -
--     an exact duplicate of idx_caisses_parent - instead of sessions_caisse).
--  G. Track the out-of-band fuzzy-search objects (backend/migrations/
--     002_fuzzy_search.sql): pg_trgm + GIN indexes, so a fresh DB does not
--     silently degrade ProduitService.searchFuzzy to ILIKE.
--  H. Drop orphan plpgsql functions whose tables/triggers are long gone.
--
-- Every step is guarded: presence-checked and data-checked, with a NOTICE
-- (not a failure) when a constraint would not hold, so the file is safe on
-- both the legacy-baselined live DB and any freshly migrated one.
-- ============================================================

-- ------------------------------------------------------------
-- A. Re-point financial FKs to ON DELETE RESTRICT
-- ------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  c RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('paiements',             'facture_id',        'factures'),
      ('paiements_fournisseur', 'facture_id',        'factures_fournisseur'),
      ('acomptes_clients',      'tiers_id',          'tiers'),
      ('acomptes_fournisseur',  'tiers_id',          'tiers'),
      ('compte_client_lignes',  'tiers_id',          'tiers'),
      ('mouvements_stock',      'produit_id',        'produits'),
      ('mouvements_caisse',     'session_caisse_id', 'sessions_caisse')
    ) AS v(tbl, col, ref)
  LOOP
    IF to_regclass(r.tbl) IS NULL THEN
      RAISE NOTICE '089A: table % absent, skipped.', r.tbl;
      CONTINUE;
    END IF;

    -- Drop EVERY existing FK on (tbl.col) - this also collapses the
    -- duplicate fk_mouvements_caisse_session / mouvements_caisse_session_id_fkey pair.
    FOR c IN
      SELECT con.conname
      FROM pg_constraint con
      WHERE con.conrelid = r.tbl::regclass
        AND con.contype = 'f'
        AND con.conkey = ARRAY[(
          SELECT a.attnum FROM pg_attribute a
          WHERE a.attrelid = r.tbl::regclass AND a.attname = r.col
        )]::smallint[]
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.tbl, c.conname);
    END LOOP;

    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(id) ON DELETE RESTRICT',
      r.tbl, 'fk_' || r.tbl || '_' || r.col, r.col, r.ref
    );
    RAISE NOTICE '089A: %.% -> %(id) ON DELETE RESTRICT.', r.tbl, r.col, r.ref;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- B. Recreate commissions_ventes (dropped in 043, still used by HR/payroll)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commissions_ventes (
  id SERIAL PRIMARY KEY,
  employe_id INTEGER NOT NULL REFERENCES employes(id) ON DELETE RESTRICT,
  facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE RESTRICT,
  montant_vente NUMERIC(15, 2) NOT NULL,
  taux_commission NUMERIC(5, 2) NOT NULL,
  montant_commission NUMERIC(15, 2) NOT NULL,
  date_vente DATE NOT NULL,
  statut VARCHAR(20) DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'validee', 'payee')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_commissions_employe ON commissions_ventes(employe_id);
CREATE INDEX IF NOT EXISTS idx_commissions_facture ON commissions_ventes(facture_id);
CREATE INDEX IF NOT EXISTS idx_commissions_date ON commissions_ventes(date_vente);

-- ------------------------------------------------------------
-- C. ecritures_comptables hardening
-- ------------------------------------------------------------
DO $$
DECLARE
  v_bad BIGINT;
BEGIN
  -- C1. Duplicate compte_numero FK: 079 added fk_ecritures_compte_numero even
  -- where ecritures_comptables_compte_numero_fkey already existed. Keep 079's.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ecritures_compte_numero')
     AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ecritures_comptables_compte_numero_fkey') THEN
    ALTER TABLE ecritures_comptables DROP CONSTRAINT ecritures_comptables_compte_numero_fkey;
    RAISE NOTICE '089C: dropped duplicate FK ecritures_comptables_compte_numero_fkey.';
  END IF;

  -- C2. NOT NULL debit/credit (only when data is clean).
  SELECT COUNT(*) INTO v_bad FROM ecritures_comptables WHERE debit IS NULL OR credit IS NULL;
  IF v_bad = 0 THEN
    ALTER TABLE ecritures_comptables ALTER COLUMN debit SET NOT NULL;
    ALTER TABLE ecritures_comptables ALTER COLUMN credit SET NOT NULL;
    ALTER TABLE ecritures_comptables ALTER COLUMN debit SET DEFAULT 0;
    ALTER TABLE ecritures_comptables ALTER COLUMN credit SET DEFAULT 0;
  ELSE
    RAISE NOTICE '089C: % ecritures with NULL debit/credit - NOT NULL skipped; backfill then re-apply.', v_bad;
  END IF;

  -- C3. debit >= 0 / credit >= 0 (present on the legacy-baselined DB, absent on a fresh 069 build).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'ecritures_comptables'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%debit%>=%'
  ) THEN
    SELECT COUNT(*) INTO v_bad FROM ecritures_comptables WHERE debit < 0 OR credit < 0;
    IF v_bad = 0 THEN
      ALTER TABLE ecritures_comptables ADD CONSTRAINT chk_ecritures_montants_pos CHECK (debit >= 0 AND credit >= 0);
    ELSE
      RAISE NOTICE '089C: % ecritures with negative amounts - CHECK skipped.', v_bad;
    END IF;
  END IF;

  -- C4. A leg is debit XOR credit, never both.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ecritures_single_side') THEN
    SELECT COUNT(*) INTO v_bad FROM ecritures_comptables WHERE debit > 0 AND credit > 0;
    IF v_bad = 0 THEN
      ALTER TABLE ecritures_comptables ADD CONSTRAINT chk_ecritures_single_side CHECK (NOT (debit > 0 AND credit > 0));
    ELSE
      RAISE NOTICE '089C: % ecritures with both debit and credit > 0 - single-side CHECK skipped.', v_bad;
    END IF;
  END IF;

  -- C5. Journal CHECK (071 dropped the legacy one without re-adding on some DBs).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'ecritures_comptables'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%journal%'
  ) THEN
    SELECT COUNT(*) INTO v_bad FROM ecritures_comptables
    WHERE journal IS NOT NULL AND journal NOT IN ('ACHATS', 'VENTES', 'TRESORERIE', 'OD');
    IF v_bad = 0 THEN
      ALTER TABLE ecritures_comptables ADD CONSTRAINT chk_ecritures_journal
        CHECK (journal IN ('ACHATS', 'VENTES', 'TRESORERIE', 'OD'));
    ELSE
      RAISE NOTICE '089C: % ecritures with out-of-set journal values - journal CHECK skipped.', v_bad;
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- D. montant > 0 CHECKs on money tables
-- ------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  v_bad BOOLEAN;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'paiements', 'paiements_fournisseur', 'acomptes_clients', 'acomptes_fournisseur', 'mouvements_caisse'
  ] LOOP
    IF to_regclass(t) IS NULL THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_' || t || '_montant_pos') THEN CONTINUE; END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE montant <= 0)', t) INTO v_bad;
    IF v_bad THEN
      RAISE NOTICE '089D: % has montant <= 0 rows - CHECK skipped; clean up then re-apply.', t;
    ELSE
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (montant > 0)', t, 'chk_' || t || '_montant_pos');
      RAISE NOTICE '089D: CHECK (montant > 0) added on %.', t;
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- E. NOT NULL on backfilled caisse columns
-- ------------------------------------------------------------
DO $$
DECLARE
  v_bad BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_bad FROM mouvements_caisse WHERE type IS NULL OR categorie IS NULL;
  IF v_bad = 0 THEN
    ALTER TABLE mouvements_caisse ALTER COLUMN type SET NOT NULL;
    ALTER TABLE mouvements_caisse ALTER COLUMN categorie SET NOT NULL;
  ELSE
    RAISE NOTICE '089E: % mouvements_caisse with NULL type/categorie - NOT NULL skipped.', v_bad;
  END IF;

  SELECT COUNT(*) INTO v_bad FROM sessions_caisse WHERE magasin_id IS NULL;
  IF v_bad = 0 THEN
    ALTER TABLE sessions_caisse ALTER COLUMN magasin_id SET NOT NULL;
  ELSE
    RAISE NOTICE '089E: % sessions_caisse with NULL magasin_id - NOT NULL skipped (one-open-session index stays bypassable for those rows).', v_bad;
  END IF;
END $$;

-- ------------------------------------------------------------
-- F. Missing hot-path indexes
-- ------------------------------------------------------------
-- Grand livre by tiers (ComptabiliteService filters ecritures on tiers_id)
CREATE INDEX IF NOT EXISTS idx_ecritures_tiers ON ecritures_comptables(tiers_id) WHERE tiers_id IS NOT NULL;
-- Supplier-invoice list ORDER BY (043's rebuild voided 019's idx_ff_date)
CREATE INDEX IF NOT EXISTS idx_ff_date ON factures_fournisseur(date_facture DESC);
-- Session-scoped payment lookups (043's rebuild voided 024_link's index on some DBs)
CREATE INDEX IF NOT EXISTS idx_paiements_session ON paiements(session_caisse_id);
CREATE INDEX IF NOT EXISTS idx_acomptes_session ON acomptes_clients(session_caisse_id);
-- Anti-over-return check sums retour_lignes per (facture, produit)
CREATE INDEX IF NOT EXISTS idx_retour_lignes_facture_produit ON retour_lignes(facture_id, produit_id);
-- RESTRICT checks on produit delete + reorder joins
CREATE INDEX IF NOT EXISTS idx_commande_lignes_produit ON commande_lignes(produit_id);
-- Acompte FIFO reset touches facture_id_applique
CREATE INDEX IF NOT EXISTS idx_acomptes_facture_applique ON acomptes_clients(facture_id_applique);
-- 023 created idx_sessions_caisse_id on the WRONG table (caisses - exact dup of
-- idx_caisses_parent); drop it and index what it was meant to cover.
DROP INDEX IF EXISTS idx_sessions_caisse_id;
CREATE INDEX IF NOT EXISTS idx_sessions_caisse_caisse ON sessions_caisse(caisse_id);

-- ------------------------------------------------------------
-- G. Track fuzzy-search objects (formerly out-of-band db:fuzzy-search)
-- ------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '089G: no privilege to CREATE EXTENSION pg_trgm - fuzzy search will use the ILIKE fallback until a superuser installs it.';
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS idx_produits_nom_trgm ON produits USING gin (nom gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_produits_reference_trgm ON produits USING gin (reference gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_produits_description_trgm ON produits USING gin (COALESCE(description, '') gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_produits_categorie_trgm ON produits USING gin (COALESCE(categorie, '') gin_trgm_ops);
  END IF;
END $$;

-- ------------------------------------------------------------
-- H. Drop orphan functions (tables/triggers long gone)
-- ------------------------------------------------------------
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'expire_old_lots',            -- references lots, dropped in 085
        'update_client_solde',        -- its trigger died with 043's clients drop
        'log_mouvement_stock',        -- its trigger dropped in 073
        'rollback_fifo_allocation',   -- superseded by tiers-shaped FIFO (043)
        'check_allocation_consistency'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', f.sig);
    RAISE NOTICE '089H: dropped orphan function %.', f.sig;
  END LOOP;
END $$;
