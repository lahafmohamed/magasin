# 15 Valorisation et CMP

> **Contre-expertise du 2026-11-27** ([détail](../vagues/vague-5-contre-expertise.md)) : Verdict maintenu pour le calcul, écran fusionné : la page devient l'onglet « Stock » des Rapports (15-F). D1 : la page a raison ; la tuile des Rapports lit `produits.prix_achat`, qui suit le dernier CMP modifié (réception **ou transfert**) et toute saisie à la main, pas « le dernier site réceptionné ». D2 remplace le point « ouvert (4) » de CLAUDE.md, périmé. 15-I est retiré (fiche 22) ; 15-D absorbe le rapport de pertes de 12-F, 15-E l'état de fin d'année de 12-G. Oubli : un prix d'achat saisi à la main fige la vente suivante sans changer la valeur (10-B). Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-27, base jetable `nolyx_audit_3`, interface et API réelles (gérant, admin, caissier, vendeur, dépôt, lecteur ; 1440 et 390 px). Données créées par l'ERP : produits « V53 … » (n° 24 à 26), fournisseur et client « V53 ». Montants en FCFA. CMP = coût moyen pondéré, le « prix de revient moyen ». La caisse du banc (ouverte depuis plus de 48 h) n'a pas servi : toutes les ventes sont à crédit.

## 1. Verdict

**Améliorer.** Le calcul du coût moyen est juste dans une boutique : 12 opérations rejouées, aucun écart. Mais trois écrans donnent trois « valeurs du stock », la marge oublie la casse et les écarts d'inventaire, une livraison facturée plus tard prend le coût du jour de la facture, le mot « marge » a deux sens, et l'ERP ne sait pas dire ce que valait le stock au 31 décembre. Le CMP reste la bonne méthode.

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire boutique / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Besoin | 3 | 5 | 4 | 3 / 5 | 4 | 5 |
| Réponse actuelle | 2 | 2 | 1 | 2 / 1 | 3 | 1 |

- **Informatique** : articles chers, vite démodés, importés. Rien sur le stock qui vieillit ; frais d'approche absents (17-H).
- **Habillement** : la fin de saison est le vrai risque. Rien ne montre ce qui ne se vend plus.
- **Grossiste** : marges fines, livraisons facturées en fin de mois (03-J). Leur marge prend le coût du jour de la facture (D2).
- **Plusieurs sites** : deux valeurs différentes (D1), coût de vente faux (10-B), aucune valeur par site.

## 3. Parcours réel

| Rôle | À l'écran | Ce qui surprend |
|---|---|---|
| Gérant, admin (1440 et 390) | Gestion → « Valorisation du stock » : 1 geste. Quatre tuiles, un graphique et un tableau par catégorie. Téléphone : cartes lisibles | Ni site, ni produit, ni date. Catégorie non cliquable. CSV = une ligne par catégorie |
| Gérant, Rapports | Tuile « Valeur du stock » | Pas le même chiffre que la page (D1) |
| Caissier, vendeur, lecteur | Pas d'écran | API : 200, valeur d'achat 89 440 052 F : lot 03-E |
| Dépôt | Pas d'écran | API : quantités seulement. Juste |

**Les chiffres, opération par opération** (produit 24, prix de vente 2 000). « Page » = valeur de la catégorie sur la page ; « Rapports » = hausse de la tuile des rapports depuis le début de l'essai.

| Opération | MAG-1 | MAG-2 | Coût figé sur la vente | Page | Rapports |
|---|---|---|---|---|---|
| Réception 10 à 1 000 | 10 × 1 000 | | | 10 000 | 10 000 |
| Réception 10 à 1 500 | 20 × 1 250 | | | 25 000 | 25 000 |
| Vente de 4 | 16 × 1 250 | | 1 250, juste | 20 000 | 20 000 |
| Retour de 1, approuvé | 17 × 1 250 | | | 21 250 | 21 250 |
| Transfert de 5 | 12 × 1 250 | 5 × 1 250 | | 21 250 | 21 250 |
| Réception 10 à 2 000 | 22 × 1 590,91 | 5 × 1 250 | | 41 250,02 | **42 954,57** |
| Vente de 1 à MAG-2 | | 4 × 1 250 | **1 590,91** (10-B) | 40 000,02 | 41 363,66 |
| Ajustement +2, perte −3 | 21 × 1 590,91 | | | 38 409,11 | 39 772,75 |
| Inventaire : 20 comptés | 20 (écart −1 590,91) | | | 36 818,20 | 38 181,84 |
| Vente de 20, puis 1 de plus | 0 ; la suivante : 422 | | 1 590,91, juste | 5 000 | 6 363,64 |
| Réception 10 à 1 800 | 10 × 1 800 | | | 23 000 | 25 200 |
| Bon de livraison de 2, livré | 8 × 1 800 | | | 19 400 | 21 600 |
| Réception 8 à 3 000 | 16 × 2 400 | | | 43 400 | 48 000 |
| Bon facturé | | | **2 400** au lieu de 1 800 | 43 400 | 48 000 |

