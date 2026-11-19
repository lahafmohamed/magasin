-- 108_historique_demandes_acteur.sql
--
-- L'historique d'une demande de réapprovisionnement attribue chaque étape à
-- la personne qui l'a faite (G-STOCK-02).
--
-- Le trigger `trg_demande_state_change` (041) écrivait l'utilisateur
-- COALESCE(decided_by, executed_by, closed_by) : une fois la demande décidée,
-- l'exécution, la livraison et la clôture étaient toutes créditées au
-- décideur, et l'envoi n'avait aucun auteur.
--
-- 1. `log_demande_state_change()` prend désormais, dans l'ordre :
--    a. l'auteur déclaré par l'application pour la transaction en cours
--       (`SELECT set_config('hitek.acteur_id', '<id>', true)`, posé par
--       DemandeService avant chaque transition — valable jusqu'à la fin de la
--       transaction seulement) ;
--    b. à défaut, la colonne qui enregistre l'auteur de CETTE étape :
--       envoyée → created_by, approuvée / partiellement approuvée / refusée →
--       decided_by, en cours / livrée → executed_by, clôturée → closed_by.
-- 2. Les lignes d'historique déjà écrites sont corrigées quand l'auteur réel
--    est connu avec certitude : exécution et livraison → executed_by,
--    clôture → closed_by, envoi sans auteur → l'utilisateur de l'action
--    « send » du journal d'audit. Les lignes corrigées portent
--    `payload.acteur_corrige = "108"`. Les autres restent telles quelles.
--
-- Idempotente (CREATE OR REPLACE ; la correction ne touche que les lignes
-- dont l'auteur diffère encore).
--
-- Change le schéma (fonction) : `ci-baseline.sql` est à régénérer.

CREATE OR REPLACE FUNCTION public.log_demande_state_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_acteur INTEGER;
BEGIN
  -- Only log if status actually changed
  IF OLD.statut IS DISTINCT FROM NEW.statut THEN
    BEGIN
      v_acteur := NULLIF(current_setting('hitek.acteur_id', true), '')::integer;
    EXCEPTION WHEN invalid_text_representation THEN
      v_acteur := NULL;
    END;

    IF v_acteur IS NULL THEN
      v_acteur := CASE NEW.statut
        WHEN 'envoyee'                 THEN NEW.created_by_user_id
        WHEN 'approuvee'               THEN NEW.decided_by_user_id
        WHEN 'partiellement_approuvee' THEN NEW.decided_by_user_id
        WHEN 'refusee'                 THEN NEW.decided_by_user_id
        WHEN 'en_cours'                THEN NEW.executed_by_user_id
        WHEN 'livree'                  THEN NEW.executed_by_user_id
        WHEN 'cloturee'                THEN NEW.closed_by_user_id
        ELSE NULL
      END;
    END IF;

    INSERT INTO demandes_reapprovisionnement_history (
      demande_id,
      from_statut,
      to_statut,
      user_id,
      payload
    ) VALUES (
      NEW.id,
      OLD.statut,
      NEW.statut,
      v_acteur,
      jsonb_build_object(
        'decided_by_user_id', NEW.decided_by_user_id,
        'executed_by_user_id', NEW.executed_by_user_id,
        'closed_by_user_id', NEW.closed_by_user_id,
        'raison_refus', NEW.raison_refus,
        'transfert_id', NEW.transfert_id
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Exécution et livraison : l'auteur est celui qui a exécuté la demande.
UPDATE demandes_reapprovisionnement_history h
SET user_id = d.executed_by_user_id,
    payload = COALESCE(h.payload, '{}'::jsonb) || jsonb_build_object('acteur_corrige', '108')
FROM demandes_reapprovisionnement d
WHERE d.id = h.demande_id
  AND h.to_statut IN ('en_cours', 'livree')
  AND d.executed_by_user_id IS NOT NULL
  AND h.user_id IS DISTINCT FROM d.executed_by_user_id;

-- Clôture : l'auteur est celui qui a clôturé.
UPDATE demandes_reapprovisionnement_history h
SET user_id = d.closed_by_user_id,
    payload = COALESCE(h.payload, '{}'::jsonb) || jsonb_build_object('acteur_corrige', '108')
FROM demandes_reapprovisionnement d
WHERE d.id = h.demande_id
  AND h.to_statut = 'cloturee'
  AND d.closed_by_user_id IS NOT NULL
  AND h.user_id IS DISTINCT FROM d.closed_by_user_id;

-- Envoi sans auteur : l'utilisateur de l'action « send » du journal d'audit
-- (la plus récente si la demande en a plusieurs).
UPDATE demandes_reapprovisionnement_history h
SET user_id = s.user_id,
    payload = COALESCE(h.payload, '{}'::jsonb) || jsonb_build_object('acteur_corrige', '108')
FROM (
  SELECT DISTINCT ON (a.record_id) a.record_id, a.user_id
  FROM audit_log a
  WHERE a.table_name = 'demandes_reapprovisionnement'
    AND a.action = 'send'
    AND a.user_id IS NOT NULL
  ORDER BY a.record_id, a.id DESC
) s
WHERE s.record_id = h.demande_id
  AND h.to_statut = 'envoyee'
  AND h.user_id IS NULL;
