-- 105_seed_payroll_defaults.sql
--
-- Donne à la paie ses paramètres légaux par défaut quand une base n'en a
-- aucun : la cotisation CNPS Retraite et le barème ITS.
--
-- Ces lignes n'étaient semées que par la migration `081`. Or une base neuve
-- (CI, `deploy/provision-client.sh`) est construite depuis `ci-baseline.sql` +
-- `ci-ref-data.sql`, puis toutes les migrations sont baselinées sans être
-- exécutées : `payroll_cotisations` et `payroll_bareme_its` y restaient vides
-- (`GET /api/payroll/config` → `{ cotisations: [], baremes: [] }`). Chaque
-- bulletin était alors calculé sans retenue CNPS ni ITS, sans aucun
-- avertissement, et aucun écran ne permettait d'ajouter une cotisation
-- (`POST /api/payroll/config/cotisations` est ajouté dans la même passe).
--
-- Mêmes valeurs que `081` (taux à vérifier contre la loi en vigueur : ce sont
-- des lignes modifiables depuis « Paramètres paie & achats »). Rien n'est
-- inséré dès qu'une des deux tables contient quelque chose : une configuration
-- commencée à la main (la production a une cotisation et aucun barème ITS)
-- reste telle quelle — y ajouter un barème changerait le net des prochains
-- bulletins sans que personne l'ait décidé. `ci-ref-data.sql` porte les mêmes
-- lignes pour les bases construites après cette migration.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM payroll_cotisations) OR EXISTS (SELECT 1 FROM payroll_bareme_its) THEN
    RETURN;
  END IF;

  INSERT INTO payroll_cotisations (code, libelle, taux_salarial, taux_patronal, plafond)
  VALUES ('CNPS_RET', 'CNPS Retraite', 0.0630, 0.0770, 1647315.00);

  INSERT INTO payroll_bareme_its (ordre, tranche_min, tranche_max, taux) VALUES
    (1, 0,       75000,   0.00),
    (2, 75000,   240000,  0.16),
    (3, 240000,  800000,  0.21),
    (4, 800000,  2400000, 0.24),
    (5, 2400000, NULL,    0.32);
END $$;
