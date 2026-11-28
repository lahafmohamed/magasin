# 08 Sessions, historique et audit de caisse

> **Contre-expertise du 2026-11-26** ([détail](../vagues/vague-2-contre-expertise.md)) : Verdict maintenu, réduit : 08-C étape 2, 08-I étape 2, 08-J et 08-L passent plus tard. D1 : il faut des clients et des articles différents, et l'erreur est rare au rythme réel. D2 : les deux chiffres sont dans l'historique ; reprendre la recette est un usage normal, il manque « remis à qui ». Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-25, base jetable `nolyx_audit_2`, interface et API réelles. Montants en FCFA. « Écran » = atteignable par un employé ; « API » = par programme seulement.

## 1. Verdict

**Améliorer.** Le calcul du tiroir est juste. Mais l'argent peut disparaître autour : d'un jour à l'autre, par une sortie libre, entre l'écran et l'enregistrement. Trois pages deviennent une, l'audit est supprimé.

## 2. Utilité

||Général|Informatique|Habillement|Alim. / grossiste|Un magasin|Plusieurs sites|
|---|---|---|---|---|---|---|
|Besoin|5|4|5|5|5|5|
|Réponse actuelle|2|2|2|2|2|2|

Page Audit seule : 0 partout. Client neuf : **0**, la caisse ne s'ouvre pas.

## 3. Parcours réel

**Une journée rejouée** (session 3, fonds 50 000, un caissier et un vendeur) : 7 ventes, 2 acomptes, 2 dépenses, dépôt banque de 15 000, 10 000 remis au patron, remboursement d'acompte de 5 000, une vente saisie en espèces au lieu de Wave, une vente annulée. Tiroir attendu : 37 000, compté 35 000.

|Le soir|Réalité|Caisse|Historique|Audit|Comptabilité|
|---|---|---|---|---|---|
|Espèces attendues|37 000|37 000 ✔|37 000 ✔|absent|—|
|Écart|−2 000|−2 000 ✔|−2 000 ✔|absent|**aucune écriture**|
|Variation des espèces, avant écart|−13 000|−13 000 ✔|—|—|**+60 000** au compte 53|
|Wave net|**24 500**|**22 500**|22 500|liste|22 500|
|Carte, chèque, virement|73 000|73 000 ✔|✔|liste|**en espèces (53)**|
|Remis au patron|10 000|sortie|total|**absent**|**charge (65)**|
|Deux paiements supprimés (17 000)|—|visibles|**invisibles**|**invisibles**|contre-passés ✔|

**Le patron absent sait-il en deux minutes si l'argent est juste ?** À moitié. L'accueil annonce « 1 clôture de caisse avec écart aujourd'hui » ; trois touches donnent le montant, qui a fermé, son commentaire. **Pourquoi : non.** Après la clôture, aucun écran ne montre les mouvements de la session (`CaisseV2.tsx:656`, caisse ouverte seulement). **Qui : non.** Deux vendeurs, un tiroir. La base sait qui a encaissé (`cree_par`), rien ne l'affiche.

|Rôle|Ce qui marche|Ce qui bloque|
|---|---|---|
|Caissier, vendeur|Ouvrir (3 gestes), clôturer (4, 5 avec écart), entrée, sortie|Corriger un mode de paiement : 403. Ne revoient jamais leur clôture|
|Gérant|Tout, plus historique et audit|Même correction : 409 puis 403. **Seul l'administrateur y arrive**|
|Dépôt, lecteur|Refusés à l'écran ✔|L'API les laisse lire (D11)|

À 390 px, « Espèces comptées » est hors de l'écran ; la page Audit mesure 35 534 px.

**Bien fait (rejoué) :** trois ouvertures ensemble → une seule, deux refus clairs. Deux clôtures ensemble → une seule. Paiement pendant la clôture : total enregistré exact, rien n'entre après. Ouvrir la caisse d'une autre boutique : refusé. Mouvements inaltérables (base).

## 4. Défauts prouvés

### Argent

