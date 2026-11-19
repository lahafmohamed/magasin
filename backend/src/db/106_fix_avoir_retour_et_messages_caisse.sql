-- 106_fix_avoir_retour_et_messages_caisse.sql
--
-- Répare la création d'un avoir depuis un retour, et nettoie les messages de
-- la garde des mouvements de caisse.
--
-- 1. `create_avoir_from_retour()` (appelée par POST /api/avoirs/from-retour)
--    insérait encore dans `factures_avoir.client_id`, colonne disparue avec la
--    table `tiers` unifiée (043) : chaque appel tombait en 500, après avoir
--    consommé un numéro d'avoir. Elle écrivait aussi ses lignes dans la table
--    héritée `facture_avoir_lignes`, que l'application ne lit plus : l'avoir
--    serait apparu sans aucune ligne. Ses messages étaient en anglais.
--    La nouvelle version :
--      - n'accepte qu'un retour approuvé (`traite`), et un seul avoir actif
--        par retour (le retour est verrouillé pendant la création) ;
--      - écrit l'avoir sur `tiers_id`, rattaché à la facture d'origine quand
--        le retour n'en concerne qu'une, au total des lignes du retour ;
--      - écrit ses lignes dans `document_lignes` (comme un avoir manuel) et le
--        crédit dans le relevé du client (`compte_client_lignes`) ;
--      - lève des erreurs en français, avec un SQLSTATE `HK4xx` que
--        `CreditNoteService` traduit en statut HTTP (404, 409, 422).
--    NB : `creer_avoir_depuis_retour()`, citée par la migration 099, n'existe
--    dans aucune base — c'était cette fonction-ci. `facture_avoir_lignes`
--    n'est plus écrite par personne.
--
-- 2. `enforce_mouvement_append_only()` (trigger de `mouvements_caisse`) portait
--    un message illisible, encodé deux fois : « cloturÃ©e â€” impossible… ». Ses
--    trois autres messages étaient en anglais. Même logique, textes en français.
--    Le commentaire de la vue `vue_session_methode_totaux` avait le même défaut.
--
-- Change le schéma (fonctions) : `ci-baseline.sql` est à régénérer.

CREATE OR REPLACE FUNCTION public.create_avoir_from_retour(p_retour_id integer, p_user_id integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_retour      RECORD;
  v_avoir_id    INTEGER;
  v_numero      VARCHAR(50);
  v_existant    VARCHAR(50);
  v_total       NUMERIC(15, 2);
  v_nb_factures INTEGER;
  v_facture_id  INTEGER;
  v_location_id INTEGER;
BEGIN
  SELECT * INTO v_retour FROM retours WHERE id = p_retour_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Retour introuvable.' USING ERRCODE = 'HK404';
  END IF;

  IF v_retour.statut IS DISTINCT FROM 'traite' THEN
    RAISE EXCEPTION 'Approuvez le retour % avant de créer son avoir.', v_retour.numero_retour
      USING ERRCODE = 'HK409';
  END IF;

  SELECT numero_avoir INTO v_existant
    FROM factures_avoir
   WHERE retour_id = p_retour_id
     AND deleted_at IS NULL
     AND statut IS DISTINCT FROM 'annule'
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Le retour % a déjà son avoir : %.', v_retour.numero_retour, v_existant
      USING ERRCODE = 'HK409';
  END IF;

  SELECT COALESCE(SUM(total_ligne), 0), COUNT(DISTINCT facture_id), MIN(facture_id)
    INTO v_total, v_nb_factures, v_facture_id
    FROM retour_lignes
   WHERE retour_id = p_retour_id;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Le retour % n’a aucun montant à rembourser.', v_retour.numero_retour
      USING ERRCODE = 'HK422';
  END IF;

  -- Facture d'origine : seulement quand le retour n'en concerne qu'une.
  IF v_nb_factures <> 1 THEN
    v_facture_id := NULL;
  ELSE
    SELECT location_id INTO v_location_id FROM factures WHERE id = v_facture_id;
  END IF;

  -- Même séquence et même format que NumberingService ('avoir').
  v_numero := 'AVOIR-' || EXTRACT(YEAR FROM CURRENT_DATE)::int || '-'
              || LPAD(nextval('avoir_seq')::text, 5, '0');

  INSERT INTO factures_avoir (
    numero_avoir, tiers_id, facture_origine_id, retour_id, date_avoir,
    sous_total, tva, total, total_ht, total_ttc,
    statut, avoir_type, notes, location_id, cree_par
  ) VALUES (
    v_numero, v_retour.tiers_id, v_facture_id, p_retour_id, CURRENT_DATE,
    v_total, 0, v_total, v_total, v_total,          -- pas de TVA (027)
    'valide', 'retour', 'Avoir du retour ' || v_retour.numero_retour, v_location_id, p_user_id
  ) RETURNING id INTO v_avoir_id;

  INSERT INTO document_lignes (document_type, document_id, produit_id, description, quantite, prix_unitaire, total_ligne)
  SELECT 'avoir', v_avoir_id, rl.produit_id, p.nom, rl.quantite, rl.prix_unitaire, rl.total_ligne
    FROM retour_lignes rl
    LEFT JOIN produits p ON p.id = rl.produit_id
   WHERE rl.retour_id = p_retour_id
   ORDER BY rl.id;

  INSERT INTO compte_client_lignes (
    tiers_id, type_operation, document_id, document_numero,
    montant_debit, montant_credit, notes, cree_par
  ) VALUES (
    v_retour.tiers_id, 'avoir', v_avoir_id, v_numero,
    0, v_total, 'Avoir ' || v_numero || ' du retour ' || v_retour.numero_retour, p_user_id
  );

  RETURN v_avoir_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.enforce_mouvement_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_statut VARCHAR(20);
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un mouvement de caisse ne se supprime pas (mouvement n° %) : enregistrez un mouvement inverse.', OLD.id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Seuls le lien d'annulation (reversed_by_mouvement_id) et les dates de
    -- mise à jour peuvent changer ; jamais le montant ni l'origine.
    IF NEW.montant IS DISTINCT FROM OLD.montant
      OR NEW.type IS DISTINCT FROM OLD.type
      OR NEW.categorie IS DISTINCT FROM OLD.categorie
      OR NEW.reference_type IS DISTINCT FROM OLD.reference_type
      OR NEW.reference_id IS DISTINCT FROM OLD.reference_id
      OR NEW.methode_paiement IS DISTINCT FROM OLD.methode_paiement
      OR NEW.session_caisse_id IS DISTINCT FROM OLD.session_caisse_id
    THEN
      RAISE EXCEPTION 'Le mouvement de caisse n° % ne peut plus être modifié : enregistrez un mouvement inverse.', OLD.id;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT statut INTO v_statut FROM sessions_caisse WHERE id = NEW.session_caisse_id;
    IF v_statut IS NULL THEN
      RAISE EXCEPTION 'Session de caisse n° % introuvable.', NEW.session_caisse_id;
    END IF;
    IF v_statut <> 'ouverte' THEN
      RAISE EXCEPTION 'La session de caisse n° % est clôturée : impossible d’ajouter un mouvement.', NEW.session_caisse_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


DO $$
BEGIN
  IF to_regclass('public.vue_session_methode_totaux') IS NOT NULL THEN
    COMMENT ON VIEW public.vue_session_methode_totaux IS
      'Totaux par session et par mode de paiement — utilisés par la clôture de caisse.';
  END IF;
END $$;
