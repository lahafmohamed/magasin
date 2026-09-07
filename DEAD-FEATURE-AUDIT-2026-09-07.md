# Audit « fonctionnalités inutiles » — 2026-09-07

Méthode : recensement exhaustif des routes backend montées dans `server.ts`, des
pages/routes React, des wrappers `services/api.ts`, des tables du dump
`ci-baseline.sql` et des dépendances npm, puis croisement backend ↔ frontend.
Un élément est « mort » quand **aucun** appelant n'existe côté produit
(le code compile et est monté, mais rien ne l'atteint).

Total supprimable identifié : **~1 750 lignes TypeScript**, **11 tables**,
**~25 endpoints**, sans aucun test à réécrire (aucun des modules morts n'est couvert).

> **Lots 1 et 2 exécutés le 2026-09-07.** Lot 1 : §1, §2, §4 (première
> catégorie), §7 et le service worker dupliqué du §8, plus la migration `099`.
> Lot 2 : fusion comptable (§3), commissions (§5) et les trois écrans manquants
> (§4 seconde catégorie), plus la migration `100`. `ci-baseline.sql` régénéré
> deux fois. Backend 439/439 et frontend 84/84 passent, `tsc` et les deux lint
> à 0 erreur. Le lot 3 (hygiène) reste ouvert.

---

## 1. Modules complets sans interface — supprimables en entier

| Module | Fichiers | LOC | Preuve |
|---|---|---|---|
| **POS / caisse tactile** | `routes/pos.ts`, `controllers/POSController.ts`, `services/POSService.ts`, schémas `openPosSessionSchema`/`posQuickSaleSchema` | ~580 | Aucune page `/pos` dans `App.tsx`, aucune entrée `navConfig`, **0 appel** `/api/pos` dans `frontend/src`. Tables `pos_sessions` + `pos_cart_items` (cette dernière n'est référencée nulle part, même pas par `POSService`). |
| **Hiérarchie de caisses** | `routes/caisses-hierarchy.ts`, `controllers/CaisseHierarchyController.ts`, `services/CaisseHierarchyService.ts` | ~663 | 11 endpoints, **0 appel** frontend. Le frontend n'utilise que `/api/caisse` (`CaisseMagasinService`). Table `caisses` lue/écrite **uniquement** par ce service mort. Doublon fonctionnel de la caisse magasin. |
| **Recalcul d'allocation admin** | `routes/admin-allocation.ts`, `controllers/AdminAllocationController.ts` | ~118 | 3 endpoints (`recompute-all`, `test/:clientId`, `recompute/:clientId`), **0 appel** frontend. Outil de maintenance ponctuel : soit l'exposer dans `/admin`, soit le déplacer en script `backend/scripts/`. |

> Ces trois modules n'ont **aucun** fichier `.test.ts` : suppression sans dette de test.

## 2. Shims dépréciés jamais appelés

| Route | LOC | État |
|---|---|---|
| `/api/clients` (`routes/clients.ts`) | 287 | `deprecateRoute('/api/tiers')` + **SQL brut réécrit à la main** dupliquant `TiersService`. 0 appel frontend (`/clients/analytics` est une route **React**, pas l'API). |
| `/api/fournisseurs` (`routes/fournisseurs.ts`) | 50 | Idem, 0 appel frontend. |
| `/api/comptes` (`routes/comptes-clients.ts`) | 76 | 7 endpoints, **1 seul utilisé** (`GET /:clientId/acomptes/disponibles`, `api.ts:403`). Deux autres renvoient déjà `410`. À réduire à l'endpoint vivant — ou à basculer sur `/api/tiers/:id/acomptes-client` et supprimer le routeur. |

## 3. Redondance majeure : deux API comptables parallèles

`/api/comptabilite` et `/api/general-ledger` attaquent la même table
`ecritures_comptables` avec des endpoints équivalents :

| `/api/comptabilite` | `/api/general-ledger` |
|---|---|
| `GET /plan-comptable` | `GET /chart-of-accounts` |
| `GET /ecritures` | `GET /` |
| `POST /ecritures` (`enregistrerPiece`) | `POST /manual-entry` |
| `GET /grand-livre/:compteNumero` | `GET /account/:id/ledger` |
| `GET /balance` | `GET /trial-balance` |
| `GET /journal` | `GET /journal-breakdown` |

Deux pages front en doublon également : `/general-ledger` (libellé menu
« Comptabilité ») et `/comptabilite` (« Saisie comptable »). Un utilisateur voit
deux entrées de menu pour le même grand livre. **Décision à prendre** : garder
`general-ledger` (celui qui porte les exports PDF/Excel, bilan, compte de
résultat) et réduire `comptabilite` à ce qu'il apporte réellement
(`/tresorerie`, `/ratios`), ou l'inverse.

## 4. Endpoints morts dans des routeurs vivants

Vérifiés à zéro occurrence dans `frontend/src` :

- `produits` : `GET /alertes-stock` — doublon de `GET /reorder-suggestions` (seul utilisé par Réapprovisionnement).
- `reports` : `GET /inventory`, `GET /turnover` — la valorisation passe par les endpoints produits.
- `depenses` : `GET /reports/by-location`, `GET /reports/by-categorie`.
- `employes` : `GET /:id/commissions` — **les commissions ne sont affichées nulle part** (voir §5).
- `avoirs` : `POST /:id/apply-to-facture` — impossible d'imputer un avoir sur une facture depuis l'UI.
- `stock-transfers` : `POST /:id/cancel` — un transfert ne peut pas être annulé depuis l'UI.
- `comptabilite` : `GET /plan-comptable/search`.
- `notifications` : `GET /status`.
- `auth` : `POST /revoke-all-sessions/:userId` — révocation admin non exposée.
- `clients` : `GET /with-balance`.

Deux catégories à ne pas confondre : `alertes-stock`, `reports/inventory`,
`reports/turnover`, `depenses/reports/*`, `plan-comptable/search`,
`notifications/status`, `clients/with-balance` sont **à supprimer** (doublons ou
sans usage). `avoirs/apply-to-facture`, `stock-transfers/cancel`,
`revoke-all-sessions` et `employes/commissions` sont des **fonctions manquantes
côté UI**, pas du code inutile — soit on câble l'écran, soit on retire le backend.

## 5. Commissions employés — pas mortes, cassées

> **Correction apportée à l'exécution du lot 2.** La première version de cette
> section concluait « fonctionnalité fantôme, backend-only ». L'inspection du
> code a montré l'inverse.

La chaîne est complète **sauf le déclencheur** :

- `PayrollService` somme `commissions_ventes` pour la colonne « commissions » de
  chaque bulletin ([PayrollService.ts:177](backend/src/services/PayrollService.ts:177)) ;
- `Employes.tsx` affiche un récapitulatif par employé (`getCommissionSummary` est
  bien appelé — le grep initial cherchait `/commissions` et ratait
  `commission-summary`) ;
- `employes.commission_taux` est saisissable dans le formulaire.

Mais **rien n'écrivait jamais** dans `commissions_ventes` : le seul chemin
d'écriture, `POST /api/employes/:id/commission`, n'était appelé par aucun écran.
Résultat : tous les récapitulatifs et tous les bulletins affichaient 0. Ce n'est
pas du code mort à supprimer, c'est une fonctionnalité à brancher — voir le lot 2
en fin de document.

Reste effectivement inutilisé : `POST /employes/shifts` et le wrapper
`employeService.recordShift` (pointage), sans écran ni consommateur.

## 6. Wrappers `api.ts` sans appelant (nettoyage frontend)

~45 fonctions exportées ne sont appelées par aucune page/composant. Les plus
notables :

`factureService.delete` · `factureService.updateStatut` ·
`devisService.convertToFacture` · `bonLivraisonService.delete` ·
`commandeService.delete` · `creditNoteService.delete` / `updateStatut` /
`createFromRetour` · `receptionService.create` / `delete` / `getPending` /
`getStats` / `getOrderDetails` · `paiementService.getAll` / `getByFacture` /
`update` · `generalLedgerService.createManualEntry` / `getStats` /
`getJournalBreakdown` · `reportService.getConsolidatedDashboard` /
`getRevenueTrends` · `crmService.getRappels` / `marquerRappelFait` ·
`tiersService.promouvoir` / `getReleveDetaille` · `payrollService.getStats`.

Attention : plusieurs de ces `delete`/`updateStatut` correspondent à des routes
backend **gardées par rôle et fonctionnelles**. Leur absence côté UI est un
choix implicite, pas forcément un bug — mais elle doit être assumée.

## 7. Tables mortes en base

Aucune référence dans `backend/src/**/*.ts` :

| Table | Verdict |
|---|---|
| `_deprecated_internal_stock_request_lignes` | Renommée « deprecated » puis jamais droppée. |
| `_deprecated_internal_stock_requests` | Idem. |
| `_deprecated_three_way_match_details_2026_05` | Idem (le 3-way match vit dans `082`). |
| `_deprecated_three_way_matches_2026_05` | Idem. |
| `pos_cart_items` | Panier POS, jamais écrit même par `POSService`. |
| `allocation_audit` | Créée en `043`, aucune écriture applicative. |
| `taux_tva` | La TVA est supprimée par politique (`027`). Table + colonne `facture_avoir_lignes.taux_tva_id` résiduelles. |

Orphelines **après** le retrait des modules du §1 (elles n'étaient référencées
que par le code supprimé) :

| Table | Verdict |
|---|---|
| `pos_sessions` | Sessions POS. |
| `barcode_scans` | Historique de scans « à but analytique », écrit par `POSService.scanBarcode`, jamais lu par un écran. |
| `caisses` | Hiérarchie de caisses. La colonne `sessions_caisse.caisse_id` qui la référençait n'était jamais écrite : `099` la retire aussi. |
| `transferts_caisse` | Transferts inter-caisses, avec la fonction `transferer_fonds_caisse()` que `099` supprime avant les tables. |

Cas particulier : **`facture_avoir_lignes`** n'est référencée par aucun TS mais
reste écrite par la fonction PL/pgSQL de génération d'avoir depuis un retour
(`ci-baseline.sql:497`). **Ne pas dropper** — c'est une écriture réellement
vivante, portée par un trigger, invisible depuis le code applicatif.

## 8. Divers

- **Service worker enregistré deux fois** : `frontend/src/main.tsx:19` *et* un
  script inline dans `frontend/index.html:46`. Le second ne teste même pas
  `isLocalhost`. Supprimer celui de `index.html`.
- **Notifications à deux systèmes** : SSE (`useSseNotifications`, appelé dans
  `App.tsx`) pour les toasts, et polling 30 s (`useDemandeNotifications`) pour
  la cloche. La cloche pourrait consommer le flux SSE déjà ouvert et économiser
  ~2 900 requêtes/jour/poste.
- **Migrations de greffe legacy** : `068_pbd_legacy_plan_comptable_graft.sql`,
  `068_z_legacy_ecritures_graft.sql`, `068_zz_legacy_plan_comptable_check_drop.sql`,
  `084_z_drop_legacy_serial_lot_views.sql` (110 lignes) n'existaient que pour
  converger la base `pbd_db`, décommissionnée le 2026-08-31. No-op sur toute
  base saine — candidats à la suppression une fois confirmé qu'aucune base
  client ne reste sur une chaîne pré-060.
- **Documentation** : 12 fichiers `.md` racine, 3 603 lignes, dont 1 620 pour les
  trois `UX_*_2026-07-23.md` et 525 pour `PRODUCT-UX-AUDIT-2026-08-17.md`, tous
  marqués exécutés. À archiver dans `docs/archive/`.
- **`CLAUDE.md` périmé** : annonce « la migration la plus haute est `096` », il y
  a `097` et `098`.

---

## Ce qui est sain (vérifié, rien à retirer)

- **Frontend** : les 45 pages sont routées et atteignables, les 29 primitives
  `components/ui` ont toutes au moins un consommateur, les 7 hooks aussi, et les
  29 objets de service d'`api.ts` sont tous utilisés. `playwright` a déjà été
  retiré des devDeps.
- **Dépendances npm** : aucune dépendance de production inutilisée des deux côtés.
- **Modules désactivables** (`frontend/src/config/modules.ts`, migration `098`) :
  le catalogue couvre déjà 25 modules avec 4 verrouillés. C'est le bon levier
  pour « une boutique sans dépôt » — pas une raison de supprimer du code.

## Plan d'action proposé

**Lot 1 — ✅ fait le 2026-09-07**
POS, hiérarchie de caisses, admin-allocation, shims
`clients`/`fournisseurs`/`comptes` (+ `middleware/deprecation.ts`), endpoints
morts du §4 première catégorie, SW dupliqué dans `index.html`. Migration `099` :
`DROP` des 11 tables mortes, de la fonction `transferer_fonds_caisse()` et de la
colonne `sessions_caisse.caisse_id` (**pas** `facture_avoir_lignes`), puis
régénération de `ci-baseline.sql` — qui rattrape au passage `096` et `098`,
absents du dump précédent.

Un effet de bord utile : `acompteService.listForClient` pointe désormais sur
`/tiers/:id/acomptes-client/disponibles`. L'ancien shim filtrait
`statut = 'disponible'` seulement, sans `montant_restant > 0` ni `deleted_at` —
un acompte partiellement utilisé disparaissait donc de la liste d'imputation
d'une facture alors qu'il lui restait de l'argent. `FactureDetail` lisait déjà
`montant_restant`, le bon comportement s'applique sans autre changement.

**Lot 2 — ✅ fait le 2026-09-07**

*Fusion comptable (§3)* — une seule page, `/general-ledger` « Comptabilité »,
avec les onglets Écritures · Grand-livre · Balance · Plan comptable et un
dialogue « Nouvelle écriture ». `/comptabilite` redirige (les favoris survivent),
l'entrée de menu « Saisie comptable » disparaît. Neuf endpoints doublons
supprimés. Le partage retenu : `general-ledger` pour la consultation et les
exports, `comptabilite` pour ce qu'il est seul à faire — saisie de pièce,
grand-livre par numéro de compte, trésorerie prévisionnelle. La saisie conservée
est `POST /api/comptabilite/ecritures` : elle numérote la pièce elle-même,
accepte un tiers par ligne et journalise l'audit, ce que
`/general-ledger/manual-entry` ne faisait pas.

> Au passage : `enregistrerPiece` ne vérifiait pas l'existence des comptes. Un
> numéro inconnu violait `fk_ecritures_compte_numero` et remontait en 500 opaque
> — exactement la régression que couvrait le test de l'endpoint supprimé. Le
> contrôle est ajouté (404 nommant le compte fautif) et le test suit le chemin
> survivant.

*Commissions (§5)* — le diagnostic était faux dans la première version de ce
document : les commissions ne sont pas mortes, elles sont **cassées**. La paie
les somme, la fiche employé les affiche, le taux est saisissable — mais rien
n'écrivait jamais dans `commissions_ventes`. La migration `100` pose
`trg_commission_vente` sur `factures`, seul point de passage commun aux cinq
chemins de création de facture, avec repli du vendeur sur le créateur du BL puis
du devis (les deux fonctions PL/pgSQL de conversion et `BonLivraisonService`
n'alimentent pas `cree_par` — sans ce repli, la conversion BL → facture, le
chemin de vente le plus courant en magasin, ne commissionnerait personne). Un
index unique `(employe_id, facture_id)` interdit la double commission. La paie
et la fiche employé excluent maintenant les factures annulées ou supprimées :
sans ce filtre, une facture annulée aurait continué de gonfler le brut d'un
bulletin. Le récapitulatif gagne le détail ligne à ligne, et le point d'entrée
manuel `POST /employes/:id/commission` est supprimé — le trigger est le seul
chemin d'écriture.

*Écrans manquants (§4, seconde catégorie)* — imputation d'un avoir sur une
facture du même client (AvoirDetail, sélecteur limité aux factures non soldées),
annulation d'un transfert en attente (StockTransfers, confirmation destructive),
révocation des sessions d'un compte (UserManagement — désactiver un compte
n'expulse pas les jetons déjà émis).

**Lot 3 — ✅ fait le 2026-09-07 (sauf les greffes, volontairement)**

*Wrappers orphelins* — la liste du §6 mélangeait deux choses. Une partie des
wrappers n'était pas morte : **la page refaisait le même appel en direct**.
`Receptions.tsx` appelait `api.get('/receptions/pending')`, `/receptions/order/:id`
et `api.post('/receptions')` à la main pendant que `receptionService` exposait
exactement ces trois méthodes. La page passe maintenant par les services ; au
passage elle quitte l'instance axios d'`authService` (celle qui ne déballe pas
l'enveloppe), d'où la disparition des `data.data || data`.

Le reste — **37 wrappers** — est supprimé (`api.ts` : 1 712 → 1 499 lignes). Un
cas mérite d'être signalé : `caisseService.getMagasins` appelait
`/stock-locations`, pas `/caisse/magasins`. Les deux ne renvoient pas la même
chose — le second filtre sur les magasins de l'utilisateur connecté. Le wrapper
n'avait aucun appelant, mais le premier qui s'y serait fié aurait silencieusement
récupéré **toutes** les localisations. Supprimé.

*Cloche sur SSE* — `DemandeService` émet `demande-changed` après le COMMIT de ses
sept transitions, via `NotificationService.safely()`. Le message ne transporte
aucune donnée métier : il invalide, et la cloche recharge son décompte, déjà
filtré par rôle côté serveur. Répliquer la machine à états dans l'événement
l'aurait dupliquée des deux côtés et aurait poussé des numéros de demande vers
des sessions sans droit dessus. Le pont passe par un événement DOM plutôt qu'un
second `EventSource` (les navigateurs plafonnent les connexions par origine).
Le sondage tombe de 30 s à 5 min en simple filet : il lançait jusqu'à trois
requêtes par tour, soit ~8 600 requêtes/jour pour un poste admin.

*Documentation* — cinq audits exécutés déplacés dans `docs/archive/` (qui
existait déjà), ~2 340 lignes hors de la racine, liens croisés corrigés.
`PLAN.md` et `INTERFACE-RULES-AUDIT-2026-08-27.md` restent à la racine : le
second porte encore « **Report only — nothing implemented yet** », donc rien ne
permet de le classer comme exécuté.

*Greffes legacy — conservées, sciemment.* `migrate.mjs` calcule
`pending = fichiers − schema_migrations` : un fichier supprimé après application
est simplement ignoré, donc les retirer ne casse aucune base déjà à jour. Mais
une base client restée sur une chaîne pré-060 en aurait toujours besoin, et
l'état du parc ne se vérifie pas depuis le dépôt. 110 lignes de SQL no-op ne
valent pas ce risque : à retirer après un `node migrate.mjs --status` sur chaque
client.

**Reste ouvert** — `Reporting.tsx`, `CaisseV2.tsx` et `DepensesV2.tsx` appellent
encore l'API en direct sur des chemins sans wrapper (rapports, mouvements de
caisse, dépenses). Les câbler demanderait d'ajouter une quinzaine de méthodes à
`api.ts` : c'est une conversion, pas du nettoyage.
