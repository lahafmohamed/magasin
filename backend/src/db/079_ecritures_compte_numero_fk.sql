-- ============================================================
-- 079_ecritures_compte_numero_fk.sql
-- Add the foreign key ecritures_comptables.compte_numero -> plan_comptable(numero)
-- that 071 deliberately deferred until the data was known clean.
--
-- Guarded: only adds the FK if there are NO orphan compte_numero values (an écriture
-- referencing an account absent from plan_comptable). If orphans exist the migration
-- logs a NOTICE listing them and skips the FK rather than failing the whole run, so
-- the chart of accounts can be reconciled first and the migration re-run safely.
-- ============================================================

DO $$
DECLARE
  v_orphans INTEGER;
  v_has_fk  INTEGER;
BEGIN
  -- Already present? nothing to do.
  SELECT COUNT(*) INTO v_has_fk
  FROM pg_constraint
  WHERE conname = 'fk_ecritures_compte_numero';
  IF v_has_fk > 0 THEN
    RAISE NOTICE '079: FK fk_ecritures_compte_numero already exists, skipping.';
    RETURN;
  END IF;

  -- A unique/PK on plan_comptable.numero is required to reference it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'plan_comptable'
      AND c.contype IN ('p', 'u')
      AND (SELECT array_agg(a.attname::text)
           FROM unnest(c.conkey) k
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k) = ARRAY['numero']::text[]
  ) THEN
    BEGIN
      ALTER TABLE plan_comptable ADD CONSTRAINT uq_plan_comptable_numero UNIQUE (numero);
    EXCEPTION WHEN duplicate_table OR unique_violation THEN
      RAISE NOTICE '079: could not add UNIQUE(numero) on plan_comptable; skipping FK.';
      RETURN;
    END;
  END IF;

  SELECT COUNT(*) INTO v_orphans
  FROM ecritures_comptables e
  WHERE e.compte_numero IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM plan_comptable p WHERE p.numero = e.compte_numero);

  IF v_orphans > 0 THEN
    RAISE NOTICE '079: % orphan compte_numero value(s) in ecritures_comptables not in plan_comptable. FK skipped; reconcile then re-run.', v_orphans;
    RETURN;
  END IF;

  ALTER TABLE ecritures_comptables
    ADD CONSTRAINT fk_ecritures_compte_numero
    FOREIGN KEY (compte_numero) REFERENCES plan_comptable(numero);

  RAISE NOTICE '079: FK fk_ecritures_compte_numero added.';
END $$;
