-- ============================================================
-- 068_z_legacy_ecritures_graft.sql
-- Companion to 068_pbd_legacy_plan_comptable_graft: graft the
-- canonical 069 columns onto a legacy (019-shaped)
-- ecritures_comptables before 069 runs its CREATE INDEX statements
-- (compte_numero, reference_type/reference_id).
--
-- 071_ecritures_unify does the full backfill + FKs later; here we only
-- add the bare columns so 069 can index them. Same converge pattern as
-- 070/090. No-op on fresh DBs (table absent => 069 creates the full
-- shape) and on already-canonical DBs (columns already exist).
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'ecritures_comptables') THEN
    ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS compte_numero  VARCHAR(8);
    ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS tiers_id       INTEGER;
    ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS libelle        TEXT;
    ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50);
    ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS reference_id   INTEGER;
    ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS a_lettrer      BOOLEAN DEFAULT FALSE;
    ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS lettrage       VARCHAR(50);
    ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS date_saisie    TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE ecritures_comptables ADD COLUMN IF NOT EXISTS cree_par       INTEGER;
  END IF;
END $$;
