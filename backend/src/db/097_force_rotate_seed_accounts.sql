-- ============================================================
-- 097_force_rotate_seed_accounts.sql
--
-- Les migrations 004 et 040 ensemencent des comptes de démonstration dont le
-- mot de passe en clair est publié dans le dépôt (admin/admin123,
-- manager/manager123, caissier/caissier123, depot1..2/depot123,
-- magasin1..2/magasin123). Sur une base provisionnée à neuf, ces comptes
-- n'existent pas (bootstrap via ci-baseline.sql, schéma seul) : cette migration
-- est alors un no-op. Sur toute base ayant rejoué la chaîne complète (postes de
-- dev, bases héritées), ces identifiants sont des comptes réels — dont un
-- administrateur — utilisables à distance.
--
-- On force `must_change_password = true` sur ces comptes : le mot de passe connu
-- ne peut plus servir qu'à déclencher le changement obligatoire, il ne donne
-- plus accès à l'application. Idempotent, sûr sur base neuve (0 ligne touchée).
--
-- NB : les opérateurs d'une base héritée doivent en plus faire tourner
-- réellement ces mots de passe sans attendre la prochaine connexion.
-- ============================================================

UPDATE utilisateurs
SET must_change_password = true
WHERE username IN ('admin', 'manager', 'caissier', 'depot1', 'depot2', 'magasin1', 'magasin2')
  AND must_change_password = false;
