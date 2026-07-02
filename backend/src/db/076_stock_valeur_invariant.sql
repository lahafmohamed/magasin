-- ============================================================
-- 076_stock_valeur_invariant.sql
-- Make stock_par_location.valeur_stock a maintained invariant:
--
--     valeur_stock = ROUND(quantite * cmp, 2)
--
-- Previously valeur_stock and cmp were only updated by ReceptionService on
-- goods receipt, so valeur_stock drifted on every sale / transfer / adjustment
-- (quantite changed, valeur_stock did not). Three readers then computed stock
-- value three different ways. With this trigger, ANY change to quantite or cmp
-- recomputes valeur_stock, so it is always correct under weighted-average costing
-- (removing units at CMP leaves CMP unchanged and reduces value proportionally).
--
-- ReceptionService still owns the weighted-average CMP recompute on receipt; it
-- sets the new cmp and the trigger derives the matching valeur_stock.
-- ============================================================

-- 1. Backfill cmp from produits.prix_achat where it was never set (legacy rows).
UPDATE stock_par_location spl
SET cmp = p.prix_achat
FROM produits p
WHERE spl.produit_id = p.id
  AND (spl.cmp IS NULL OR spl.cmp = 0)
  AND p.prix_achat IS NOT NULL
  AND p.prix_achat > 0;

-- 2. Backfill valeur_stock to the invariant for every existing row.
UPDATE stock_par_location
SET valeur_stock = ROUND(quantite * COALESCE(cmp, 0), 2);

-- 3. Enforce the invariant on every future insert/update.
CREATE OR REPLACE FUNCTION enforce_stock_valeur_invariant()
RETURNS TRIGGER AS $$
BEGIN
  NEW.valeur_stock := ROUND(COALESCE(NEW.quantite, 0) * COALESCE(NEW.cmp, 0), 2);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_valeur_invariant ON stock_par_location;
CREATE TRIGGER trg_stock_valeur_invariant
  BEFORE INSERT OR UPDATE OF quantite, cmp, valeur_stock ON stock_par_location
  FOR EACH ROW
  EXECUTE FUNCTION enforce_stock_valeur_invariant();
