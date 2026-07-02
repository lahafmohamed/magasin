-- ============================================================
-- 077_drop_unused_multidevise.sql
-- Drop the dormant multi-currency columns added by 066/067. They were never
-- read or written by any service (the business is XOF-only); only the
-- company-level company_settings.taux_conversion is actually used (PDF display),
-- so that one is intentionally KEPT.
-- ============================================================

ALTER TABLE paiements             DROP COLUMN IF EXISTS devise_paiement;
ALTER TABLE paiements             DROP COLUMN IF EXISTS taux_conversion;
ALTER TABLE factures              DROP COLUMN IF EXISTS taux_conversion;
ALTER TABLE devis                 DROP COLUMN IF EXISTS taux_conversion;
ALTER TABLE bons_livraison        DROP COLUMN IF EXISTS taux_conversion;
ALTER TABLE commandes_fournisseur DROP COLUMN IF EXISTS taux_conversion;
ALTER TABLE factures_avoir        DROP COLUMN IF EXISTS taux_conversion;

-- company_settings.taux_conversion is deliberately retained (used by CompanySettingsService / PDFService).
