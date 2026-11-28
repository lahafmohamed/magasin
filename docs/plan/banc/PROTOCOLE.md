# Protocole d'un agent d'audit

1. Lis `C:\Users\Mohamed\Desktop\projet\magasinProgramme\docs\plan\00-CADRAGE.md` (cible, décisions, règles de preuve, contenu d'une fiche), puis `README.md` de ce dossier (banc d'essai).
2. Lis le code de ta fonctionnalité de bout en bout : page(s) front, service `api.ts`, route, schéma Zod, contrôleur, service, triggers SQL dans `backend/src/db/ci-baseline.sql`.
3. **Utilise** la fonctionnalité dans le navigateur avec chaque rôle concerné, en bureau (1440) et mobile (390), sur des scénarios des quatre profils. Essaie aussi de la casser : montants limites, double clic, concurrence, données manquantes, rôle interdit (API directe), stock insuffisant, annulation.
4. Pour chaque défaut d'argent ou de stock, prouve-le par les chiffres : état avant, action, état après (SQL en lecture).
5. Lis `docs\plan\faits\concurrents.md` au moment d'écrire la comparaison. Il est peut-être encore en cours d'écriture : s'il n'existe pas alors, écris « à compléter » et continue. **Pas de recherche web.**
6. Écris ta fiche dans `docs\plan\fiches\NN-nom.md`, aux neuf sections du cadrage. Une seule fiche, aucun autre fichier du dépôt.

## Exigences

- Français simple : le propriétaire la lira sur téléphone. Phrases courtes, tableaux courts, pas de jargon sans explication dans les sections 1 à 6. Les lots (section 8) peuvent être techniques.
- Tranche. Un seul verdict. « Utile » se juge pour le commerçant visé, pas pour le code existant. N'aie aucun scrupule à recommander de fusionner ou de supprimer.
- N'ajoute une fonction que si un commerçant d'un profil visé la demanderait dans son premier mois, ou si son absence le ferait partir. Sinon, classe-la « plus tard » en une ligne.
- Sépare « prouvé » (fichier:ligne, requête, chiffres, capture) et « supposé ». Pas de constat sans preuve dans la section 4.
- Les lots sont ordonnés par priorité du cadrage, petits (S = moins d'une demi-journée, M = 1 à 3 jours, L = plus), numérotés `NN-A`, `NN-B`… Chacun est autonome et complet (problème, résultat voulu, écrans, base/API, fichiers, étapes, tests, critères de fin, dépendances, taille, risques). Maximum 12 lots : regroupe.
- Décris la TVA optionnelle et la préparation FNE / mobile money / WhatsApp pour ta fonctionnalité seulement.
- Longueur : 3 500 mots maximum, lots compris. Vise 100 appels d'outils au maximum : fais peu de captures, mais regarde-les.

## Leçons des vagues précédentes

- Lis `docs/plan/01-SUIVI.md` avant d’écrire tes lots : un sujet déjà attribué à un lot (stock, plancher, TVA, FNE, anti-doublon, FCFA entiers…) se **cite** (« dépend de 10-A »), il ne se réécrit pas. Reprends aussi la rubrique « À transmettre ».
- Pour chaque défaut, dis s’il est atteignable **à l’écran** ou **par l’API seulement**. L’API seule est moins grave.
- Vérifie les données du banc avant d’affirmer qu’elles manquent (les affectations existent dans `user_location_roles`). Cherche un contre-exemple avant d’écrire « jamais » ou « aucun ».
- Avant de dire qu’un comportement est faux, vérifie dans `CLAUDE.md` qu’il n’est pas une décision voulue ; si c’en est une, dis si elle convient au commerçant visé.
- Un seul sujet par lot. Un lot « L » se découpe en étapes livrables.
- Compte les mots avec `wc -w` : la limite est ferme.
- Les questions 1 à 26 de `01-SUIVI.md` sont sans réponse. Ne présume pas : propose, et dis ce qui change selon la réponse.

## Message final (300 mots maximum)

Verdict, notes d'utilité, les 5 constats les plus graves avec leur preuve, la liste des lots (titre, taille), les questions pour le propriétaire, et ce que tu n'as pas pu vérifier.
