# Audit produit & UX — 17 août 2026

**Périmètre.** Audit produit (fonctionnalités manquantes à valeur métier pour un magasin informatique) + audit UI/UX de clarté (placeholders, lisibilité des montants, jargon, états vides/erreurs/confirmations) pour des utilisateurs non techniques (caissiers, gérants). Les 45 pages de `frontend/src/pages`, les composants de `frontend/src/components`, et l'ensemble des 33 routeurs / 27 contrôleurs backend ont été lus. *(L'objectif initial listait 6 pages ; l'arborescence réelle en contient 45 — le périmètre complet a été validé.)*

**Règle de non-duplication.** Les constats déjà corrigés d'après AUDIT.md, FEATURE-AUDIT.md, DESIGN-AUDIT.md, UX_USABILITY_AUDIT_2026-07-23.md et UX_REMEDIATION_PLAN_2026-07-23.md ne sont pas re-signalés. Un constat antérieur encore présent dans le code est marqué **STILL OPEN** avec sa preuve `fichier:ligne` actuelle. Cet audit exclut volontairement la qualité de code, la sécurité, l'architecture et la performance.

**Référence de format monétaire.** L'utilitaire unique est `formatCurrency` (frontend/src/utils/format.ts:70-78) : `Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })` + suffixe « FCFA » → **« 1 250 000 FCFA »** (séparateur espace, 0 décimale). C'est la cible correcte ; les écarts sont signalés page par page.

---

## 1. Inventaire des fonctionnalités actuelles

Tous les routeurs sont montés dans `backend/src/server.ts:105-143` sous `/api/*`.

### Ventes
| Capacité | Preuve |
|---|---|
| Devis : CRUD, statuts, stats, **PDF**, conversion en BL/facture | backend/src/routes/devis.ts:22,34 |
| Bons de livraison : CRUD, statuts, **PDF**, conversion en facture | backend/src/routes/bons-livraison.ts:21,33 |
| Factures : création directe, statuts, stats, **PDF**, export JSON complet | backend/src/routes/factures.ts:13,19 |
| **Paiements partiels** multiples par facture + reçu de paiement PDF | backend/src/routes/factures.ts:25-26, backend/src/routes/paiements.ts:18 |
| Acomptes client : enregistrement, application, remboursement | backend/src/routes/acomptes.ts:10-13, backend/src/routes/tiers.ts:32 |
| POS : sessions, vente rapide, **scan code-barres** (journalisé) | backend/src/routes/pos.ts:15-24 (scan :21) |
| Retours clients : machine à états, restockage à l'approbation | backend/src/routes/retours.ts:15-16 |
| Avoirs : depuis retour, manuel, application sur facture, PDF, stats | backend/src/routes/avoirs.ts:21-33 |
| Analytics ventes : tendances CA, top produits, top clients | backend/src/routes/factures.ts:15-17 |
| Plafond de crédit client appliqué à la création BL/facture/devis-confirm | backend/src/services/CreditService.ts (`assertWithinCreditLimit`) |

### Achats
| Capacité | Preuve |
|---|---|
| Demandes internes magasin→dépôt (workflow complet) | backend/src/routes/demandes.ts:30-52 |
| Commandes fournisseur : CRUD, statuts, stats, bon de commande PDF | backend/src/routes/commandes.ts:15 |
| Rapprochement 3 voies (commande↔réception↔facture + tolérances) | backend/src/routes/commandes.ts:13, backend/src/routes/factures-fournisseur.ts:19-20 |
| Réceptions contre commande + stats | backend/src/routes/receptions.ts:11-16 |
| Factures fournisseur : création, paiement, acomptes, compensation | backend/src/routes/factures-fournisseur.ts:16-23, backend/src/routes/tiers.ts:33,77-78 |
| Suggestions de réapprovisionnement automatiques | backend/src/routes/produits.ts:20 |

### Stock
| Capacité | Preuve |
|---|---|
| Produits : CRUD, recherche fuzzy, mouvements, ajustements | backend/src/routes/produits.ts:12-31 |
| **Alertes stock bas** (liste, consultation à la demande) | backend/src/routes/produits.ts:19 |
| Valorisation du stock (globale + par catégorie), info dernier coût/CMP | backend/src/routes/produits.ts:21-23 |
| **Multi-magasin** : emplacements, stock par lieu, transferts inter-magasins | backend/src/routes/stock-locations.ts:12-18, backend/src/routes/stock-transfers.ts:14-16 |

### Comptabilité / Caisse
| Capacité | Preuve |
|---|---|
| Plan comptable, écritures, grand livre, balance, journaux | backend/src/routes/comptabilite.ts:13-122, backend/src/routes/general-ledger.ts:20-27 |
| Exports PDF : grand livre, bilan, compte de résultat | backend/src/routes/general-ledger.ts:55,110,128 |
| Caisse : ouverture/clôture de session, mouvements, historique, audit | backend/src/routes/caisse.ts:18-50 |
| Hiérarchie de caisses + transferts de fonds + rapport consolidé | backend/src/routes/caisses-hierarchy.ts:12-44 |
| Dépenses V2 : CRUD, catégories, rapports par lieu/catégorie | backend/src/routes/depenses.ts:12-33 |

### Tiers / CRM
| Capacité | Preuve |
|---|---|
| Tiers unifiés (clients+fournisseurs) : CRUD, solde, relevé PDF | backend/src/routes/tiers.ts:12-29 |
| Balance âgée clients (créances par ancienneté) + export | backend/src/routes/reports.ts:14-15 |
| CRM : interactions, tâches, rappels | backend/src/routes/crm.ts:19-149 |
| Pièces jointes sur documents (upload/téléchargement, ACL) | backend/src/routes/attachments.ts:9-12 |

### RH / Paie
| Capacité | Preuve |
|---|---|
| Employés : CRUD, commissions (saisie manuelle), shifts | backend/src/routes/employes.ts:19-27 |
| Paie : cycles (générer/valider/payer/annuler), bulletins PDF, config CNPS/ITS | backend/src/routes/payroll.ts:20-35 |

### Admin / Reporting
| Capacité | Preuve |
|---|---|
| Auth, gestion utilisateurs, rôles, affectations aux emplacements | backend/src/routes/auth.ts:10-21, backend/src/routes/admin-users.ts:12-16, backend/src/routes/user-location-assignments.ts:12-15 |
| Paramètres société (logo, devise, identifiants fiscaux) | backend/src/routes/company-settings.ts:13-24 |
| Journal d'audit (consultation admin) | backend/src/routes/audit.ts:10 |
| **Rapports par période** : KPIs, P&L, marges, tendances, comparaison N-1, prévision, consolidé multi-magasins | backend/src/routes/reports.ts:12-25 |
| Flux SSE de notifications (infrastructure) | backend/src/routes/notifications.ts:14 |

**Déjà couvert — ne pas re-demander** : devis/proformas ✔, paiements partiels & créances ✔, retours/avoirs (backend) ✔, PDF de tous les documents de vente ✔, rapports par période/produit ✔, achats fournisseur complets ✔, multi-magasin ✔, export Excel (généré côté frontend via `useExportExcel` ; les endpoints `/export` renvoient du JSON — backend/src/routes/factures.ts:13, general-ledger.ts:30, reports.ts:14) ✔.

---

## 2. Fonctionnalités manquantes (classées par valeur métier)

### M1. Codes-barres de bout en bout — Effort : **S/M** — NOUVEAU (précise F-3) — **✅ LIVRÉ le 2026-08-17**
- **Quoi** : la chaîne existait à moitié. Le scan POS existe (backend/src/routes/pos.ts:21, colonne `produits.code_barre` dans backend/src/db/007_receptions.sql:33), mais `code_barre` était **absent de `createProduitSchema`/`updateProduitSchema` et de `ProduitService`** — impossible d'attribuer un code-barres à un produit via l'application. Côté frontend, le bouton « Scanner code-barres » de la nouvelle facture était **mort (aucun `onClick`)**.
- **Pourquoi** : un magasin informatique vend des articles à référence EAN (claviers, souris, cartouches). Scanner au lieu de taper divise le temps d'encaissement et supprime les erreurs de saisie.
- **Étend** : Inventaire (fiche produit) + NouvelleFacture/POS.
- **Livré** : champ « Code-barres » dans le formulaire produit (création + modification), enregistré via les schémas Zod et `ProduitService` (chaîne vide normalisée en `NULL` car la colonne est `UNIQUE`) ; recherche par code-barres exact dans l'inventaire, la recherche floue et le sélecteur magasin ; **un code scanné dans la recherche produit d'une facture ou d'un devis ajoute la ligne immédiatement** (scanner deux fois le même article incrémente la quantité) ; message d'erreur distinct quand le code est déjà attribué à un autre produit ; code-barres affiché dans la liste et exporté en CSV. Aucune migration nécessaire (colonne préexistante).

### M2. Garanties, retours atelier et numéros de série (RMA) — Effort : **L** — STILL OPEN (F-19)
- **Quoi** : suivi par numéro de série, date d'achat → échéance de garantie, dossier de retour atelier (reçu, statut réparation, retour client). Le tracking série a été retiré du code (migration `085`) ; la décision de re-création est explicitement en attente (FEATURE-AUDIT F-19).
- **Pourquoi** : c'est LE différenciateur d'un magasin informatique : « ce PC est-il encore sous garantie ? » est une question quotidienne au comptoir. Aujourd'hui rien ne relie un article vendu à sa facture d'origine.
- **Étend** : Factures (lignes) + Retours + fiche produit.

