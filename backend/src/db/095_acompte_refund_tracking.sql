-- ============================================================
-- 095_acompte_refund_tracking.sql
--
-- Les triggers de synchronisation des acomptes (048 côté client, 051 côté
-- fournisseur) recalculaient montant_restant = montant - Σ(applications) en
-- ignorant les remboursements partiels effectués par AcompteService.refund*.
-- Conséquence : tout événement d'application ultérieur sur le même acompte
-- « ressuscitait » la part remboursée, qui redevenait dépensable (double
-- sortie d'argent possible).
--
-- Correctif : matérialiser le cumul remboursé (montant_rembourse) sur les deux
-- tables d'acomptes, l'intégrer aux formules des triggers de synchronisation
-- et aux triggers de plafonnement des applications.
--
-- Le backfill dérive montant_rembourse de l'état courant
-- (montant - montant_restant - Σ(applications)) : les remboursements partiels
-- historiques correctement conservés sont récupérés ; un éventuel restant déjà
-- ressuscité par le bug avant cette migration n'est pas détectable
-- automatiquement et devra être corrigé via l'endpoint de recompute admin.
-- ============================================================

-- 1. Colonnes de suivi des remboursements
ALTER TABLE acomptes_clients
  ADD COLUMN IF NOT EXISTS montant_rembourse NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE acomptes_fournisseur
  ADD COLUMN IF NOT EXISTS montant_rembourse NUMERIC(15,2) NOT NULL DEFAULT 0;

-- 2. Backfill depuis l'état courant (clampé dans [0, montant])
UPDATE acomptes_clients ac
SET montant_rembourse = LEAST(ac.montant, GREATEST(
      ac.montant
      - ac.montant_restant
      - COALESCE((SELECT SUM(a.montant) FROM acompte_applications a WHERE a.acompte_id = ac.id), 0),
      0));

UPDATE acomptes_fournisseur af
SET montant_rembourse = LEAST(af.montant, GREATEST(
      af.montant
      - af.montant_restant
      - COALESCE((SELECT SUM(a.montant) FROM acompte_applications_fournisseur a WHERE a.acompte_id = af.id), 0),
      0));

-- 3. Contraintes de cohérence
ALTER TABLE acomptes_clients DROP CONSTRAINT IF EXISTS chk_acompte_client_rembourse;
ALTER TABLE acomptes_clients
  ADD CONSTRAINT chk_acompte_client_rembourse
  CHECK (montant_rembourse >= 0 AND montant_rembourse <= montant);

ALTER TABLE acomptes_fournisseur DROP CONSTRAINT IF EXISTS chk_acompte_fourn_rembourse;
ALTER TABLE acomptes_fournisseur
  ADD CONSTRAINT chk_acompte_fourn_rembourse
  CHECK (montant_rembourse >= 0 AND montant_rembourse <= montant);

-- 4. Sync client : restant = montant - Σ(applications) - remboursé
CREATE OR REPLACE FUNCTION sync_acompte_after_application()
RETURNS TRIGGER AS $$
DECLARE
  v_acompte_id INTEGER;
  v_total_applied NUMERIC(15,2);
  v_montant NUMERIC(15,2);
  v_rembourse NUMERIC(15,2);
  v_new_restant NUMERIC(15,2);
  v_new_statut VARCHAR(30);
BEGIN
  v_acompte_id := COALESCE(NEW.acompte_id, OLD.acompte_id);
  SELECT COALESCE(SUM(montant),0) INTO v_total_applied
    FROM acompte_applications WHERE acompte_id = v_acompte_id;
  SELECT montant, COALESCE(montant_rembourse, 0) INTO v_montant, v_rembourse
    FROM acomptes_clients WHERE id = v_acompte_id;

  v_new_restant := GREATEST(v_montant - v_total_applied - v_rembourse, 0);
  IF v_new_restant <= 0.005 THEN
    v_new_statut := 'utilise';
    v_new_restant := 0;
  ELSIF v_total_applied <= 0.005 THEN
    v_new_statut := 'disponible';
  ELSE
    v_new_statut := 'partiellement_utilise';
  END IF;

  UPDATE acomptes_clients
    SET montant_restant = v_new_restant,
        statut = CASE WHEN statut = 'rembourse' THEN 'rembourse' ELSE v_new_statut END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = v_acompte_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 5. Sync fournisseur : même formule
CREATE OR REPLACE FUNCTION sync_acompte_fournisseur_state()
RETURNS TRIGGER AS $$
DECLARE
  v_acompte_id      INTEGER;
  v_total_applied   NUMERIC(15,2);
  v_montant_total   NUMERIC(15,2);
  v_rembourse       NUMERIC(15,2);
  v_montant_restant NUMERIC(15,2);
  v_statut          VARCHAR(30);
  v_deja_rembourse  BOOLEAN;
BEGIN
  v_acompte_id := COALESCE(NEW.acompte_id, OLD.acompte_id);

  SELECT COALESCE(SUM(montant),0) INTO v_total_applied
    FROM acompte_applications_fournisseur WHERE acompte_id = v_acompte_id;

  SELECT montant, COALESCE(montant_rembourse, 0), statut = 'rembourse'
    INTO v_montant_total, v_rembourse, v_deja_rembourse
    FROM acomptes_fournisseur WHERE id = v_acompte_id;

  v_montant_restant := GREATEST(v_montant_total - v_total_applied - v_rembourse, 0);

  IF v_deja_rembourse THEN
    v_statut := 'rembourse';
  ELSIF v_montant_restant <= 0.005 THEN
    v_statut := 'utilise';
  ELSIF v_total_applied <= 0.005 THEN
    v_statut := 'disponible';
  ELSE
    v_statut := 'partiellement_utilise';
  END IF;

  UPDATE acomptes_fournisseur
  SET montant_restant = v_montant_restant,
      statut = v_statut,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = v_acompte_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 6. Plafonds d'application : Σ(applications) ≤ montant - remboursé
CREATE OR REPLACE FUNCTION enforce_acompte_application_cap()
RETURNS TRIGGER AS $$
DECLARE
  v_total_applied NUMERIC(15,2);
  v_montant_acompte NUMERIC(15,2);
  v_rembourse NUMERIC(15,2);
BEGIN
  SELECT COALESCE(SUM(montant),0) INTO v_total_applied
    FROM acompte_applications WHERE acompte_id = NEW.acompte_id;
  SELECT montant, COALESCE(montant_rembourse, 0) INTO v_montant_acompte, v_rembourse
    FROM acomptes_clients WHERE id = NEW.acompte_id;
  IF v_total_applied > v_montant_acompte - v_rembourse THEN
    RAISE EXCEPTION 'Application dépasse le montant disponible de l''acompte (%/% dont % remboursé)',
      v_total_applied, v_montant_acompte, v_rembourse;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_acompte_fournisseur_application_cap()
RETURNS TRIGGER AS $$
DECLARE
  v_total_applied   NUMERIC(15,2);
  v_montant_acompte NUMERIC(15,2);
  v_rembourse       NUMERIC(15,2);
BEGIN
  SELECT COALESCE(SUM(montant),0) INTO v_total_applied
    FROM acompte_applications_fournisseur WHERE acompte_id = NEW.acompte_id;
  SELECT montant, COALESCE(montant_rembourse, 0) INTO v_montant_acompte, v_rembourse
    FROM acomptes_fournisseur WHERE id = NEW.acompte_id;

  IF v_total_applied > v_montant_acompte - v_rembourse + 0.005 THEN
    RAISE EXCEPTION
      'Σ(applications)=%, dépasse le disponible de l''acompte_fournisseur #% (montant=%, remboursé=%)',
      v_total_applied, NEW.acompte_id, v_montant_acompte, v_rembourse;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. update_facture_fournisseur_payment_status : ignorer les paiements
--    soft-supprimés (deleted_at existe depuis 051 ; 094 les exclut déjà du
--    solde fournisseur — le trigger doit compter pareil).
CREATE OR REPLACE FUNCTION update_facture_fournisseur_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_facture_id INTEGER;
  total_due    NUMERIC(15,2);
  total_paid   NUMERIC(15,2);
BEGIN
  v_facture_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.facture_id ELSE NEW.facture_id END;
  SELECT total INTO total_due FROM factures_fournisseur WHERE id = v_facture_id;
  SELECT COALESCE(SUM(montant), 0) INTO total_paid
  FROM paiements_fournisseur
  WHERE facture_id = v_facture_id
    AND deleted_at IS NULL;
  UPDATE factures_fournisseur SET
    montant_paye = total_paid,
    reste_due    = total_due - total_paid,
    statut = CASE
      WHEN total_paid = 0         THEN 'en_attente'
      WHEN total_paid < total_due THEN 'partiellement_payee'
      ELSE 'payee'
    END
  WHERE id = v_facture_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
