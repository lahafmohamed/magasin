-- ============================================================
-- 084_z_drop_legacy_serial_lot_views.sql
-- Pre-060 forked DBs (pbd_db) still carry 016/017-era views over the
-- dead batch/serial tables (articles_sous_garantie, lots_perimes, ...),
-- which block 085's plain DROP TABLE of numeros_serie / lots. Drop any
-- view depending on those two tables, found via pg_depend rather than
-- by name. No-op when the tables (or views) are already gone.
-- ============================================================

DO $$
DECLARE v RECORD;
BEGIN
  FOR v IN
    SELECT DISTINCT dependent.relname
    FROM pg_depend d
    JOIN pg_rewrite r ON r.oid = d.objid
    JOIN pg_class dependent ON dependent.oid = r.ev_class
    WHERE d.refobjid IN (SELECT oid FROM pg_class
                         WHERE relname IN ('numeros_serie', 'lots'))
      AND dependent.relkind = 'v'
  LOOP
    EXECUTE format('DROP VIEW IF EXISTS %I CASCADE', v.relname);
  END LOOP;
END $$;
