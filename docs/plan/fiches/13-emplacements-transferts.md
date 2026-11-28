# 13 Emplacements, transferts, affectations

> **Contre-expertise du 2026-11-27** ([détail](../vagues/vague-6-contre-expertise.md)) : Verdict maintenu. D1 (exécution en double) : fenêtre de 0 à 3 ms, donc API seulement, mais 13-A coûte peu et reste en tête. D2 : refait avec un vendeur affecté à MAG-2 seul, il tient ; le contrôle existe à la caisse (403) mais pas à la vente, et le serveur choisit le site principal : 13-D1 corrige le serveur, pas seulement l'écran. D3 : `location_type` est lue par les demandes, pas par la vente (`StockMagasinService.ts:22-29`). B2 : la fiche utilisateur écrit bien la boutique par défaut, seul l'écran Affectations la perd. 13-D est découpé en 13-D1 (vendre et encaisser chez soi) et 13-D2 (recevoir, transférer, compter chez soi) ; 13-E absorbe l'étape 1 de 14-B ; 13-H réduit aux numéros Wave et Orange ; 13-I plus tard. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-27, base `nolyx_audit_1`, interface et API réelles (six rôles ; 1440 et 390 px). Montants en FCFA. MAG-1 = Boutique Audit (principale), MAG-2 = Boutique Yopougon, DEP-1 = Dépôt Vridi. TRF = transfert. La caisse du banc (session 2, ouverte le 25/11, refusée car vieille de plus de 24 h) a été clôturée sans écart par le gérant ; sessions 4 (MAG-1, gérant) et 3 (MAG-2, vendeur) ouvertes pour l'essai. **Mes essais ont désactivé DEP-1, sans retour possible par l'ERP** (D4) ; son stock est passé à MAG-2.

## 1. Verdict

**Améliorer.** Indispensable dès deux sites, et sa base est saine : le transfert emporte la valeur au coût moyen (0,04 F d'écart sur 6,2 millions), refuse de vider un stock deux fois, cache les prix au dépôt. Mais aujourd'hui on ne peut ni créer une boutique, ni garder chaque employé dans la sienne : l'argent d'une vente tombe dans le tiroir d'une autre boutique, deux clics sur « Exécuter » déplacent la marchandise deux fois, et c'est le **nom** qui décide si un site est un dépôt. On garde un seul écran d'affectation (l'autre part), on ajoute l'étape « expédié », et un commerçant à une seule boutique ne voit plus rien de ce module.

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire boutique / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Besoin | 4 | 4 | 4 | 2 / 5 | 0 (à cacher) | 5 |
| Réponse actuelle | 1 | 1 | 1 | 1 / 1 | 1 (4 menus inutiles) | 1 |

- **Grossiste** : dépôt + comptoir est son modèle ; il transfère chaque jour.
- **Habillement** : boutiques qui s'échangent des tailles ; « il en reste à Yopougon » vend.
- **Un magasin** : le cas le plus fréquent ; Emplacements, Transferts, Demandes et Affectations s'affichent quand même (aucun profil ne les masque, `profilsActivite.ts:25-53`).

## 3. Parcours réel

| Rôle | À l'écran | Ce qui bloque |
|---|---|---|
| Admin, 1440 | Emplacements → « Nouvel emplacement » → code, nom → « Créer » | **500**, message « Réessayez » (capture `13-creer-boutique`). Ni type boutique/dépôt, ni « Modifier », ni « Fermer » à l'écran |
| Admin, 1440 | Affectations, puis Utilisateurs | Deux écrans qui se contredisent : gérant « 0 emplacement » d'un côté, trois de l'autre (captures `13-affectations-gerant`, `13-utilisateurs`) |
| Dépôt, 390 | Transferts → « Nouveau transfert » → départ, arrivée, produit, quantité → Créer → « Exécuter » → confirmer : **≈ 10 gestes** | Les 3 sites proposés en départ (capture `13-depot-transfert-source`) : il vide une boutique vers l'autre |
| Vendeur de MAG-2, 390 | Vente comptoir | « Magasin » vaut **Boutique Audit (MAG-1)** par défaut, les deux au choix (capture `13-vendeur-mag2-vente`). Transferts : « Accès réservé » : il ne voit pas ce qui lui arrive et ne peut pas le confirmer (403) |
| Caissier, lecteur | Liste des transferts (API 200) | — |

