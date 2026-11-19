-- ============================================================
-- 109_profil_activite_ticket.sql
--
-- Lot 1 (profil métier) et lot 2 (vente comptoir + ticket 80 mm).
--
-- 1. `type_activite` : le métier du client. Un seul programme sert des
--    boutiques d'informatique, d'habillement, des libre-services… Le profil
--    propose les modules utiles à ce métier (préréglage appliqué depuis les
--    paramètres, jamais en silence) et désigne l'écran de vente par défaut.
--    'general' (défaut) = aucun préréglage : le comportement d'avant.
--
-- 2. `ticket_message` : la phrase imprimée en bas du ticket de caisse
--    (« Merci de votre visite », conditions d'échange…). NULL = rien.
--
-- Idempotente. `ci-baseline.sql` porte les mêmes colonnes (une base neuve
-- baseline cette migration sans l'exécuter).
-- ============================================================

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS type_activite VARCHAR(30) NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS ticket_message TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_settings_type_activite_check'
  ) THEN
    ALTER TABLE company_settings
      ADD CONSTRAINT company_settings_type_activite_check
      CHECK (type_activite IN ('general', 'informatique', 'habillement', 'libre_service'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_settings_ticket_message_length'
  ) THEN
    ALTER TABLE company_settings
      ADD CONSTRAINT company_settings_ticket_message_length
      CHECK (ticket_message IS NULL OR char_length(ticket_message) <= 300);
  END IF;
END $$;

COMMENT ON COLUMN company_settings.type_activite IS
  'Métier du client : general, informatique, habillement, libre_service. Préréglage des modules et écran de vente.';
COMMENT ON COLUMN company_settings.ticket_message IS
  'Message imprimé en bas du ticket de caisse 80 mm. NULL = aucun.';