|N°|Fait|Preuve|Où|
|---|---|---|---|
|D1|**Encaisser à plusieurs échoue** (« Erreur interne du serveur »). 3 postes, 3 clients : 16 ventes sur 45, 20 encaissements sur 30. 2 postes au même instant : 2 sur 40 ; à moins de 50 ms : 1 sur 40 ; à moins de 150 ms : 0. Rien n'est enregistré, réessayer marche. Une clôture a aussi échoué|39 interblocages (journal PostgreSQL : `sessions_caisse … FOR UPDATE`). L'insertion (`PaiementService.ts:308`) pose un verrou léger sur la session, `CaisseMagasinService.ts:475` en veut un fort : deux postes s'attendent|Écran|
|D2|**Le tiroir du soir et celui du matin ne se parlent pas.** Compté 483 700, rouvert à 20 000 : **463 700 sans question ni trace**|Sessions 6 → 7 ; `ouvrirSession` ne lit pas la clôture précédente|Écran|
|D3|**Le caissier sort ce qu'il veut.** 300 000, motif « abc », tiroir de 20 000 : accepté. Compté 0 → « 280 000 **en trop** »|`o2-tiroir-negatif-1440.png`|Écran|
|D4|**L'écart enregistré n'est pas celui vu.** Écran : −1 000, « manque 1000 ». Une vente de 20 000 passe pendant le comptage → **−21 000** avec ce commentaire|Session 6, `s4-cloture-1440.png`|Écran|
|D5|Réponse perdue à la clôture : « Serveur injoignable », puis « Session non trouvée ou déjà clôturée ». L'écart n'est jamais montré|Session 6|Écran|
|D6|**Wave incomplet** : acompte Wave avec magasin choisi (8 000), dépense Wave (6 000), ventes Wave caisse fermée (4 × 1 400, suite de 07-D8) : hors caisse **et** hors comptabilité|`AcompteService.ts:164` et `DepenseServiceV2.ts:100` ne rattachent que les espèces|Écran|
|D7|Règlement fournisseur en espèces : 1 000 payés, mouvements 233 → 233. L'acompte fournisseur, lui, sort bien|`POST /factures-fournisseur/1/paiement` (fiche 18)|Rejoué par l'API|
|D8|**Comptabilité fausse** : carte, chèque, virement en 53 ; écart jamais écrit ; « remis au patron » en charge, « apport » en produit (lu) ; acompte entré au 419, remboursé au 411 ; l'écriture garde le numéro de la source sans son type|Pièces PC-2026-00006 à 00013 ; `CaisseMagasinService.ts:564-626`|Écran|
|D9|Cette écriture est **éteinte chez un client provisionné** : `CAISSE_GL_POSTING` n'est nulle part dans `deploy/`|Recherche|Installation|

### Blocage

- **D10. Client neuf** : 1 emplacement, 0 magasin de caisse (base `neuve`). Renommer la boutique ne renomme pas sa caisse.
- **D11. Droits (API).** Dépôt et lecteur lisent fonds et écarts de **toutes** les boutiques (`GET /caisse/historique` sans magasin → 200). Vendeur de MAG-1 : acompte encaissé dans la caisse de MAG-2 (201), facture MAG-1 payée dans la caisse MAG-2 (201).
- **D12. Caisse oubliée.** Après 24 h, **toute** vente est bloquée, Wave compris, jusqu'au gérant (`CaisseMagasinService.ts:489`, lu ; écran vu en simulant 30 h).
- **D13. Après clôture, rien ne se corrige** : paiement 409, dépense 422, comptage et commentaire figés.

### Gêne

- D14. Pas à l'aveugle : l'attendu s'affiche au-dessus du champ à remplir. Commentaire « a » accepté. Ni seuil, ni validation, ni billets et pièces.
- D15. L'audit ne peut **plus** rien trouver : la base refuse un paiement espèces sans mouvement (`trg_paiement_espece_mouvement` ; essayé : 500). Il ignore 19 des 233 mouvements, dont les sorties libres, et compte deux fois les acomptes appliqués.
- D16. Historique : sessions ouvertes absentes, ni filtre « avec écart », ni responsable, ni impression.
- D17. API : 0,5 F accepté ; dépôt banque en **entrée** ; montant géant ou motif de 300 caractères → 500 ; même clé, autre montant → ancien mouvement renvoyé ; espèces datées du 1er novembre dans la caisse du 25.
- D18. Remise en banque, au patron, au coffre : un motif libre, aucun accusé.

## 5. Comparaison

Source : [concurrents.md](../faits/concurrents.md), T10.

||Eux|Nous|
|---|---|---|
|Ouverture|Odoo : contrôle d'ouverture|Fonds libre|
|Comptage|Odoo, Ma Caisse : billets et pièces|Un seul montant|
|À l'aveugle|Loyverse : attendu caché au caissier|Non|
|Écart|Odoo : au-delà d'un maximum, un responsable valide|Commentaire libre|

