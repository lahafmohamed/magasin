-- ============================================================
-- 110_code_barre_interne.sql
--
-- Lot 3 (étiquettes) : les produits sans code-barres reçoivent un EAN-13
-- interne pour être scannés en caisse.
--
-- Plage GS1 « circulation restreinte » : un code qui commence par 2 n'est
-- jamais attribué à un fabricant, il ne heurte donc aucun code imprimé sur un
-- emballage. Format : « 20 » + numéro de séquence sur 10 chiffres + clé de
-- contrôle (calculée par `NumberingService.nextInternalBarcode`).
--
-- La séquence garantit qu'aucun numéro n'est servi deux fois, même par deux
-- postes en même temps ; la contrainte UNIQUE déjà posée sur
-- `produits.code_barre` refuse un code saisi à la main qui tomberait dans la
-- même plage (le service passe alors au numéro suivant).
--
-- Idempotente. `ci-baseline.sql` porte la même séquence.
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS code_barre_interne_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

COMMENT ON SEQUENCE code_barre_interne_seq IS
  'Numéros des EAN-13 internes (préfixe 20) attribués aux produits sans code-barres.';