**« J'ouvre ma deuxième boutique à Yopougon avec deux vendeurs »** : aujourd'hui **impossible** (500, puis aucune caisse : lot 08-G). Une fois réparé : créer (5 gestes), une ligne `magasins` à insérer par un technicien, deux utilisateurs (≈ 7 gestes chacun), un transfert (≈ 10), puis **à chaque vente** changer « Magasin ». Total ≈ 30 gestes et une intervention. Cible : 15 gestes, sans technicien.

**« J'envoie 20 cartons du dépôt, il en arrive 19 »** : transfert de 20 (8 gestes), « Exécuter » par le dépôt ou le gérant (2), puis le gérant ouvre Inventaire → produit → « Ajuster » −1 perte (5). ≈ 15 gestes, deux personnes ; la perte n'est pas reliée au transfert (mouvement 426, référence vide) et le transfert dit « 20 livrés ». Cible : « Expédier » (8 gestes) puis « Réceptionner 19 » à la boutique (4).

## 4. Défauts prouvés

### Argent et stock

| N° | Défaut | Preuve | Où |
|---|---|---|---|
| D1 | **Un transfert exécuté plusieurs fois.** Quatre « Exécuter » simultanés sur un transfert d'**un** écran : **4** sortent du dépôt, 4 entrent à MAG-2, 8 essais sur 8 | TRF-2026-00010 : 1 demandé, 1 « transféré », 4 sorties et 4 entrées, 4 « complete » au journal. Dépôt 80 → 48 pour 8 écrans envoyés. Aucun verrou sur le transfert (`StockTransferService.ts:237`) | API ; écran : deux postes au même moment (non rejoué) |
| D2 | **L'argent tombe dans le tiroir d'une autre boutique.** Le vendeur affecté à MAG-2, son tiroir ouvert, vend sur MAG-1 et encaisse une facture à crédit de MAG-1 | FAC-2026-00204 (3 500) et paiement de FAC-2026-00205 (2 800) : session 4 de MAG-1 **+6 300**, session 3 de MAG-2 **0**. Au soir : MAG-1 manque 6 300, MAG-2 en a 6 300 de trop. Le paiement prend la caisse du magasin de la facture (`PaiementService.ts:217-233`) ; aucun contrôle d'affectation à la vente | Écran (sélecteur) et API |
| D3 | **C'est le nom qui fait le dépôt.** Le dépôt renommé « Entrepôt Vridi » (ENT-1) devient vendable ; MAG-2 renommé « Boutique Yopougon près du dépôt » ne vend plus | FAC-2026-00206, 600 000 sur le stock du dépôt (HP 80 → 79). MAG-2 : 422 « stock dépôt ». La colonne `location_type` est ignorée : `LIKE 'DEPOT%'` (`StockMagasinService.ts:22-40`, `ProduitController.ts:113-130`) | API (pas d'écran de modification) ; écran dès la création réparée |
| D4 | **Stock enfermé dans un site fermé.** DEP-1 fermé avec TRF-20 en route vers lui ; « Exécuter » l'y dépose ; on ne rouvre jamais | 5 bouteilles (5 499,20) entrées dans DEP-1 inactif ; nouveau transfert vers lui : 201 ; `PUT {actif:true}` : 200 mais toujours inactif ; l'écran de transfert cache les sites inactifs (`StockTransfers.tsx:453`) : sortie par l'API seulement (TRF-23) | API |
| D5 | **La marchandise part avant « Exécuter ».** Un inventaire entre-temps retire le stock deux fois ; « Annuler » après le départ laisse le stock au dépôt ; 19 sur 20 arrivés : aucune case | Rejoué par la contre-expertise vague 5 (sucre : 5 unités perdues). Le stock ne bouge qu'à l'exécution (`StockTransferService.ts:310`) ; écart = « Ajuster » sans lien (mouvement 426) | Écran |
| D6 | **Le dépôt agit partout.** Affecté au dépôt seul, il transfère de MAG-1 à MAG-2 (TRF-17, 201 puis 200), réceptionne à MAG-2 (fiche 17, D13), compte et ajuste MAG-1 (fiche 12, D5) | `routes/stock-transfers.ts:14-16` : rôle seulement | Écran |

Bons points : aucun stock négatif (`stock_par_location_quantite_check`) ; deux transferts qui vident le même stock : le second est refusé (TRF-12, 409).

### Blocage