**Nos avantages réels** : espèces et autres modes jamais mélangés ; dépenses, acomptes et remboursements en espèces reliés au document ; mouvements inaltérables. **À battre** : le cahier et l'enveloppe du soir.

## 6. Manques

|Manque|Général|Informatique|Habillement|Alim. / grossiste|Verdict|
|---|---|---|---|---|---|
|Fonds du matin = reste de la veille|●●|●●|●●|●●|Premier mois|
|Remise au patron, coffre, banque, avec accusé|●●|●|●●|●●|Premier mois|
|À l'aveugle, billets et pièces|●●|●|●●|●●|Premier mois|
|Solde du téléphone marchand comparé le soir|●●|●|●|●●|Premier mois|
|Détail d'une journée fermée, par vendeur|●●|●●|●●|●●|Premier mois|
|Relève entre caissiers|●||●|●●|Premier mois|
|Un tiroir par caissier||||●|Selon la réponse|

**Une caisse par boutique, ou un tiroir par caissier ?**

||Par boutique, avec relève|Un tiroir par caissier|
|---|---|---|
|Base|Colonne « responsable » ; l'index « une session ouverte par magasin » reste|Table `tiroirs`, index par tiroir|
|Code|Inchangé|Session cherchée par utilisateur dans 4 services (paiement, acompte, dépense, avoir)|
|Écran|Bouton « Passer la caisse »|« Ma caisse » ; le gérant choisit le tiroir d'un remboursement|
|Écart|Au responsable sortant|À chaque caissier|

**Proposé : par boutique avec relève** ; plusieurs tiroirs en réglage, pour qui a deux comptoirs.

