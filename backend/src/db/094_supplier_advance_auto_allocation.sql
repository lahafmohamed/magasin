-- Affectation automatique FIFO des acomptes fournisseur aux factures ouvertes.
-- L'application est un rapprochement interne : elle ne crée aucun second
-- mouvement de caisse, le décaissement ayant déjà eu lieu à la saisie de
-- l'acompte.

ALTER TABLE paiements_fournisseur
  DROP CONSTRAINT IF EXISTS paiements_fournisseur_methode_paiement_check;

ALTER TABLE paiements_fournisseur
  ADD CONSTRAINT paiements_fournisseur_methode_paiement_check
  CHECK (methode_paiement IN (
    'espece','carte','cheque','virement','mobile_money',
    'orange_money','mtn_money','wave','compensation'
  ));

-- La migration 093 avait consommé les contreparties fournisseur de
-- compensation sans les rattacher aux factures. Les remettre disponibles
-- permet de créer les applications/paiements correspondants ci-dessous.
UPDATE acomptes_fournisseur af
SET statut = 'disponible',
    montant_restant = af.montant,
    date_utilisation = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE af.methode_paiement = 'compensation'
  AND af.idempotency_key LIKE 'compensation:%:fournisseur'
  AND af.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM acompte_applications_fournisseur aaf
    WHERE aaf.acompte_id = af.id
  );

DO $$
DECLARE
  v_acompte RECORD;
  v_facture RECORD;
  v_acompte_restant NUMERIC(15,2);
  v_montant NUMERIC(15,2);
  v_paiement_id INTEGER;
BEGIN
  FOR v_acompte IN
    SELECT id, tiers_id, montant_restant, methode_paiement,
           date_acompte, magasin_id, cree_par
    FROM acomptes_fournisseur
    WHERE statut IN ('disponible', 'partiellement_utilise')
      AND montant_restant > 0
      AND deleted_at IS NULL
    ORDER BY tiers_id, date_acompte, id
    FOR UPDATE
  LOOP
    v_acompte_restant := v_acompte.montant_restant;

    FOR v_facture IN
      SELECT id, GREATEST(total - COALESCE(montant_paye, 0), 0) AS restant
      FROM factures_fournisseur
      WHERE tiers_id = v_acompte.tiers_id
        AND statut != 'annulee'
        AND GREATEST(total - COALESCE(montant_paye, 0), 0) > 0
      ORDER BY date_facture, id
      FOR UPDATE
    LOOP
      EXIT WHEN v_acompte_restant <= 0;
      v_montant := LEAST(v_acompte_restant, v_facture.restant);

      INSERT INTO paiements_fournisseur (
        facture_id, montant, methode_paiement, date_paiement, reference,
        notes, magasin_id, source, idempotency_key, effectue_par
      ) VALUES (
        v_facture.id,
        v_montant,
        COALESCE(v_acompte.methode_paiement, 'virement'),
        v_acompte.date_acompte,
        'ACOF-AUTO-' || v_acompte.id || '-' || v_facture.id,
        'Affectation automatique de l''acompte fournisseur #' || v_acompte.id,
        v_acompte.magasin_id,
        'acompte_application',
        'acof-auto:' || v_acompte.id || ':' || v_facture.id,
        v_acompte.cree_par
      )
      RETURNING id INTO v_paiement_id;

      INSERT INTO acompte_applications_fournisseur (
        acompte_id, facture_id, paiement_id, montant, cree_par, notes
      ) VALUES (
        v_acompte.id, v_facture.id, v_paiement_id, v_montant,
        v_acompte.cree_par, 'Affectation FIFO automatique'
      );

      v_acompte_restant := v_acompte_restant - v_montant;
    END LOOP;
  END LOOP;
END;
$$;

-- Une application est déjà comptée dans paiements_fournisseur. Pour éviter
-- tout double comptage, seuls les reliquats d'acomptes non encore affectés sont
-- ensuite déduits du solde fournisseur.
CREATE OR REPLACE FUNCTION calculer_solde_fournisseur(p_tiers_id INTEGER)
RETURNS NUMERIC(15,2) AS $$
DECLARE v_solde NUMERIC(15,2);
BEGIN
  SELECT
    COALESCE(SUM(ff.total), 0)
    - COALESCE((
        SELECT SUM(pf.montant)
        FROM paiements_fournisseur pf
        JOIN factures_fournisseur ff2 ON ff2.id = pf.facture_id
        WHERE ff2.tiers_id = p_tiers_id
          AND pf.deleted_at IS NULL
      ), 0)
    - COALESCE((
        SELECT SUM(af.montant_restant)
        FROM acomptes_fournisseur af
        WHERE af.tiers_id = p_tiers_id
          AND af.statut IN ('disponible', 'partiellement_utilise')
          AND af.deleted_at IS NULL
      ), 0)
  INTO v_solde
  FROM factures_fournisseur ff
  WHERE ff.tiers_id = p_tiers_id
    AND ff.statut != 'annulee';

  RETURN COALESCE(v_solde, 0);
END;
$$ LANGUAGE plpgsql;
