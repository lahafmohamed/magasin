-- Ajout du taux de conversion pour le mode multi-devise
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS taux_conversion NUMERIC(10,4) DEFAULT 1.0000;

-- Ajout du champ taux_conversion sur les documents financiers
ALTER TABLE factures
  ADD COLUMN IF NOT EXISTS taux_conversion NUMERIC(10,4) DEFAULT 1.0000;

ALTER TABLE devis
  ADD COLUMN IF NOT EXISTS taux_conversion NUMERIC(10,4) DEFAULT 1.0000;

ALTER TABLE bons_livraison
  ADD COLUMN IF NOT EXISTS taux_conversion NUMERIC(10,4) DEFAULT 1.0000;

ALTER TABLE commandes_fournisseur
  ADD COLUMN IF NOT EXISTS taux_conversion NUMERIC(10,4) DEFAULT 1.0000;

ALTER TABLE factures_avoir
  ADD COLUMN IF NOT EXISTS taux_conversion NUMERIC(10,4) DEFAULT 1.0000;
