-- 113_retire_fonctions_conversion_legacy.sql
-- Les fonctions SQL de conversion datent d'avant le schéma unifié (043) :
--   * convert_devis_to_facture insère encore factures.client_id — colonne
--     disparue → 42703 → 500 sur la conversion devis→facture ;
--   * convert_bl_to_facture hardcode 'net_30', sans échéance, sans auteur,
--     sans coût d'achat ni description sur les lignes ;
--   * convert_devis_to_bl n'est plus appelé par aucun écran.
-- Leur numérotation par MAX(numero) est sujette aux races, contrairement aux
-- séquences de NumberingService. La conversion passe désormais par un seul
-- chemin applicatif (DevisService / BonLivraisonService), testé. On retire
-- ces fonctions pour qu'aucun chemin de code ne puisse les rappeler.

DROP FUNCTION IF EXISTS convert_devis_to_facture(integer, integer);
DROP FUNCTION IF EXISTS convert_bl_to_facture(integer, integer);
DROP FUNCTION IF EXISTS convert_devis_to_bl(integer, integer);
