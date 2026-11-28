# 29 Mobile, recherche, hors ligne

> **Contre-expertise du 2026-11-27** ([détail](../vagues/vague-10-contre-expertise.md)) : Verdict maintenu, 29-A d'abord (un `sw.js` qui se désinscrit, plus l'intercepteur). **Une affirmation est fausse** : « la clé anti-doublon a tenu à chaque essai ». Si la connexion coupe pendant que le serveur travaille, Chrome renvoie la vente 7 ms plus tard : deux factures, stock retiré deux fois, une dette inventée au Client comptoir, écran « Vente enregistrée ». Propriétaire 07-A (clé écrite sur la facture dans la transaction), après 29-A ; la vérification après coupure passe à 29-B. D6 : un scan d'inventaire coupé fait planter la page, sans faux succès. Les icônes relèvent de 29-D seul. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-27, base `nolyx_audit_2` (API 6142). J'ai construit la **version de production** (hors du dépôt), servie comme nginx sur le port 6172, service worker actif, avec des coupures simulées : **avant** l'envoi (rien n'arrive au serveur) ou **après** (le serveur enregistre, la réponse se perd). Téléphones émulés au doigt : 360 × 740 (Android d'entrée de gamme) et 390 × 844. Réseau : 400 ms de latence, 750 kbit/s (3G) puis 1,6 Mbit/s. Rôles : caissier, vendeur, gérant, dépôt, admin.

**Banc.** La caisse MAG-1 du 25/11 répondait 409 (plus de 24 h) : clôturée par l'API au montant attendu (60 000, écart 0) ; le caissier a ouvert la sienne au téléphone (session 3, fonds 20 000). Ventes d'essai : FAC-2026-00209 à 211.

**Pourquoi personne ne l'avait vu.** Le service worker n'est jamais actif sur `localhost` (`main.tsx:16-17`, `sw.js:34`) : tests, banc et fiches précédentes tournent sans lui. En production, il est toujours là.

## 1. Verdict

**Améliorer, en réparant d'abord.** Les écrans tiennent au téléphone (aucune des 37 pages ne déborde à 360 px). Mais en production, une coupure de réseau devient un **faux succès** : « Vente enregistrée », « Paiement enregistré », « Caisse clôturée » s'affichent alors que rien n'est écrit. C'est pire que pas de hors ligne du tout. On répare cela (petit lot), on allège l'application pour la 3G, on ajoute la caméra comme lecteur de code. La vente hors ligne vient **plus tard**, limitée au comptoir payé comptant.

## 2. Utilité

| | Général | Informatique | Habillement | Alim. / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Écrans au téléphone | 5 | 4 | 5 | 5 | 5 | 5 |
| Recherche (globale, produit) | 4 | 5 | 4 | 4 | 4 | 4 |
| Hors ligne actuel | 0 | 0 | 0 | 0 | 0 | 0 |
| Hors ligne réparé (vérité, coquille) | 5 | 4 | 5 | 5 | 5 | 5 |
| Vente hors ligne (plus tard) | 3 | 2 | 3 | 4 | 3 | 3 |
| Installer comme application | 3 | 3 | 3 | 3 | 3 | 3 |

Le hors ligne actuel vaut 0 : il trompe.

## 3. Parcours réel

| Rôle, écran | Parcours | Ce qui marche | Ce qui bloque |
|---|---|---|---|
| Caissier, 390 | Vendre au comptoir | Chercher « huile » : 1re proposition en **0,8 s** en 3G ; « Encaisser » → « Vente enregistrée » en **0,8 s** ; clavier numérique sur « Espèces reçues » | Page longue (fiche 07 : « Encaisser » à 2 590 px pour 10 articles) ; pas de caméra |
| Caissier, 390 | Encaisser une facture | 4 gestes | Coupure : faux succès (D2) |
| Gérant 360 / caissier 390 | Clôturer, ouvrir la caisse | 4 et 3 gestes | Sélecteur tronqué « Choisir un… » ; « Clôturer » à 618 px sur 740, sous le clavier (supposé) ; coupure : faux succès (D3, D4) |
| Dépôt, 360 | Recevoir, compter | Menu de 8 entrées ; quantités au clavier numérique ; inventaire : fiche 12 | Ni scan à la réception (17-G) ni caméra (12-E) |
| Vendeur, 360 | Nommer un client | « Nommer le client » | Il faut toucher × sur « Client comptoir » avant de taper (capture `nommer-client-360`) |
| Gérant / admin, 360 | Accueil du soir, menu | Lisible | Accueil 7,9 écrans (23-E) ; menu de 33 liens, 2,6 écrans |

**Vitesse en 3G** (version de production, cache vide puis plein) :

| | 1re visite, 750 kbit/s | 1re visite, 1,6 Mbit/s | Visite suivante |
|---|---|---|---|
| Caissier, Vente comptoir | 8,4 s | 5,9 s | 0,85 s |
| Gérant, accueil | 12,3 s | 8,3 s | 2,5 à 3 s (26 requêtes) |

Première visite : **918 Ko**, dont le logo **463 Ko** (une photo JPEG de 1024 px nommée `logo.png`, servie comme icône d'onglet), le paquet commun 333 Ko (tableur Excel compris), la police 47 Ko. La page de vente elle-même pèse 5 Ko.

**Recherche.** Recherche globale « riz » au téléphone : 1,0 s en 3G, 2 requêtes pour un caissier (jusqu'à 7 pour l'admin, `GlobalSearch.tsx:174-183`), protégée contre les réponses en retard (ligne 186). Raccourcis clavier : utiles au bureau, sans objet au téléphone, sans gêne. Accents et mots partiels : lot 10-F. Contacts par numéro : 19-E.

**Bien fait.** 0 px de débordement horizontal sur les 37 pages à 360 px ; tableaux remplacés par des cartes ; champs en 16 px (pas de zoom forcé sur iPhone) ; zoom au doigt autorisé ; claviers numériques sur les montants et quantités.

## 4. Défauts prouvés

### Argent et stock

**La cause unique de D1 à D6.** Quand le réseau coupe, le service worker ne renvoie pas une erreur mais une réponse « réussie » (statut 200) contenant `{ success: false, error: 'Hors ligne' }` (`sw.js:57-68`). L'application la prend telle quelle (`api.ts:34-52` rend l'objet, l'intercepteur ne rejette que les statuts d'erreur, `api.ts:86-106`). Chaque écran affiche donc son message de succès. Toutes les écritures passent par là.

| N° | Défaut | Preuve (écran) |
|---|---|---|
| D1 | **Vente perdue, écran « Vente enregistrée ».** Coupure avant l'envoi : « Vente enregistrée », ticket « — », monnaie « Montant indisponible ». Aucune facture. Le client part avec l'article, l'argent est au tiroir, l'ERP ne sait rien : stock faux, caisse en excédent le soir | Factures 199 → 199, huile 433 → 433 ; capture `vente-drop-before-allow-apres` ; `VenteComptoir.tsx:244-256` (aucun contrôle du résultat) |
| D2 | **Paiement inventé.** FAC-2026-00195 (56 000 dus), 5 000 saisis, coupure : « Paiement de 5 000 FCFA enregistré. Facture soldée. » Sous le message, la page dit « Non payée, payé 0 » | Paiements 0 → 0, reste 56 000 ; capture `paiement-coupure-390` ; `FactureDetail.tsx:247-257` |
| D3 | **Clôture inventée.** Gérant, 360, 60 000 comptés : « Caisse clôturée » ; la session 2 reste « ouverte » | `sessions_caisse` id 2 : `ouverte`, `date_cloture` vide ; `CaisseV2.tsx:846-852` |
| D4 | **Ouverture inventée.** « Caisse ouverte avec un fonds de 20 000 FCFA » ; aucune session créée ; l'écran montre ensuite « Fermée » | Dernière session : id 2 `cloturee` ; `CaisseV2.tsx:738-743` |
| D5 | **Réponse perdue : même écran que D1.** Le serveur enregistre FAC-2026-00210, l'écran affiche « Vente enregistrée » sans numéro ni monnaie. Le caissier ne peut pas distinguer D1 de D5 | FAC-00210 créée, stock 432 → 431 |
| D6 | Inventaire : un scan pendant une coupure affiche « undefined : 0 compté » et vide le champ ; le comptage est perdu sans alerte | Lu dans le code, non rejoué : `InventairePhysiqueDetail.tsx:399-406` |

**Antidoublon (07-A).** Après une réponse perdue, Chrome renvoie seul la vente jusqu'à 5 fois. La clé d'idempotence a tenu : **une seule facture** à chaque essai (FAC-00209, 210, 211). Mais l'écran ne voit jamais l'erreur : l'étape de 07-A « après une erreur réseau, interroger la clé » ne se déclenchera pas sans 29-A.

### Blocage

| N° | Défaut | Preuve |
|---|---|---|
| D7 | Lecture pendant une coupure : la liste des factures affiche « Cette page a rencontré un problème » (plantage) au lieu de « Pas de connexion » ; l'accueil du caissier devient celui du lecteur (« consultation du stock ») | Écran ; t6, capture `factures-coupure-390` |
| D8 | Rechargement sans réseau : page d'erreur du navigateur. Le service worker ne garde que `manifest.json` et le logo (`sw.js:4-7`, `52-54`) | `ERR_INTERNET_DISCONNECTED`, capture `reload-offline-390` |
| D9 | Page jamais ouverte pendant une coupure, **ou** ancienne version après un déploiement : « Cette page a rencontré un problème… prévenez votre administrateur ». Aucun rechargement automatique ; `index.html` servi sans `Cache-Control` | « Failed to fetch dynamically imported module » (morceau `Factures` retiré comme le fait un déploiement) ; capture `apres-deploiement-360` ; `nginx-client.conf.template:47-53` |
| D10 | 918 Ko et 8,4 s à la première visite en 3G | Logo 463 Ko (`public/logo.png`, JPEG 1024 px) ; tout `node_modules` dans un seul paquet chargé d'emblée (`vite.config.ts:17-25`), tableur `xlsx` compris (`useExportExcel.ts`, import direct) |

### Gêne

- D11. Après **chaque** vente, tout le stock de la boutique est rechargé, sans limite (`VenteComptoir.tsx:216-217`, `StockLocationService.ts:206-218`) : 3,7 Ko pour 23 articles, donc environ 320 Ko par vente pour 2 000 articles avant compression (estimé). Payé en données mobiles à chaque ticket.
- D12. Aucun indicateur « hors ligne » (aucun `navigator.onLine` dans `frontend/src`).
- D13. Petites cibles au doigt (< 32 px) à 360 : 20 sur Factures, 23 sur Inventaire, 21 sur Comptabilité, 36 sur Paramètres (numéros et noms en lien dans les cartes). Pages longues : Journal 10,1 écrans, Inventaire 8,3.
- D14. Recherche globale au milieu de l'écran (de 257 à 484 px sur 740) : avec le clavier ouvert (environ 290 px), les résultats sont dessous (supposé, pas de vrai clavier).
- D15. Aucune caméra pour lire un code-barres (aucun `BarcodeDetector` ni `getUserMedia`).
- D16. Installation : Chrome ne signale aucune erreur du manifeste, mais l'icône est une photo 1024 px déclarée PNG 192 et 512 « maskable » (recadrée sur Android, supposé), aucune icône iPhone (`apple-touch-icon`), aucun bouton « Installer ».

## 5. Comparaison

| | Odoo | Sage 100 | Loyverse, outils locaux | Nous |
|---|---|---|---|---|
| Hors ligne | Caisse : ventes gardées dans le navigateur, **ne pas recharger**, pas de nouveau client ni de stock réel, produits en nombre limité [O9] | Réseau local ° | Loyverse : ventes et caisse hors ligne ; ni remboursement, ni nouveau client, ni stock ; déconnexion bloquée avant synchronisation [L11]. Ma Caisse, Karnet : oui [P3][P5] | Rien, et faux succès |
| Téléphone | Application web | Poste Windows ° | Applications Android | Tout l'ERP, propre à 360 px |

**Mieux chez eux** : la vente continue pendant une coupure ; applications légères. **Mieux chez nous** : tout l'ERP au téléphone (caisse, achats, inventaire, rapports), sans installation. **À battre** (concurrents.md T16) : vendre pendant une coupure avec un état de synchronisation visible, survivre à un rechargement.

## 6. Manques par profil

- **Tous** : savoir si une écriture est passée ; ouvrir l'application sans réseau ; caméra comme lecteur (beaucoup n'ont pas de douchette, supposé).
- **Alimentaire / grossiste** : dépôt au téléphone là où le réseau coupe (supposé) ; la vente hors ligne y sert le plus.
- **Habillement** : étiquettes lues à la caméra. **Informatique** : numéros de série à la caméra (10-K).
- **Plus tard** : notifications sur le téléphone. **Jamais** : application Android native (le web suffit).

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** : aucune incidence propre au téléphone.
- **FNE** : une vente faite hors ligne ne peut pas être certifiée au moment de la vente. Proposé : jamais certifiée automatiquement ; certifiable après synchronisation, depuis la liste (« le commerçant choisit facture par facture »).
- **Mobile money** : hors ligne, le vendeur vérifie le SMS de l'opérateur sur le téléphone du magasin ; la référence (07-F) part avec la vente en file d'attente.
- **WhatsApp** : le lien `wa.me` exige le réseau ; « Partager » au téléphone : 27-I. Hors ligne, bouton grisé avec explication.

