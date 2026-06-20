-- Ajout des colonnes pour le calcul du Coût Moyen Pondéré (CMP)
ALTER TABLE stock_par_location
  ADD COLUMN IF NOT EXISTS valeur_stock NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cmp NUMERIC(15,2) DEFAULT 0;

-- Trigger pour maintenir produits.prix_achat synchronisé avec le CMP
CREATE OR REPLACE FUNCTION sync_cmp_to_produit()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE produits
  SET prix_achat = NEW.cmp
  WHERE id = NEW.produit_id
    AND (prix_achat IS NULL OR prix_achat = 0 OR prix_achat != NEW.cmp);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_cmp ON stock_par_location;
CREATE TRIGGER trg_sync_cmp
  AFTER UPDATE OF cmp ON stock_par_location
  FOR EACH ROW
  WHEN (NEW.cmp IS DISTINCT FROM OLD.cmp AND NEW.cmp > 0)
  EXECUTE FUNCTION sync_cmp_to_produit();
