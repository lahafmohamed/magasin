-- Migration: Add prix_achat_unitaire to document_lignes to track margin/profitability history.
-- This ensures that if the product purchase price changes, historical profit margins remain correct.

ALTER TABLE document_lignes ADD COLUMN IF NOT EXISTS prix_achat_unitaire NUMERIC(15, 2) DEFAULT 0.00;

-- Backfill existing invoice lines with the current product purchase price
UPDATE document_lignes dl
SET prix_achat_unitaire = COALESCE((SELECT p.prix_achat FROM produits p WHERE p.id = dl.produit_id), 0.00)
WHERE dl.document_type = 'facture';