## 8. Lots proposés

Ordre du cadrage. Fichiers sous `frontend/` sauf mention.

### 29-A · Le réseau coupé n'est plus un succès (S, priorité 1)
- **Problème** : D1 à D7.
- **Résultat** : une coupure affiche toujours « La connexion a coupé », jamais un succès.
- **Écrans** : tous ; rien de nouveau.
- **Base/API** : aucune.
- **Fichiers** : `public/sw.js`, `src/services/api.ts`, `src/pages/VenteComptoir.tsx`.
- **Étapes** : le service worker n'intercepte plus `/api/` ; nouveau nom de cache ; l'intercepteur rejette toute enveloppe `success: false`, même en 200 ; la vente comptoir exige `facture_id` avant « Vente enregistrée ».
- **Tests** : version de production servie hors `localhost`, coupure avant et après envoi : vente, paiement, ouverture, clôture, scan d'inventaire, création de client ; test de l'intercepteur.
- **Fini quand** : les six cas affichent une erreur ; aucun succès sans écriture en base.
- **Dépend de** : rien. **Risque** : un téléphone garde l'ancien service worker jusqu'à sa visite suivante (`sw.js` en `no-cache`).

### 29-B · Après une coupure, dire si c'est passé (M, priorité 3)
- **Problème** : D5, D12 ; le caissier ne sait pas s'il doit refaire.
- **Résultat** : bandeau « Hors ligne » ; boutons d'écriture grisés avec la raison ; saisie gardée ; à la reprise, l'écran vérifie puis dit « Paiement bien enregistré » ou « Pas enregistré : réessayez ».
- **Base/API** : aucune ; relecture de l'état (session, paiements de la facture, ligne d'inventaire) ; vente : `GET /factures/comptoir/:cle` de 07-A.
- **Fichiers** : `hooks/useNetworkStatus.ts` (nouveau), `Layout.tsx`, `FactureDetail.tsx`, `CaisseV2.tsx`, `InventairePhysiqueDetail.tsx`, `utils/errors.ts`.
- **Étapes** : état réseau (événements `online`/`offline` et requêtes en échec) ; « La connexion a coupé. Vérification… » ; relecture ; clé d'idempotence gardée jusqu'à confirmation.
- **Tests** : coupure avant et après envoi pour chaque geste ; retour du réseau.
- **Fini quand** : aucun doublon et aucun geste perdu sans message, sur les cinq gestes.
- **Dépend de** : 29-A, 07-A. **Risque** : `navigator.onLine` ment parfois (Wi-Fi sans internet) : se fier aussi aux échecs.

