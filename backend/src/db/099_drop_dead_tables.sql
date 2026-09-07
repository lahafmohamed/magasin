-- 099_drop_dead_tables.sql
--
-- Nettoyage du schéma après le retrait des modules morts (audit du 2026-09-07,
-- lot 1) : POS, hiérarchie de caisses, et les tables laissées derrière par des
-- migrations antérieures.
--
-- Chaque objet supprimé ici a été vérifié : aucune référence dans
-- `backend/src/**/*.ts` après le lot 1, et aucune fonction PL/pgSQL ni aucun
-- trigger vivant ne l'utilise.
--
-- Ne PAS ajouter `facture_avoir_lignes` : cette table n'apparaît dans aucun
-- TypeScript mais reste alimentée par `creer_avoir_depuis_retour()`.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Hiérarchie de caisses (module retiré)
-- ---------------------------------------------------------------------------
-- La fonction de transfert inter-caisses n'était appelée que par
-- CaisseHierarchyService (supprimé) ; aucun trigger ne s'y accroche. Elle doit
-- partir AVANT les tables, sinon elle survivrait en référençant des relations
-- inexistantes.
DROP FUNCTION IF EXISTS public.transferer_fonds_caisse(integer, integer, numeric, integer, text);

-- Colonne morte sur la table de session vivante : jamais écrite par
-- CaisseMagasinService, elle ne portait que la FK vers `caisses`. La retirer
-- explicitement évite de laisser une colonne orpheline après le DROP TABLE.
ALTER TABLE IF EXISTS sessions_caisse DROP COLUMN IF EXISTS caisse_id;

DROP TABLE IF EXISTS transferts_caisse CASCADE;
DROP TABLE IF EXISTS caisses CASCADE;

-- ---------------------------------------------------------------------------
-- 2. POS (module retiré, jamais consommé par une interface)
-- ---------------------------------------------------------------------------
-- `barcode_scans` n'était écrite que par POSService.scanBarcode : historique
-- de scans à but analytique, jamais lu par aucun écran.
DROP TABLE IF EXISTS barcode_scans CASCADE;
DROP TABLE IF EXISTS pos_cart_items CASCADE;
DROP TABLE IF EXISTS pos_sessions CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Tables renommées « _deprecated_ » puis jamais supprimées
-- ---------------------------------------------------------------------------
-- Demandes de réappro internes → remplacées par `demandes`.
DROP TABLE IF EXISTS _deprecated_internal_stock_request_lignes CASCADE;
DROP TABLE IF EXISTS _deprecated_internal_stock_requests CASCADE;

-- Ancien rapprochement 3 voies → remplacé par `082_three_way_match`
-- (`factures_fournisseur.commande_id` + `three_way_match_config`).
DROP TABLE IF EXISTS _deprecated_three_way_match_details_2026_05 CASCADE;
DROP TABLE IF EXISTS _deprecated_three_way_matches_2026_05 CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Journal d'affectation jamais écrit
-- ---------------------------------------------------------------------------
-- Créé en `043`, aucune écriture applicative : l'historique réel des
-- affectations d'acomptes vit dans `acomptes_applications`.
DROP TABLE IF EXISTS allocation_audit CASCADE;

-- ---------------------------------------------------------------------------
-- 5. TVA (supprimée par décision métier en `027_enforce_no_tax`)
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS facture_avoir_lignes DROP COLUMN IF EXISTS taux_tva_id;
DROP TABLE IF EXISTS taux_tva CASCADE;

COMMIT;