**Ce qui marche (prouvé).** Moyenne juste à chaque entrée (1 250, 1 590,91, 2 400). Le retour rentre au coût figé de sa vente, le transfert emporte le coût du site de départ, l'ajustement et l'inventaire gardent le CMP, la page suit exactement « quantité × CMP ». Stock à 0 puis réception : le CMP repart du nouveau prix (1 800), sans traîner l'ancien. Le stock négatif est impossible (`ci-baseline.sql:4018`, vente refusée en 422) : la question « négatif puis réception » ne se pose pas tant que la question 9 n'est pas tranchée. Arrondi : 35 000,02 pour 35 000 achetés, sans effet ; le CMP doit rester au centime (03-B ne doit pas l'arrondir au franc).

**Méthode.** Le CMP convient à la cible : une seule colonne à suivre, aucun lot, et il est admis par le plan comptable OHADA (supposé, non recherché). Le premier entré, premier sorti exige de suivre des lots : trop lourd, sauf comme estimation pour la péremption (17-I). Le dernier prix d'achat est ce que le commerçant retient pour fixer ses prix, pas une valeur de stock : après une hausse, il gonfle le stock et écrase la marge. On garde le CMP pour la valeur et la marge, et on montre le dernier prix d'achat à côté (10-B).

**Ce que le commerçant comprend.** « Valeur du stock » : l'argent immobilisé, au prix où il a acheté. « Marge » : ce qu'il gagne, en francs ; en pourcentage, il pense « j'achète 1 000, je mets 30 % » (sur l'achat). La page sert au patron, une fois par mois, et au comptable ou au banquier en fin d'année.

## 4. Défauts prouvés

### Argent et stock

| N° | Constat | Preuve | Où |
|---|---|---|---|
| D1 | **Deux valeurs du stock.** Rapports multiplie la quantité totale par un seul coût, celui du dernier site réceptionné | Produit 24 : page **43 400** (16 × 2 400 + 4 × 1 250), Rapports **48 000** (20 × 2 400). Toute la base : page 89 445 052, Rapports 89 444 114. `ReportingService.ts:264-268` (`produits.stock × prix_achat`) contre `ProduitService.ts:341-356` (`SUM(valeur_stock)`). L'export CSV de l'inventaire suit Rapports (au même instant : 89 443 114,14 des deux côtés). `CLAUDE.md` (« trois lecteurs unifiés ») est faux | Écran |
| D2 | **Livraison facturée plus tard : coût du jour de la facture.** Le bon ne garde aucun coût | Livré à 1 800, facturé après une réception à 3 000 : coût **2 400**. Fiche facture : coût 4 800, marge 200, « 4 % » au lieu de 3 600, 1 400, 28 %. `BonLivraisonService.ts:218, 344` n'écrit pas `prix_achat_unitaire` ; `DocumentConversion.ts:63` prend le prix d'achat du moment | Écran |
| D3 | **Casse, pertes et écarts d'inventaire absents de la marge** | Perte −3 et inventaire −1 : 6 363,64 F sortis ; +2 trouvés : 3 181,82. Compte de résultat : coût des ventes 43 209,11 = les 4 lignes vendues, rien d'autre (`ReportingService.ts:34-37`). Aucun écran ne totalise la démarque d'un mois | Écran |
| D4 | **Stock à coût zéro compté pour rien, marge gonflée, sans alerte** | Produit 26 créé avec 5 pièces à prix d'achat 0 : valeur +0, « Marge potentielle » +15 000, unités +5. Cause : 17-B, 10-B ; la page ne le signale pas | API |
| D5 | **Vente dans un autre site au coût du dernier site réceptionné** (déjà 10-B) | Vente à MAG-2 : coût figé 1 590,91 pour des pièces à 1 250 | Écran |