### 29-C · Nouvelle version et page non chargée (S, priorité 3)
- **Problème** : D9.
- **Résultat** : après un déploiement, l'application se recharge seule ; hors ligne, « Cette page n'est pas encore sur ce téléphone : reconnectez-vous ».
- **Fichiers** : `src/main.tsx` (`vite:preloadError`), `ErrorBoundary.tsx`, `deploy/nginx-client.conf.template` (`index.html` en `no-cache`).
- **Étapes** : sur échec de chargement d'un morceau, recharger une fois (garde contre la boucle) ; jamais pendant une vente en cours (panier non vide : proposer) ; message distinct hors ligne.
- **Tests** : morceau retiré après chargement ; coupure puis menu vers une page jamais ouverte.
- **Fini quand** : aucun « prévenez votre administrateur » dans ces deux cas.
- **Dépend de** : rien. **Risque** : faible.

### 29-D · Léger en 3G (M, priorité 3)
- **Problème** : D10, D11.
- **Résultat** : première visite sous 400 Ko et 4 s pour la vente en 3G ; quelques Ko par vente.
- **Base/API** : la vente comptoir cherche le stock au serveur (`products-with-stock` avec recherche et limite, existe déjà) au lieu de tout charger ; après une vente, seules les lignes vendues sont relues.
- **Fichiers** : `public/logo.png` (vraies icônes PNG, 29-I), `index.html`, `vite.config.ts` (plus de paquet unique ; `xlsx` chargé à l'export par `import()`), `hooks/useExportExcel.ts`, `components/useSalesStock.ts`, `VenteComptoir.tsx`.
- **Tests** : mesure scriptée en 3G sur la version de production ; 2 000 articles au banc.
- **Fini quand** : premier chargement de « Vente comptoir » ≤ 400 Ko ; une vente ≤ 10 Ko échangés.
- **Dépend de** : 10-F pour la recherche ; accueil du gérant : 23-E. **Risque** : régression d'export Excel.

### 29-E · La caméra comme lecteur de code-barres (M, priorité 4)
- **Problème** : D15 ; sans douchette, pas de scan.
- **Résultat** : un bouton caméra à côté de chaque champ « scanner ou chercher » (10-F) : vente (07-L), inventaire (12-E), réception (17-G), étiquettes. Bip et vibration ; lecture en continu pour l'inventaire.
- **Fichiers** : `components/ScanCamera.tsx` (nouveau), champs de 10-F.
- **Étapes** : `BarcodeDetector` s'il existe, sinon bibliothèque chargée à la demande ; EAN-13, EAN-8, Code 128 ; refus de la caméra expliqué.
- **Tests** : vrais Android d'entrée de gamme et iPhone ; faible lumière.
- **Fini quand** : 20 articles lus en moins de 60 s au téléphone.
- **Dépend de** : 10-F. **Risque** : caméra refusée sans HTTPS ; lenteur sur petits téléphones.

### 29-F · L'application s'ouvre sans réseau (M, priorité 7)
- **Problème** : D8.
- **Résultat** : l'application s'ouvre hors ligne et affiche le bandeau de 29-B ; jamais de données d'argent gardées dans le cache.
- **Fichiers** : `public/sw.js` (ou outil de build qui liste les fichiers), `vite.config.ts`.
- **Étapes** : garder `index.html` et `assets/` de la version courante ; repli de navigation sur `index.html` ; nouvelle version installée en attente, activée quand aucune vente n'est en cours ; `/api/` jamais en cache.
- **Tests** : rechargement hors ligne ; déploiement avec l'application ouverte ; déconnexion puis cache vidé.
- **Fini quand** : rechargement hors ligne = application et bandeau, pas la page du navigateur.
- **Dépend de** : 29-A, 29-B, 29-C. **Risque** : version ancienne servie trop longtemps.

### 29-G · Vendre pendant une coupure (L, priorité 7, plus tard)
- **Problème** : rien ne marche sans réseau ; Loyverse et Odoo vendent hors ligne.
- **Résultat** : ventes comptoir payées comptant (espèces, mobile money saisi), gardées sur le téléphone, envoyées au retour du réseau ; « 3 ventes en attente » visible.
- **Base/API** : `POST /factures/comptoir` accepte `vendue_le` et un numéro provisoire ; clé 07-A contre le doublon ; stock négatif accepté **à la synchronisation seulement**, signalé au gérant (question 3) ; rattachement à la session de caisse du moment.
- **Étapes** : 1) catalogue et prix de la boutique sur le téléphone ; 2) file de ventes, ticket « provisoire » ; 3) envoi dans l'ordre, refus montrés au gérant ; 4) ni crédit, ni nouveau client, ni retour, ni clôture tant que la file n'est pas vide ; déconnexion bloquée avant envoi.
- **Tests** : deux téléphones vendent le dernier article ; prix changé entre-temps ; caisse clôturée ailleurs ; téléphone éteint avant envoi.
- **Fini quand** : 50 ventes hors ligne arrivent une fois chacune, caisse et stock justes ou signalés.
- **Dépend de** : 07-A, 08-A, 10-A, 13-D1, 29-F. **Risque** : ventes perdues avec le téléphone ; double vente du dernier article ; FNE non décidée.