### M3. Interface Retours clients — Effort : **M** — STILL OPEN (F-1) — **✅ LIVRÉ le 2026-08-17**
- **Quoi** : le backend des retours était complet (backend/src/routes/retours.ts:15-16, restockage à l'approbation) mais **aucune page frontend n'existait**. Les retours passaient par un avoir manuel sans mouvement de stock.
- **Pourquoi** : les retours de matériel défectueux sont fréquents en informatique ; sans UI, le stock diverge de la réalité à chaque retour.
- **Étend** : Ventes (nouvelle page + lien depuis FactureDetail).
- **Livré** : page `frontend/src/pages/Retours.tsx` (route `/retours`, entrée « Retours clients » dans le menu Ventes, réservée admin/manager comme le backend). Liste paginée avec statistiques (en attente / approuvés / total remboursé), statut explicite (« Approuvé — stock réintégré »), détail par retour, et création guidée : on choisit la **facture d'origine**, ses articles deviennent les seuls retournables (quantité plafonnée à la quantité facturée), chaque ligne porte un motif (défectueux, non conforme, erreur de référence, autre). Approbation et annulation passent par une confirmation qui énonce l'effet sur le stock. Le stock n'est réintégré qu'à l'approbation, conformément au backend. 4 tests ajoutés (`Retours.test.tsx`).
- **Piège rencontré** : la colonne réelle est `factures.tiers_id` ; `client_id` n'est qu'un alias hérité absent de la projection (backend/src/services/FactureService.ts:21-22). Envoyer `facture.client_id` aurait fait échouer chaque création sur « Client requis ». Le type `Facture` a été corrigé en conséquence.

### M4. Alertes actives (stock bas, impayés) — Effort : **M** — précise F-15 avec preuve nouvelle — **✅ PARTIELLEMENT LIVRÉ le 2026-08-17**
- **Quoi** : l'infrastructure SSE existait (backend/src/routes/notifications.ts:14, `NotificationService` avec `invoiceCreated`/`paymentReceived`) mais **aucun code métier n'appelait jamais ces émetteurs** — les clients ne recevaient que l'événement `connected`.
- **Pourquoi** : le gérant veut être prévenu (« stock souris < 5 », « facture impayée +30 j ») sans aller chercher l'info. La plomberie était déjà payée ; il manquait les producteurs d'événements et un centre de notifications persistant.
- **Étend** : Notifications + Dashboard.
- **Livré** : les émetteurs sont câblés — facture créée (`FactureService.create`) et paiement encaissé (`PaiementService`) émettent **après le COMMIT**, via un `NotificationService.safely()` qui garantit qu'une panne de notification ne peut jamais annuler une vente déjà enregistrée. Nouvelle alerte **stock bas déclenchée par la vente elle-même** : après chaque facture, `checkLowStock` relit le stock consolidé des produits vendus et alerte ceux repassés sous leur seuil. Côté client, l'alerte **nomme le produit et son stock restant** avec un bouton « Voir le produit » (auparavant : « Vérifiez le tableau de bord pour les détails », sans dire lequel), et les notifications porteuses d'un lien ont un bouton « Ouvrir ».
- **Diffusion restreinte par rôle (nouveau)** : `broadcast` poussait à **toutes** les sessions connectées. Les événements portant un montant et un nom de client (facture, paiement) sont désormais réservés aux rôles admin/manager ; les alertes de stock, purement opérationnelles, restent diffusées à tous. Sans ce filtre, câbler les émetteurs aurait envoyé le chiffre d'affaires à chaque caissier connecté — l'inverse du travail de cloisonnement fait en juillet-août.
- **Perte du flux signalée** : le flux se coupait en silence (constat DESIGN-AUDIT §4 « SSE connection loss fully silent », STILL OPEN jusqu'ici) — l'utilisateur pouvait croire « aucune alerte » alors que plus rien n'arrivait. Après 3 échecs de reconnexion, un avertissement unique s'affiche, et le rétablissement est confirmé.
- **Reste ouvert** : le **centre de notifications persistant** (F-15 — historique, lu/non-lu) ; la cloche n'affiche toujours que les demandes de réapprovisionnement, et une alerte manquée pendant une déconnexion est perdue. Les relances d'impayés restent liées à M6.

### M5. Rapports de ventes par vendeur — Effort : **M** — NOUVEAU
- **Quoi** : aucune colonne vendeur sur `factures` (aucune référence dans `FactureService`), aucun rapport par vendeur dans backend/src/routes/reports.ts:12-25. Les commissions employé existent mais en **saisie manuelle uniquement** (backend/src/routes/employes.ts:24).
- **Pourquoi** : avec plusieurs caissiers/vendeurs (rôles caissier/manager déjà en place), le gérant doit savoir qui vend quoi ; les commissions devraient découler des factures, pas d'une double saisie.
- **Étend** : Factures (champ vendeur) + Reporting + Employés/commissions.

### M6. Relances impayés et devis expirés — Effort : **M** — STILL OPEN (F-22) — **✅ VOLET IMPAYÉS LIVRÉ le 2026-08-17**
- **Quoi** : liste de relance à partir de la balance âgée existante (backend/src/routes/reports.ts:15) + relevé PDF (backend/src/routes/tiers.ts:29) : file « à relancer », trace des relances, échéances de devis.
- **Pourquoi** : le crédit client est central ici (plafond de crédit, acomptes, aging déjà codés) — mais rien ne poussait à recouvrer. Pour une petite structure, la relance = trésorerie.
- **Étend** : Reporting (créances) + CRM (tâches).
- **Livré** : page `frontend/src/pages/Relances.tsx` (route `/relances`, menu Contacts, admin/manager). **Aucune nouvelle table** : la file de relance est la balance âgée existante, et chaque relance est enregistrée comme interaction CRM de type `relance` — l'historique client existant devient le journal de recouvrement. Chaque ligne affiche **depuis combien de jours le client est impayé** (le critère qui décide d'une relance, plus que le montant), son téléphone cliquable, la part à plus de 60 jours, et la date de la dernière relance (« Jamais relancé » sinon). Le dialogue enregistre le canal (téléphone, WhatsApp, e-mail, passage en boutique), la réponse du client et une date de rappel ; le relevé PDF se télécharge depuis la même ligne. 5 tests ajoutés.
- **Ajout backend minime** : `getReceivablesAging` renvoie désormais `telephone`, `email` et `plus_ancienne_facture` (backend/src/services/ReportingService.ts) — sans le téléphone, un écran de relance oblige à ouvrir la fiche client pour chaque appel.
- **Reste ouvert** : la relance des **devis expirés** (l'autre moitié de F-22) et l'envoi automatique, qui dépend de M7 (e-mail).

### M7. Envoi des documents par e-mail — Effort : **M** — STILL OPEN (F-12)
- **Quoi** : aucun endpoint d'envoi (aucune infra SMTP dans backend/src). Devis, factures et relevés PDF ne peuvent qu'être imprimés/téléchargés puis envoyés à la main.
- **Pourquoi** : un devis envoyé en 1 clic depuis DevisDetail se convertit plus vite ; prérequis aussi pour les relances (M6) et le reset de mot de passe (F-13).
- **Étend** : DevisDetail / FactureDetail / TiersDetail.

### M8. Import Excel/CSV produits & clients — Effort : **M** — STILL OPEN (F-11)
- **Quoi** : aucune route d'import (seuls les scripts seed `.mjs` côté serveur). Un nouveau client SaaS doit saisir son catalogue à la main.
- **Pourquoi** : un magasin informatique a des centaines de références ; l'import avec mapping + dry-run est la condition d'un onboarding réaliste (le modèle SaaS multi-clients est déjà l'objectif du dépôt `deploy/`).
- **Étend** : Inventaire + Tiers.

### M9. Inventaire physique (comptage) — Effort : **M/L** — STILL OPEN (F-9)
- **Quoi** : sessions de comptage par emplacement, écarts théorique/compté, ajustement en masse validé. Aujourd'hui seul l'ajustement produit par produit existe (backend/src/routes/produits.ts:30-31).
- **Pourquoi** : le comptage annuel (ou tournant) est inévitable en boutique ; sans module, il se fait hors système et le stock déraille.
- **Étend** : Inventaire + StockLocations.

### M10. Grilles tarifaires / prix par client — Effort : **M** — STILL OPEN (F-20)
- **Quoi** : prix revendeur vs comptoir, remise par client ou par catégorie. Un seul `prix_vente` par produit aujourd'hui.
- **Pourquoi** : l'activité est **détail + gros** (CLAUDE.md) : les revendeurs négocient des prix différents ; les caissiers les re-tapent à la main dans la remise ligne à ligne (frontend/src/pages/NouvelleFacture.tsx:713-725), sans contrôle.
- **Étend** : Tiers + NouvelleFacture/NouveauDevis.

### M11. Cycle de vie complet des avoirs dans l'UI — Effort : **S** — NOUVEAU — **✅ PARTIELLEMENT LIVRÉ le 2026-08-17**
- **Quoi** : (1) le formulaire de création forçait le type `'erreur'` en dur alors que la liste filtre 4 types ; (2) la page AvoirDetail n'offre **que** « Imprimer » (frontend/src/pages/AvoirDetail.tsx:108-111) — aucune action valider/annuler/appliquer alors que le badge affiche un statut brouillon/validé/utilisé et que le backend expose l'application sur facture (backend/src/routes/avoirs.ts:21-33).
- **Pourquoi** : l'avoir est l'outil quotidien du SAV ; l'utilisateur doit passer par FactureDetail pour l'appliquer, sans le savoir.
- **Étend** : Avoirs.
- **Livré** : sélecteur « Motif de l'avoir » dans le formulaire de création (4 motifs, défaut « Retour marchandise »), avec les libellés partagés dans `frontend/src/utils/avoirTypes.ts` — la liste et le formulaire ne peuvent plus diverger. **Reste ouvert** : les actions de cycle de vie sur AvoirDetail (valider / annuler / appliquer sur facture).

### M12. Recherche et filtres sur les listes financières d'achats — Effort : **S** — NOUVEAU — **✅ LIVRÉ le 2026-08-17**
- **Quoi** : Réceptions n'avait **aucune recherche** sur la liste des commandes en attente ; FacturesFournisseur n'avait **que** le filtre statut (tri client-side limité à la page courante, admis en commentaire :116-117) ; DepensesV2 n'avait ni recherche, ni filtre date, ni filtre catégorie.
- **Pourquoi** : retrouver « la facture EDS du mois dernier » obligeait à paginer à l'aveugle.
- **Étend** : Achats / Dépenses (aligner sur `DocumentListPage`).
- **Livré** : recherche sur les trois pages. **Le backend supportait déjà tous ces filtres** — ils n'étaient simplement pas câblés : `FactureFournisseurService.getAll` acceptait `search` (backend/src/services/FactureFournisseurService.ts:84) et `DepenseServiceV2.getAll` acceptait `search`/`categorie_id`/`date_debut`/`date_fin` (backend/src/services/DepenseServiceV2.ts:541-600). Factures fournisseur : recherche serveur débouncée (n° interne, n° fournisseur, raison sociale). Dépenses : recherche + filtre catégorie + période, avec bouton « Effacer les filtres » et état vide distinct « aucun résultat » vs « aucune dépense ». Réceptions : filtre client (la liste des commandes en attente est chargée en entier). **Reste ouvert** : migration de ces listes vers `DocumentListPage`, et le tri serveur des factures fournisseur.

*Écartés comme non justifiés par l'activité montrée dans le code : fabrication/BOM, budgets, immobilisations, portail client (F-25/F-26/F-32 restent au backlog général de FEATURE-AUDIT.md).*

---

## 3. Audit UI/UX par page

### Constats transverses (s'appliquent à presque toutes les pages)

| # | Constat | Preuve | Statut |
|---|---|---|---|
| T1 | Un seul « vrai » formateur monétaire, mais 3 noms + 4 styles d'import (`formatCurrency` ~165 usages / `formatFCFA` ~26 / `formatXOF` direct 5 fichiers / `formatFCFA as formatXOF` 7 fichiers) | frontend/src/utils/format.ts:70-85 | **STILL OPEN** (DESIGN-AUDIT §7.1) |
| T2 | Le total de DevisDetail rend « F CFA » via `Intl … currency: 'XOF'` au lieu de « FCFA » — seule page divergente | frontend/src/pages/DevisDetail.tsx:206 | **STILL OPEN** (DESIGN-AUDIT §3.1) |
| T3 | Copies privées du formateur : print-layout (`fmtMoney`, sans garde NaN) et GeneralLedger (`fmt`, nombre nu, devise déportée en en-tête) | frontend/src/components/ui/print-layout.tsx:56-57, frontend/src/pages/GeneralLedger.tsx:74 | **STILL OPEN** (DESIGN-AUDIT §7.1) |
| T4 | Dates : 47 appels inline `toLocaleDateString` dans 25 fichiers contre 34 usages des utilitaires `formatDate`/`formatDateShort` — le format long/court varie d'une page à l'autre | frontend/src/utils/format.ts:90-105 | **STILL OPEN** (AUDIT.md §5, DESIGN-AUDIT §3.2) |
| T5 | Signe moins : U+2212 « − » (Tresorerie.tsx:86, Reporting.tsx:290) vs ASCII « - » (DepensesV2.tsx:621, CaisseV2.tsx:766) | cités | NOUVEAU |
| T6 | Ellipses : « ... » ASCII dans les pickers (DocumentPicker.tsx:147, TiersPicker.tsx:119, NouveauDevis.tsx:310) vs « … » ailleurs ; guillemets « » vs "" (GlobalSearch.tsx:234) | cités | NOUVEAU |
| T7 | `MoneyInput` groupe les milliers avec U+00A0 alors qu'`Intl` produit U+202F — quasi identiques à l'écran, différents au copier-coller | frontend/src/components/ui/money-input.tsx:11-17 | NOUVEAU (mineur) |
| T8 | `ErrorBoundary` affiche le `error.message` brut (anglais/technique) à l'utilisateur | frontend/src/components/ErrorBoundary.tsx:38 | NOUVEAU |
| T9 | Fallback vendeur imprimé « Administrator » (anglais) sur tous les documents | frontend/src/components/ui/print-layout.tsx:133 | NOUVEAU |
| T10 | Toasts de chargement « télégraphiques » hors convention (« Erreur chargement contacts »…) : Tiers.tsx:92, TiersDetail.tsx:248, Employes.tsx:132, AuditLog.tsx:60, Receptions.tsx:101,119,193, StockLocations.tsx:81, StockTransfers.tsx:160,178,243, Comptabilite.tsx:78-106 | cités | NOUVEAU |

**Verdict global montants** : le format cible « 1 250 000 FCFA » (0 décimale, alignement droite dans les listes, totaux en gras) est respecté sur la grande majorité des pages. Les écarts précis sont listés par page ci-dessous ; les exports CSV divergent parfois de l'écran (2 décimales : Inventaire.tsx:502-504, ClientAnalytics.tsx:61).

---

### 3.1 Ventes

#### Factures — frontend/src/pages/Factures.tsx
- **(a) Placeholders** : `"Rechercher par numéro de facture ou client…  ( / )"` :179 — **exemple utile** (champs cherchés + raccourci), à garder tel quel.
- **(b) Montants** : `formatXOF`, colonne Total alignée à droite :61-63 ✔. La colonne **Payé n'est pas alignée à droite** (:81-86) alors que Total l'est — aligner. Sous-ligne `Reste: …` :86 lisible.
- **(c) Jargon** : tooltip `"Allocation FIFO: les paiements remboursent les factures les plus anciennes en premier"` :69 — « Allocation FIFO » est du vocabulaire d'algorithme. Proposition : *« Les paiements règlent d'abord les factures les plus anciennes »*. Le CSV exporte les statuts bruts (`payee`, `en_attente`) :33 → exporter les libellés français.
- **(d) États** : vides et erreurs conformes (:120, :205-206). Bouton « Ouvrir dans un nouvel onglet » visible uniquement au survol (`opacity-0 group-hover:opacity-100`) :101-107 — invisible sur tactile.

#### FactureDetail — frontend/src/pages/FactureDetail.tsx
- **(a)** Aucun placeholder. Les deux champs de montant clés en sont dépourvus : compensation :620-628 et application d'acompte :663-671 — **manquants** ; proposition : `Ex : 50 000` + rappel du maximum.
- **(b)** Mélange d'alias dans le même fichier (`formatCurrency` + `formatXOF`, import :21). Rendu correct : lignes à droite :449-450, Total `text-2xl font-bold` :469-471 ✔.
- **(c)** Page la plus chargée en jargon financier côté vente : `"Compenser avec dette fournisseur"` :601, `"Votre dette fournisseur envers ce tiers"` :613, `"Acomptes disponibles"` :546, `"Reste dû sur la facture"` :609, `"Marge brute"`/`"Taux de marge"` :491-496. Propositions caissier : *« Utiliser ce que nous lui devons pour régler sa facture »* ; *« Avances du client disponibles »*. L'acompte est identifié par son id technique `#{a.id}` :568 → afficher date + montant (« Acompte du 12/08 — 100 000 FCFA »).
- **(d)** Confirmations bien rédigées (`"Appliquer l'acompte ?"` :156-158 avec montant ; suppression paiement :193-196 irréversible ✔). Fallback `'Erreur application acompte'` :172 télégraphique → *« Erreur lors de l'application de l'acompte »*. Libellé de chargement générique `'En cours...'` :636, :678 → *« Enregistrement… »*.

#### NouvelleFacture — frontend/src/pages/NouvelleFacture.tsx
- **(a)** `"Rechercher un produit par nom ou référence…"` :476 — **exemple utile** ✔ ; `"Notes optionnelles visibles sur la facture…"` :820 — **utile** (dit où la note apparaît) ✔ ; `"Choisir un emplacement"` :407 — correct. Champs quantité :622-636, prix :664-676, remise :713-725 sans placeholder — acceptable (pré-remplis), mais la recherche produit exige ≥ 2 caractères sans l'indiquer :195 → ajouter *« (2 lettres minimum) »* ou un message sous le champ.
- **(b)** Exemplaire : lignes `text-right font-mono` :731-733, total résumé + bouton `Créer la facture · {total}` :837 ✔.
- **(c)** `"Client (Tiers)"` :373 — « Tiers » est du vocabulaire comptable → *« Client »* seul suffit ; `"P. revient"` :680 → *« Prix d'achat »* ; `"Échéance"` :425 → compréhensible mais *« À payer avant le »* est plus parlant ; la colonne **« Marge »** :570 expose la marge au caissier (voir aussi Inventaire) — à masquer par rôle.
- **(d)** Messages de validation clairs (`'Veuillez sélectionner un client'` :275, `` `Stock insuffisant pour "X" (disponible: N)` `` :284 ✔). États vides bien rédigés :489-490, :756-757. **Bouton « Scanner code-barres » mort (aucun handler)** :457-462 — retirer ou câbler (cf. M1) ; un bouton inerte détruit la confiance.

#### Devis — frontend/src/pages/Devis.tsx
- **(a)** `"Rechercher par numéro ou client…  ( / )"` :164 — **utile** ✔.
- **(b)** Total à droite `text-right font-medium` :126-131 ✔.
- **(c)** Chip `'Converti'` :42 — statut technique → *« Facturé »* (StatusBadge fait déjà cette traduction ailleurs : frontend/src/components/StatusBadge.tsx:6-42) ; CSV en statuts bruts :176.
- **(d)** Confirmations exemplaires (`'Confirmer ce devis ?'` + conséquence « générera un bon de livraison » :61 ✔ ; suppression destructive :72 ✔). 4 boutons d'action par ligne en icône seule :139-146 (aria-label présents, aucun libellé visible).

#### DevisDetail — frontend/src/pages/DevisDetail.tsx
- **(a)** Aucun input, aucun placeholder — RAS.
- **(b)** **STILL OPEN** : total en `Intl … currency: 'XOF'` :206 (« F CFA ») vs `formatCurrency` sur les lignes :243-244 (« FCFA ») — même page, deux libellés. **Aucune colonne numérique alignée à droite** (en-têtes :220-222, cellules :242-244) — seul document de vente dans ce cas avec BonLivraisonDetail.
- **(c)** `"Validité"` :204 → *« Valable jusqu'au »*.
- **(d)** Dialogues conformes :283-311. `"Aucune ligne à afficher"` :251 correct. `'En cours...'`/`'Suppression...'` :294, :320 → uniformiser sur « … ».

#### NouveauDevis — frontend/src/pages/NouveauDevis.tsx
- **(a)** `"Rechercher un produit par nom ou référence…"` :437 ✔ ; `"Ajoutez une note..."` :674 — **répète le label** (« Notes ») → *« Ex : validité 15 jours, livraison incluse »* ; `"Choisir un magasin"` :411 ✔.
- **(b)** Conforme (lignes à droite :618-620, total `text-2xl font-bold` :683).
- **(c)** `"Montant total estimé"` :682 — « estimé » sur une somme exacte : troublant → *« Montant total »* ; `"P. revient"` :566 → *« Prix d'achat »* ; `"Magasin (stock)"` :400 → *« Magasin »*.
- **(d)** Messages conformes ; en-tête d'édition `"Chargement du devis..."` :310 avec « ... » ASCII.

#### BonsLivraison — frontend/src/pages/BonsLivraison.tsx
- **(a)** `"Rechercher par numéro ou client…  ( / )"` :142 ✔.
- **(b)** Total à droite :108-112 ✔.
- **(c)** Abréviation **« BL »** exposée : stat `'Total BL'` :80, toast `'Aucun BL « livré » sélectionné'` :70, CSV `'N° BL'` :147 → écrire *« bon de livraison »* au moins dans les stats et toasts. `"Nouveau Bon (depuis devis)"` :138 — la parenthèse est une contrainte technique → *« Nouveau bon de livraison »* et expliquer la contrainte dans la page de création.
- **(d)** Confirmations avec conséquence :58, :71 ✔.

#### BonLivraisonDetail — frontend/src/pages/BonLivraisonDetail.tsx
- **(a)** Aucun input — RAS.
- **(b)** **Cellules monétaires non alignées à droite** :233-234 (en-têtes :219-220) ; total simple `tabular-nums font-semibold` :203 sans carte résumé, contrairement à FactureDetail/AvoirDetail — hiérarchie visuelle du total plus faible que ses pages sœurs.
- **(c)** `BL #${bon.id}` :151, :185, :255 — id technique au lieu du numéro de document ; `"Qté commandée"` / `"Qté livrée"` :217-218 sans explication de la différence.
- **(d)** Dialogues conformes :274-303 ; `'En cours...'` :285, :311.

#### NouveauBonLivraison — frontend/src/pages/NouveauBonLivraison.tsx
- **(a)** `"Rechercher un devis accepté (numéro, client)..."` :249 ✔ ; `"Rechercher un produit..."` :300 — **plus vague** que ses jumeaux (pas de « par nom ou référence ») → harmoniser ; `"Notes internes ou instructions de livraison..."` :454 ✔.
- **(b)** Alias `formatCurrency` (vs `formatXOF` de la liste) ; **total de ligne sans `text-right`** :425-427, en-têtes :354-359 non alignés ; total `"Total estime"` :464.
- **(c) Accents cassés en série (verbatim)** : `'Veuillez selectionner un client'` :37, `'Le numero de devis est obligatoire'` :40, `"Creez un nouveau bon de livraison client"` :194, `"Selectionnez le client"` :265, `"Ajoutez les produits a livrer"` :289, `'Ce produit est deja dans le bon de livraison'` :128, `"Informations complementaires"` :450, `"Total estime"` :464, `'Creation...'`/`'Creer le bon de livraison'` :469, `` `Bon de livraison ${numero} cree avec succes` `` :173, `'Erreur lors de la creation du bon de livraison'` :176 — seul fichier du module dans cet état ; corrections évidentes (é/à).
- **(d)** La liste déroulante produit n'a **pas d'état vide** (rendue seulement si `produits.length > 0` :309) — 0 résultat = silence, contrairement à Facture/Devis. Icône `Users` sur la carte Produits :286 (mauvaise icône). **Sélectionner le devis ne préremplit ni le client ni les lignes** — tout est re-saisi à la main, et la double saisie « Qté commandée »/« Qté livrée » :355-356 est imposée au caissier.

#### Avoirs — frontend/src/pages/Avoirs.tsx
- **(a)** `"Rechercher par numéro ou client  ( / )"` :239 — utile mais **sans l'ellipse** de ses pages sœurs → harmoniser ; `"Tous les types"` :244 ✔.
- **(b)** Montant à droite `text-right font-medium num` :172-177 ✔.
- **(c)** Bon exemple à généraliser : sous-titre explicatif `"Notes de crédit clients — retours, erreurs et remises commerciales"` :204 ✔ ; types traduits :58-63 ✔. `'Validés non utilisés'` :212 reste absconse → *« Avoirs à utiliser »*. CSV en statuts bruts :88.
- **(d)** L'export CSV plafonne silencieusement à 200 lignes et **ignore le filtre type** :262 — au minimum, toaster le plafond (convention déjà appliquée dans GeneralLedger.tsx:247).

#### AvoirDetail — frontend/src/pages/AvoirDetail.tsx
- **(a)** Aucun input — RAS.
- **(b)** Conforme (lignes à droite :202-203, total `text-2xl font-bold` :222-224 ✔).
- **(c)** Aucune explication du mot « Avoir » ici (le glossaire n'existe que sur la liste :204) ; envisager le même sous-titre.
- **(d)** Seule action : Imprimer :108-111 (cf. M11). `"Aucune ligne"` :210 correct.

#### NouvelAvoir — frontend/src/pages/NouvelAvoir.tsx
- **(a)** `"Rechercher une facture (numéro, client)..."` :210 ✔ ; `"Motif / produit"` :243 — **trop court** → *« Ex : retour clavier HP défectueux »* ; `"Commentaires optionnels"` :320 — répète le label → *« Ex : remboursé en espèces le 17/08 »*.
- **(b)** Un seul montant affiché : `"Montant estimé"` `text-2xl font-bold` :327-328 — **aucun sous-total par ligne** visible pendant la saisie.
- **(c) Apostrophes manquantes (verbatim)** : `"La facture d origine est obligatoire"` :34, `"Un avoir doit être lié à une facture d origine"` :175, `"Facture d origine"` :196, `'Erreur lors de la création de l avoir'` :123 → « d'origine », « l'avoir ». `'Le tiers (client) est obligatoire'` :31 → *« Le client est obligatoire »*. Zod `'Quantité ou prix invalide'` :24-25 réutilisé pour les deux champs — impossible de savoir lequel corriger.
- **(d)** Type d'avoir forcé à `'erreur'` :117 (cf. M11). Lignes en texte libre (pas de recherche produit) — incohérent avec tous les autres formulaires de documents.

---

### 3.2 Achats / Stock

#### Commandes — frontend/src/pages/Commandes.tsx
- **(a)** `"Rechercher par numero de commande ou fournisseur..."` :811 — utile mais **« numero » sans accent** ; `"Instructions de livraison, références, etc."` :428 ✔ ; quick-create exemplaire : `"Ex: Clavier USB"` :632, `"Ex: CLV-001"` :636, `"Ex: Périphériques"` :645 — **meilleurs placeholders de l'app**, à imiter partout ; `"Rechercher rapidement par nom ou référence pour ajouter..."` :464 ✔ ; `"Rechercher..."` :683 (catalogue) — vague → préciser les champs.
- **(b)** Total de création `text-2xl font-black` :593 ✔ ; **bug d'alignement : en-tête Montant `align="right"` :904 mais cellule sans `text-right`** :922. **Les 3 KPI (:298-318) sont calculés sur la page courante uniquement** — chiffres faux dès la page 2, présentés comme des totaux globaux.
- **(c)** `"Sélectionnez le tiers fournisseur"` :375 → *« Sélectionnez le fournisseur »* ; `"Réf"`/`"Désignation"` :524-525 — passables ; tooltips natifs avec fautes : `"Marquer comme expediee"` :952, `"Receptionner la commande"` :967.
- **(d)** 3 toasts hors `getErrorMessage` (`'Erreur lors du chargement'` :110, :192, :242). Confirmations riches :260-265 ✔ (annulation destructive avec « Retour » ✔). États vides bien écrits :498-517 avec action `Créer "X"` ✔.

#### CommandeDetail — frontend/src/pages/CommandeDetail.tsx
- **(a)** `"Notes..."` :424 — répète le label → *« Ex : livraison souhaitée avant le 25 »* ; recherche :459/:621 ✔/vague ; quantité/prix :527-542 sans placeholder (pré-remplis, acceptable).
- **(b)** **Prix du rapprochement 3 voies affichés bruts, sans formateur ni FCFA** :823-824 — seuls montants non formatés de l'app. Impression : totaux corrects :971-990.
- **(c)** Le bloc 3 voies concentre le jargon : `"Rapprochement 3 voies"` :782, en-têtes `"Cmd"` :808, `"Prix cmd"`/`"Prix fact."` :811-812, colonne `"État"` en icônes seules ✓/🕐/✗ :826-828 sans texte ni tooltip. Propositions : *« Contrôle commande / réception / facture »*, colonnes *« Commandé »*, *« Prix commandé »*, *« Prix facturé »*, icônes + libellé. `"NET À PAYER"` :989 sur un bon de commande (vocabulaire de facture) → *« Total commande »*. `"Details du bon de commande fournisseur"` :733 sans accent. L'impression code en dur `"Magasin Programme"` / `"Système d'approvisionnement ERP"` :891-892 au lieu des paramètres société.
- **(d)** Boutons icône seule **sans aria-label** : suppression de ligne :548 et fermeture du tiroir :611 (leurs jumeaux dans Commandes.tsx:572/:673 en ont). `"Aucun produit trouvé"` :651-652 en div brut (pas EmptyState). `"Aucune donnée de rapprochement."` :790 correct.

#### DemandesList — frontend/src/pages/DemandesList.tsx
- **(a)** `"Rechercher par numéro, magasin, dépôt..."` :241 ✔ ; `"Tous les statuts"` :251 ✔.
- **(b)** Pas de montants (volumes uniquement).
- **(c)** Libellés d'action très compressés :160-175 : `'Décider'`, `'Exécuter'`, `'Clôturer'`, `'Attente clôture'` → *« Approuver / refuser »*, *« Préparer le transfert »*, *« Confirmer la réception »* ; statut `"Partiellement"` :53 tronqué → *« Partiellement livrée »*.
- **(d)** `'Aucun résultat pour cette recherche.'` :285 ✔. **Fetch complet sans pagination** — STILL OPEN (DESIGN-AUDIT §7.2, migration `DocumentListPage` attendue), preuve :121-126.

#### DemandeDetail — frontend/src/pages/DemandeDetail.tsx
- **(a)** Aucun input — RAS.
- **(b)** Quantités centrées :322-333 (acceptable, pas de monnaie).
- **(c)** **Contre-exemple positif** : les descriptions de statut :83-131 sont le meilleur français explicatif de l'app (`'La demande a été soumise au dépôt et attend une décision.'` :93) — modèle à suivre. Champ `motif` étiqueté « Notes » :448 vs « Motif de refus » :440.
- **(d)** Fallback fourre-tout `` `Erreur lors de l'action` `` :203 → messages spécifiques par action. Confirmations avec conséquence :487, :513 ✔.

#### DemandeForm — frontend/src/pages/DemandeForm.tsx
- **(a)** `"Sélectionner..."` :365/:395 — génériques → *« Choisir le magasin »* / *« Choisir le dépôt »* ; `"Rechercher un produit par nom ou référence..."` :431 ✔ ; `"Notes éventuelles pour le dépôt..."` :536 ✔ ; `"Notes (optionnel)"` :619 — répète le label.
- **(b)** Pas de monnaie. Seuils de couleur stock codés en dur (≤5 rouge, ≤20 orange) :460-464 — déconnectés du `stock_min` par produit.
- **(c)** Disclaimer :520-523 bien rédigé ✔. `"Magasin destinataire *"`/`"Dépôt source"` :354-384 corrects.
- **(d)** **Tous les steppers +/− et la corbeille du panier sont icône seule SANS aria-label** :479-495, :569-616. Garde `beforeunload` présente :104-113 ✔. Boutons `'Enregistrer brouillon'`/`'Envoyer au dépôt'` :639-647 clairs ✔.

#### Receptions — frontend/src/pages/Receptions.tsx
- **(a)** `"Sélectionner un emplacement"` :236 ✔ ; `"Notes optionnelles"` :298 — répète le label.
- **(b)** Montant à droite :354 ✔.
- **(c)** **La colonne statut affiche l'enum brut** (`validee`, `expediee` — sans accent ni libellé) :351 ; le mapping :55-58 ne porte que les couleurs → utiliser `StatusBadge`.
- **(d)** Fallbacks télégraphiques `'Erreur chargement commandes'` :101, `'Erreur chargement commande'` :119, `'Erreur création réception'` :193. Validations précises :140-175 ✔. **Aucune recherche** sur la liste (cf. M12) ; **aucune confirmation avant validation de la réception** :309 alors qu'elle écrit stock + CMP — ajouter `useConfirm` avec le total.

#### FacturesFournisseur — frontend/src/pages/FacturesFournisseur.tsx
- **(a)** `"ex: 30 jours"` :425 — **exemple utile** ✔ ; `"Produit…"` :446/449 ✔ ; `"Qté"` :458 / `"Prix unit."` :466 — abréviations en placeholder ; `"— Sélectionner —"` :595/598 génériques ; MoneyInputs :514/:609 sans placeholder ; n° facture fournisseur :392 sans exemple → *« Ex : FF-2026-0145 »*.
- **(b)** Bloc paiement hiérarchisé (`Reste à payer` coloré :757 ✔) ; table dense `text-xs px-1` :652-666 — pénible mais alignée :669.
- **(c)** `"Acompte"`/`"Appliquer acompte"` :582-601 → *« Avance versée »* ; double numérotation `"N° interne"` :655 vs `"N° facture fournisseur"` :391 sans explication ; statut `"Partielle"` :81 tronqué → *« Payée partiellement »*.
- **(d)** **Aucune recherche, filtre statut seul** :359 (cf. M12) ; tri client-side limité à la page (aveu en commentaire :116-117). Vides corrects :646, :764-767.

#### Reapprovisionnement — frontend/src/pages/Reapprovisionnement.tsx
- **(a)** **Aucun placeholder sur la page** ; l'input quantité :173-180 n'a **ni placeholder ni aria-label**.
- **(b)** Prix d'achat à droite :171 ✔.
- **(c)** En-têtes `"Min"` :149 → *« Seuil mini »* ; `"— manquant —"` :168 (fournisseur absent) → *« Aucun fournisseur »*. Sous-titre :114 clair ✔.
- **(d)** **Génération de N commandes fournisseur sans confirmation** :119 (boucle séquentielle :83-94 qui peut réussir à moitié ; fallback `` `Erreur après ${ok} commande(s)` `` :98 — STILL OPEN, déjà noté FEATURE-AUDIT §4.2). Bandeau « produits sans fournisseur » :126 bien fait ✔.

#### Inventaire — frontend/src/pages/Inventaire.tsx
- **(a)** `"Rechercher par nom ou référence..."` :752 ✔ ; `"REF-001"` :919 — **exemple utile** ✔ ; `"Nom du produit"` :929 / `"Catégorie"` :938 — **répètent le label** → *« Ex : Clavier Logitech K120 »*, *« Ex : Périphériques »* ; `"Description optionnelle"` :1035 — répète ; `"Quantité"` :830 (bulk) — répète ; `"Sélectionner..."` :978 générique ; stock/stock min :961-1027 et MoneyInputs :1004-1017 sans placeholder.
- **(b)** Prix à droite :576 ✔ ; **colonne Stock alignée à gauche** (:592, en-tête :1098) au milieu de colonnes chiffrées à droite ; CSV en 2 décimales :502-504 vs 0 à l'écran.
- **(c)** Colonne **« Marge »** :1097 visible pour tous les rôles caissiers compris — donnée sensible → gate par rôle ; sélecteur d'ajustement en masse dont les seules options sont **« + », « − », « = »** :843-845 → *« Ajouter au stock / Retirer du stock / Remplacer le stock »* ; `"Qui achète le plus ?"` :1389 — excellent français simple ✔.
- **(d)** `'Ce produit est peut-être lié à des factures'` :318 — spéculatif → afficher la vraie raison serveur via `getErrorMessage`. **Opérations en masse : les échecs unitaires sont avalés en silence** (:335-336, :374-376, :396-397 — seul le compte des succès est toasté) et « = » calcule le delta sur un stock client potentiellement périmé :363-369 ; aucune confirmation sur l'application en masse. Deux patrons de confirmation dans le même fichier (Dialog :1146-1149 vs `useConfirm` :328) — STILL OPEN (AUDIT.md §5).

#### StockLocations — frontend/src/pages/StockLocations.tsx
- **(a)** `"Rechercher un produit"` :270 ✔ ; code/nom/adresse d'emplacement :173-181 sans placeholder → *« Ex : MAG-ABJ »*, *« Ex : Magasin Abidjan centre »*.
- **(b)** Quantités à droite :296-297 ✔ (pas de monnaie).
- **(c)** Colonnes **« Quantité » vs « Disponible »** :287-288 sans explication de la différence → tooltip *« Disponible = quantité moins les réservations en cours »* ou fusionner si identiques.
- **(d)** `'Erreur chargement stock'` :81 télégraphique. Validations précises :111-127 ✔. Vides corrects :213-214, :278.

#### StockTransfers — frontend/src/pages/StockTransfers.tsx
- **(a)** `"Rechercher N°, source, destination..."` :303 ✔ ; `"Sélectionner..."` ×4 :502-522 génériques ; `"Choisir produit..."` :566/569 ✔ ; `"Qté"` :580 ; `"Optionnel..."` :539 — vide de sens → *« Ex : rééquilibrage avant week-end »*.
- **(b)** Quantités à droite :452-453 ✔. **Le picker produit affiche `(stock: X)` = stock GLOBAL** :572, pas celui de l'emplacement source — trompeur pour décider un transfert.
- **(c)** Badge `"Proactif"` :266 opaque → *« Transfert direct »* (vs « Via demande N° » :260 ✔) ; `"Trajet"` :349 → *« De → vers »*.
- **(d)** **Un échec de chargement s'affiche comme une liste vide** : le catch :113-117 ne pose aucun état d'erreur, l'EmptyState `"Aucun transfert trouvé"` :359 s'affiche après une erreur réseau — **régression vis-à-vis de la règle QueryState** (DESIGN-AUDIT §2.1 marquait ce chantier corrigé ; cette page y échappe → STILL OPEN ici). Fallbacks télégraphiques :160, :178, :243. Confirmation de complétion avec conséquence :166-170 ✔. Fetch complet sans pagination + catalogue entier dans un seul Select :108, :570-575.

#### StockValuation — frontend/src/pages/StockValuation.tsx
- **(a)** Aucun input — RAS.
- **(b)** KPIs et colonnes conformes :128-223 ; axe Y en « Xk » :174 sans unité.
- **(c)** `"Valorisation du Stock"` :91 — jargon comptable → sous-titre *« Ce que vaut votre stock à l'achat et à la revente »* ; `"Si tout est vendu"` :141 — excellent ✔ ; **icône `DollarSign`** :125 dans une app FCFA → `Banknote`/`Coins`.
- **(d)** `margePercent` divise par `valeur_achat` :83 → affiche `+Infinity%`/`NaN%` si stock à coût nul. Vides corrects :164-167, :195-198.

---

### 3.3 Finance / Caisse

#### CaisseV2 — frontend/src/pages/CaisseV2.tsx
- **(a)** `"50 000"` :817 (fond initial) — **seul MoneyInput de l'app avec un montant d'exemple : modèle à généraliser** ✔ ; `"Ex: Fond de caisse standard"` :830 ✔ ; `"Ex: Apport gérant, retrait dépôt banque..."` :1104 ✔ ; placeholder dynamique `"Expliquer l'écart..."` / `"Commentaire optionnel..."` :973 — **excellent** (contextuel) ✔ ; `"0"` :944/:1095 — neutres.
- **(b)** Conforme : montants signés colorés :765-766, écart coloré par seuil :951-954 (0 vert, <5 000 orange, sinon rouge — bonne pédagogie), `text-right` :733-734, :1145-1146 ✔.
- **(c)** `"Solde théorique"` :657 → *« Solde attendu »* ; `"Encaissements"`/`"Décaissements"` :629-643 → *« Entrées »* / *« Sorties »* (vocabulaire bancaire pour un caissier débutant) ; `"Libellé"` :732 → *« Description »* ; `"mouvement(s) sans source — clôture bloquée"` :884 — concept interne à expliquer d'une phrase.
- **(d)** Toasts précis et actionnables (`'Écart de X — commentaire obligatoire'` :410 ✔, `'Session ouverte depuis plus de 24 heures…'` :234 ✔). État vide :743-744 ✔. **`loadMouvements` échoue en silence** (`console.error` seul :318) — la table peut sembler vide après une erreur réseau.

#### CaisseHistorique — frontend/src/pages/CaisseHistorique.tsx
- **(a)** `"Tous"` :137 ✔ ; **aucune recherche texte** ; filtres date sans valeur par défaut :151-155 (= tout l'historique chargé d'office).
- **(b)** Conforme :181-183, :202-204 ; écart exactement nul rendu `"0"` **sans FCFA** :50.
- **(c)** `"Fond initial"`/`"Fond compté"` :181-182 — passables ; méthode de paiement affichée via `replace('_',' ')` :267 au lieu du formateur de libellés — codes semi-bruts dans le détail.
- **(d)** Ligne cliquable signalée uniquement par un tooltip `"Voir le détail"` :193 — aucune affordance visible (chevron/bouton).

#### CaisseAudit — frontend/src/pages/CaisseAudit.tsx
- **(a)** **Aucun placeholder, aucune recherche** ; DatePickers avec aria-label seuls :167-171.
- **(b)** Montant à droite :233 ✔ mais dé-emphasé `text-xs` sous le compteur :139.
- **(c)** Page la plus « développeur » du module : colonne **« Tiers » = `tiers_id` numérique brut** :213/:231 sans nom ; `"Session"` = id brut :216/:234 ; `#{source_id}` :230 ; `"Mvt caisse"` :217 ; `"Orphelins (espèce sans caisse)"` :128. Propositions : joindre le nom du tiers, lien vers la session, *« Mouvement de caisse »*, *« Paiements espèces sans caisse ouverte »*.
- **(d)** Plafond dur `— limité à 500` :193 sans pagination. `animate-spin` inline :114 hors convention Spinner.

#### Comptabilite — frontend/src/pages/Comptabilite.tsx
- **(a)** `"Chercher un compte (numéro ou intitulé)..."` :334 ✔ ; `"Libellé de l'écriture"` :532 — répète le label → *« Ex : achat fournitures bureau »* ; `"Compte..."` :558 générique ; MoneyInputs débit/crédit :568-569 sans placeholder.
- **(b)** Conforme et soigné : cellules zéro laissées vides :318-319, solde `D/C` avec tooltip :445, `text-right` partout :306-307, :376-378, :427-429 ✔. **Divergence interne** : GeneralLedger imprime « 0 » là où cette page laisse vide — deux conventions pour les mêmes données.
- **(c)** Page la plus jargonneuse de l'app (public admin/comptable, tolérable, mais le sous-titre `"OHADA / SYSCOHADA"` :214 et les **deux systèmes parallèles de codes journaux** (`VE/AC/TRESORERIE/OD` :261-266 vs `VENTES/ACHATS` :514-517) troublent même un initié) ; `"Classe {n}"` :277/:442/:485 nus → libeller (*« Classe 6 — Charges »*).
- **(d)** Fallbacks télégraphiques en série `'Erreur chargement journal'` :78, :87, :96, :106, :155 vs style long ailleurs :141-146. Vides corrects :292-293, :364-365, :415-416, :464-465. Dates par défaut en `toISOString()` (UTC) :47-49 alors que `todayLocal()` existe :27-31 — risque de décalage d'un jour en soirée. Le grand-livre exige de taper le compte puis « Voir » :339-352 au lieu de cliquer un compte du plan déjà chargé.

#### GeneralLedger — frontend/src/pages/GeneralLedger.tsx
- **(a)** `"Ex. FAC-2026"` :368 — **exemple utile** ✔ ; `"Rechercher dans le libellé"` :378 ✔.
- **(b)** Formateur privé `fmt` :73-74 — nombre nu, devise reportée en en-tête `"Débit (FCFA)"` :409-410 ✔ acceptable, mais la **balance :533-535 n'a aucune mention FCFA** ; alignement `text-right` :77, :438-439, :543-548 ✔.
- **(c)** Badge journal en code brut (`OD`, `TRESORERIE`) :433 ; **badge type de compte en enum brut : « capitaux_propres »** :492 ; libellés à mapper.
- **(d)** **Double toast contradictoire** : `'Export CSV réussi'` :284 se déclenche même après le toast d'échec :250 ; à conditionner. Avertissements de plafond d'export :247-250 ✔ (bonne pratique à copier dans Avoirs). Vides corrects :396-397, :470-471, :523-524. Dates par défaut UTC :92-93. *(Doublon fonctionnel quasi complet avec Comptabilite.tsx — deux UI pour journal/balance/plan comptable avec copies et formats divergents.)*

#### Tresorerie — frontend/src/pages/Tresorerie.tsx
- **(a)** Aucun input (périodes 30/60/90 en boutons :55-59) — RAS.
- **(b)** Conforme, signes +/− colorés :76-97 ✔ ; axe Y en « k » nu :130.
- **(c)** `"Trésorerie prévisionnelle"` :47, `"Encaissements prévus"` :73, `"Échéancier par semaine"` :117 — vocabulaire gérant acceptable ; sous-titre `"Commandes + dépenses"` :87 aide ✔.
- **(d)** Gestion d'erreur via QueryState :28-35 ✔ (page témoin du correctif DESIGN-AUDIT). Vide :110 correct.

#### DepensesV2 — frontend/src/pages/DepensesV2.tsx
- **(a)** `"Sélectionner un magasin"` :363 ✔ ; `"0"` :490 ; `"Sélectionner une catégorie"` :502 ✔ ; `"Nom du bénéficiaire (optionnel)"` :539 ✔ ; `"Description de la dépense"` :550 — répète le label → *« Ex : carburant groupe électrogène »*.
- **(b)** Montants en rouge signés à droite :621 ✔ ; KPI `"Total dépenses (page)"` :417 honnête mais peu utile (somme de la page courante :205).
- **(c)** `"Espèces (décrémente la caisse)"` :526 et `"Elle décrémentera le solde…"` :467 — « décrémenter » = vocabulaire développeur → *« sera déduite de la caisse »*.
- **(d)** **Meilleure UX d'erreur de l'app** : toast « Caisse fermée » avec bouton d'action `"Ouvrir la caisse →"` :238-246 — modèle à généraliser. Confirmation destructive conforme :303 ✔. Vide conditionnel intelligent :585-586 ✔. Manquent recherche/filtres (cf. M12).

#### ParametresFinance — frontend/src/pages/ParametresFinance.tsx
- **(a)** `"aucun"` :165 (plafond) et `"∞"` :227 (tranche max) — cryptiques → *« Vide = pas de plafond »* ; les champs taux %/tranches/tolérances sans placeholder.
- **(b)** **Seule page monétaire sans formateur** : plafond :164 et tranches :222-226 en `type="number"` nus — pas de séparateurs de milliers, pas de FCFA, pas de MoneyInput.
- **(c)** Vocabulaire statutaire dense mais public admin : `"Barème ITS (impôt progressif)"` :191 ✔ (la parenthèse aide) ; `"Rapprochement 3 voies"` :253 → au moins un sous-texte *« contrôle commande/réception/facture »* ; `"Salarial %"`/`"Patronal %"` :143-144 corrects.
- **(d)** Sauvegarde par ligne sans indicateur de modification non enregistrée :175 ; suppression de tranche sans confirmation :234 (persistée seulement au « Enregistrer le barème » — acceptable mais invisible). Vides corrects :133-135, :200-201.

#### Reporting — frontend/src/pages/Reporting.tsx
- **(a)** `"Rechercher un client"` :372 ✔ ; `"Solde minimum"` :382 — l'unité FCFA n'existe que dans l'aria-label :383, invisible à l'écran → *« Solde minimum (FCFA) »*.
- **(b)** ~20 rendus conformes (KPIs :237-264, buckets colorés :456-459 ✔) ; axes Y bruts :342/:535 (grands nombres non abrégés, contrairement à Tresorerie) ; en-têtes CSV en français ✔ :184.
- **(c)** `"CA"` :598/:629 → écrire *« Chiffre d'affaires »* au moins dans les titres ; `"Compte de résultat"` :281, `"Coût des ventes"` :289 — public gérant, acceptables ; casse Titre incohérente (`"Top Clients les plus Profitables"` :589, `"Analyse des Marges & Rentabilité"` :229) vs casse phrase ailleurs.
- **(d)** Très bon patron d'erreur partielle (créances : alerte inline + `"Réessayer"` :433-437 ✔ ; plafond d'export toasté :194 ✔). **L'onglet marges rend `null` si `marginsReport` est vide** :517 — écran blanc sans EmptyState. **Les 2 KPI « (mois) » ignorent le filtre de dates de la page** (fetch sans dates :153) — chiffres à côté des filtres qu'ils n'écoutent pas. Dates par défaut UTC :70-71.

---

### 3.4 Admin / Tiers / RH

#### Dashboard — frontend/src/pages/Dashboard.tsx
- **(a)** Aucun input, aucune recherche — RAS.
- **(b)** ~22 rendus conformes (KPIs `text-2xl font-bold` :435-505, listes alignées :841-846, :884-886, :1106-1108 ✔) ; axes en « k » nus :768/:805/:986.
- **(c)** Densité d'abréviations élevée pour la page d'accueil d'un gérant : `"CA"` :430/:746, `"Panier moyen"` :500, `"Pipeline commandes"` :666-670 (anglais) → *« Suivi des commandes fournisseur »*, `"Moyenne mobile sur 3 mois · fourchette indicative"` :572, `"Prévi"` :607, `"vs. période préc."` :439, `"Moy/jour"` :749, `"u."` :842/:959, `"fact."` :891, `"ops"` :1152 ; **méthode de paiement en code brut majuscule** (`ESPECE`) :1146 → formateur de libellés.
- **(d)** États vides tous spécifiques et bien rédigés :720-1118 ✔ ; avertissement de prévision :580-583 — **exemplaire** ✔ ; bandeau d'alertes :144-162 ✔.

#### Login — frontend/src/pages/Login.tsx
- **(a)** **Aucun placeholder** (identifiant :73-80, mot de passe :89-96) — acceptable avec labels, mais un exemple d'identifiant aiderait la première connexion.
- **(b)** RAS.
- **(c)** Titre `"Magasin Programme"` :58 — **nom de projet interne exposé aux utilisateurs finaux** ; devrait afficher le nom société de CompanySettings.
- **(d)** `'Échec de connexion'` :48 — générique, correct pour la sécurité ✔ ; `'Identifiant requis'`/`'Mot de passe requis'` :15-16 ✔. **Aucun lien « mot de passe oublié »** (dépend de F-12/F-13 — STILL OPEN) ; pas d'indicateur verrouillage/majuscules.

#### Tiers — frontend/src/pages/Tiers.tsx
- **(a)** `"Nom, téléphone, NIF, code..."` :227 — **utile** ✔ ; `"0"` :474 ; **tous les champs du formulaire sans placeholder** : raison sociale :402, prénom :421, téléphone :425 (→ *« Ex : +225 07 00 00 00 00 »*), email :430, NIF :454, RCCM :458 — les deux derniers sont précisément ceux qui exigent un exemple de format.
- **(b)** Soldes alignés à droite :307-311, :335-343 ✔. **Convention de couleur du solde net inversée par rapport à TiersDetail** : ici net > 0 = rouge (:175-176), sur la fiche net > 0 = vert (TiersDetail.tsx:358) — même chiffre, couleur opposée à un clic d'écart. Choisir une sémantique (« il nous doit » = ?) et l'appliquer partout.
- **(c)** `"Raison sociale *"` :401 imposé aussi aux personnes physiques → *« Nom / Raison sociale »* ; `"NIF"`/`"RCCM"` :453-457 sans expansion → tooltip *« Numéro d'Identification Fiscale »* ; onglet `"Mixtes"` :37 → *« Client & fournisseur »* ; `"Solde fourn."` :310 → *« Solde fournisseur »*. La page se nomme « Contacts » :183 mais l'app dit « tiers » partout ailleurs — trancher le vocabulaire.
- **(d)** Confirmation de suppression **sans description** :167 (aucune mention des soldes/documents liés) ; échec de suppression aplati en `'Impossible de supprimer ce contact'` :172 (la vraie raison serveur est perdue). `'Erreur chargement contacts'` :92 et `'Erreur enregistrement'` :162 télégraphiques.

#### TiersDetail — frontend/src/pages/TiersDetail.tsx
- **(a)** MoneyInputs `"0"` :867-1012 — neutres ; `"— Choisir —"` :886/:937 génériques ; `"N° de pièce"` :901/:952 ✔ ; **`"Auto si magasin acompte"` :1030 — cryptique** → *« Laisser vide : la caisse du magasin de l'acompte sera utilisée »* ; notes/CRM :788-832, :904-980 sans placeholder.
- **(b)** Hiérarchie exemplaire (« Solde NET » `text-2xl font-bold` :456 + sous-lignes détaillées :433-449 ✔ ; ledger débit/crédit colorés à droite :545-546 ✔).
- **(c)** Anglicismes financiers : `"Ledger unifié"` :494 → *« Historique du compte »* ; `"Compensation (netting)"` :967 → supprimer « (netting) » ; `"Recalculer allocation FIFO"` :403 → *« Recalculer l'affectation des paiements »* ; statut d'acompte en enum brut `{a.statut}` :597/:611 ; méthodes `replace('_',' ')` :875-1022 semi-brutes ; en face, `"Il nous doit"` / `"Nous lui devons"` / `"Compte soldé"` :458 — **excellent français simple**, à imiter. Aides télégraphiques :895, :946, :1002-1005 (`"Fournisseur restitue le cash → encaissement caisse."`) → phrases complètes.
- **(d)** Confirmations titre-seul :150, :191 ; **aucune confirmation sur « Rembourser » et « Compenser »** alors que ce sont des mouvements d'argent irréversibles (le Dialog-formulaire vaut confirmation selon la convention projet, mais un récapitulatif chiffré type Payroll :184-192 serait plus sûr). `'Erreur remboursement'` :236, `'Erreur compensation'` :312, `'Erreur recalcul'` :321 télégraphiques.

#### ClientAnalytics — frontend/src/pages/ClientAnalytics.tsx
- **(a)** Aucun input — RAS.
- **(b)** Conforme :130-141, :227 ✔ ; CSV en 2 décimales :61 vs 0 à l'écran.
- **(c)** `"Analytics Clients"` :83 (anglais) → *« Analyse clients »* ; `"Top 10 Clients par Montant Dépensé"` :152 (casse Titre + anglais) ; **« Panier moyen » :142 désigne ici la moyenne par client alors que le Dashboard :500 l'utilise pour la facture moyenne** — même mot, deux métriques → renommer *« CA moyen par client »*.
- **(d)** Vide :108-109 et fallback :43 corrects ✔.

#### Employes — frontend/src/pages/Employes.tsx
- **(a)** `"Nom, matricule, poste..."` :276 ✔ ; **aucun placeholder sur le formulaire** (matricule :388 → *« Ex : EMP-001 »*, téléphone :423, salaire :431…).
- **(b)** Conforme (commissions `text-xl font-semibold text-success-700` :493 ✔) ; pas de colonne salaire dans la liste — discrétion bienvenue ✔.
- **(c)** `"Matricule"` :322 — administratif mais standard RH, OK ; `"Dépt."` :341 → *« Département »*.
- **(d)** Confirmation d'activation/désactivation **avec nom et conséquence** :200-206 — bonne pratique ✔. `'Erreur chargement employés'` :132, `'Action impossible'` :212 télégraphiques.

#### Payroll — frontend/src/pages/Payroll.tsx
- **(a)** Aucun placeholder ; période `type="month"` :391 avec label redondant `"Période (AAAA-MM)"` (le picker natif rend le format inutile).
- **(b)** Conforme, `num` tabulaire partout :211-246, :347-372 ✔.
- **(c)** **« CNPS » / « ITS » en en-têtes sans jamais être expansés** :225-226/:243-244 → tooltip *« Cotisation sociale (CNPS) »* / *« Impôt sur salaire (ITS) »* ; **fuite technique : `"Astuce: les primes/déductions par bulletin sont modifiables via l'API tant que le cycle est en brouillon."`** :280-282 — dire « via l'API » à un gérant = fonctionnalité manquante déguisée en astuce.
- **(d)** **Meilleures confirmations de l'app** — chiffrées et explicites : `'Valider ce cycle de paie ?'` avec net à payer :184, `'Marquer ce cycle comme payé ?'` avec montant :192, suppression :334 ✔. Réserve : le paiement est codé en dur `'virement'` :193 sans choix de l'utilisateur. Vides corrects :259-262, :321-327.

#### UserManagement — frontend/src/pages/UserManagement.tsx
- **(a)** `"Rechercher..."` :237 — générique et **mensonger** : ne cherche que username + nom complet :197-200 (ni email ni rôle) → *« Rechercher par nom ou identifiant »* ; `"Jean Dupont"` :332 — **exemple utile** ✔ ; placeholder ternaire du mot de passe :371 — **excellent** ✔ ; username :338-345 et email :350-355 sans placeholder.
- **(b)** RAS.
- **(c)** `"Identifiant (Username)"` :337 → supprimer la parenthèse anglaise ; **rôle affiché en enum brut** `{user.role}` :278 (« admin », « caissier ») alors que `ROLE_LABELS` existe déjà dans Profil.tsx:25-32 → réutiliser ; `{loc.location_type}` brut :428 ; vocabulaire flottant : `"Boutiques assignées"` :257 vs `"Accès aux Boutiques / Dépôts"` :411 vs « Emplacements » (AffectationsLocations) — trois mots pour la même chose.
- **(d)** **Seule page auditée sans QueryState** : un échec de chargement se rend comme table vide `"Aucun utilisateur trouvé"` :266 (fetch :73-88) — STILL OPEN vis-à-vis de la règle DESIGN-AUDIT §2.1. Politique de mot de passe révélée **seulement en toast d'échec** :157-162 alors que Profil/ChangePassword ont la checklist en direct → réutiliser le composant. Pas de pagination (`getAll(1, 100)`) :76.

#### AffectationsLocations — frontend/src/pages/AffectationsLocations.tsx
- **(a)** Aucun placeholder (Select par défaut :246).
- **(b)** RAS.
- **(c)** Description :140 claire ✔ ; rôle en enum brut :182 (même correctif que UserManagement) ; « Emplacements » vs « Boutiques » (cf. ci-dessus). *(La page duplique fonctionnellement l'édition d'affectations d'UserManagement:411 — deux surfaces pour la même donnée.)*
- **(d)** **Accents manquants** : `'Affectations mises a jour'` :123 et `'Erreur mise a jour affectations'` :129 → « à ». Vide :150-151 correct.

#### CompanySettings — frontend/src/pages/CompanySettings.tsx
- **(a)** `'Hitek-CI'` :141 — **le nom d'un client réel fuit comme placeholder chez tous les tenants** → neutre *« Ex : Ma Boutique SARL »* ; `'+225 07 00 00 00'` :154 ✔ ; `'contact@example.com'` :155 / `'www.example.com'` :157 ✔ ; **NIF/RC/AI/CB :166-169 sans exemple de format** — les quatre champs qui en ont le plus besoin.
- **(b)** Aide de conversion :200 ✔ mais **le label `"Taux de conversion (1 FCFA → devise)"` :190 contredit son propre exemple** (« 1 EUR = 655.957 FCFA → taux = 655.957 » est un taux devise→FCFA) — spécification ambiguë sur un réglage monétaire.
- **(c)** `"AI"` :168 et `"Compte bancaire (CB)"` :169 — « CB » entre en collision avec « carte bancaire » → *« N° de compte bancaire (RIB) »* ; NIF/RC sans expansion.
- **(d)** Garde `beforeunload` seule :55-63 — **la navigation interne SPA perd les modifications sans avertir**. Suppression du logo sans confirmation :219 (staged jusqu'au save, acceptable).

#### AuditLog — frontend/src/pages/AuditLog.tsx
- **(a)** `"Toutes les tables"` :108 ; **aucune recherche texte** malgré un bouton `"Filtrer"` à icône loupe :129-132.
- **(b)** RAS.
- **(c)** Page pensée développeur : filtre/colonne **« Table »** :102/:157 avec noms de tables bruts (`company_settings`, `utilisateurs`) :171 ; actions en anglais `CREATE/UPDATE/DELETE` :174-176 ; **valeurs anciennes/nouvelles en JSON brut tronqué à 80 caractères** :179-184 ; enregistrement `#{record_id}` :172 sans numéro de document ni lien ; `"Aucun log trouvé"` :150 (« log »). Propositions : libellés d'entités français, `Créé/Modifié/Supprimé`, un diff lisible « champ : avant → après », lien vers le document.
- **(d)** Modèle de filtre incohérent sur la même carte : la table s'applique automatiquement (useEffect :38-40), les dates seulement au clic « Filtrer ». `'Erreur lors du chargement des logs'` :60.

#### Profil — frontend/src/pages/Profil.tsx
- **(a)** Aucun placeholder (3 PasswordInputs :166-215) — acceptable.
- **(b)** RAS.
- **(c)** **Contre-exemple positif** : `ROLE_LABELS` traduit les rôles :25-32 ✔ (fallback brut :133 si rôle inconnu).
- **(d)** Checklist de mot de passe en direct :186-198 ✔ ; messages :70-88 conformes ✔ ; `"Vous serez déconnecté après le changement…"` :158-160 — bonne annonce de conséquence ✔.

#### ChangePassword — frontend/src/pages/ChangePassword.tsx
- **(a)** Aucun placeholder (3 inputs :65-140) — acceptable.
- **(b)** RAS.
- **(c)** Copie claire (:56-59 ✔).
- **(d)** Conforme ; duplique presque verbatim la carte sécurité de Profil (celui-ci utilise `PasswordInput`, celui-là re-code le toggle :78-144) — un seul composant suffirait.

---

### 3.5 Composants transverses (frontend/src/components)

| Composant | Constat | Réf. |
|---|---|---|
| DocumentPicker | Placeholder par défaut `"Rechercher un document..."` (« ... » ASCII) ; états `"Recherche..."`, `"Aucun résultat pour « X »"` corrects | DocumentPicker.tsx:147,159-161 |
| TiersPicker | Placeholders `"Rechercher un client/fournisseur/tiers..."` ✔ ; **une recherche en échec est rejetée sans message** (try/finally sans catch) | TiersPicker.tsx:119,35-44 |
| GlobalSearch | Placeholder riche ✔ :207 ; guillemets `"X"` droits :234 vs « » ailleurs ; **une source en échec disparaît en silence** (`.catch(() => [])`) | GlobalSearch.tsx:93-98 |
| PaymentModal | Placeholders montant `"0"` :125, `"N° du chèque"`/`"Référence du virement"` **contextuels — bon modèle** ✔ ; messages :59-90 clairs ✔ | PaymentModal.tsx:170-176 |
| PaymentHistory | Badges source `"Acompte"/"Annulation"/"Direct"` sans explication ; datetime inline :42-51 | PaymentHistory.tsx:23-26 |
| StatusBadge | `brouillon` **et** `valide` d'un BL rendent tous deux « En attente » — deux états réels, un seul libellé ; statut inconnu affiché brut | StatusBadge.tsx:22-23,53 |
| NotificationBell | `"Décision requise"/"Exécution requise"/"Clôture requise"` — style injonctif technique → *« Demande à approuver »*… ; ne couvre que les demandes (cf. M4) | NotificationBell.tsx:17-20 |
| DemandeClotureDialog / DemandeDecisionDialog | Textes de conséquence **exemplaires** (:92-103 ✔) ; refus silencieusement rempli `'Demande refusée'` :103 ; `Loader2` inline hors convention :113/:223 | DemandeClotureDialog.tsx, DemandeDecisionDialog.tsx |
| DashboardDemandeWidgets | Échec de fetch en console seule :75 — tuiles muettes après erreur ; 100 demandes chargées pour des stats client-side :48 | DashboardDemandeWidgets.tsx |
| ErrorBoundary | `error.message` brut affiché :38 (cf. T8) | ErrorBoundary.tsx |
| print-layout | Fallback vendeur `"Administrator"` :133 (cf. T9) ; quantités imprimées forcées à 2 décimales (`"1,00"`) :59-60 alors que l'écran affiche des entiers | print-layout.tsx |
| navConfig | Entrées de menu jargonneuses pour un non-initié : `"Avoirs"` :71, `"Demandes Réappro"` :109-112, `"Affectations"` :115, `"Valorisation"` :116, `"Saisie comptable"` :132 → sous-libellés ou intitulés complets | navConfig.tsx:43-147 |
| ui/pagination, ui/query-state, ui/confirm-dialog, ui/loading | Défauts français corrects (`"Aucune donnée"`, `"Échec du chargement"` + Réessayer, `"Affichage de X à Y sur Z résultats"`, `"Chargement…"`) ✔ | pagination.tsx:32-37, query-state.tsx:46-74, loading.tsx:8-72 |

---

## 4. Quick wins (moins d'une heure chacun, classés)

> **✅ Les 10 quick wins ci-dessous ont été exécutés le 2026-08-17** (typecheck 0 erreur, lint 0 erreur, 58/58 tests frontend au vert). Détails d'implémentation : libellés de rôles et de types d'emplacement centralisés dans `frontend/src/utils/roles.ts` (réutilisé par Profil, Topbar, UserManagement, AffectationsLocations) ; convention de couleur du solde net alignée sur celle documentée dans TiersDetail (net > 0 = créance = vert).

1. **Corriger les accents de NouveauBonLivraison** — 11 chaînes (`selectionner`, `numero`, `Creez`, `deja`, `complementaires`, `estime`, `Creation`, `cree`, `creation`) : frontend/src/pages/NouveauBonLivraison.tsx:37,40,128,173,176,194,265,289,450,464,469. Français cassé visible à chaque création de BL.
2. **Corriger les apostrophes de NouvelAvoir** (« d origine », « l avoir ») : frontend/src/pages/NouvelAvoir.tsx:34,123,175,196 + accents d'AffectationsLocations (`mises a jour`) : frontend/src/pages/AffectationsLocations.tsx:123,129.
3. **DevisDetail : remplacer l'`Intl … currency:'XOF'` par `formatCurrency`** — supprime le seul « F CFA » de l'app : frontend/src/pages/DevisDetail.tsx:206 (STILL OPEN DESIGN-AUDIT §7.1, mais c'est 1 ligne).
4. **Receptions : traduire le statut brut** (`validee`/`expediee`) via `StatusBadge` : frontend/src/pages/Receptions.tsx:351.
5. **UserManagement : réutiliser `ROLE_LABELS`** (existe déjà dans frontend/src/pages/Profil.tsx:25-32) pour :278 et :389 ; idem AffectationsLocations.tsx:182 ; + mapper `location_type` :428.
6. **Aligner la couleur du solde net** entre frontend/src/pages/Tiers.tsx:175-176 et frontend/src/pages/TiersDetail.tsx:358 — même chiffre, sémantique inversée à un clic d'écart.
7. **Masquer ou câbler le bouton mort « Scanner code-barres »** : frontend/src/pages/NouvelleFacture.tsx:457-462.
8. **Formater les prix du rapprochement 3 voies** avec `formatCurrency` : frontend/src/pages/CommandeDetail.tsx:823-824 ; + `text-right` sur le Montant de Commandes.tsx:922 et le Stock d'Inventaire.tsx:592.
9. **GeneralLedger : conditionner le toast `'Export CSV réussi'`** pour supprimer le double toast contradictoire : frontend/src/pages/GeneralLedger.tsx:284 ; + mapper le badge `capitaux_propres` :492.
10. **Dashboard : passer la méthode de paiement brute (`ESPECE`) au formateur de libellés** : frontend/src/pages/Dashboard.tsx:1146 ; même correctif dans CaisseHistorique.tsx:267 et TiersDetail.tsx:875,926,1022.

---

## 5. Feuille de route suggérée

**Phase 1 — Polissage de la confiance (1 à 2 semaines).** Exécuter les 10 quick wins, puis la passe « copie française » : remplacer le jargon caissier relevé en section 3 (Tiers→Client, Libellé→Description, Solde théorique→Solde attendu, Allocation FIFO→affectation des paiements, Encaissements/Décaissements→Entrées/Sorties), compléter les placeholders des formulaires clés sur le modèle des meilleurs existants (CaisseV2:817-830, Commandes:632-645, UserManagement:332), et rétablir la règle « une erreur ne ressemble jamais à une liste vide » sur les deux pages qui y échappent encore (StockTransfers.tsx:113-117, UserManagement.tsx:73-88). Zéro migration, zéro nouveau module : uniquement des chaînes, des classes et des mappings — mais c'est ce que les caissiers voient toute la journée.

> **Avancement phase 2 au 2026-08-17** : M1 (codes-barres), M3 (UI Retours clients) et M12 (recherche/filtres achats & dépenses) livrés intégralement ; M4 (alertes actives) et M11 (motif d'avoir) partiellement ; confirmations récapitulatives ajoutées avant la validation d'une réception (écriture stock + CMP) et avant la génération en masse de commandes fournisseur. Restent : le centre de notifications persistant (F-15), les actions de cycle de vie sur AvoirDetail, puis la phase 3.

**Phase 2 — Le comptoir du magasin informatique (1 à 2 mois).** Livrer les fonctionnalités qui collent au métier : codes-barres de bout en bout (M1 — exposer `code_barre` dans les schémas produits, champ sur la fiche Inventaire, câbler le scan dans NouvelleFacture), interface Retours clients (M3 — le backend attend), cycle de vie des avoirs dans l'UI (M11), recherche/filtres des listes d'achats et dépenses (M12), et confirmation chiffrée avant les écritures lourdes (réception, génération de commandes en masse). En parallèle, brancher les producteurs SSE existants pour les alertes stock bas et impayés (M4) — l'infrastructure est déjà payée.

> **Avancement phase 3 au 2026-08-17** : M6 livré côté impayés (page Relances adossée à la balance âgée + historique CRM, sans nouvelle table). Restent M2 (garanties/numéros de série), M5 (ventes par vendeur), M7 (e-mail), M8 (import Excel), M10 (grilles tarifaires) — tous nécessitent une migration ou une décision d'infrastructure.

**Phase 3 — Vendre plus, encaisser mieux (trimestre suivant).** Les investissements différenciants : garanties et numéros de série (M2 — le vrai fossé concurrentiel d'un magasin informatique), rapports et commissions par vendeur (M5 — nécessite le champ vendeur sur les factures), relances d'impayés appuyées sur la balance âgée existante (M6), envoi des documents par e-mail (M7 — prérequis des relances), grilles tarifaires détail/gros (M10) et import Excel du catalogue (M8) pour industrialiser l'onboarding SaaS. Chaque brique s'appuie sur un module déjà en place ; aucune ne demande de refonte.

---

*Audit réalisé le 2026-08-17 sur la branche `main` (HEAD `31e37ea`). Sources : lecture intégrale de frontend/src/pages (45 pages), frontend/src/components, backend/src/routes + controllers ; dédoublonnage contre AUDIT.md, FEATURE-AUDIT.md, DESIGN-AUDIT.md, UX_USABILITY_AUDIT_2026-07-23.md, UX_REMEDIATION_PLAN_2026-07-23.md.*
