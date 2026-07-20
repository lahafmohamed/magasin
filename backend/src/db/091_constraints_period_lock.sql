-- ============================================================
-- 091_constraints_period_lock.sql
-- PLAN.md Sprint-2 P1 DB remainder:
--   A. Quantity/price CHECKs on the remaining line tables (document_lignes
--      already has quantite > 0; add retour_lignes / commande_lignes qty and
--      a document_lignes prix_unitaire >= 0). Negative/zero lines silently
--      corrupt document totals and stock math.
--   B. Extend the closed-period lock from INSERT-only to INSERT/UPDATE/DELETE
--      so a closed accounting period cannot be mutated by psql or future code
--      (075 only guarded INSERT — the app never UPDATE/DELETEs ledger rows,
--      but the DB guarantee should not depend on that).
--
-- Guarded: each CHECK is added only when the existing data satisfies it.
-- ============================================================

-- ------------------------------------------------------------
-- A. Line-quantity / price CHECKs
-- ------------------------------------------------------------
DO $$
DECLARE
  v_bad BOOLEAN;
BEGIN
  -- retour_lignes.quantite > 0
  IF to_regclass('retour_lignes') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_retour_lignes_qte_pos') THEN
    SELECT EXISTS (SELECT 1 FROM retour_lignes WHERE quantite <= 0) INTO v_bad;
    IF v_bad THEN
      RAISE NOTICE '091A: retour_lignes has quantite <= 0 rows - CHECK skipped.';
    ELSE
      ALTER TABLE retour_lignes ADD CONSTRAINT chk_retour_lignes_qte_pos CHECK (quantite > 0);
    END IF;
  END IF;

  -- commande_lignes.quantite > 0
  IF to_regclass('commande_lignes') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_commande_lignes_qte_pos') THEN
    SELECT EXISTS (SELECT 1 FROM commande_lignes WHERE quantite <= 0) INTO v_bad;
    IF v_bad THEN
      RAISE NOTICE '091A: commande_lignes has quantite <= 0 rows - CHECK skipped.';
    ELSE
      ALTER TABLE commande_lignes ADD CONSTRAINT chk_commande_lignes_qte_pos CHECK (quantite > 0);
    END IF;
  END IF;

  -- document_lignes.prix_unitaire >= 0 (quantite > 0 already exists)
  IF to_regclass('document_lignes') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_document_lignes_prix_pos') THEN
    SELECT EXISTS (SELECT 1 FROM document_lignes WHERE prix_unitaire < 0) INTO v_bad;
    IF v_bad THEN
      RAISE NOTICE '091A: document_lignes has prix_unitaire < 0 rows - CHECK skipped.';
    ELSE
      ALTER TABLE document_lignes ADD CONSTRAINT chk_document_lignes_prix_pos CHECK (prix_unitaire >= 0);
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- B. Period lock on INSERT / UPDATE / DELETE
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION assert_ecriture_period_open()
RETURNS TRIGGER AS $$
DECLARE
  v_statut TEXT;
  v_month  INT;
  v_year   INT;
BEGIN
  -- Check the NEW period (INSERT / UPDATE target) and the OLD period
  -- (UPDATE source / DELETE) — a closed period blocks both moving in and
  -- mutating/removing an existing posting.
  FOR v_year, v_month IN
    SELECT DISTINCT EXTRACT(YEAR FROM d)::int, EXTRACT(MONTH FROM d)::int
    FROM (VALUES
      (CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN NEW.date_ecriture END),
      (CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN OLD.date_ecriture END)
    ) AS v(d)
    WHERE d IS NOT NULL
  LOOP
    SELECT statut INTO v_statut
    FROM periodes_comptables
    WHERE exercice = v_year AND periode = v_month;

    IF v_statut = 'fermee' THEN
      RAISE EXCEPTION 'Periode comptable %/% est cloturee. Aucune ecriture autorisee.',
        LPAD(v_month::text, 2, '0'), v_year
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ecriture_period_lock ON ecritures_comptables;
CREATE TRIGGER trg_ecriture_period_lock
  BEFORE INSERT OR UPDATE OR DELETE ON ecritures_comptables
  FOR EACH ROW
  EXECUTE FUNCTION assert_ecriture_period_open();