**Écriture automatique si la comptabilité est cachée ?** Oui : toujours active (sinon le 411 n'est jamais soldé), invisible, déduite de « où est l'argent », sans jamais bloquer une vente. Si la fiche 22 supprime la comptabilité, on retire cette seule fonction. Les numéros 53, 54, 51 ne semblent pas ceux du SYSCOHADA (57, 55, 52) : **supposé**.

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA, FNE** : aucun effet, le tiroir compte du TTC.
- **Mobile money** : par opérateur et par boutique, trois chiffres le soir : attendu (entrées − sorties), solde lu sur le téléphone à l'ouverture et à la clôture, écart. Il faut : toute opération rattachée (08-D), référence (07-F), comptes par opérateur (08-J), une place pour « confirmé par l'opérateur ». Solde par API : vérifié chez Wave seulement. Retraits et frais du marchand : des transferts, pas des écarts.
- **WhatsApp** : rapport du soir par `wa.me` (08-L). Envoi automatique plus tard.

## 8. Lots

Ordre du cadrage. **Client neuf : 08-G en premier**, il ne dépend de rien. Chaque lot : tests serveur avec base, tests écran, navigateur. Voisins : 03-B (francs entiers), 07-A (anti-doublon), 07-F (vente non espèces, Moov, référence), 07-J (échange).

### 08-A — Encaisser à plusieurs sans erreur (S)
- **Problème** : D1. **Résultat** : trois postes vendent en même temps.
- **Fichiers** : `CaisseMagasinService.ts:331,475`, `PaiementService.ts:308`, `AcompteService.ts`, `utils/errors.ts`.
- **Étapes** : `FOR NO KEY UPDATE` au lieu de `FOR UPDATE` sur `sessions_caisse` (compatible avec la clé étrangère, exclusif entre encaissements) ; rejouer une fois une transaction `40P01`, sinon « Réessayez ».
- **Tests** : 3 × 15 ventes et 3 × 10 paiements simultanés, clôture au milieu.
- **Fini quand** : 0 erreur 500, `pg_stat_database.deadlocks` inchangé, total exact.
- **Dépend de** : rien. **Risque** : faible ; garder l'ordre facture → session.

### 08-B — Fonds et sorties tenus (M)
- **Problème** : D2, D3. **Résultat** : l'argent a toujours un endroit.
- **Base** : `sessions_caisse.session_precedente_id`, `fond_laisse`, `montant_remis`, `ecart_ouverture`, `motif_ecart_ouverture`.
- **API** : `GET /caisse/ouverture/:magasin` (fonds attendu) ; `ouvrir` refuse un autre fonds sans motif ; `mouvement-divers` refuse une sortie supérieure au tiroir (422) ; au-delà d'un plafond réglable (25 000 proposé), accord du gérant.
- **Écrans** : clôture, « Je laisse 20 000, je remets 463 700 à… » ; ouverture, « Hier il restait 20 000. Compté : ».
- **Fichiers** : `CaisseMagasinService.ts`, `CaisseMagasinController.ts`, `schemas.ts:574-592`, `CaisseV2.tsx`, migration, `ci-baseline.sql`.
- **Étapes** : lien entre sessions, sorties, écrans.
- **Tests** : 483 700 → 20 000 exige une remise ; sortie de 300 000 refusée ; premier jour ; dépense supérieure au tiroir (fiche 09).
- **Fini quand** : compté = laissé + remis, chaque soir, par requête.
- **Dépend de** : 24 (PIN) ; sans PIN, réservé au gérant. **Risque** : entrée pas encore saisie → bouton « Ajouter l'entrée oubliée ».

### 08-C — Clôture exacte, puis à l'aveugle (M, deux étapes)
- **Problème** : D4, D5, D14. **Résultat** : l'écart vu est celui gardé ; on compte sans être influencé.
- **Base** : `cloture_cle` unique ; table `sessions_comptages` (session, mode, attendu, compté, écart, billets, motif) ; réglages `cloture_aveugle`, `ecart_max`.
- **Étape 1 (S)** : l'écran envoie le dernier mouvement vu ; s'il a changé, 409 « Une vente de 20 000 est passée : recomptez » ; même clé → même résultat.
- **Étape 2 (M)** : l'attendu n'est plus envoyé avant le comptage (caissier, vendeur, aussi dans `session-active`) ; grille de billets et pièces FCFA ; motif choisi (monnaie, oubli de saisie, dépense non notée, faux billet, autre + 10 caractères) ; au-delà de `ecart_max`, session « à valider » par le gérant, sans bloquer la réouverture ; solde téléphone par opérateur, facultatif.
- **Fichiers** : `CaisseMagasinService.ts:258-450`, `CaisseV2.tsx`, `schemas.ts`, migration.
- **Tests** : vente pendant le comptage ; réponse coupée ; aperçu caissier sans attendu ; écart 5 000 ; billets = total.
- **Fini quand** : D4 et D5 rejoués donnent le bon écart.
- **Dépend de** : 08-D pour le solde opérateur. **Risque** : trop long → total seul permis.

### 08-D — Tout argent passe par la session (S)
- **Problème** : D6. **Résultat** : Wave attendu = Wave réel.
- **Étapes** : acompte, dépense, remboursement : même recherche de session que le paiement, quel que soit le mode ; caisse fermée → 409 clair. Complète 07-F ; règlement fournisseur : fiche 18.
- **Fichiers** : `AcompteService.ts:57-215`, `DepenseServiceV2.ts:98-300,405`, `CreditNoteService.ts:720-770`, `TiersDetail.tsx:501`, `DepensesV2.tsx`.
- **Tests** : la journée de la section 3 donne Wave 24 500 ; dépense Wave modifiée, supprimée.
- **Fini quand** : documents = mouvements, par mode.
- **Dépend de** : 08-A. **Risque** : dépense payée par le patron hors caisse → choix « payée par le patron » (08-J).

### 08-E — Droits et bornes de saisie (S)
- **Problème** : D11, D17. **Résultat** : on ne voit et ne touche que sa boutique.
- **Étapes** : `historique` filtré sur les magasins de l'utilisateur, 403 dépôt et lecteur ; toute `session_caisse_id` reçue doit être ouverte, du magasin de la pièce et de l'utilisateur ; cohérence type/catégorie ; montant plafonné, motif 255, clé 80 ; clé réutilisée avec un autre montant → 409.
- **Fichiers** : `CaisseMagasinController.ts:150-190`, `AcompteService.ts:57`, `PaiementService.ts:226`, `schemas.ts`, `routes/caisse.ts`.
- **Tests** : chaque cas de D11 et D17. **Fini quand** : tous refusés en français.
- **Dépend de** : 13 (une seule table d'affectation), 03-B. **Risque** : gérant multi-boutiques à ne pas bloquer.

### 08-F — Une seule page Caisse, audit supprimé (M)
- **Problème** : D15, D16, mouvements invisibles après clôture. **Résultat** : un menu, deux onglets : « Aujourd'hui », « Journées ».
- **« Journées »** : sessions ouvertes et fermées ; filtres boutique, dates, responsable, écart. Fiche : résultat, bande du tiroir, modes, **totaux par vendeur**, mouvements, « À vérifier » (paiements supprimés, sorties libres, fonds changé, antidatés). Impression A4/80 mm. Le caissier voit ses journées.
- **API, base** : compléter `GET /caisse/session/:id` (vendeurs, suppressions depuis `audit_log`) ; supprimer `v_caisse_audit`.
- **Fichiers** : `CaisseV2.tsx` à découper, `CaisseHistorique.tsx`, supprimer `CaisseAudit.tsx` et `routes/caisse.ts:51-111`, `routeAccess.ts`, `navConfig.tsx`, `Dashboard.tsx`, redirections, migration.
- **Tests** : accès par rôle ; 17 000 supprimés visibles ; 390 px.
- **Fini quand** : un gérant trouve la cause d'un écart en 3 touches.
- **Dépend de** : rien. **Risque** : anciens paiements hors caisse → requête gardée pour le support.

### 08-G — Un magasin créé a toujours sa caisse (S)
- **Problème** : D10. **Résultat** : un client neuf vend dès le premier jour.
- **Base** (migration) : index unique `magasins(location_id)` (doublons sans session supprimés avant) ; fonction `sync_magasin_caisse()`, trigger `AFTER INSERT OR UPDATE OF code, nom, adresse, actif, location_type ON stock_locations` : « magasin » → crée ou met à jour la ligne ; « dépôt » ou inactif → désactive, refus si une session est ouverte ; code déjà pris → `MAG-<id>`.
- **Base existante** (même migration) : une ligne pour chaque emplacement « magasin » ; désactivation des caisses de dépôt sans session (`044` en créait).
- **Base neuve** : même bloc **en fin** de `ci-baseline.sql`. `ci-db-setup.mjs:117` insère l'emplacement après : le trigger suffit, provisionnement compris.
- **Création d'emplacement** : `createStockLocationSchema` exige `location_type` ; `StockLocationService.create` l'écrit ; choix « Boutique » ou « Dépôt » au formulaire.
- **Fichiers** : migration, `ci-baseline.sql`, `StockLocationService.ts:88`, `schemas.ts:530`, `StockLocations.tsx`.
- **Tests** : base `ci-db-setup` → `GET /caisse/magasins` = 1 → ouvrir 201 → vente espèces 201, **sans insertion manuelle** (à retirer des tests `CaisseMagasinController`, `VenteComptoir`, `AvoirRembourser`, `security-hardening`) ; `POST /stock-locations` 201 ; renommage ; dépôt.
- **Fini quand** : aucun emplacement « magasin » sans ligne `magasins`, bases neuves et mises à jour.
- **Dépend de** : rien. **Risque** : code en double, traité.

### 08-H — Caisse oubliée (S)
- **Problème** : D12. **Résultat** : la boutique ouvre le matin sans attendre le gérant.
- **Étapes** : jour de commerce (bascule réglable, 5 h) ; après bascule, le caissier compte et clôture hier, puis ouvre ; aucune vente dans la session d'hier ; patron prévenu ; même règle dans `cloturerSession` (l'API ne contrôle rien, lu).
- **Fichiers** : `CaisseMagasinService.ts:11-27,489`, `tillSession.ts`, `CaisseV2.tsx`, `Dashboard.tsx`.
- **Tests** : 23 h → 1 h ; oubli d'un jour, de trois jours. **Fini quand** : caissier seul débloqué en 2 minutes.
- **Dépend de** : 08-C étape 1. **Risque** : boutiques de nuit.

### 08-I — Responsable du tiroir (S, puis M selon réponse)
- **Problème** : un écart n'appartient à personne. **Résultat** : chacun répond de son temps.
- **Étape 1 (S)** : `responsable_id` ; « Passer la caisse » : clôture et réouverture en une transaction, comptage du sortant confirmé par l'entrant.
- **Étape 2 (M, si tiroir par caissier)** : table `tiroirs`, index par tiroir, `session_pour(utilisateur, magasin)` dans les quatre services, choix du tiroir pour un remboursement. Un seul tiroir : rien à l'écran.
- **Fichiers** : `CaisseMagasinService.ts`, quatre services, `CaisseV2.tsx`, migration.
- **Tests** : relève avec écart ; deux tiroirs, deux écarts ; remboursement croisé refusé.
- **Dépend de** : 08-A, 08-B. **Fini quand** : chaque écart porte un nom. **Risque** : heures pleines → relève facultative.

### 08-J — Où est l'argent : banque, coffre, patron (M, deux étapes)
- **Problème** : D8, D9, D18. **Résultat** : une remise a un départ, une arrivée, un accusé.
- **Base** : `comptes_argent` (tiroir, coffre, banque, patron, opérateur ; magasin ; numéro comptable) ; `transferts_argent` (de, vers, montant, envoyé par, reçu par, statut, photo).
- **Étape 1 (M)** : « Remettre » remplace dépôt banque et sortie libre ; le destinataire confirme ; alerte après 48 h.
- **Étape 2 (S)** : l'écriture suit le compte (une remise n'est ni charge ni produit), écart écrit, 419 au remboursement d'acompte, lien vers le **mouvement** ; supprimer `CAISSE_GL_POSTING`.
- **Fichiers** : `CaisseMagasinService.ts:550-630`, nouveau `TransfertArgentService.ts`, `CaisseV2.tsx`, migration. La fiche 21 réutilise `comptes_argent` ; compte par mode : 07-F.
- **Tests** : journée rejouée : tiroir 35 000, banque 88 000, patron 10 000.
- **Fini quand** : solde comptable du tiroir = compté.
- **Dépend de** : 08-B, 08-D, fiche 22 pour les numéros. **Risque** : une période close ne doit jamais bloquer une vente.