- **B1. Créer un site : 500**, même avec `location_type` (le schéma le retire, `StockLocationService.ts:93` ne l'écrit pas). Propriétaire : 08-G.
- **B2. Deux affectations.** « Affectations » écrit `utilisateur_locations`, la fiche utilisateur `user_location_roles` ; la caisse lit l'union (`CaisseMagasinService.ts:724-770`). Vendeur « passé » à MAG-2 par Affectations : il garde MAG-1 (caisse : MAG-1 et MAG-2). « Emplacement par défaut » n'est jamais enregistré (`default_location_id` retiré par le schéma, `schemas.ts:767` ; `est_defaut` reste faux) ni lu : la vente prend le principal (`useSalesStock.ts:93`).
- **B3.** Modifier le type ou rouvrir un site : `PUT` répond 200 et ignore le champ (`StockLocationService.ts:143`). Fermer : aucun bouton.
- **B4.** La boutique qui reçoit ne voit ni ne confirme le transfert (vendeur et caissier : 403).
- **B5.** Tout ou rien : une ligne courte bloque tout le transfert (TRF-13 : le lait reste à Yopougon car les chemises manquent) ; seule issue : annuler, refaire.

### Gêne

- Ligne en double ou site inconnu : 500 « Erreur serveur » (API).
- Numéros perdus (TRF-15 et 16 consommés par des échecs) : `nextval` dans le service (`:172`), pas `NumberingService`.
- Mouvements : référence « Transfert TRF-1 » au lieu du numéro, `transfer_id` jamais rempli, aucun auteur.
- Recherche des transferts côté navigateur ; export limité à 1 000.
- « Principal » veut dire deux choses : défaut des réceptions (`ReceptionService.ts:149`) et défaut de vente.
- Renommer un site ne renomme pas sa caisse (08-G).
- Le vendeur de MAG-2 lit le stock de MAG-1 (utile) et les 199 factures, montants compris (fiche 03, 4.9).

**Correction du suivi** : la réception **a** un emplacement (`ReceptionService.ts:149`) ; c'est la commande qui n'en a pas (16-D).

## 5. Comparaison

| | Ils font mieux | Nous faisons mieux |
|---|---|---|
| Sage 100 | Multi-dépôts et transferts dans toutes les gammes, droits par dépôt dès Standard [G1] | Prix |
| Odoo | Entrepôts et transferts internes (connaissance générale, non relue) | Simplicité |
| Loyverse | Multi-magasins gratuit [L1] | Transferts gratuits (payants chez Loyverse, 25 $/magasin/mois [L1]) ; valeur transférée au coût moyen ; dépôt sans prix |

Minimum attendu (hypothèse, `concurrents.md`) : envoyé, reçu, écart en deux temps ; bon de transfert ; dépôt sans prix ; **rien à l'écran pour un magasin unique**. Nous n'avons que le troisième.

## 6. Manques par profil

- **Tous, plusieurs sites** : boutique de l'utilisateur respectée (13-D) ; expédier puis recevoir (13-E) ; « il en reste à Yopougon » (13-I).
- **Grossiste** : transfert en cartons (10-H) ; bon de transfert imprimé sans prix pour le chauffeur (fiche 27) ; livrer depuis le dépôt (02-G).
- **Habillement** : envoyer « 2 du 42 » depuis la fiche produit (13-I, plus tard en grille avec 10-J).
- **Informatique** : numéros de série dans le transfert (10-K).
- **Plus tard** : rayons, transferts planifiés, réassort automatique (fiche 14).

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** : un transfert interne n'est pas une vente : ni TVA ni facture, au coût. Rien à changer.
- **FNE** (supposé, `faits/fne.md` §7) : la plateforme demande un `establishment` et un `pointOfSale`, « un point de vente = une caisse ». Préparer : un identifiant d'établissement par boutique, un identifiant de point de vente par caisse ; le dépôt n'en a pas. Le contrôle « sortie magasin » (art. 13 bis cité) justifie un bon de transfert imprimé (fiche 27).
- **Mobile money** : Wave donne une clé par portefeuille (`faits/mobile-money.md` §4). Préparer le numéro ou le QR marchand **par caisse** ; l'encaissement suit la règle de 13-D (le tiroir où l'argent est reçu).
- **WhatsApp** : le message (03-L) signe avec le nom et le téléphone de la boutique de la pièce : le téléphone manque sur l'emplacement (13-H).

## 8. Lots proposés

