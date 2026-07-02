-- ============================================================
-- 087_relax_legacy_ecriture_columns.sql
-- Completes the intent of 071_ecritures_unify on installs where the chart of
-- accounts was built by the legacy setup scripts (schema_migrations was empty,
-- so 071 was baselined-as-applied without actually running its ALTERs).
--
-- The canonical write path since 069/072 uses `compte_numero` and does NOT
-- populate the legacy `compte_id` / `ligne_numero` columns (see the 072 trigger
-- and ComptabiliteService / GeneralLedgerService / CaisseMagasinService inserts).
-- If those columns are still NOT NULL (stale 019 constraint), every such insert
-- fails. Drop the NOT NULL so the unified schema is self-consistent. Idempotent.
-- ============================================================

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
