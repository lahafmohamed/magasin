-- 100_commission_vente_auto.sql
--
-- Les commissions de vente étaient lisibles mais jamais écrites.
--
-- `PayrollService` somme `commissions_ventes` pour alimenter la colonne
-- « commissions » de chaque bulletin, la fiche employé affiche un récapitulatif,
-- et `employes.commission_taux` est saisissable. Mais le seul chemin d'écriture
-- (`POST /api/employes/:id/commission`) n'était appelé par aucun écran : la
-- table restait vide, donc tous les récapitulatifs et tous les bulletins
-- affichaient 0. Fonctionnalité présente de bout en bout sauf le déclencheur.
--
-- Le déclencheur est posé en base plutôt que dans un service : une facture naît
-- par cinq chemins différents (FactureService, BonLivraisonService,
-- DevisService, et les fonctions `convert_bl_to_facture` /
-- `convertir_devis_en_facture`). Un trigger `AFTER INSERT` sur `factures` est le
-- seul point de passage commun — c'est la même logique que la synchro de stock
-- et l'auto-comptabilisation de `072`.
--
-- Le vendeur est déduit de `factures.cree_par`, avec repli sur le créateur du
-- bon de livraison puis du devis d'origine : les deux fonctions PL/pgSQL de
-- conversion n'alimentent pas `cree_par` sur la facture produite, et
-- BonLivraisonService non plus. Sans ce repli, la conversion BL → facture — le
-- chemin de vente le plus courant en magasin — ne commissionnerait personne.

BEGIN;

-- Idempotence : une facture ne commissionne un employé qu'une fois. Sans cet
-- index, un rejeu (reconversion d'un BL, réexécution du trigger) doublerait la
-- commission, donc la paie.
CREATE UNIQUE INDEX IF NOT EXISTS commissions_ventes_employe_facture_uniq
  ON commissions_ventes (employe_id, facture_id);

CREATE OR REPLACE FUNCTION public.enregistrer_commission_vente() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_user_id  INTEGER;
  v_employe  RECORD;
BEGIN
  -- Vendeur : créateur de la facture, sinon du BL, sinon du devis d'origine.
  v_user_id := COALESCE(
    NEW.cree_par,
    (SELECT bl.cree_par FROM bons_livraison bl WHERE bl.id = NEW.bl_id),
    (SELECT d.cree_par  FROM devis d          WHERE d.id  = NEW.devis_id)
  );

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.id, e.commission_taux
    INTO v_employe
    FROM employes e
   WHERE e.utilisateur_id = v_user_id
     AND e.actif = true
     AND COALESCE(e.commission_taux, 0) > 0
   LIMIT 1;

  -- Utilisateur sans fiche employé, employé inactif, ou taux à 0 : rien à faire.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO commissions_ventes (
    employe_id, facture_id, montant_vente,
    taux_commission, montant_commission, date_vente, statut
  ) VALUES (
    v_employe.id,
    NEW.id,
    NEW.total,
    v_employe.commission_taux,
    ROUND(NEW.total * v_employe.commission_taux / 100, 2),
    COALESCE(NEW.date_facture::date, CURRENT_DATE),
    'en_attente'
  )
  ON CONFLICT (employe_id, facture_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enregistrer_commission_vente() IS
  'Enregistre la commission du vendeur à la création d''une facture. Vendeur = factures.cree_par, sinon créateur du BL, sinon du devis.';

DROP TRIGGER IF EXISTS trg_commission_vente ON factures;
CREATE TRIGGER trg_commission_vente
  AFTER INSERT ON factures
  FOR EACH ROW
  EXECUTE FUNCTION public.enregistrer_commission_vente();

COMMIT;