Ordre du cadrage. Prochaine migration : le numéro libre (dernière : `113`) ; tout changement de schéma régénère `ci-baseline.sql`. Déjà ailleurs : création qui répond 500 et caisse de chaque boutique **08-G** ; stock par emplacement **10-A** ; coût par site **10-B** ; droits sur l'argent **08-E** ; demandes **fiche 14** ; bon imprimé **fiche 27**. Ce lot remplace **07-G** et la partie boutique de **03-F**. **12-D étape 2** (comptage limité aux emplacements) utilise la fonction de 13-C.

### 13-A · « Exécuter » ne compte qu'une fois (S, priorité 1)
**Problème** : D1, et 500 sur doublon ou site inconnu. **Résultat** : quoi qu'il arrive, un transfert bouge son stock une seule fois.
**API** : en tête de `complete`, `UPDATE stock_transfers SET statut='en_cours' WHERE id=$1 AND statut='en_preparation' RETURNING *` (enum existant), sinon 409 ; même verrou pour `cancel`. Création : sites existants et actifs (422 en français), produits distincts (refine Zod, 422) ; numéro par `NumberingService` après validation. Mouvements : `transfer_id` et `reference_liee = numero_transfer`.
**Fichiers** : `StockTransferService.ts:155-342`, `NumberingService.ts`, `schemas.ts:519-527`.
**Tests** : 4 « Exécuter » parallèles → un 200, trois 409, stock −1 ; site 999 → 422 ; doublon → 422 ; vers un site inactif → 422.
**Fini quand** : D1 rejoué : 0 double. **Dépend** : rien. **Risque** : faible.

### 13-B · Le type décide, pas le nom (S, priorité 1)
**Problème** : D3. **Résultat** : un dépôt ne vend jamais, quel que soit son nom.
**API** : `MAGASIN_SCOPE_SQL` = `sl.actif AND sl.location_type = 'magasin'` ; `getVentesLocations` appelle `getMagasinLocations`.
**Fichiers** : `StockMagasinService.ts:1-130`, `ProduitController.ts:113-130`, tests associés.
**Tests** : D3 rejoué : « Entrepôt » → 422, « près du dépôt » → 201.
**Fini quand** : plus aucun `LIKE 'DEPOT` dans `src/`. **Dépend** : 08-G (type écrit à la création). **Risque** : base existante au type faux : requête de contrôle avant livraison.

### 13-C · Une seule affectation, un seul écran (M, priorité 2)
**Problème** : B2. **Résultat** : le patron coche les boutiques d'un employé sur sa fiche, choisit sa boutique par défaut, et la retrouve dans l'« Équipe » de la boutique.
**Base** : copier `utilisateur_locations` dans `user_location_roles` (union, `est_defaut` gardé), un seul défaut par utilisateur (index unique partiel), supprimer `utilisateur_locations` et `role_at_location` (toujours « both »).
**API** : supprimer `/user-location-assignments` ; `adminCreate/UpdateUserSchema` + `location_defaut_id` ; `/auth/me` renvoie boutiques et défaut ; une fonction `userLocationIds(user)` (admin et gérant : toutes) remplace `getUserLocationRole`, les deux replis de `CaisseMagasinService` et `DemandeController.ts:39`.
**Écrans** : supprimer `AffectationsLocations.tsx`, sa route, son module ; fiche utilisateur « Boutiques » et « Boutique par défaut » ; onglet « Équipe » en lecture dans la fiche emplacement.
**Fichiers** : migration, `AdminUserService.ts`, `UserLocationAssignment*.ts`, `permissions.ts`, `CaisseMagasinService.ts:166-210,724-770`, `DemandeController.ts`, `AuthController.ts`, `UserManagement.tsx`, `routeAccess.ts`, `modules.ts`, `navConfig.tsx`, `App.tsx`.
**Tests** : vendeur passé de MAG-1 à MAG-2 → caisse MAG-2 seule ; défaut relu ; banc migré sans perte.
**Fini quand** : `utilisateur_locations` n'existe plus hors migrations. **Dépend** : rien. **Risque** : l'union élargit des droits ; la montrer au patron.

