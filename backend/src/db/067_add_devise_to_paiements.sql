-- Extension multi-devise aux paiements et documents
ALTER TABLE paiements
  ADD COLUMN IF NOT EXISTS taux_conversion NUMERIC(10,4) DEFAULT 1.0000,
  ADD COLUMN IF NOT EXISTS devise_paiement VARCHAR(10) DEFAULT NULL;
