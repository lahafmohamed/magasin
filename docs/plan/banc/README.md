# Banc d'essai de l'audit

Bases jetables `nolyx_audit_*` sur le PostgreSQL local : `base` (modèle rempli), `neuve` (client neuf), `1` à `4` (copies). Serveurs arrêtés entre deux vagues.

Remettre en marche, par agent N : supprimer puis recréer `nolyx_audit_N` depuis `nolyx_audit_base` (`CREATE DATABASE … TEMPLATE …`), `(cd deps && npm i)` la première fois, `bash start-backend.sh nolyx_audit_N 614N 615N`, puis `node <chemin>/start-vite.mjs 615N 614N` **depuis `frontend/`**. Base modèle perdue : `ci-db-setup.mjs`, `populate.mjs`, emplacements et `magasins` en SQL (défauts 1 et 2 du cadrage), `stage2.mjs`, `seed-month-activity.mjs --days 45`.

Les affectations du banc sont dans `user_location_roles` (fiche utilisateur), pas dans `utilisateur_locations` (écran « Affectations »).

Chaque agent a un numéro N et un environnement isolé, démarré avant son lancement :

- Base PostgreSQL `nolyx_audit_N` (copie d'une base remplie : 3 emplacements, 23 produits informatique/alimentaire/habillement, 12 tiers, ~199 factures sur 45 jours, caisse du magasin 1 ouverte avec 50 000 F).
- API : `http://localhost:614N/api` · Interface : `http://localhost:615N`
- Comptes (mot de passe `Audit2026!x`) : `admin` (admin), `gerant` (manager), `caissier` (caissier), `vendeur` (magasin_staff), `depot` (depot_staff), `lecteur` (viewer).
- Emplacements : 1 = MAG-1 boutique principale, 4 = MAG-2 boutique Yopougon, 5 = DEP-1 dépôt. Table `magasins` : 1 → emplacement 1, 2 → emplacement 4.
- Base `nolyx_audit_neuve` : un client neuf sorti de `ci-db-setup.mjs`, jamais touché. Lecture SQL seulement (`sql('neuve', ...)`).

Outils (`audit.mjs`, chemin Windows absolu à importer via `file:///C:/...`) :

```js
import { api, ui, sql } from 'file:///C:/Users/Mohamed/Desktop/projet/magasinProgramme/docs/plan/banc/audit.mjs';
const c = await api(N, 'caissier');            // c.get/post/put/patch/del → { status, json }
const rows = await sql(N, 'SELECT ... WHERE id = $1', [1]);   // lecture seule
const s = await ui(N, { user: 'vendeur', width: 390 });
await s.goto('/vente-comptoir'); await s.shot('nom'); console.log(s.errors); await s.close();
```

`s.page` est une page Playwright normale (locators, click, fill, keyboard). Captures dans `%TEMP%
olyx-capturesN`. Écris tes scripts dans `%TEMP%/nolyx-agents/vagueX-N/` (pas dans le dépôt) et lance-les avec `node`. Regarde tes captures avec l'outil Read.

## Règles

- Aucun fichier du dépôt modifié, sauf ta fiche dans `docs/plan/fiches/`. Pas de commit.
- Uniquement tes ports et ta base. Jamais `pbdsarl`, jamais la production (aucun ssh), jamais les ports d'un autre agent.
- Ne redémarre ni n'arrête rien : si ton API ne répond plus, dis-le dans ta fiche.
- Écritures par l'interface ou l'API seulement, jamais par SQL : sinon tu prouves ton SQL, pas l'ERP.
- Ce qui vient du banc n'est pas un défaut de l'ERP : les emplacements 4 et 5 et les lignes de `magasins` ont été insérés en SQL, et l'activité des 45 jours vient de `seed-month-activity.mjs` (elle contourne l'API). Pour prouver un défaut, crée tes propres données par l'ERP.
