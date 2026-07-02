-- ============================================================
-- 085_drop_dead_lot_serial_tables.sql
-- Remove the dead batch/lot + serial-number tracking schema. The API
-- routes/services were removed on 2026-06-30 and no UI was ever wired; both
-- tables have been empty. This drops the tables and the now-orphaned FK
-- columns that pointed at them.
--
-- Order: drop referencing FK columns first, then numeros_serie (which FKs
-- lots), then lots.
-- ============================================================

ALTER TABLE mouvements_stock DROP COLUMN IF EXISTS lot_id;
ALTER TABLE mouvements_stock DROP COLUMN IF EXISTS numero_serie_id;
ALTER TABLE reception_lignes  DROP COLUMN IF EXISTS lot_id;

DROP TABLE IF EXISTS numeros_serie;
DROP TABLE IF EXISTS lots;
