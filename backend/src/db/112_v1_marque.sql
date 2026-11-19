-- 112_v1_marque.sql
-- nolyxERP : défauts neutres pour company_settings.
-- Une instance neuve ne démarre plus sous « Hitek-CI » (le nom de l'instance
-- de test) avec un email et un site web fictifs : la boutique renseigne sa
-- propre identité dans les paramètres. Les données existantes ne sont pas
-- touchées — seuls les DEFAULT changent.

ALTER TABLE company_settings
  ALTER COLUMN nom SET DEFAULT 'Mon entreprise',
  ALTER COLUMN adresse SET DEFAULT '',
  ALTER COLUMN telephone SET DEFAULT '',
  ALTER COLUMN email SET DEFAULT '',
  ALTER COLUMN site_web SET DEFAULT '';