### 29-H · Au doigt (M, priorité 8)
- **Problème** : D13, D14, menu de 33 liens, client à nommer en deux gestes, sélecteur tronqué.
- **Résultat** : toute la carte d'une ligne est touchable ; recherche globale en haut, plein écran, résultats au-dessus du clavier ; « Nommer le client » ouvre la recherche ; menu raccourci par rôle (13-F, 25-B) ; validation visible clavier ouvert.
- **Fichiers** : `DocumentListPage.tsx`, `GlobalSearch.tsx`, `TiersPicker.tsx`, `ui/dialog.tsx`, menu latéral.
- **Tests** : balayage scripté à 360 : aucune cible de moins de 32 px dans les listes ; vrai Android avec clavier.
- **Fini quand** : les parcours de la section 3 sans geste de trop.
- **Dépend de** : 23-E pour l'accueil, 07-L pour la vente. **Risque** : faible.

### 29-I · Installer sur l'écran d'accueil (S, priorité 8)
- **Problème** : D16 ; le mot « PWA » ne dit rien au commerçant, « une icône sur le téléphone » oui.
- **Résultat** : bouton « Ajouter nolyxERP à l'écran d'accueil » (Mon profil, première connexion au téléphone) ; aide pour iPhone ; ouverture sur l'écran du rôle.
- **Fichiers** : `public/manifest.json`, icônes vraies (dont `maskable` avec marge), `index.html` (`apple-touch-icon`), `pages/Profil.tsx`.
- **Tests** : installation réelle Android et iPhone ; icône non rognée.
- **Fini quand** : un caissier installe l'application en moins d'une minute, seul.
- **Dépend de** : 29-D (icônes). **Risque** : faible.

