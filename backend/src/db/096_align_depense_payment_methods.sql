-- ============================================================
-- 096_align_depense_payment_methods.sql
--
-- `depenses` n'acceptait que 4 modes de règlement (espece, carte, cheque,
-- virement) alors que toutes les autres tables monétaires en acceptent 8
-- (paiements, mouvements_caisse) voire 9 avec 'compensation'
-- (acomptes_clients, acomptes_fournisseur, paiements_fournisseur).
--
-- Conséquence : le formulaire de dépense propose « Mobile Money » et le
-- schéma Zod l'accepte, mais l'INSERT viole
-- depenses_methode_paiement_check — l'utilisateur reçoit une erreur 500 sur
-- un mode de paiement pourtant courant ici (Wave, Orange Money, MTN Money).
--
-- Correctif : aligner la contrainte sur la liste canonique de 8 modes
-- (utils/paymentMethods.ts). 'compensation' est volontairement exclu : une
-- compensation solde une créance, elle ne règle pas une dépense.
-- ============================================================

ALTER TABLE depenses DROP CONSTRAINT IF EXISTS depenses_methode_paiement_check;

ALTER TABLE depenses
  ADD CONSTRAINT depenses_methode_paiement_check
  CHECK (methode_paiement IN (
    'espece', 'carte', 'cheque', 'virement',
    'mobile_money', 'orange_money', 'mtn_money', 'wave'
  ));