### 13-D · Chacun dans sa boutique, l'argent dans le bon tiroir (M, priorité 1, après 13-C)
**Problème** : D2, D6 ; 07-D13, 17-D13, 12-D5, 05-B5. **Résultat** : le vendeur de Yopougon vend, encaisse, rend et compte à Yopougon sans rien choisir ; l'argent entre dans le tiroir où il est posé.
**Règles proposées** (questions 1 à 3) : vendeur et caissier vendent, encaissent, ouvrent la caisse et font les retours dans leurs boutiques ; le dépôt reçoit, transfère, compte dans les siennes ; gérant et admin partout ; lecteur lit tout.
**API** : vente (factures, comptoir, devis, BL) : sans `location_id` → boutique par défaut ; hors affectation → 403 « Vous n'êtes pas affecté à Boutique Audit ». Paiement : la session est celle de la boutique de **l'encaisseur** (`PaiementService.ts:217-233`), la facture garde sa boutique, `paiements.magasin_id` = boutique qui encaisse, message « encaissé à Yopougon pour une facture de Boutique Audit ». Réception, transfert, inventaire, ajustement : site dans les affectations. Listes de factures, retours, caisses filtrées pour vendeur et caissier.
**Écrans** : « Magasin » caché pour une seule boutique affectée, sinon défaut = boutique par défaut ; listes de sites filtrées (transferts, réceptions, inventaires).
**Fichiers** : `FactureService.ts`, `VenteComptoirService.ts`, `DevisService.ts`, `BonLivraisonService.ts`, `PaiementService.ts`, `ReturnService.ts`, `ReceptionService.ts`, `StockTransferService.ts`, `InventaireService.ts`, `ProduitService.ts`, `SalesDocumentQuery.ts`, `ProduitController.ts:113`, `useSalesStock.ts:91`, pages concernées.
**Tests** : vendeur MAG-2 → vente MAG-1 403 ; facture MAG-1 encaissée à MAG-2 → session MAG-2 ; dépôt → transfert MAG-1→MAG-2 403, réception MAG-2 403 ; gérant partout 201 ; magasin unique inchangé.
**Fini quand** : D2 et D6 rejoués : refus ou bon tiroir. **Dépend** : 13-C, 08-A, 08-E. **Risque** : vendeur prêté pour un jour : le gérant ajoute la boutique.

