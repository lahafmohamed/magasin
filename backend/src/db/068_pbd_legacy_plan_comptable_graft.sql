-- ============================================================
-- 068_pbd_legacy_plan_comptable_graft.sql
-- Graft the canonical 069 columns onto a legacy (019-shaped)
-- plan_comptable before 069 runs its CREATE INDEX / seed INSERT.
--
-- Context: DBs built from the pre-060 fork (pbd_db) carry the 019
-- plan_comptable (id, numero, intitule, type_compte, categorie, actif,
-- created_at) with no `classe`/`niveau`/`compte_parent`. On such DBs
-- 069's CREATE TABLE IF NOT EXISTS is a no-op and its
-- `CREATE INDEX ... ON plan_comptable(classe)` fails. Same converge
-- pattern as 071/090: add the columns idempotently and backfill
-- `classe` from the leading digit of `numero` (OHADA convention).
-- No-op on fresh DBs (table absent => 069 creates the full shape) and
-- on already-canonical DBs (columns already exist).
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'plan_comptable') THEN
    ALTER TABLE plan_comptable ADD COLUMN IF NOT EXISTS classe INTEGER;
    ALTER TABLE plan_comptable ADD COLUMN IF NOT EXISTS niveau INTEGER DEFAULT 1;
    ALTER TABLE plan_comptable ADD COLUMN IF NOT EXISTS compte_parent VARCHAR(8);
    UPDATE plan_comptable
       SET classe = LEFT(numero, 1)::int
     WHERE classe IS NULL
       AND numero ~ '^[1-9]';
  END IF;
END $$;
