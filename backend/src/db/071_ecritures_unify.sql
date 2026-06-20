-- ============================================================
-- 071_ecritures_unify.sql
-- Converge ecritures_comptables to the canonical 069 schema.
--
-- Context: ecritures_comptables was created TWICE with conflicting
-- columns (019_erp_modules.sql = legacy compte_id/ligne_numero/description,
-- 069_plan_comptable.sql = canonical compte_numero/libelle/...).
-- On a fresh DB migrations run in numeric order, so 019 creates the
-- table first => the LEGACY schema is what physically exists at runtime.
-- This migration idempotently grafts the 069 columns onto whatever is
-- there, backfills from the legacy columns, relaxes the legacy NOT NULL /
-- CHECK constraints so new 069-style inserts succeed, and keeps the legacy
-- columns in place for safety / rollback (they are NOT dropped).
--
-- VAT is being removed system-wide (business is VAT-exempt): no tax
-- accounts are touched here.
-- ============================================================

-- 0. plan_comptable(numero) must be UNIQUE so it can be referenced by
--    compte_numero. 019 already declares `numero VARCHAR(20) UNIQUE NOT NULL`
--    and 069 declares `numero VARCHAR(8) NOT NULL UNIQUE`; add it defensively
--    in case an older variant is present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'plan_comptable'
      AND c.contype IN ('u', 'p')
      AND pg_get_constraintdef(c.oid) ILIKE '%(numero)%'
  ) THEN
    BEGIN
      ALTER TABLE plan_comptable ADD CONSTRAINT plan_comptable_numero_key UNIQUE (numero);
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN
      -- constraint already present under another name
      NULL;
    END;
  END IF;
END $$;

-- 1. Add the canonical 069 columns if missing (idempotent).
ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS compte_numero  VARCHAR(8);
ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS tiers_id       INTEGER;
ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS libelle        TEXT;
ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50);
ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS reference_id   INTEGER;
ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS a_lettrer      BOOLEAN DEFAULT false;
ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS lettrage       VARCHAR(50);
ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS date_saisie    TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS cree_par       INTEGER;

-- tiers_id FK -> tiers(id). Guard the ADD so re-running is safe and so it is
-- skipped if the tiers table is absent in a given environment.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'tiers')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname = 'ecritures_comptables'
         AND c.conname = 'ecritures_comptables_tiers_id_fkey'
     ) THEN
    ALTER TABLE ecritures_comptables
      ADD CONSTRAINT ecritures_comptables_tiers_id_fkey
      FOREIGN KEY (tiers_id) REFERENCES tiers(id);
  END IF;
END $$;

-- cree_par FK -> utilisateurs(id).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'utilisateurs')
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname = 'ecritures_comptables'
         AND c.conname = 'ecritures_comptables_cree_par_fkey'
     ) THEN
    ALTER TABLE ecritures_comptables
      ADD CONSTRAINT ecritures_comptables_cree_par_fkey
      FOREIGN KEY (cree_par) REFERENCES utilisateurs(id);
  END IF;
END $$;

-- 2. Backfill the new columns from the legacy ones.
--    Each block is guarded so it is a no-op if the legacy column is absent
--    (e.g. on a DB that was created straight from the 069 schema).

-- 2a. compte_numero from legacy compte_id via plan_comptable.id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'ecritures_comptables' AND column_name = 'compte_id') THEN
    UPDATE ecritures_comptables ec
       SET compte_numero = pc.numero
      FROM plan_comptable pc
     WHERE ec.compte_id = pc.id
       AND ec.compte_numero IS NULL;
  END IF;
END $$;

-- 2b. libelle from legacy description
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'ecritures_comptables' AND column_name = 'description') THEN
    UPDATE ecritures_comptables
       SET libelle = description
     WHERE libelle IS NULL
       AND description IS NOT NULL;
  END IF;
END $$;

-- 2c. reference_type from legacy piece_type
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'ecritures_comptables' AND column_name = 'piece_type') THEN
    UPDATE ecritures_comptables
       SET reference_type = piece_type
     WHERE reference_type IS NULL
       AND piece_type IS NOT NULL;
  END IF;
END $$;

-- 2d. reference_id from legacy piece_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'ecritures_comptables' AND column_name = 'piece_id') THEN
    UPDATE ecritures_comptables
       SET reference_id = piece_id
     WHERE reference_id IS NULL
       AND piece_id IS NOT NULL;
  END IF;
END $$;

-- 3. Relax legacy NOT NULL columns so new 069-style inserts (which omit
--    compte_id and ligne_numero) succeed. Columns are kept, not dropped.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'ecritures_comptables' AND column_name = 'compte_id') THEN
    ALTER TABLE ecritures_comptables ALTER COLUMN compte_id DROP NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'ecritures_comptables' AND column_name = 'ligne_numero') THEN
    ALTER TABLE ecritures_comptables ALTER COLUMN ligne_numero DROP NOT NULL;
  END IF;
END $$;

-- 4. Drop the restrictive journal CHECK constraint from the legacy schema
--    (CHECK (journal IN ('ACHATS','VENTES','TRESORERIE','OD'))) so the new
--    journal codes ('VE','AC','OD','BQ','VT', etc.) all work. Found
--    dynamically: any CHECK constraint on ecritures_comptables whose
--    definition references the `journal` column. No new CHECK is re-added
--    (journal stays free-form VARCHAR).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'ecritures_comptables'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%journal%'
  LOOP
    EXECUTE format('ALTER TABLE ecritures_comptables DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- 5. Index on compte_numero (mirrors 069's idx_ecritures_compte). We add an
--    index rather than an FK on compte_numero, because on a partially
--    backfilled / dirty DB an FK could fail to validate. Adding the FK is
--    deferred until all rows are guaranteed backfilled (see note below).
CREATE INDEX IF NOT EXISTS idx_ecritures_compte_numero ON ecritures_comptables(compte_numero);

-- NOTE (intentionally skipped, run manually once data is verified clean):
--   ALTER TABLE ecritures_comptables
--     ADD CONSTRAINT ecritures_comptables_compte_numero_fkey
--     FOREIGN KEY (compte_numero) REFERENCES plan_comptable(numero);
-- Only add this after confirming every existing row has a non-null
-- compte_numero that exists in plan_comptable.