### Blocage

| N° | Constat | Preuve |
|---|---|---|
| B1 | **Aucune valeur à une date passée**, donc pas d'état au 31 décembre | `?date=2026-01-01` : mêmes chiffres. `getStockValuation()` sans paramètre. `mouvements_stock` n'a ni coût ni valeur (`ci-baseline.sql:3033-3046`) : impossible à reconstituer |
| B2 | **Aucune valeur par site ni par produit** | Page et API sans filtre (`ProduitService.ts:341-379`). `/reports/consolidated` sait filtrer par magasin, aucun écran ne l'appelle |
| B3 | **Le stock n'existe pas en comptabilité** | Client neuf : 14 comptes, aucun en classe 3 ni 603 (`nolyx_audit_neuve`). Ni stock au bilan, ni variation de stock |

### Gêne

| N° | Constat | Preuve |
|---|---|---|
| G1 | **« Marge » a deux sens** | Souris achetée 1 000, vendue 1 500 : liste Inventaire **50 %** (sur l'achat, `Inventaire.tsx:208-211`) ; fiche facture et Rapports **33,3 %** (sur la vente, `FactureDetail.tsx:437`) |
| G2 | Trois cartes « valeur du stock », trois bases | Accueil : prix de vente (`Dashboard.tsx:2506`) ; Rapports : D1 ; page : CMP |
| G3 | Stock qui dort invisible | Aucune date de dernière vente nulle part. `taux_rotation` calculé (`ReportingService.ts:270-278`), affiché nulle part |
| G4 | À 1440, la barre « Informatique » dépasse du cadre | Capture `valo-1440` |

## 5. Comparaison

Source : [faits/concurrents.md](../faits/concurrents.md).

| Sujet | Odoo | Sage 100 | Loyverse | Nous |
|---|---|---|---|---|
| Méthode | CMP ou FIFO [O19] | CMUP, FIFO, LIFO [G1] | Rapport payant [L1] | CMP par site, juste dans une boutique |
| Frais d'approche | Répartis, avant/après visible [O19] | Non vérifié | Non vérifié | Absents (17-H) |
| Valeur par site, à date, stock dormant | Non vérifié | Non vérifié | Non vérifié | Rien |

**Minimum attendu** (hypothèse) : coût moyen avec frais, marge par vente, valeur par site, coût réservé au patron, correction tracée.

**On fait mieux** : le transfert emporte le coût, le retour revient au coût de sa vente, le dépôt ne voit aucun montant. **Pour battre** : une valeur unique, par site, à date, avec la démarque du mois et le stock qui dort, en FCFA, sans module payant.

## 6. Manques par profil

| Profil | Premier mois | Plus tard (une ligne) |
|---|---|---|
| Tous | Une valeur juste, par site ; démarque du mois ; état au 31 décembre | Dépréciation chiffrée (comptable) |
| Informatique | Stock sans vente depuis 90 jours | Valeur au prix du marché |
| Habillement | Fin de saison : ce qui ne part plus | Soldes suggérées |
| Grossiste | Marge juste des bons facturés en fin de mois | Marge par client |

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** (03-K) : pour un client qui récupère la TVA, coût d'entrée, CMP, valeur et marge **hors taxe** ; sinon, taxe comprise dans le coût. Si les prix de vente sont saisis TTC (question 4), « valeur de vente » et marge doivent retirer la taxe, sinon elles gonflent de 18 %. Rien d'affiché pour le non-assujetti.
- **FNE** : aucun effet.
- **Mobile money** : aucun effet.
- **WhatsApp** : l'état valorisé (15-E) envoyé au comptable par lien `wa.me` (03-L).

## 8. Lots proposés

Ordre du cadrage. Prochaine migration : le numéro libre au moment du lot (dernière : `113`) ; tout changement de schéma régénère `ci-baseline.sql`. Déjà ailleurs : stock fantôme **10-A**, coût par site à la vente **10-B**, coût 0 à la réception **17-B**, frais et coût corrigé par la facture **17-H1, 17-H2**, défectueux **05-C**, qui voit les coûts **03-E**, ventes et achats dans la balance **03-C**, CA net des retours **05-D**.

**Une fois 10-A, 10-B, 17-B et 15-A à 15-D faits**, la suite de la section 3 doit donner : Rapports = page = 43 400 ; coût figé à MAG-2 1 250 ; coût du bon 1 800 ; démarque nette −3 181,82 affichée ; coût des ventes 41 668,20 au lieu de 43 209,11 (hors retour, que 05-D déduit). C'est le test de fin commun.

### 15-A · Une seule valeur du stock (S, priorité 1)
- **Problème** : D1, G2.
- **Résultat** : le même chiffre sur la page, les Rapports, l'export et l'accueil (au coût).
- **Base/API** : une fonction SQL `valeur_stock(location_id NULL)` = `SUM(quantite × cmp)` des sites actifs, produits non supprimés ; lue par `ProduitService.getStockValuation`, `ReportingService.getDashboardKPIs`, `getConsolidatedDashboard`. Export Inventaire : coût = CMP du site filtré. Retirer `taux_rotation`.
- **Écran** : tuile Rapports « Valeur du stock (au coût) », lien vers la page ; carte de l'accueil renommée « Stock au prix de vente ».
- **Fichiers** : `ReportingService.ts`, `ProduitService.ts`, `Inventaire.tsx`, `Reporting.tsx`, `Dashboard.tsx`, migration.
- **Tests** : la suite de la section 3 jusqu'au transfert puis réception : 41 250,02 partout.
- **Fini quand** : un test compare les trois lecteurs sur deux sites.
- **Dépend** : aucun. **Risque** : chiffres de rapports qui changent ; le dire dans la note de version.

### 15-B · Le bon de livraison garde le coût du jour de la livraison (S, priorité 1)
- **Problème** : D2.
- **Résultat** : la marge d'une livraison ne bouge pas avec les arrivages suivants.
- **API** : à la sortie de stock du bon, `prix_achat_unitaire` = CMP du site de livraison (même source que 10-B) ; la conversion garde ce coût ; repli sur le coût actuel seulement pour les anciens bons à 0, signalés.
- **Fichiers** : `BonLivraisonService.ts:218, 344` et passage à « livré », `DocumentConversion.ts:63`.
- **Tests** : livré à 1 800, réception à 3 000, facturé : 1 800 ; livraison partielle en deux fois.
- **Fini quand** : la suite donne 3 600 de coût, 1 400 de marge.
- **Dépend** : 10-B, 02-A. **Risque** : bons déjà livrés en base ; les lister.

### 15-C · Chaque mouvement de stock garde son coût (M, priorité 1)
- **Problème** : B1, D3 : aucun mouvement ne dit combien il valait.
- **Résultat** : chaque entrée ou sortie a un coût et une valeur ; on peut tout justifier.
- **Base** : `mouvements_stock.cout_unitaire`, `valeur` (signée), `cmp_apres`, `utilisateur_id` (avec fiche 10, D8). Écrits partout où le stock bouge (`applyStockMovement`, ventes, réceptions, transferts, bons, retours, inventaire, annulation).
- **Tests** : sur la suite, `SUM(valeur)` par site = `valeur_stock` à chaque étape.
- **Fini quand** : contrôle d'écart à 0 sur la base du banc après rejeu.
- **Dépend** : 10-A. **Risque** : chemin oublié ; un test liste les `INSERT INTO mouvements_stock` du code.

### 15-D · La démarque chiffrée dans les rapports (S, priorité 1)
- **Problème** : D3.
- **Résultat** : « ce mois, j'ai perdu 6 364 F de marchandise » ; la marge après pertes.
- **Écran** : Rapports, bloc « Pertes et écarts » par mois et par site (perte, casse, inventaire, ajustement), en valeur, détail par produit ; compte de résultat : « Marge brute », « Pertes et écarts », « Marge après pertes ».
- **API** : `GET /reports/demarque` sur 15-C.
- **Tests** : la suite → −3 181,82 net.
- **Dépend** : 15-C, 05-D, fiche 23. **Risque** : défectueux compté deux fois (05-C).

### 15-E · Valeur du stock au 31 décembre (M, priorité 4)
- **Problème** : B1.
- **Résultat** : je donne au comptable l'état des stocks valorisé à la date de clôture.
- **Écran** : page « Valeur du stock », choix de date ; action « Arrêter la valeur du stock » (gérant, admin) : imprimé et CSV (produit, site, quantité, CMP, valeur, total) ; un inventaire validé propose « Arrêter à cette date ».
- **Base** : `arretes_stock` (date, site, produit, quantité, CMP, valeur, auteur), figé ; date sans arrêté : reconstituée depuis 15-C.
- **Tests** : arrêt, mouvements, relecture : figé ; date reconstituée = arrêté.
- **Dépend** : 15-C, 15-A, fiche 12, fiche 27 (imprimé). **Risque** : stock antérieur à 15-C non reconstituable ; dater le premier arrêté.

### 15-F · Une page qui répond au patron (M, priorité 4)
- **Problème** : B2, D4, G4.
- **Résultat** : je sais ce que vaut chaque boutique et chaque article.
- **Écran** : choix du site (magasin seul : caché) ; liste par produit triée par valeur ; catégorie cliquable ; bandeau « 5 articles comptés à 0 : coût à renseigner » (vers 10-B) ; « Marge potentielle » remplacée par « Valeur de vente » ; graphique corrigé à 1440.
- **API** : `GET /produits/stock-valuation?location_id=&par=produit`, sur 15-A.
- **Dépend** : 15-A. **Risque** : page lente au-delà de 2 000 articles ; paginer.

### 15-G · Une seule marge (S, priorité 2)
- **Problème** : G1.
- **Résultat** : même produit, même chiffre partout.
- **Écran** : marge en francs d'abord ; un seul pourcentage, nommé (« sur le prix d'achat » ou « sur le prix de vente », question 1), sur la liste, la saisie, la fiche facture, les Rapports et la page.
- **Fichiers** : `Inventaire.tsx`, `NouvelleFacture.tsx`, `NouveauDevis.tsx`, `FactureDetail.tsx`, `Reporting.tsx`, `StockValuation.tsx`, `utils/format.ts`.
- **Tests** : souris 1 000 → 1 500 : même pourcentage sur cinq écrans.
- **Dépend** : question 1. **Risque** : aucun.