## 9. Questions pour le propriétaire

1. Vente hors ligne : plus tard (proposé), ou dès le premier client ? Cela dépend de la fréquence des coupures chez les premiers clients : faut-il la mesurer une semaine chez eux ?
2. Si oui : espèces et mobile money seulement, client comptoir seulement, et pour combien de temps au plus (proposé : 4 heures, 100 ventes) ?
3. Dernier article vendu deux fois hors ligne : vente gardée en stock négatif avec alerte au gérant (proposé), ou refusée à la synchronisation ?
4. Mise à jour de l'application pendant une vente : attendre la fin de la vente (proposé) ?
5. Recommande-t-on une douchette Bluetooth, ou la caméra suffit-elle au premier mois ?
6. Proposer l'installation sur l'écran d'accueil à la première connexion au téléphone (proposé : oui) ?

## Non vérifié

- Vrais téléphones, clavier virtuel, iPhone : tout est émulé.
- Création d'un client pendant une coupure (même cause, non rejouée) ; D6 lu dans le code.
- Taille du stock d'une boutique de 2 000 articles (estimée) ; compression par nginx non mesurée sur l'API.

## À transmettre

- **07-A** : sans 29-A, l'écran ne verra jamais l'erreur réseau en production ; 07-A dépend de 29-A.
- **Toutes les fiches** : les essais de coupure faits sur `localhost` ne montrent pas le comportement de production (service worker absent).
- **Fiche 28** : `public/logo.png` est un JPEG de 463 Ko ; vérifier l'en-tête `Cache-Control` de `index.html` sur le serveur.