### 13-E · Expédier, puis réceptionner (L, deux étapes, priorité 1)
**Problème** : D5, B4, B5, question 37. **Résultat** : le dépôt expédie, la marchandise quitte son stock ; la boutique reçoit ce qui arrive ; un écart devient une perte reliée au transfert.
**Étape 1 (M)** : états `en_preparation → expedie → recu`, `annule` avant expédition, `retourne` après. « Expédier » (dépôt, gérant) sort le stock au coût moyen, figé sur la ligne (`cout_unitaire`). « Réceptionner » (équipe de la boutique d'arrivée, gérant) : quantité reçue par ligne, entrée au coût figé ; écart = mouvement `perte` motif « manquant au transfert », `transfer_id` rempli. Une marchandise en route n'est comptée par aucun inventaire.
**Étape 2 (S)** : expédier ce qui est disponible (« 8 sur 10 ») au lieu du tout ou rien ; « À recevoir » sur l'accueil de la boutique ; valeur en route dans la valorisation (15-A).
**Base** : valeurs d'enum ; `expedie_par/le`, `recu_par/le` ; lignes `quantite_recue`, `cout_unitaire`.
**API** : `POST /:id/expedier`, `POST /:id/recevoir {lignes}`, `POST /:id/annuler` selon l'état ; `complete` = expédier + tout recevoir (gérant).
**Écrans** : boutons par état ; vendeur et caissier voient et reçoivent les transferts de leur boutique ; réception avec + et − et scan (10-F).
**Fichiers** : migration, `StockTransferService.ts`, `StockTransferController.ts`, `routes/stock-transfers.ts`, `schemas.ts`, `DemandeService.ts` et `sync_demande_on_transfer_change` (fiche 14), `InventaireService.ts`, `StockTransfers.tsx`, `routeAccess.ts`.
**Tests** : 20 expédiés, 19 reçus → dépôt −20, boutique +19, perte 1 × 13 200 reliée ; inventaire du dépôt entre les deux → aucune double sortie ; double « Réceptionner » → 409 ; annulé après expédition → stock revenu.
**Fini quand** : scénario des 19 cartons en 12 gestes. **Dépend** : 13-A, 13-D, fiche 14. **Risque** : transferts déjà « en préparation » repris tels quels.

### 13-F · Un seul magasin : rien à l'écran (M, priorité 2)
**Problème** : un commerçant à une boutique voit 4 menus et un sélecteur à un seul choix. **Résultat** : il ne les voit pas ; ils apparaissent dès le deuxième site créé.
**API** : `/auth/me` ou les paramètres renvoient le nombre de sites actifs. **Écrans** : condition « plusieurs sites » dans `routeAccess.ts`/`modules.ts` (Emplacements, Transferts, Demandes, Équipe), sélecteurs et colonnes « Emplacement » cachés ; Paramètres : « Ajouter une boutique ou un dépôt ».
**Fichiers** : `modules.ts`, `routeAccess.ts`, `navConfig.tsx`, `useSalesStock.ts`, `VenteComptoir.tsx`, `NouvelleFacture.tsx`, `NouveauDevis.tsx`, `Inventaire.tsx`, `InventairesPhysiques.tsx`, `Receptions.tsx`, `CompanySettings.tsx`.
**Tests** : base neuve → aucun menu de site ; deuxième site → menus visibles ; fermé → disparus.
**Dépend** : 13-G, 08-G. **Risque** : un dépôt créé « pour essayer » fait tout apparaître.

### 13-G · Gérer un site : modifier, fermer, rouvrir (M, priorité 3)
**Problème** : B3, D4, « principal » ambigu. **Résultat** : le patron renomme, change l'adresse, ferme et rouvre une boutique ou un dépôt, depuis l'écran.
**Écran** : fiche du site (nom, type, adresse, téléphone, « reçoit les livraisons », équipe, caisse) ; « Modifier », « Fermer » / « Rouvrir » avec confirmation qui nomme la conséquence.
**API** : schéma `.strict()` (fini le 200 muet) avec `location_type` et `actif` ; fermer refusé si transfert en cours vers ou depuis le site, caisse ouverte ou stock (message chiffré) ; type changé seulement sans caisse ouverte ; `est_principal` devient « reçoit les livraisons » (réceptions seulement), la vente suit 13-D.
**Fichiers** : `StockLocationService.ts`, `StockLocationController.ts`, `schemas.ts:529-537`, `StockLocations.tsx`, `ReceptionService.ts:149`.
**Tests** : D4 rejoué : fermeture refusée « TRF-… en route » ; rouvrir ; champ inconnu → 400.
**Dépend** : 08-G. **Risque** : un site fermé garde tout son historique (jamais supprimé).

### 13-H · Fiche boutique prête pour FNE, Wave, WhatsApp (S, priorité 6)
**Base** : `stock_locations.telephone`, `fne_etablissement_id` ; caisse : `fne_point_vente_id`, `wave_marchand` (numéro ou lien du QR affiché). Tous vides par défaut.
**Écran** : champs dans la fiche du site (13-G), FNE caché tant que le module FNE est éteint. Ticket, PDF et message WhatsApp lisent nom, adresse et téléphone du site de la pièce (fiche 27, 03-L). Aucun appel externe.
**Fichiers** : migration, `StockLocationService.ts`, `CaisseMagasinService.ts`, `StockLocations.tsx`. **Dépend** : 13-G, 03-L. **Risque** : aucun.

### 13-I · « Il en reste à l'autre boutique » (S, priorité 7)
**Résultat** : dans « Vendre », un article à zéro affiche « Yopougon 12 · Dépôt 80 » (quantités seules) et « Demander » (fiche 14).
**API** : `GET /produits/:id/stock-par-site` (sites actifs, quantités). **Fichiers** : `ProduitController.ts`, `VenteComptoir.tsx`, `NouvelleFacture.tsx`. **Dépend** : 10-A, 13-D, 13-F. **Risque** : aucun.

## 9. Questions pour le propriétaire

1. Le vendeur de Yopougon encaisse la facture à crédit d'un client de la boutique principale : accepté, l'argent entrant dans **son** tiroir (proposé), ou refusé ?
2. Voit-il les ventes et le chiffre des autres boutiques ? Proposé : non ; leur stock en quantités : oui.
3. Le gérant voit-il toutes les boutiques (proposé) ou seulement les siennes ?
4. Question 37 : état « expédié » (proposé : oui), et c'est la boutique qui reçoit qui confirme ?
5. Carton manquant à l'arrivée : perte tout de suite (proposé), ou « litige » réglé plus tard par le gérant ?
6. Une boutique envoie-t-elle directement à une autre, sans passer par le dépôt ? (proposé : oui)
7. FNE : chaque boutique est-elle un établissement à déclarer ? (supposé, à vérifier auprès de la DGI)
8. Wave : un QR par boutique, ou un seul pour l'entreprise ?

## Non vérifié

Double « Exécuter » par deux postes à l'écran (prouvé par l'API seulement) ; ligne en double à l'écran ; création d'une boutique de bout en bout (bloquée par le 500) ; réseau lent ; base neuve à deux sites.
