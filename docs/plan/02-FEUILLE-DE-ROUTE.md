# Feuille de route nolyxERP

Écrite le 2026-11-27, à la fin de l'audit des 30 fonctionnalités. Elle remplace `PLAN.md` et `PLAN-V1`. Aucune date : chaque étape se lance quand le propriétaire le décide. Sources : [cadrage](00-CADRAGE.md) · [suivi, propriétaires des lots et questions](01-SUIVI.md) · [ordre complet des 265 lots](vagues/vague-10-contre-expertise.md) · [fiches](fiches/).

## En bref

- **265 lots** en **25 étapes**, regroupées en cinq phases. Taille : 93 petits (S, moins d'une demi-journée), 157 moyens (M, 1 à 3 jours), 15 gros (L, plus, découpés en étapes).
- **Avant le premier client** : phases A à C, étapes 0 à 11, 126 lots, de l'ordre de 198 jours de travail pour une personne (S = ½ jour, M = 2, L = 5 ; ordre de grandeur, pas un engagement).
- **Plus court pour un premier client d'une seule boutique sans dépôt** : les lots des transferts et des demandes (13-E, 14-A à 14-C, 13-D2, 13-G) attendent son deuxième site, et seul le bloc de son métier est fait. Il reste alors environ 112 à 113 lots, soit, en jours : informatique 159, habillement 157, alimentaire 163.
- **La phase E** ne suit pas le rang : chaque étape s'y lance sur un déclencheur (premier grossiste, premier client assujetti à la TVA, premier mois clos chez un cabinet, agrément FNE).
- **Une étape est livrable seule** : à sa fin, l'ERP marche mieux qu'avant et rien n'est à moitié fait. Ne pas commencer une étape avant d'avoir fini la précédente, sauf en phase E.
- **Une seule réparation est urgente quel que soit le reste** : le lot 29-A (une coupure du réseau affiche « Vente enregistrée » alors que rien n'est écrit, en production).

## À faire tout de suite, hors code

1. Vérifier si le dépôt GitHub est ou a été public (question 98).
2. Si l'ancien secret JWT de l'historique (commit `dd971e0`) a servi en production, le changer.
3. Ne jamais lancer `seed-hitek-demo.mjs` avec un `.env` qui pointe vers une vraie base : il vide 42 tables sans garde.
4. Vérifier que le pare-feu du serveur ferme les ports des API (question 95).
5. Répondre aux questions qui débloquent le plus : **100** (métier du premier client), **94** (service worker), **93** (trous de numérotation), **47** (crédit des nouveaux clients), **37** (état « expédié »), **36** (« Ajuster »), **13 et 74** (acomptes), **1** (un seul écran « Vendre »), **10** (comptabilité cachée). Les 103 questions sont dans [01-SUIVI.md](01-SUIVI.md).

## Comment lancer un lot

1. Lire le lot dans la section 8 de sa fiche (lien dans les tableaux ci-dessous), **puis la note de contre-expertise en tête de la fiche** et le rapport de vague qu'elle cite : certains lots y sont réduits, découpés ou corrigés.
2. Vérifier dans [01-SUIVI.md](01-SUIVI.md) (« Un seul lot par sujet ») que le lot est bien le propriétaire de son sujet ; un lot qui cite un autre lot ne refait pas son travail.
3. Répondre d'abord aux questions listées pour l'étape.
4. Une branche et un commit par lot ; tests du lot écrits avant d'annoncer « fini » ; critères « c'est fini » de la fiche rejoués sur le banc (`docs/plan/banc/`), avec le service worker actif quand le lot touche le réseau.
5. Mettre à jour `CLAUDE.md` (et `ci-baseline.sql` si le schéma change), puis noter le lot fait dans la section « Suivi » en bas de cette feuille (l'étape se coche quand tous ses lots sont faits).

## Ce qui marche déjà et ne doit pas casser

Vérifié par les contre-expertises, à garder comme tests de non-régression : le plafond de crédit bloque sur les trois chemins de vente, même pour deux ventes simultanées ; le coût moyen est juste dans une boutique (12 opérations rejouées) ; une vente ou un transfert pendant un inventaire ne fausse pas le stock, 40 scans simultanés donnent 40, une double validation donne 409 ; une réception partielle ne ferme plus la commande ; le dépôt ne voit aucun prix à la réception, API comprise ; un compte désactivé est coupé en 32 ms ; les codes-barres internes sont uniques ; l'historique des demandes crédite le bon auteur ; aucune page ne déborde à 360 px ; le bulletin de paie est calculé juste ; une sauvegarde restaurée redonne stock, dettes, caisse et pièces jointes identiques.

## Phase A — Sécuriser (avant tout le reste)

### Étape 0 · Ne plus rien perdre

Rangs 1 à 6 · 6 lots (6 S) · environ 3 jours.

**Pour le commerçant** : Aucune vente annoncée à tort, aucune donnée perdue ou effacée par erreur, aucune mise à jour à moitié faite.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 1 | [29-A](fiches/29-mobile-hors-ligne.md) | Le réseau coupé n'est plus un succès | S |
| 2 | [28-A](fiches/28-deploiement-demo.md) | Sauvegarde toutes les heures, copiée hors du serveur | S |
| 3 | [28-G1](fiches/28-deploiement-demo.md) | Seed de démonstration gardé et réparé | S |
| 4 | [28-D1](fiches/28-deploiement-demo.md) | Une migration ratée arrête tout (code 1) | S |
| 5 | [28-C](fiches/28-deploiement-demo.md) | Dépôt propre : données réelles, seeds morts, notes périmées | S |
| 6 | [28-E](fiches/28-deploiement-demo.md) | Contrôle du schéma, en CI et à chaque mise à jour | S |

**C'est fini quand** :
- Couper le réseau pendant une vente, un paiement ou une clôture n'affiche jamais un succès.
- Une sauvegarde de moins d'une heure existe hors du serveur.
- Le seed de démonstration refuse toute base qui n'est pas marquée « démo ».
- Une migration ratée arrête la mise à jour (code 1) ; la CI compare le schéma réel au schéma attendu.
- Le dépôt ne contient plus de données réelles ni de scripts morts.

**Décider avant** : questions 94 (retirer le service worker), 96 (ordre des mises à jour), 97 et 98 (données suivies par git, dépôt public).

### Étape 1 · Un client neuf démarre, rien ne compte deux fois

Rangs 7 à 17 · 11 lots (10 S, 1 M) · environ 7 jours.

**Pour le commerçant** : Un client neuf crée sa boutique, sa caisse et ses produits sans erreur. Un double clic ou un renvoi du réseau n'enregistre jamais deux fois. On restaure un client en une commande.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 7 | [08-G](fiches/08-caisse.md) | Un magasin créé a toujours sa caisse | S |
| 8 | [10-E](fiches/10-produits-prix.md) | Créer un produit sans blocage | S |
| 9 | [13-B](fiches/13-emplacements-transferts.md) | Le type décide, pas le nom | S |
| 10 | [08-A](fiches/08-caisse.md) | Encaisser à plusieurs sans erreur | S |
| 11 | [04-B](fiches/04-paiements-acomptes.md) | Rien ne bouge sans un geste | S |
| 12 | [07-A](fiches/07-vente-comptoir.md) | Une vente ne s'enregistre qu'une fois | S |
| 13 | [13-A](fiches/13-emplacements-transferts.md) | « Exécuter » ne compte qu'une fois | S |
| 14 | [09-A](fiches/09-depenses.md) | Une dépense ne bouge l'argent qu'une fois | S |
| 15 | [28-B](fiches/28-deploiement-demo.md) | Restaurer un client en une commande, chiffres vérifiés | M |
| 16 | [28-J](fiches/28-deploiement-demo.md) | En-têtes, journaux et ancien secret | S |
| 17 | [29-C](fiches/29-mobile-hors-ligne.md) | Nouvelle version et page non chargée | S |

**C'est fini quand** :
- Sur une base neuve, créer un magasin crée sa caisse ; créer un produit passe du premier coup.
- Un dépôt renommé « Entrepôt » ne vend pas.
- Vente, encaissement, transfert et dépense envoyés deux fois, y compris par Chrome pendant que le serveur travaille : une seule écriture.
- Une restauration est vérifiée par les chiffres, et la numérotation saute au lieu de réattribuer un numéro.
- Ancien secret changé, en-têtes posés ; une nouvelle version ne casse plus la page ouverte.

**Décider avant** : questions 93 (trous de numérotation), 95 (pare-feu).

### Étape 2 · Qui a fait quoi

Rangs 18 à 22 · 5 lots (3 S, 2 M) · environ 6 jours.

**Pour le commerçant** : La comptabilité fausse est cachée au commerçant. Chaque geste d'argent, de stock et de droits laisse une trace qu'on ne peut pas effacer.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 18 | [22-A](fiches/22-comptabilite.md) | Cacher la comptabilité au commerçant | S |
| 19 | [26-C1](fiches/26-journal-notifications.md) | Page Journal réparée et lisible au téléphone — étape 1 | S |
| 20 | [26-B](fiches/26-journal-notifications.md) | Trace en ajout seul, gardée | S |
| 21 | [26-A1](fiches/26-journal-notifications.md) | Trace des sorties de caisse, acomptes, plafonds, contacts | M |
| 22 | [28-I](fiches/28-deploiement-demo.md) | L'application n'est plus propriétaire de sa base | M |

**C'est fini quand** :
- Le menu Comptabilité n'apparaît plus au commerçant.
- La page Journal s'ouvre et filtre par date sans erreur, au téléphone.
- Sortie et apport de tiroir, acompte, plafond de crédit et contact supprimé ont chacun une ligne avec leur auteur.
- L'application ne peut ni modifier ni effacer le journal.

**Décider avant** : questions 90 (qui voit le journal), 92 (durée de conservation).

## Phase B — Des chiffres justes

### Étape 3 · Le stock juste, chacun dans sa boutique

Rangs 23 à 38 · 16 lots (5 S, 10 M, 1 L) · environ 28 jours.

**Pour le commerçant** : Une seule vérité du stock par emplacement, au bon coût. Un inventaire fiable. Une seule affectation, l'argent dans le bon tiroir, des transferts expédiés puis réceptionnés.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 23 | [10-A/1](fiches/10-produits-prix.md) | Une seule vérité du stock — étape 1 | M |
| 24 | [10-A/2](fiches/10-produits-prix.md) | Une seule vérité du stock — étape 2 | M |
| 25 | [07-C](fiches/07-vente-comptoir.md) | On ne vend que ce que le magasin possède | S |
| 26 | [29-B](fiches/29-mobile-hors-ligne.md) | Après une coupure, dire si c'est passé | M |
| 27 | [10-B](fiches/10-produits-prix.md) | Coût d'achat juste et traçable | M |
| 28 | [12-A](fiches/12-inventaire-physique.md) | Pas de double correction | S |
| 29 | [15-A](fiches/15-valorisation-cmp.md) | Une seule valeur du stock | S |
| 30 | [12-B](fiches/12-inventaire-physique.md) | Une validation qui dit la vérité | S |
| 31 | [15-C](fiches/15-valorisation-cmp.md) | Chaque mouvement de stock garde son coût | M |
| 32 | [12-C](fiches/12-inventaire-physique.md) | Compter à plusieurs sans s'écraser | M |
| 33 | [12-D/1](fiches/12-inventaire-physique.md) | Ajuster : réservé, motivé, chiffré — étape 1 | M |
| 34 | [13-C](fiches/13-emplacements-transferts.md) | Une seule affectation, un seul écran | M |
| 35 | [13-D1](fiches/13-emplacements-transferts.md) | Vendre et encaisser dans sa boutique, l'argent dans le bon tiroir | M |
| 36 | [13-E/1](fiches/13-emplacements-transferts.md) | Expédier, puis réceptionner — étape 1 | L |
| 37 | [26-A2](fiches/26-journal-notifications.md) | Avant et après : stock, prix, droits, remises | M |
| 38 | [26-C2](fiches/26-journal-notifications.md) | Page Journal réparée et lisible au téléphone — étape 2 | S |

**C'est fini quand** :
- Le stock fantôme est repris d'après les mouvements, puis verrouillé ; on ne vend que le stock de sa boutique.
- Le coût d'une vente est le coût moyen du site qui vend ; la valeur du stock est la même sur tous les écrans.
- Inventaire : pas de double correction, comptage à plusieurs sans écrasement, « Ajuster » réservé et motivé.
- Le vendeur de MAG-2 encaisse dans le tiroir de MAG-2.
- Un transfert part « en route » et arrive « réceptionné », manquant compris. Après une coupure, l'écran dit si l'opération est passée.

**Décider avant** : questions 9 (vendre un article à zéro), 11 et 36 (« Ajuster »), 37 (état « expédié »), 50, 51, 53.

### Étape 4 · Ventes, livraisons et retours au bon montant

Rangs 39 à 59 · 21 lots (9 S, 12 M) · environ 29 jours.

**Pour le commerçant** : Chaque facture, bon, retour et avoir dit le même montant partout (écran, papier, relevé, rapports), et on ne livre ni ne rend plus que ce qui a été vendu.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 39 | [23-B](fiches/23-tableau-bord-rapports.md) | Caissier : ventes du jour comptées par le serveur | S |
| 40 | [03-B](fiches/03-factures.md) | FCFA entiers et remises visibles | M |
| 41 | [03-A](fiches/03-factures.md) | Facturer ce qui a été livré | M |
| 42 | [23-A](fiches/23-tableau-bord-rapports.md) | Bornes de dates et factures annulées | S |
| 43 | [27-A](fiches/27-documents-pdf.md) | Le papier dit le bon montant | S |
| 44 | [02-B](fiches/02-bons-livraison.md) | Un bon livré est figé | S |
| 45 | [02-A](fiches/02-bons-livraison.md) | On ne livre jamais plus que le devis | M |
| 46 | [15-B](fiches/15-valorisation-cmp.md) | Le bon de livraison garde le coût du jour de la livraison | S |
| 47 | [06-A](fiches/06-relances-credit.md) | Le crédit se donne, il ne se prend pas | M |
| 48 | [02-C](fiches/02-bons-livraison.md) | Le plafond compte les bons non facturés | S |
| 49 | [01-A](fiches/01-devis.md) | Un cycle de vie qui tient | S |
| 50 | [05-A/1](fiches/05-retours-avoirs.md) | On ne rend que ce qui a été vendu — étape 1 | M |
| 51 | [05-A/2](fiches/05-retours-avoirs.md) | On ne rend que ce qui a été vendu — étape 2 | M |
| 52 | [19-A](fiches/19-contacts-crm.md) | Une dette ne disparaît pas avec son contact | S |
| 53 | [04-A](fiches/04-paiements-acomptes.md) | Un seul solde client, juste partout | M |
| 54 | [05-B](fiches/05-retours-avoirs.md) | Rembourser ce qui est payé, déduire ce qui est dû | M |
| 55 | [27-B1](fiches/27-documents-pdf.md) | Relevé client juste | M |
| 56 | [05-D](fiches/05-retours-avoirs.md) | Le retour baisse le chiffre d'affaires, la marge et les comptes | M |
| 57 | [15-D](fiches/15-valorisation-cmp.md) | La démarque chiffrée dans les rapports | S |
| 58 | [12-F](fiches/12-inventaire-physique.md) | Mes pertes du mois | M |
| 59 | [05-C](fiches/05-retours-avoirs.md) | L'article rendu va au bon endroit, dans le bon état | M |

**C'est fini quand** :
- Montants en FCFA entiers ; ce qui est facturé est ce qui a été livré ; le PDF dit le montant enregistré.
- Un devis ne se livre qu'une fois ; le plafond compte les bons non facturés ; un nouveau client n'a pas de crédit tant que le gérant n'a pas fixé de plafond.
- On ne rend que ce qui a été vendu ; un avoir ne rembourse en espèces que ce qui a été payé.
- Un seul solde client, le même sur la fiche, la liste, le relevé et l'accueil ; le chiffre d'affaires et la marge sont nets des retours ; les pertes sont chiffrées.

**Décider avant** : questions 6 et 47 (qui donne du crédit), 20 à 26 (devis, bons, retours), 76.

### Étape 5 · Achats justes

Rangs 60 à 64 · 5 lots (4 S, 1 M) · environ 4 jours.

**Pour le commerçant** : Une commande n'est plus une dette. Une réception n'entre qu'une fois, au bon coût.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 60 | [16-A](fiches/16-commandes-fournisseur.md) | Une commande n'est pas une dette | M |
| 61 | [21-A](fiches/21-tresorerie.md) | Les prévisions disent vrai | S |
| 62 | [16-B](fiches/16-commandes-fournisseur.md) | Des statuts qui ne reviennent pas en arrière | S |
| 63 | [17-A](fiches/17-receptions.md) | Une réception n'entre qu'une fois | S |
| 64 | [17-B](fiches/17-receptions.md) | Le coût d'entrée ne dépend pas de qui reçoit | S |

**C'est fini quand** :
- Une commande ne crée plus de facture fournisseur ; les factures fantômes existantes sont annulées par contre-passation.
- Les états d'une commande ne reviennent plus en arrière.
- La prévision d'argent lit les vraies factures (clients en retard compris).
- Une réception envoyée deux fois n'entre qu'une fois ; un article offert entre à coût zéro.

**Décider avant** : questions 27, 28, 29 (achat direct, acompte fournisseur, rapprochement).

### Étape 6 · Tout l'argent passe par la caisse

Rangs 65 à 73 · 9 lots (4 S, 5 M) · environ 12 jours.

**Pour le commerçant** : Espèces, Wave, Orange, Moov, carte, chèque et virement sont comptés dans la session. Une sortie ne dépasse pas le tiroir. Payer un fournisseur sort l'argent. Une journée fermée se corrige.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 65 | [04-J](fiches/04-paiements-acomptes.md) | Compensation réduite et verrouillée | S |
| 66 | [08-D](fiches/08-caisse.md) | Tout argent passe par la session | S |
| 67 | [07-F](fiches/07-vente-comptoir.md) | L'argent non espèces est toujours compté | S |
| 68 | [04-E](fiches/04-paiements-acomptes.md) | L'acompte passe par la caisse et le bon compte | S |
| 69 | [23-C](fiches/23-tableau-bord-rapports.md) | Une seule définition par chiffre | M |
| 70 | [08-B](fiches/08-caisse.md) | Fonds et sorties tenus | M |
| 71 | [18-B](fiches/18-factures-fournisseur.md) | Payer sort l'argent, une seule fois | M |
| 72 | [08-C/1](fiches/08-caisse.md) | Clôture exacte, puis à l'aveugle — étape 1 | M |
| 73 | [08-K](fiches/08-caisse.md) | Corriger une journée fermée | M |

**C'est fini quand** :
- Chaque mode d'argent a sa ligne dans la session, avec sa référence.
- Une sortie supérieure au tiroir est refusée ; payer un fournisseur en espèces sort du tiroir.
- Chaque chiffre d'argent a une seule définition, la même partout.
- La clôture est exacte ; une erreur après clôture se corrige par un contre-mouvement motivé.

**Décider avant** : questions 5 (une caisse ou un tiroir par caissier), 7, 14, 15, 16, 17, 30.

### Étape 7 · Corriger sans effacer

Rangs 74 à 80 · 7 lots (7 M) · environ 14 jours.

**Pour le commerçant** : Toute erreur se corrige par une annulation tracée, jamais par un effacement. Une pièce émise ne change plus.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 74 | [18-C](fiches/18-factures-fournisseur.md) | Annuler une facture ou un paiement | M |
| 75 | [17-E](fiches/17-receptions.md) | Voir les réceptions et leurs écarts | M |
| 76 | [17-C](fiches/17-receptions.md) | Annuler ou corriger une réception | M |
| 77 | [04-D](fiches/04-paiements-acomptes.md) | Annuler un encaissement, proprement | M |
| 78 | [09-C](fiches/09-depenses.md) | Corriger et annuler sans effacer | M |
| 79 | [03-D](fiches/03-factures.md) | Pièce inaltérable et numéros sans trou | M |
| 80 | [02-D](fiches/02-bons-livraison.md) | Annuler à l'écran, sans fausser le stock | M |

**C'est fini quand** :
- Facture fournisseur, paiement, réception, encaissement, dépense, bon et facture s'annulent proprement, stock et argent compris.
- Plus aucun numéro ne disparaît ; aucune pièce ne se supprime.

**Décider avant** : questions 8 (le vendeur annule sa facture du jour), 24, 86.

### Étape 8 · Droits, accord du gérant, chiffres du patron

Rangs 81 à 92 · 12 lots (5 S, 7 M) · environ 17 jours.

**Pour le commerçant** : L'API refuse ce que l'écran cache. Renvoyer quelqu'un coupe tout. Le gérant donne son accord sur place par code PIN. Prix plancher, une seule marge, et moins d'écrans faux.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 81 | [23-D](fiches/23-tableau-bord-rapports.md) | Retirer le bruit | S |
| 82 | [21-B1](fiches/21-tresorerie.md) | Page Trésorerie masquée | M |
| 83 | [27-C](fiches/27-documents-pdf.md) | Un seul gabarit A4 : le PDF | M |
| 84 | [24-A1](fiches/24-utilisateurs-roles.md) | Le serveur refuse ce que l'écran cache (test rôle par route) | M |
| 85 | [24-B](fiches/24-utilisateurs-roles.md) | Renvoyer, c'est tout couper | S |
| 86 | [25-F](fiches/25-parametres-profils.md) | Qui change quoi, et qui l'a fait | S |
| 87 | [24-I](fiches/24-utilisateurs-roles.md) | Code PIN du gérant : l'accord sur place | M |
| 88 | [10-C](fiches/10-produits-prix.md) | Droits, prix plancher, historique des prix | M |
| 89 | [03-E](fiches/03-factures.md) | Prix plancher et confidentialité | M |
| 90 | [15-G](fiches/15-valorisation-cmp.md) | Une seule marge | S |
| 91 | [15-F](fiches/15-valorisation-cmp.md) | Une page qui répond au patron | M |
| 92 | [06-B](fiches/06-relances-credit.md) | Une seule page « Crédit clients » | S |

**C'est fini quand** :
- Un test rôle par route prouve qu'aucun rôle ne lit ou n'écrit ce que son écran ne montre pas.
- Un compte désactivé ne reçoit plus rien, notifications comprises.
- Remise sous le plancher, sortie, annulation : refusées sans le code du gérant, tracées avec.
- Bruit retiré de l'accueil, page Trésorerie masquée, un seul gabarit A4, Valorisation dans Rapports, une seule page « Crédit clients ».

**Décider avant** : questions 3 (sous le plancher : bloquer ou avertir), 42 (calcul de la marge), 57, 59, 64, 67, 72.

## Phase C — Prêt pour le premier client

### Étape 9 · Plusieurs boutiques, chaque métier son ERP

Rangs 93 à 104 · 12 lots (2 S, 8 M, 2 L) · environ 27 jours.

**Pour le commerçant** : Les demandes deviennent des transferts « demandés ». Le commerçant dit son métier, sa taille et ses options, et ne voit que ce qui le concerne. L'accueil du patron se lit en 10 secondes.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 93 | [14-A](fiches/14-demandes.md) | Sortir d'une demande que le dépôt ne peut pas servir | M |
| 94 | [13-E/2](fiches/13-emplacements-transferts.md) | Expédier, puis réceptionner — étape 2 | L |
| 95 | [14-B](fiches/14-demandes.md) | Une demande = un transfert « demandé » | L |
| 96 | [14-C](fiches/14-demandes.md) | La demande part de ma boutique | S |
| 97 | [08-E](fiches/08-caisse.md) | Droits et bornes de saisie | S |
| 98 | [13-D2](fiches/13-emplacements-transferts.md) | Recevoir, transférer, compter dans sa boutique | M |
| 99 | [13-G](fiches/13-emplacements-transferts.md) | Gérer un site : modifier, fermer, rouvrir | M |
| 100 | [25-B](fiches/25-parametres-profils.md) | Métier + taille + 8 options au lieu de 33 cases | M |
| 101 | [25-E](fiches/25-parametres-profils.md) | Un écran caché disparaît partout | M |
| 102 | [13-F](fiches/13-emplacements-transferts.md) | Un seul magasin : rien à l'écran | M |
| 103 | [23-E](fiches/23-tableau-bord-rapports.md) | L'accueil du patron en 10 secondes | M |
| 104 | [21-B2](fiches/21-tresorerie.md) | Bloc « Argent » sur l'accueil, page Trésorerie retirée | M |

**C'est fini quand** :
- Une demande que le dépôt ne peut pas servir s'annule ; la demande et le transfert ne font qu'un.
- On modifie, ferme et rouvre un site.
- Métier, taille et options remplacent les cases ; un module caché disparaît partout, serveur compris ; un magasin seul ne voit rien des transferts.
- L'accueil du patron donne vente du jour par boutique, argent encaissé et où il est, dettes, ruptures, écarts de caisse.

**Décider avant** : questions 38, 40, 49, 54, 68, 69, 80.

### Étape 10 · Prêt à installer

Rangs 105 à 116 · 12 lots (2 S, 8 M, 2 L) · environ 27 jours.

**Pour le commerçant** : Trouver un produit ou un client en deux lettres ou au scan, même en 3G. Reprendre le catalogue, les clients et leurs dettes depuis un classeur. Installer un client en une heure.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 105 | [10-F](fiches/10-produits-prix.md) | Une recherche qui trouve | M |
| 106 | [29-D](fiches/29-mobile-hors-ligne.md) | Léger en 3G | M |
| 107 | [29-E](fiches/29-mobile-hors-ligne.md) | La caméra comme lecteur de code-barres | M |
| 108 | [10-G](fiches/10-produits-prix.md) | Importer et exporter le catalogue Excel | M |
| 109 | [19-E](fiches/19-contacts-crm.md) | Le téléphone comme clé | M |
| 110 | [19-G/1](fiches/19-contacts-crm.md) | Importer ses clients et leur dette de départ — étape 1 | L |
| 111 | [19-G/2](fiches/19-contacts-crm.md) | Importer ses clients et leur dette de départ — étape 2 | L |
| 112 | [25-C](fiches/25-parametres-profils.md) | Assistant de démarrage | M |
| 113 | [28-D2](fiches/28-deploiement-demo.md) | Version testée et retour arrière | M |
| 114 | [28-F](fiches/28-deploiement-demo.md) | Installer et dépanner un client en une heure | M |
| 115 | [28-H](fiches/28-deploiement-demo.md) | Suspension propre, port fermé | S |
| 116 | [30-A](fiches/30-ce-qui-manque.md) | Aide et contact du support | S |

**C'est fini quand** :
- Recherche par nom approché, référence, code-barres ou caméra ; première page légère en 3G.
- Un classeur Excel remplit articles, stock de départ, clients et dettes de départ, avec un rapport d'erreurs.
- L'assistant de démarrage mène du premier login à la première vente en espèces.
- Installation et dépannage d'un client en une heure ; suspension propre ; contact du support visible.

**Décider avant** : questions 66 (qui reprend le cahier), 99 (douchette ou caméra), 101 (support, impayés), 103 (à qui sont les données).

### Étape 11 · Le métier du premier client

Rangs 117 à 126 · 10 lots (8 M, 2 L) · environ 26 jours.

**Pour le commerçant** : Ce qui rend l'ERP vendable pour un métier précis. **Faire d'abord le bloc du métier du premier client**, les autres avant le client du métier suivant.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 117 | [10-K](fiches/10-produits-prix.md) | Numéros de série et garantie, version minimale | M |
| 118 | [03-G](fiches/03-factures.md) | Un seul document, digne de Sage | M |
| 119 | [03-I](fiches/03-factures.md) | Services, note client, série et garantie | M |
| 120 | [30-C](fiches/30-ce-qui-manque.md) | Dépôt SAV : l'appareil du client a sa fiche | M |
| 121 | [10-J](fiches/10-produits-prix.md) | Tailles et couleurs en série | M |
| 122 | [11-F/1](fiches/11-etiquettes.md) | Taille, référence, nom court — étape 1 | M |
| 123 | [07-J](fiches/07-vente-comptoir.md) | Annuler ou échanger tout de suite | M |
| 124 | [10-H](fiches/10-produits-prix.md) | Carton, paquet, pièce et tarifs gros | L |
| 125 | [10-I](fiches/10-produits-prix.md) | Vente au poids | L |
| 126 | [03-J](fiches/03-factures.md) | Une facture pour plusieurs livraisons | M |

**C'est fini quand** :
- Informatique (10-K, 03-G, 03-I, 30-C) : numéros de série et garantie, facture digne d'un concurrent, services, dépôt SAV.
- Habillement (10-J, 11-F étape 1, 07-J) : tailles et couleurs en série, étiquette avec taille, échange immédiat.
- Alimentaire et grossiste (10-H, 10-I, 03-J) : cartons et pièces, vente au poids, une facture pour plusieurs livraisons.

**Décider avant** : questions 100 (métier du premier client), 2 (vente au poids), 12 (niveaux de prix), 102.

> **Jalon : premier client installé.** Toutes les étapes 0 à 11 sont faites (pour le bloc de son métier). Avant de l'installer : rejouer sur une base neuve, avec le service worker actif, la journée type de son métier, de l'ouverture de caisse à la clôture, et vérifier chaque chiffre.

## Phase D — Les premiers mois du client

### Étape 12 · Vendre l'ERP et vivre le premier mois

Rangs 127 à 143 · 17 lots (8 S, 9 M) · environ 22 jours.

**Pour le commerçant** : Une démo qui vend. Les gestes du quotidien sans friction : crédit visible, scan au panier, ticket 58 ou 80 mm, client nommé au comptoir, embauche sans e-mail, abonnement visible.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 127 | [24-G](fiches/24-utilisateurs-roles.md) | Comptes de démonstration fermés pour de bon | S |
| 128 | [28-G2](fiches/28-deploiement-demo.md) | Démos par métier, remises à neuf chaque nuit | M |
| 129 | [26-D1](fiches/26-journal-notifications.md) | Alertes : annulation, paiement supprimé, écart de caisse | M |
| 130 | [06-C1](fiches/06-relances-credit.md) | Voir l'encours avant de vendre, message en FCFA | M |
| 131 | [09-B](fiches/09-depenses.md) | Qui peut sortir combien, qui peut effacer | M |
| 132 | [07-D](fiches/07-vente-comptoir.md) | Le scan arrive toujours au panier | S |
| 133 | [27-F1](fiches/27-documents-pdf.md) | Ticket 58 et 80 mm, reste dû, noms longs | M |
| 134 | [19-B](fiches/19-contacts-crm.md) | Nommer le client à la vente comptoir | S |
| 135 | [24-D](fiches/24-utilisateurs-roles.md) | Embaucher sans e-mail, mot de passe provisoire | S |
| 136 | [24-C](fiches/24-utilisateurs-roles.md) | Une seule porte pour les comptes | S |
| 137 | [25-D](fiches/25-parametres-profils.md) | Le logo s'enregistre | S |
| 138 | [25-A](fiches/25-parametres-profils.md) | Une seule page « Paramètres », par sujet | M |
| 139 | [30-B](fiches/30-ce-qui-manque.md) | L'abonnement se voit, l'impayé laisse lire | M |
| 140 | [19-C](fiches/19-contacts-crm.md) | CRM réduit à des notes | S |
| 141 | [19-D](fiches/19-contacts-crm.md) | « Analyse clients » fondue dans la liste | M |
| 142 | [27-H](fiches/27-documents-pdf.md) | Exports pour le comptable | M |
| 143 | [01-E](fiches/01-devis.md) | Chiffrer un article sur commande | S |

**C'est fini quand** :
- La démo par métier est remise à neuf chaque nuit, comptes compris.
- Alertes gardées au lieu de bulles ; crédit visible et bloqué au plafond ; sorties bornées par rôle.
- Ticket 58 et 80 mm ; logo enregistré ; une seule page Paramètres ; abonnement et préavis visibles.
- CRM réduit à des notes, analyse dans la liste, exports pour le comptable.

**Décider avant** : questions 48, 58, 60, 61, 70.

### Étape 13 · Un seul écran par geste

Rangs 144 à 161 · 18 lots (3 S, 11 M, 4 L) · environ 44 jours.

**Pour le commerçant** : Les grandes fusions : plus de moteur d'imputation (l'acompte se choisit), une seule dette fournisseur, un seul écran « Vendre », un seul « Retour », une seule « Sortie d'argent », une page Produits, une page Caisse.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 144 | [04-C/1](fiches/04-paiements-acomptes.md) | Moteur d'imputation supprimé — étape 1 | M |
| 145 | [04-C/2-3](fiches/04-paiements-acomptes.md) | Moteur d'imputation supprimé — étapes 2 et 3 | M |
| 146 | [18-E](fiches/18-factures-fournisseur.md) | Plus d'imputation automatique ; l'acompte se choisit | M |
| 147 | [18-D](fiches/18-factures-fournisseur.md) | Une seule dette, la même partout | S |
| 148 | [27-B2](fiches/27-documents-pdf.md) | Relevé fournisseur juste | M |
| 149 | [18-F](fiches/18-factures-fournisseur.md) | Saisir depuis la réception, écart signalé | M |
| 150 | [16-C](fiches/16-commandes-fournisseur.md) | Ne pas racheter ce qui est déjà commandé | S |
| 151 | [08-F](fiches/08-caisse.md) | Une seule page Caisse, audit supprimé | M |
| 152 | [10-D](fiches/10-produits-prix.md) | « Produits » : une page, une fiche, l'archivage | M |
| 153 | [07-H/1](fiches/07-vente-comptoir.md) | Un seul écran « Vendre » — étape 1 | L |
| 154 | [07-H/2](fiches/07-vente-comptoir.md) | Un seul écran « Vendre » — étape 2 | L |
| 155 | [07-L](fiches/07-vente-comptoir.md) | Rapide au clavier et au téléphone | M |
| 156 | [02-E](fiches/02-bons-livraison.md) | Bon sans devis, module facultatif par profil | M |
| 157 | [05-E/1-2](fiches/05-retours-avoirs.md) | Un seul « Retour » : rendre, puis rembourser, créditer ou échanger — étapes 1 et 2 | L |
| 158 | [05-E/3](fiches/05-retours-avoirs.md) | Un seul « Retour » : rendre, puis rembourser, créditer ou échanger — étape 3 | L |
| 159 | [05-F](fiches/05-retours-avoirs.md) | Le caissier saisit, le gérant autorise | S |
| 160 | [09-E](fiches/09-depenses.md) | Trier les sorties, choisir ses catégories | M |
| 161 | [09-F](fiches/09-depenses.md) | Une seule porte « Sortie d'argent » | M |

**C'est fini quand** :
- Aucun argent ne s'impute tout seul ; l'acompte est proposé et choisi.
- « Nouvelle facture » et « Vente comptoir » ne font plus qu'un écran « Vendre » ; le devis partage son panier.
- Rendre, rembourser, créditer ou échanger passe par un seul « Retour ».
- Dépense, apport, remise au patron, salaire : une seule porte « Sortie d'argent ».

**Décider avant** : questions 1 (un seul écran « Vendre »), 13 et 74 (acompte), 18, 19, 25, 28.

### Étape 14 · Personnel et salaires

Rangs 162 à 169 · 8 lots (2 S, 6 M) · environ 13 jours.

**Pour le commerçant** : Une liste du personnel, des salaires payés par la caisse, des avances, et la commission au vrai vendeur.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 162 | [20-D](fiches/20-employes-paie.md) | Entrée, départ et prorata | S |
| 163 | [20-A](fiches/20-employes-paie.md) | Payer un salaire sort l'argent | M |
| 164 | [20-C](fiches/20-employes-paie.md) | Avance, prime et retenue à l'écran | M |
| 165 | [20-B1](fiches/20-employes-paie.md) | Commission à l'auteur du devis ou de la vente | M |
| 166 | [20-B2](fiches/20-employes-paie.md) | Commission reprise au retour ou à l'annulation | M |
| 167 | [20-E1](fiches/20-employes-paie.md) | Francs entiers, case « déclaré CNPS » | M |
| 168 | [20-G](fiches/20-employes-paie.md) | Qui fixe les salaires | S |
| 169 | [20-F](fiches/20-employes-paie.md) | Un seul écran « Personnel », caché par défaut | M |

**C'est fini quand** :
- Payer un salaire sort l'argent du tiroir ; avance et retenue à l'écran ; prorata à l'entrée et au départ.
- La commission va à l'auteur du devis ou de la vente, et repart avec un retour ou une annulation.
- Montants en francs entiers ; CNPS et ITS seulement pour qui est déclaré ; salaires fixés par l'admin.

**Décider avant** : questions 87, 88, 89.

### Étape 15 · Achat direct, chiffres du mois, équipe

Rangs 170 à 181 · 12 lots (5 S, 7 M) · environ 17 jours.

**Pour le commerçant** : Acheter au comptant en un geste. Le bénéfice et le résultat du mois. Le gérant gère son équipe. Identité ivoirienne sur les documents.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 170 | [17-D](fiches/17-receptions.md) | Réception sans commande, achat au comptant | M |
| 171 | [09-H](fiches/09-depenses.md) | Totaux et bénéfice | M |
| 172 | [23-G1](fiches/23-tableau-bord-rapports.md) | Rapports « Ventes » | M |
| 173 | [23-H](fiches/23-tableau-bord-rapports.md) | Le résultat du mois | M |
| 174 | [07-B](fiches/07-vente-comptoir.md) | Vente comptoir à vitesse constante, acompte respecté | M |
| 175 | [01-B](fiches/01-devis.md) | Vendre un devis en un geste | M |
| 176 | [08-H](fiches/08-caisse.md) | Caisse oubliée | S |
| 177 | [08-I/1](fiches/08-caisse.md) | Responsable du tiroir — étape 1 | S |
| 178 | [19-F/1](fiches/19-contacts-crm.md) | Doublons : prévenir, puis fusionner — étape 1 | M |
| 179 | [24-E](fiches/24-utilisateurs-roles.md) | Le gérant gère son équipe | S |
| 180 | [25-G](fiches/25-parametres-profils.md) | Changer de métier après coup, sans rien perdre de vue | S |
| 181 | [25-H](fiches/25-parametres-profils.md) | Identité ivoirienne | S |

**C'est fini quand** :
- Réception sans commande, payée ou due, en une transaction.
- Résultat du mois avec les dépenses ; rapports « Ventes » par vendeur, produit, boutique.
- Caisse oubliée signalée ; doublons de contacts prévenus ; NCC, RCCM et régime au bon endroit.

**Décider avant** : questions 27, 58, 65, 78.

### Étape 16 · Papiers et étiquettes justes

Rangs 182 à 191 · 10 lots (4 S, 6 M) · environ 14 jours.

**Pour le commerçant** : Un document émis ne change plus, porte « duplicata » à la réimpression, et contient tout ce qu'il doit. Étiquettes lisibles à la douchette, sur le bon papier.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 182 | [27-D1](fiches/27-documents-pdf.md) | Une pièce émise ne change plus | M |
| 183 | [27-D2](fiches/27-documents-pdf.md) | Duplicata et reçu numéroté figé | M |
| 184 | [27-G](fiches/27-documents-pdf.md) | Reçu de paiement à portée de main | S |
| 185 | [27-E1](fiches/27-documents-pdf.md) | Facture remise : en-tête, pages, dates, reste dû, NCC | M |
| 186 | [27-F2](fiches/27-documents-pdf.md) | Ticket : duplicata et code-barres | M |
| 187 | [12-E](fiches/12-inventaire-physique.md) | Comptage au téléphone et sur papier | M |
| 188 | [11-B](fiches/11-etiquettes.md) | Le code du fabricant d'abord | S |
| 189 | [11-A](fiches/11-etiquettes.md) | Un code imprimé passe à la douchette | S |
| 190 | [11-E](fiches/11-etiquettes.md) | Grandes impressions par paquets | S |
| 191 | [11-D](fiches/11-etiquettes.md) | Mon papier, bien calé | M |

**C'est fini quand** :
- Réimprimer une facture redonne le même nom, les mêmes prix et la même identité qu'au jour de son émission.
- Reçu pour chaque paiement et chaque acompte.
- Codes lisibles à 203 ppp ; code du fabricant d'abord ; papier calé ; grandes impressions par paquets ; comptage au téléphone.

**Décider avant** : questions 45, 46, 62, 73, 77.

### Étape 17 · Crédit clients et alertes

Rangs 192 à 199 · 8 lots (2 S, 6 M) · environ 13 jours.

**Pour le commerçant** : La file des dettes suit l'échéance. Le gérant déroge au plafond par son code. La fiche client répond au comptoir.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 192 | [03-F](fiches/03-factures.md) | Crédit daté et liste utile | M |
| 193 | [06-D](fiches/06-relances-credit.md) | La file suit l'échéance | M |
| 194 | [23-F](fiches/23-tableau-bord-rapports.md) | « À traiter » qui dit vrai | S |
| 195 | [26-D2](fiches/26-journal-notifications.md) | Alertes : caisse restée ouverte, rupture par boutique | M |
| 196 | [06-E](fiches/06-relances-credit.md) | Qui voit la dette, qui relance | S |
| 197 | [06-C2](fiches/06-relances-credit.md) | Accord du gérant au-delà du plafond | M |
| 198 | [19-H](fiches/19-contacts-crm.md) | Une fiche qui répond au comptoir | M |
| 199 | [24-J](fiches/24-utilisateurs-roles.md) | Poste partagé : changer de vendeur par code | M |

**C'est fini quand** :
- Liste « En retard » fondée sur l'échéance ; « À traiter » juste ; alertes « À surveiller » complètes.
- Dépassement de plafond accordé par le code du gérant, tracé.
- Poste partagé : changer de vendeur par code.

**Décider avant** : questions 56, 60, 65.

### Étape 18 · Livrer, recevoir, prouver

Rangs 200 à 210 · 11 lots (2 S, 9 M) · environ 19 jours.

**Pour le commerçant** : Les documents et gestes du grossiste et du dépôt : bon signé, livraison depuis le dépôt, casse à l'arrivée, pièces jointes.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 200 | [11-C](fiches/11-etiquettes.md) | Quoi et combien imprimer | M |
| 201 | [12-D/2](fiches/12-inventaire-physique.md) | Ajuster : réservé, motivé, chiffré — étape 2 | M |
| 202 | [27-E2](fiches/27-documents-pdf.md) | Facture remise : montant en lettres, conditions, cachet | M |
| 203 | [01-C](fiches/01-devis.md) | Une « facture proforma » présentable | M |
| 204 | [02-F](fiches/02-bons-livraison.md) | Le bon que signe le client | M |
| 205 | [02-G](fiches/02-bons-livraison.md) | Livrer depuis le dépôt | M |
| 206 | [16-D](fiches/16-commandes-fournisseur.md) | Pour quelle boutique on achète | S |
| 207 | [17-F](fiches/17-receptions.md) | Casse, refus et surplus à l'arrivée | M |
| 208 | [18-I](fiches/18-factures-fournisseur.md) | « À payer cette semaine » et fiche complète | M |
| 209 | [09-I](fiches/09-depenses.md) | Photo du reçu et « Refaire » | S |
| 210 | [26-E](fiches/26-journal-notifications.md) | Pièces jointes là où il y a du papier | M |

**C'est fini quand** :
- Proforma présentable ; bon de livraison signé par le client ; livraison depuis le dépôt.
- Casse, refus et surplus enregistrés à l'arrivée ; « À payer cette semaine » chez les fournisseurs.
- Photo du reçu et pièces jointes là où il y a du papier.

**Décider avant** : questions 22, 31.

### Étape 19 · Plus vite, plus loin

Rangs 211 à 225 · 15 lots (2 S, 12 M, 1 L) · environ 30 jours.

**Pour le commerçant** : Le confort des mois suivants : ouverture sans réseau, achats selon les ventes, frais d'approche, encaissement d'un client en une fois, rôles renommés, installation sur l'écran d'accueil.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 211 | [29-F](fiches/29-mobile-hors-ligne.md) | L'application s'ouvre sans réseau | M |
| 212 | [16-F](fiches/16-commandes-fournisseur.md) | Quantité proposée selon les ventes | M |
| 213 | [15-H](fiches/15-valorisation-cmp.md) | Le stock qui dort | S |
| 214 | [17-H1](fiches/17-receptions.md) | Frais d'approche — étape 1 | M |
| 215 | [04-F](fiches/04-paiements-acomptes.md) | « Encaisser un client » | L |
| 216 | [04-G](fiches/04-paiements-acomptes.md) | Reçu numéroté, figé, envoyable | M |
| 217 | [04-I](fiches/04-paiements-acomptes.md) | Acompte de commande et mise de côté | M |
| 218 | [06-F](fiches/06-relances-credit.md) | Promesse de paiement datée | M |
| 219 | [19-F/2](fiches/19-contacts-crm.md) | Doublons : prévenir, puis fusionner — étape 2 | M |
| 220 | [24-H](fiches/24-utilisateurs-roles.md) | Six rôles aux noms du commerce, un vrai comptable | M |
| 221 | [29-H](fiches/29-mobile-hors-ligne.md) | Au doigt | M |
| 222 | [29-I](fiches/29-mobile-hors-ligne.md) | Installer sur l'écran d'accueil | S |
| 223 | [07-I](fiches/07-vente-comptoir.md) | Panier gardé et tickets en attente | M |
| 224 | [11-G](fiches/11-etiquettes.md) | Étiquette de rayon | M |
| 225 | [11-F/2](fiches/11-etiquettes.md) | Taille, référence, nom court — étape 2 | M |

**C'est fini quand** :
- Chaque lot a ses propres critères dans sa fiche.

**Décider avant** : questions 32, 34, 44.

## Phase E — Selon les clients (déclenchée par un événement, pas par le rang)

### Étape 20 · Grossiste, SAV et fin d'année

Rangs 226 à 230 · 5 lots (3 M, 2 L) · environ 16 jours.
**Déclencheur** : premier grossiste ou premier SAV informatique (retour fournisseur) ; **avant le premier 31 décembre d'un client** (valeur du stock au 31 décembre).

**Pour le commerçant** : Retour fournisseur et avoir, facture de fin de mois du grossiste, valeur du stock au 31 décembre, dette passée en perte.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 226 | [18-H1](fiches/18-factures-fournisseur.md) | Retour fournisseur et avoir — étape 1 | L |
| 227 | [18-H2](fiches/18-factures-fournisseur.md) | Retour fournisseur et avoir — étape 2 | L |
| 228 | [02-H](fiches/02-bons-livraison.md) | Fin de mois du grossiste | M |
| 229 | [15-E](fiches/15-valorisation-cmp.md) | Valeur du stock au 31 décembre | M |
| 230 | [06-G](fiches/06-relances-credit.md) | Passer une dette en perte | M |

**C'est fini quand** :
- Chaque lot a ses propres critères dans sa fiche.

**Décider avant** : questions 33, 44, 52.

### Étape 21 · Comptabilité pour le cabinet

Rangs 231 à 238 · 8 lots (2 S, 6 M) · environ 13 jours.
**Déclencheur** : **avant le premier mois clos d'un client qui travaille avec un cabinet**, quel que soit son rang.

**Pour le commerçant** : Un journal juste, calculé depuis les pièces, figé à la clôture du mois, exporté au format du cabinet. L'ancien moteur d'écritures part.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 231 | [22-B](fiches/22-comptabilite.md) | Règles de comptabilisation SYSCOHADA réglables | M |
| 232 | [22-C](fiches/22-comptabilite.md) | Journal des ventes et des encaissements, calculé | M |
| 233 | [22-D](fiches/22-comptabilite.md) | Journal des achats et des paiements fournisseur | S |
| 234 | [22-E](fiches/22-comptabilite.md) | Journal de caisse : dépenses, patron, banque, écarts, salaires | M |
| 235 | [22-G](fiches/22-comptabilite.md) | Clôture du mois | M |
| 236 | [22-H](fiches/22-comptabilite.md) | Export pour le cabinet | M |
| 237 | [22-F](fiches/22-comptabilite.md) | Retirer l'ancien moteur d'écritures | S |
| 238 | [17-H2](fiches/17-receptions.md) | Frais d'approche — étape 2 | M |

**C'est fini quand** :
- Pour une journée type (ventes, remise, avoir, acompte, Wave, dépense, achat, paiement fournisseur, clôture avec écart), chaque compte a le solde attendu.
- Un mois clos refuse toute écriture ; le fichier mensuel est accepté par le cabinet.

**Décider avant** : questions 10 (confirmer), 81 à 85.

### Étape 22 · TVA optionnelle

Rangs 239 à 241 · 3 lots (2 S, 1 L) · environ 6 jours.
**Déclencheur** : premier client assujetti à la TVA.

**Pour le commerçant** : La TVA activable par client, calculée, imprimée, journalisée et totalisée.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 239 | [03-K](fiches/03-factures.md) | TVA optionnelle | L |
| 240 | [22-I](fiches/22-comptabilite.md) | TVA dans le journal | S |
| 241 | [23-J](fiches/23-tableau-bord-rapports.md) | TVA collectée | S |

**C'est fini quand** :
- Un client sans TVA ne voit aucune TVA ; un client assujetti a des factures, un journal et un total collecté justes.

**Décider avant** : questions 4 (prix saisis TTC ou HT).

### Étape 23 · WhatsApp, FNE, mobile money, où est l'argent

Rangs 242 à 250 · 9 lots (2 S, 7 M) · environ 15 jours.
**Déclencheur** : WhatsApp dès qu'un client le demande ; FNE quand l'agrément est obtenu ; le rapport du soir avancé si la question 71 reçoit « oui ».

**Pour le commerçant** : Envoyer tout document par WhatsApp, préparer la FNE, suivre les soldes banque, Wave et Orange, envoyer au patron son rapport du soir.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 242 | [03-L](fiches/03-factures.md) | Lien WhatsApp et terrain FNE | M |
| 243 | [13-H](fiches/13-emplacements-transferts.md) | Fiche boutique prête pour FNE, Wave, WhatsApp | S |
| 244 | [16-G](fiches/16-commandes-fournisseur.md) | Envoyer la commande sur WhatsApp | S |
| 245 | [01-F](fiches/01-devis.md) | Envoyer et relancer | M |
| 246 | [06-H](fiches/06-relances-credit.md) | Relancer sur WhatsApp en deux gestes | M |
| 247 | [04-H](fiches/04-paiements-acomptes.md) | Journal des encaissements et mobile money | M |
| 248 | [08-J](fiches/08-caisse.md) | Où est l'argent : banque, coffre, patron | M |
| 249 | [21-C](fiches/21-tresorerie.md) | Soldes banque, Wave, Orange : le relevé du patron | M |
| 250 | [08-L](fiches/08-caisse.md) | Le rapport du soir du patron | M |

**C'est fini quand** :
- Chaque lot a ses propres critères dans sa fiche.

**Décider avant** : questions 55, 71.

### Étape 24 · Finitions

Rangs 251 à 265 · 15 lots (9 S, 6 M) · environ 17 jours.
**Déclencheur** : quand un client les demande.

**Pour le commerçant** : Clôture à l'aveugle, prix proposés, réception au scan, péremption, cloche, connexion par appareil, matrice des droits à l'écran.

| Rang | Lot | Ce qu'il fait | Taille |
|---|---|---|---|
| 251 | [08-C/2](fiches/08-caisse.md) | Clôture exacte, puis à l'aveugle — étape 2 | M |
| 252 | [08-I/2](fiches/08-caisse.md) | Responsable du tiroir — étape 2 | S |
| 253 | [16-H](fiches/16-commandes-fournisseur.md) | Prix proposé : le dernier prix de ce fournisseur | S |
| 254 | [17-J](fiches/17-receptions.md) | Nouveau prix de vente proposé | S |
| 255 | [13-I](fiches/13-emplacements-transferts.md) | « Il en reste à l'autre boutique » | S |
| 256 | [11-H](fiches/11-etiquettes.md) | Réimprimer les prix changés | M |
| 257 | [17-G](fiches/17-receptions.md) | Recevoir au scan | M |
| 258 | [17-I](fiches/17-receptions.md) | Date de péremption à l'arrivée | S |
| 259 | [01-G](fiches/01-devis.md) | Dupliquer | S |
| 260 | [14-D](fiches/14-demandes.md) | Une cloche qui prévient la bonne personne | S |
| 261 | [23-I](fiches/23-tableau-bord-rapports.md) | Vendeur : mes ventes du jour | S |
| 262 | [27-I](fiches/27-documents-pdf.md) | PDF sur téléphone | S |
| 263 | [26-F](fiches/26-journal-notifications.md) | L'historique sur la pièce elle-même | M |
| 264 | [24-F](fiches/24-utilisateurs-roles.md) | Connexion : verrou par compte, journal, appareils | M |
| 265 | [24-A2](fiches/24-utilisateurs-roles.md) | La matrice des droits visible à l'écran | M |

**C'est fini quand** :
- Chaque lot a ses propres critères dans sa fiche.

**Décider avant** : questions 15, 35, 43.

## Plus tard, hors de l'ordre

Vente hors ligne (29-G) ; demandes de boutique à boutique et notifications de demande (14-E, 14-F) ; bulletin conforme et envoi des bulletins (20-H, 20-I) ; CNPS et ITS complets (20-E étapes 2 et 3) ; rapports avancés (23-G étape 2) ; guides d'aide (30-A, suite) ; lecture seule pendant un impayé si elle est refusée au départ (30-B) ; plafond de crédit en jours ; appareils connus (24-F, suite) ; anonymisation d'un client.

## Lots absorbés ou retirés

Ces lots des fiches ne sont plus à faire seuls : leur travail est dans le lot indiqué. 01-D → 03-B et 03-A · 02-I → 03-L · 03-C et 09-J → 22-C, 22-D, 22-E · 03-H → 03-D et 07-J · 04-K → 08-E · 05-G → 18-H1 · 07-E → 10-C et 03-B · 07-G → 13-D1 · 07-K → 27-F1, 03-K et 03-L · 09-D → 21-A · 09-G → 08-D · 09-K et 10-L → 03-K et 03-L · 12-G → 15-E · 15-I → 22-B · 16-E → 18-E · 18-A → 16-A · 18-G → 17-D · 18-J → 03-E et 18-E · 18-K → 03-K, 03-L et 08-J · 19-I → 24-A1 · 21-D → 13-H et 21-C · 21-E → 23-J · 25-I → 07-H · 28-K → 10-G et 19-G.

## Suivi

Cocher ici chaque étape finie (date et commit) :

- [ ] Étape 0 · Ne plus rien perdre
  - [x] 29-A, le 2026-11-28 (branche `lot/29-a-hors-ligne`) : service worker retiré (question 94), intercepteur et vente comptoir. Rejoué sur la version de production dans Chrome : aucun des six gestes coupés n'affiche de succès sans écriture. **Constaté au rejeu, sans lot propriétaire** : Chrome renvoie seul une requête coupée, et les routes sans clé anti-doublon l'écrivent à nouveau (scan d'inventaire compté 4 fois au lieu d'une, contact créé 6 fois, pour 5 coupures de suite) ; ventes et paiements ont tenu grâce à leur clé.
- [ ] Étape 1 · Un client neuf démarre, rien ne compte deux fois
- [ ] Étape 2 · Qui a fait quoi
- [ ] Étape 3 · Le stock juste, chacun dans sa boutique
- [ ] Étape 4 · Ventes, livraisons et retours au bon montant
- [ ] Étape 5 · Achats justes
- [ ] Étape 6 · Tout l'argent passe par la caisse
- [ ] Étape 7 · Corriger sans effacer
- [ ] Étape 8 · Droits, accord du gérant, chiffres du patron
- [ ] Étape 9 · Plusieurs boutiques, chaque métier son ERP
- [ ] Étape 10 · Prêt à installer
- [ ] Étape 11 · Le métier du premier client
- [ ] Étape 12 · Vendre l'ERP et vivre le premier mois
- [ ] Étape 13 · Un seul écran par geste
- [ ] Étape 14 · Personnel et salaires
- [ ] Étape 15 · Achat direct, chiffres du mois, équipe
- [ ] Étape 16 · Papiers et étiquettes justes
- [ ] Étape 17 · Crédit clients et alertes
- [ ] Étape 18 · Livrer, recevoir, prouver
- [ ] Étape 19 · Plus vite, plus loin
- [ ] Étape 20 · Grossiste, SAV et fin d'année
- [ ] Étape 21 · Comptabilité pour le cabinet
- [ ] Étape 22 · TVA optionnelle
- [ ] Étape 23 · WhatsApp, FNE, mobile money, où est l'argent
- [ ] Étape 24 · Finitions
