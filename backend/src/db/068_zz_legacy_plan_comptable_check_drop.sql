-- ============================================================
-- 068_zz_legacy_plan_comptable_check_drop.sql
-- Final pre-069 legacy graft: drop the 019-era CHECK on
-- plan_comptable.type_compte.
--
-- The canonical 069 table declares type_compte as a free
-- VARCHAR(30); the legacy CHECK does not admit the account types the
-- 069/086 seeds insert ('hors_bilan', ...), so the seed INSERT fails
-- on pre-060 forked DBs. Found dynamically, same pattern as 071's
-- journal CHECK drop. No-op when the table or constraint is absent.
-- ============================================================

DO $$
DECLARE c RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'plan_comptable') THEN
    FOR c IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'plan_comptable'
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) ILIKE '%type_compte%'
    LOOP
      EXECUTE format('ALTER TABLE plan_comptable DROP CONSTRAINT %I', c.conname);
    END LOOP;
  END IF;
END $$;
