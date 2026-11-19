-- 104_client_comptoir.sql
--
-- Garantit un « Client comptoir » (code `PASS`) pour les ventes de passage.
--
-- Décision produit D4 (2026-10-23) : la caisse vend à des clients qui ne sont
-- pas dans les contacts. NouvelleFacture présélectionne ce client pour le
-- rôle caissier ; `GET /api/tiers/comptoir` le renvoie au frontend, qui le
-- trouve par son code `PASS`, seul identifiant stable d'une base à l'autre.
--
-- La migration `043` semait déjà « Client Passager » sous ce code, mais une
-- base neuve (CI, `deploy/provision-client.sh`) est construite depuis
-- `ci-baseline.sql` + `ci-ref-data.sql`, toutes migrations baselinées sans être
-- exécutées : elle n'avait aucun client de passage.
--
-- Idempotente, et elle réutilise l'existant plutôt que d'en créer un second :
--   1. un tiers `PASS` existe (même supprimé) : il est rétabli comme client ;
--      le nom de la graine 043, « Client Passager », devient « Client comptoir »,
--      tout nom choisi par la boutique est conservé ;
--   2. sinon, un client de passage créé à la main (« Client passager »,
--      « Divers client », « Client divers »…, client seul, non supprimé) reçoit
--      le code `PASS` — son nom et son historique restent ; s'il y en a
--      plusieurs, celui qui porte le plus de factures ;
--   3. sinon, « Client comptoir » est créé, sans plafond de crédit, paiement
--      immédiat.
-- `ci-ref-data.sql` porte la même ligne pour les bases construites après cette
-- migration (elle y sera baselinée, donc jamais exécutée).

DO $$
DECLARE
  v_id INTEGER;
BEGIN
  SELECT id INTO v_id FROM tiers WHERE code = 'PASS';

  IF v_id IS NOT NULL THEN
    UPDATE tiers
       SET est_client     = true,
           deleted_at     = NULL,
           raison_sociale = CASE WHEN raison_sociale = 'Client Passager'
                                 THEN 'Client comptoir' ELSE raison_sociale END,
           updated_at     = CURRENT_TIMESTAMP
     WHERE id = v_id;
    RETURN;
  END IF;

  SELECT t.id INTO v_id
    FROM tiers t
   WHERE t.deleted_at IS NULL
     AND t.est_client
     AND NOT t.est_fournisseur
     AND lower(regexp_replace(btrim(t.raison_sociale), '\s+', ' ', 'g')) IN (
           'client comptoir', 'clients comptoir', 'comptoir',
           'client passager', 'clients passagers', 'passager',
           'client de passage', 'clients de passage',
           'client divers', 'clients divers', 'divers client', 'divers clients')
   ORDER BY (SELECT count(*) FROM factures f WHERE f.tiers_id = t.id) DESC, t.id ASC
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE tiers SET code = 'PASS', updated_at = CURRENT_TIMESTAMP WHERE id = v_id;
    RETURN;
  END IF;

  INSERT INTO tiers (code, raison_sociale, est_client, est_fournisseur,
                     credit_max, delai_paiement, notes)
  VALUES ('PASS', 'Client comptoir', true, false, 0, 'immediat',
          'Client de passage pour les ventes au comptoir.');
END $$;