### 08-K — Corriger une journée fermée (M)
- **Problème** : D13 et erreur de mode impossible au gérant. **Résultat** : on corrige en laissant la trace.
- **Étapes** : session ouverte : « Changer le mode » (gérant ; caissier selon la question 8 de 01-SUIVI), une transaction, deux mouvements liés par `reverses_mouvement_id` (colonne inutilisée) ; session fermée : « Correction » motivée du gérant, dans la session ouverte ; écart d'origine gardé, écart corrigé à côté. Jamais de réouverture.
- **Fichiers** : `PaiementService.ts:430-640`, `CaisseMagasinService.ts`, `FactureDetail.tsx:113`, `schemas.ts`.
- **Tests** : espèces → Wave avant et après clôture ; double correction. **Fini quand** : 2 gestes au lieu de 3 refus.
- **Dépend de** : 08-F, 07-J. **Risque** : fraude → « À vérifier ».

### 08-L — Le rapport du soir du patron (M)
- **Problème** : section 3. **Résultat** : en 30 secondes, par boutique, au téléphone.
- **Contenu** : vendu, encaissé par mode, attendu, compté, écart, responsable, motif, sorties, remises non confirmées, paiements supprimés ; total multi-boutiques, absent si une seule.
- **Étapes** : `GET /caisse/rapport-soir?date=` ; carte d'accueil ; bouton `wa.me` ; notification à la clôture.
- **Fichiers** : nouveau `RapportSoirService.ts`, `Dashboard.tsx`, fiche de journée, `NotificationService.ts`.
- **Tests** : chiffres de la journée rejouée ; caissier refusé. **Fini quand** : 1 touche depuis l'accueil.
- **Dépend de** : 08-C, D, F, J. **Risque** : numéro du patron à régler (fiche 25).

## 9. Questions pour le propriétaire

1. (Question 5 de 01-SUIVI) Par boutique avec relève, proposé ? Si tiroir par caissier : 08-I étape 2.
2. À l'aveugle pour tous, ou réglage par client (proposé : activé) ?
3. Plafond de sortie sans accord (25 000), écart maximum (5 000) : bons chiffres ?
4. Au-delà : rouvrir en attendant le gérant (proposé), ou bloquer ?
5. Manquant : simple constat (proposé), ou dette du caissier ?
6. Qui reçoit la remise : le patron seul, ou un gérant aussi ?

**À transmettre.** Fiche 04 : rembourser 5 000 d'un acompte de 20 000 a appliqué sans demander les 15 000 restants **et** un autre acompte de 8 000 à une vieille facture (paiements 166, 167). Fiche 18 : D7. Fiche 22 : D8, D9. Fiche 09 : D6.

**Non vérifié** : vraie attente de 24 h (simulée à l'écran) ; désactivation d'une boutique caisse ouverte (refusée pour stock) ; tiroir physique ; fréquence réelle de D1 ; usages de remise au patron.
