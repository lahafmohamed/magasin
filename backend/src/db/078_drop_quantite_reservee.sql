-- ============================================================
-- 078_drop_quantite_reservee.sql
-- Remove the half-built stock-reservation concept. quantite_reservee was added
-- (020/059) and read in a few queries but NEVER written by any code path, so
-- "quantite_disponible = quantite - quantite_reservee" was always just quantite.
-- The reads have been updated to use quantite directly; drop the dead column.
-- ============================================================

ALTER TABLE stock_par_location DROP COLUMN IF EXISTS quantite_reservee;
