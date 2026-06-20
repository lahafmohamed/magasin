-- 073: Drop the legacy stock-movement logging trigger.
-- `log_produits_stock` (002_mouvements_stock.sql) fires AFTER UPDATE ON produits and
-- inserts an 'ajustement' movement whenever produits.stock changes. Since migration 020,
-- produits.stock is auto-synced by trg_sync_produits_stock on every stock_par_location
-- change, while ReceptionService/StockTransferService/ProduitService already insert their
-- own explicit, per-location mouvements_stock rows. The legacy trigger therefore produced
-- DUPLICATE movements with aggregate (not per-location) stock_avant/apres. Remove it.
DROP TRIGGER IF EXISTS log_produits_stock ON produits;
-- Keep the function in case other code references it; drop only if unused.
DROP FUNCTION IF EXISTS log_mouvement_stock();