### 15-H · Le stock qui dort (S, priorité 7)
- **Problème** : G3.
- **Résultat** : je vois l'argent bloqué dans ce qui ne se vend plus.
- **Écran** : onglet de la page : produit, site, quantité, valeur, dernière vente, dernière entrée, jours sans vente ; seuil 90 jours (question 3) ; tri par valeur.
- **API** : dernière vente par produit et site depuis `mouvements_stock`.
- **Tests** : produit reçu, jamais vendu : listé après le seuil.
- **Dépend** : 15-A. **Risque** : stock antérieur sans mouvement (10-A) ; date d'entrée inconnue affichée « — ».

### 15-I · Préparer la variation de stock pour le comptable (S, après fiche 22)
- **Problème** : B3.
- **Résultat** : le comptable reçoit stock initial, stock final et variation, prêts à saisir.
- **Base** : comptes 31 et 6031 dans `ci-ref-data.sql`. À l'arrêté (15-E) : brouillon d'écriture (31 / 6031), validé par le comptable, jamais automatique.
- **Dépend** : question 10, 03-C, 15-E. **Risque** : double écriture si le comptable la passe aussi.

## 9. Questions pour le propriétaire

1. La marge en pourcentage : « sur le prix d'achat » (le commerçant) ou « sur le prix de vente » (le comptable) ? Proposé : sur l'achat à l'écran du patron, l'autre nommée seulement dans les rapports.
2. Fin d'année : l'ERP donne l'état valorisé seulement, ou aussi l'écriture de variation ? (dépend de la question 10)
3. Stock qui dort : 90 jours pour tous, ou selon le profil (habillement 180, informatique 90) ?
4. Dépréciation d'un article démodé : plus tard, chez le comptable ? Proposé : oui.

**À transmettre.** `CLAUDE.md` : les trois lecteurs ne sont pas unifiés (D1) et `ComptabiliteService` ne lit plus la valeur du stock. 03-B : garder le CMP au centime. 03-K : coût et marge hors taxe pour l'assujetti. 10-B : afficher le dernier prix d'achat à côté du coût moyen. Fiche 12 : l'inventaire ne totalise que les écarts, pas la valeur comptée (utile à 15-E). Fiche 23 : tuile Rapports (15-A), compte de résultat qui oublie le dernier jour (rejoué : 55 000 F du 27 absents au 27).

## Non vérifié

Écart d'inventaire positif quand le CMP change entre comptage et validation (lu : entre au coût du comptage) ; coût d'une annulation de facture (lu : coût figé de la vente) ; transfert depuis une demande ; création à coût 0 par le formulaire (API seulement) ; plus de 1 000 produits à l'export.
