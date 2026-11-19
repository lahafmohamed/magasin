-- 107_historique_transferts_demandes.sql
--
-- Rétablit l'historique du stock des transferts nés d'une demande de
-- réapprovisionnement (K-M2).
--
-- Jusqu'ici, exécuter une demande (DemandeService.execute) déplaçait le stock
-- du dépôt vers le magasin sans écrire de ligne dans `mouvements_stock`, alors
-- qu'un transfert manuel en écrit deux par produit (sortie au dépôt, entrée au
-- magasin). « Historique du stock » sautait donc le flux principal dépôt →
-- magasin : le solde du magasin bondissait entre deux ventes et la sortie du
-- dépôt n'apparaissait nulle part. Le code écrit désormais ces deux lignes ;
-- cette migration les ajoute pour les transferts déjà exécutés.
--
-- Données seulement : aucune quantité en stock ne change (`stock_par_location`
-- n'est pas touché). Pour chaque ligne livrée d'un transfert issu d'une
-- demande, une ligne « transfert » sortante (−q, dépôt) et une entrante (+q,
-- magasin), datées de l'exécution, rattachées au transfert (`transfer_id`),
-- raison « Transfert TRA-… — demande DEM-… (historique rétabli) ».
-- Le stock avant/après est reconstitué à partir du mouvement enregistré
-- juste avant à cet emplacement (lignes rétablies comprises, traitées dans
-- l'ordre chronologique), sinon du suivant, sinon du stock actuel : l'historique
-- se lit d'un seul tenant.
--
-- Idempotente : un côté déjà présent (même transfert, produit, emplacement et
-- sens) est ignoré, ce qui couvre une seconde exécution comme les transferts
-- exécutés après le déploiement du correctif.
--
-- Ne change pas le schéma (fonction temporaire `pg_temp` uniquement) :
-- `ci-baseline.sql` n'est pas à régénérer pour ce fichier.

CREATE FUNCTION pg_temp.retablir_mouvement_transfert(
  p_transfer_id   integer,
  p_produit_id    integer,
  p_location_id   integer,
  p_delta         integer,
  p_date          timestamp,
  p_raison        text,
  p_reference     varchar
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_avant integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM mouvements_stock
    WHERE transfer_id = p_transfer_id
      AND produit_id = p_produit_id
      AND location_id = p_location_id
      AND type_mouvement = 'transfert'
      AND sign(quantite) = sign(p_delta)
  ) THEN
    RETURN;
  END IF;

  SELECT stock_apres INTO v_avant
  FROM mouvements_stock
  WHERE produit_id = p_produit_id AND location_id = p_location_id
    AND date_mouvement <= p_date
  ORDER BY date_mouvement DESC, id DESC
  LIMIT 1;

  IF v_avant IS NULL THEN
    SELECT stock_avant - p_delta INTO v_avant
    FROM mouvements_stock
    WHERE produit_id = p_produit_id AND location_id = p_location_id
      AND date_mouvement > p_date
    ORDER BY date_mouvement ASC, id ASC
    LIMIT 1;
  END IF;

  IF v_avant IS NULL THEN
    SELECT COALESCE(quantite, 0) - p_delta INTO v_avant
    FROM stock_par_location
    WHERE produit_id = p_produit_id AND location_id = p_location_id;
  END IF;

  v_avant := COALESCE(v_avant, 0);

  INSERT INTO mouvements_stock
    (produit_id, type_mouvement, quantite, stock_avant, stock_apres, raison,
     reference_liee, location_id, transfer_id, date_mouvement)
  VALUES
    (p_produit_id, 'transfert', p_delta, v_avant, v_avant + p_delta, p_raison,
     p_reference, p_location_id, p_transfer_id, p_date);
END;
$$;

DO $$
DECLARE
  r RECORD;
  v_raison text;
BEGIN
  FOR r IN
    SELECT st.id AS transfer_id,
           st.numero_transfer,
           st.location_source_id,
           st.location_destination_id,
           d.numero AS demande_numero,
           COALESCE(d.date_execution, st.date_transfer, st.created_at) AS date_mvt,
           stl.produit_id,
           stl.quantite_transferee AS qte
    FROM stock_transfers st
    JOIN demandes_reapprovisionnement d ON d.id = st.demande_id
    JOIN stock_transfer_lignes stl ON stl.transfer_id = st.id
    WHERE st.statut::text = 'livre'
      AND stl.quantite_transferee > 0
    ORDER BY COALESCE(d.date_execution, st.date_transfer, st.created_at), st.id, stl.id
  LOOP
    v_raison := 'Transfert ' || r.numero_transfer || ' — demande ' || r.demande_numero
                || ' (historique rétabli)';
    PERFORM pg_temp.retablir_mouvement_transfert(
      r.transfer_id, r.produit_id, r.location_source_id, -r.qte, r.date_mvt,
      v_raison, left(r.numero_transfer, 50));
    PERFORM pg_temp.retablir_mouvement_transfert(
      r.transfer_id, r.produit_id, r.location_destination_id, r.qte, r.date_mvt,
      v_raison, left(r.numero_transfer, 50));
  END LOOP;
END;
$$;

DROP FUNCTION pg_temp.retablir_mouvement_transfert(integer, integer, integer, integer, timestamp, text, varchar);
