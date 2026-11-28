# 10 · Produits, prix, codes-barres

> **Contre-expertise du 2026-11-25** ([détail](../vagues/vague-1-contre-expertise.md)) : Verdict maintenu. D8 : les mouvements incohérents ne passent que par l'API, et l'auteur est bien dans le journal d'audit. D12 : seulement au-delà de 20 articles ressemblants. D1 est plus grave qu'écrit : un seul magasin suffit. Lot 10-A : la reprise doit suivre les mouvements. Lot 10-B : le coût doit être par emplacement. Les lots en double sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-25, banc n° 1 (base `nolyx_audit_1`, 23 produits, plus 2 000 créés par l'API).

## 1. Verdict

**Améliorer, en profondeur.** C'est le socle de tout l'ERP et sa base est saine, mais le stock peut disparaître, le coût se fausse tout seul, la fiche refuse un produit sans catégorie, et il n'existe ni carton/pièce, ni prix de gros, ni import Excel.

## 2. Utilité

| Profil ou taille | Utilité du besoin | Réponse actuelle |
|---|---|---|
| Général | 5 | 2 |
| Informatique | 5 | 2 |
| Habillement | 5 | 2 |
| Alimentaire / grossiste | 5 | **1** |
| Un magasin | 5 | 2 |
| Plusieurs sites | 5 | **1** (stock faux entre sites) |

## 3. Parcours réel

| Rôle | Ce qui marche | Ce qui bloque |
|---|---|---|
| Admin, gérant | Liste triée, filtres, marge, ajustement avec motif et aperçu, historique | Création sans catégorie refusée, export tronqué, aucun import |
| Vendeur | Voit prix et stock de son magasin, cherche, vend | Change le prix sans limite ; la recherche ne trouve pas tout |
| Caissier | Vend, consulte sur mobile | Reçoit le prix d'achat par le réseau |
| Dépôt | Ne voit aucun montant (vérifié) | Modifie le stock de n'importe quel magasin |
| Lecteur | Lecture seule (403 sur toute écriture) | Reçoit aussi le prix d'achat |

**Créer un produit** : 11 champs, 3 marqués obligatoires, 4 en réalité.

**Ce qui tient** :
- 8 retraits simultanés de 10 sur un stock de 45 : 4 acceptés, 4 refusés, stock final 5, jamais négatif.
- Double clic sur « Ajuster » : un seul mouvement.
- Code-barres en double : refusé, message clair.
- 2 036 produits : page en 0,9 s, API en 40 ms.
- Mobile 390 : lisible.

**Réponses aux questions posées**

| Question | Réponse |
|---|---|
| Carton, paquet et pièce du même article ? | **Non.** Un prix, un code, une quantité entière par produit. Il faut deux produits et deux ajustements à la main. Essai : ouvrir un sac de riz fait perdre 13 423 F de valeur, et les 25 kg n'arrivent nulle part (D1) |
| Vente au kilo ? | **Non.** 0,5 refusé partout. 20 colonnes de quantité sont entières |
| Prix gros, demi-gros, par quantité, par client ? | **Rien.** Aucune table ni champ |
| Un produit par taille, vivable ? | Oui jusqu'à une vingtaine de modèles, **non au-delà** : 24 fiches pour un t-shirt, et la recherche n'en montre que 20 |
| Séries et garantie ? | Remettre **une forme minimale** : le numéro saisi à la vente, imprimé, retrouvable. Pas de stock par numéro |
| Lots et péremption ? | **Plus tard.** Une alerte sur date saisie à la réception suffira |
| 2 000 articles Excel ? | **Non.** Aucun import. À la main : environ 22 h à 40 s la fiche (estimation). Par script : au moins 1 h, limite de 500 requêtes par quart d'heure (`server.ts:76`) |
| Prix plancher, historique ? | Ni l'un ni l'autre |

## 4. Défauts prouvés

### Argent et stock

| N° | Constat | Preuve |
|---|---|---|
| D1 | **Stock fantôme.** Produit créé à 0 (valeur par défaut), puis « Ajuster le stock » : la quantité n'entre dans **aucun emplacement**. La réception suivante l'efface | 0 → +10 au dépôt → liste 0, dépôt vide, vendeur de MAG-1 voit 10. Vente 3 à MAG-1 acceptée. +5. Réception de 20 : total **20 au lieu de 32**. 12 pièces effacées sans mouvement. Transfert des 10 du dépôt : 409, « 0 disponible ». `StockCostingService.ts:198-226` |
| D2 | **On vend dans un magasin ce qui est au dépôt**, sans sortir le stock | 10 au dépôt, 0 à MAG-1. Vente 3 à MAG-1 : **201**. Total 7, dépôt toujours 10. Puis +1 au dépôt : total 11 au lieu de 8. Les 3 vendues réapparaissent. `FactureService.ts:375` et `:494-505`. Même repli dans `BonLivraisonService.ts:465, 538, 775` (non rejoué) |
| D3 | **Corriger un prix d'achat ne corrige rien.** | 20 pièces saisies à 10 000 au lieu de 1 000, corrigé à 1 000. Valeur reste 200 000. Réception de 20 à 1 000 : coût **5 500**, valeur 220 000 (attendu 40 000), marge affichée −72,7 % (capture `10-liste-faute`) |
| D4 | **Prix d'achat oublié à la création** : coût divisé par deux ensuite | 10 pièces à 0, prix complété à 1 000 → valeur 0. Réception 10 à 1 000 → coût **500** |
| D5 | **La fiche écrase le coût** à chaque enregistrement | Changer la description seule : 127 688,89 → 127 689 (arrondi, `Inventaire.tsx:1559`). Fiche ouverte avant une réception : coût 1 200 → 1 000, et la vente suivante gèle 1 000 (`:1646`) |
| D6 | **Supprimer un produit en stock** fait disparaître sa valeur | 10 pièces à 50 000 : valeur 90 333 152 → 89 833 152. Aucun avertissement, aucun mouvement. `BaseService.ts:49` |
| D7 | **Vente à 1 F** | Écran à 135 000 F vendu 1 F **par l'écran du vendeur**, sans alerte (FAC-2026-00209). Par l'API : portable à 595 000 F vendu 1 F par le vendeur (FAC-2026-00202) et le caissier (FAC-2026-00203). Aucun contrôle de coût ni de plancher (`PricingService.ts:26`) |
| D8 | **Mouvements incohérents et sans auteur** | Dépôt, API : « vente +50 » et « perte +5 » **ajoutent** du stock ; −20 au magasin sans motif. `schemas.ts:79`. La table `mouvements_stock` n'a pas de colonne utilisateur : l'historique ne dit jamais qui |
| D9 | Stock initial sans mouvement | Création avec 10 pièces : 0 ligne d'historique (`ProduitService.ts:261-270`) |

### Blocage

| N° | Constat | Preuve |
|---|---|---|
| D10 | **Créer ou modifier un produit sans catégorie échoue toujours** | L'écran envoie `categorie: null`, l'API le refuse (400). Message : « Impossible d'enregistrer le produit. Réessayez. » Le champ n'est pas marqué obligatoire. `Inventaire.tsx:1644, 1659`, `schemas.ts:42, 65`. Capture `10-creation-sans-categorie` |
| D11 | **Export CSV tronqué à 100** | 100 lignes sur 2 036, « Fichier CSV téléchargé ». L'écran demande 1 000, l'API plafonne à 100 (`pagination.ts:18`) |
| D12 | **La recherche de vente ne trouve pas le stock présent** | À MAG-2, « riz », « huile », « lait » : 0 résultat, alors que chaque produit y est en stock. Les 20 premiers sont choisis **avant** le filtre de stock (`api.ts:244`) |
| D13 | La recherche rate accents et noms longs | « cable » : 0 (« Câble » existe). « rj45 » : 0 en vente, trouvé dans la liste. Seuil de ressemblance `ProduitService.ts:545-550` |
| D14 | Référence et code-barres d'un produit supprimé perdus | « Cette référence existe déjà » pour un produit invisible ; aucun écran de restauration ; `PUT` sur un produit supprimé répond 200 |
| D15 | **Le prix d'achat fuit** vers caissier, vendeur et lecteur | `GET /produits`, `/:id`, `/produits/ventes`, `/info-achat`, `/stock-valuation`, `/reorder-suggestions` : 200 avec coût. Le caissier lit la marge totale (31 557 747 F) et le meilleur client. Seul le dépôt est filtré (`roleRedaction.ts:8`) |

### Gêne

- D16 · Scanner dans la fiche (code puis Entrée) **enregistre** le produit à moitié rempli : créé à 0 F d'achat.
- D17 · Référence et nom faits d'espaces acceptés ; `REF`, `ref`, `REF␠` sont trois produits ; `Riz`, `riz`, `RIZ␠` trois catégories ; prix de 1e14 ou stock de 3 milliards : erreur 500.
- D18 · Vendre sous le coût : aucun avertissement (achat 12 000, vente 9 000 accepté).
- D19 · « Informations d'achat » compte deux achats pour une commande non reçue (la commande et sa facture).
- D20 · La caisse annonce « la vente sera refusée », puis l'accepte (FAC-2026-00206, suite de D1).
- D21 · Dans une facture, Tab puis 100 donne **15 500 100** F (à traiter en fiche 03).
- D22 · Journal d'audit : nouveau prix seulement, jamais l'ancien (`old_values: null`).
- D23 · « Inventaire » et « Inventaire physique » se confondent ; les emplacements s'affichent même avec un seul magasin.

## 5. Comparaison

Source : [faits/concurrents.md](../faits/concurrents.md).

| Sujet | Eux | Nous |
|---|---|---|
| Carton / pièce | Odoo : conditionnements avec code propre, choix en caisse non documenté. Sage : absent d'Essentials. Loyverse : démontage manuel, payant | Rien |
| Tarifs gros / quantité | Odoo : listes par client et quantité. Sage : 32 catégories. Loyverse : rien | Rien |
| Taille / couleur | Odoo : variantes. Sage : option. Loyverse : 200 combinaisons | Un produit par taille |
| Série, garantie | Odoo : en caisse, **sans bloquer**. Sage : option | Rien |
| Import | Odoo : test avant import, sans doublon. Loyverse : CSV, 10 000 lignes | Rien |
| Coût caché | Loyverse : droit « voir le coût » | Caché à l'écran, pas dans l'API |

**On fait mieux** : scan sans ambiguïté, codes internes EAN-13, ajustement avec motif et aperçu, dépôt sans montant. **Pour battre Odoo et Sage** : carton et pièce au choix **dans la caisse**, dans un prix unique sans option.

## 6. Manques par profil

| Profil | Premier mois | Plus tard (une ligne) |
|---|---|---|
| Alimentaire / grossiste | Conditionnements, tarifs, vente au poids, plancher | Alerte de péremption ; consignes de bouteilles |
| Habillement | Création en série taille × couleur, recherche par modèle | Prix barré et soldes |
| Informatique | N° de série et garantie sur la vente | Suivi SAV |
| Général | Import Excel, référence automatique, plancher, archivage | Photo du produit (colonnes `image_url` inutilisées) ; formules de prix |

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** : un taux par produit, vide = celui de l'entreprise. Invisible pour un non-assujetti. Prix saisis TTC ou HT : question 4.
- **FNE** : la ligne demande `reference`, `measurementUnit`, code taxe (TVA, TVAB, TVAC, TVAD) et prix HT. Il suffit d'un code taxe et de l'unité sur le produit (lot L).
- **Mobile money** : aucune incidence.
- **WhatsApp** : liste de prix par niveau de tarif à partager. Plus tard.

## 8. Lots proposés

Ordre du cadrage. **10-E se fait le même jour que 10-A** : une heure, et rien ne s'installe sans lui. Prochaine migration libre : `114`. Tout changement de schéma régénère `ci-baseline.sql`.

### 10-A · Une seule vérité du stock (M)
- **Problème** : D1, D2, D9, D20. Deux compteurs (`produits.stock`, `stock_par_location`) et un repli « hérité » qui contourne les emplacements.
- **Résultat** : le stock est toujours quelque part ; on ne vend que ce qui est dans le magasin.
- **Base** : migration `114`. (1) Produit sans ligne avec `stock > 0` : ligne au magasin principal, coût = `prix_achat`, mouvement « Reprise de stock ». (2) Recaler `produits.stock` sur la somme. (3) Trigger refusant toute écriture de `produits.stock` hors `trg_sync_produits_stock` (`pg_trigger_depth`). (4) Contrôle : 0 écart.
- **API** : supprimer le repli dans `StockCostingService`, `FactureService`, `BonLivraisonService`, `ProduitService.searchFuzzy`, `InventaireService` (lire aussi Retour, Demande, Transfert, `StockMagasinService`). Absence de ligne = 0. Création avec stock : passer par `applyStockMovement`, motif « Stock initial ».
- **Tests** : D1 pas à pas (attendu 32) ; vente MAG-1 avec stock au dépôt → 422 ; concurrence ; BL.
- **Fini quand** : `SUM(emplacements) = produits.stock` après la suite complète et la simulation de la base du banc.
- **Dépendances** : aucune. **Risque** : reprise au mauvais emplacement ; lister les produits repris.

### 10-B · Coût d'achat juste et traçable (M)
- **Problème** : D3 à D6, D18.
- **Résultat** : je corrige une faute de coût une fois, et la valeur suit.
- **Écran** : fiche. « Prix d'achat » modifiable jusqu'au premier stock valorisé, puis « Coût moyen » en lecture, et action « Corriger le coût » (gérant, admin) : nouveau coût, motif, aperçu avant/après. Alerte si vente < coût.
- **Base/API** : `PUT /produits/:id` n'accepte plus `prix_achat` quand un emplacement a `cmp > 0` ; `POST /produits/:id/corriger-cout` met `cmp`, `valeur_stock` et `prix_achat` à jour partout, en transaction, avec audit. Produit à coût 0 et stock > 0 : signalé « coût à renseigner ». Envoyer seulement les champs modifiés ; `If-Match` sur `updated_at`, 409 sinon.
- **Suppression** : refusée si stock > 0 (« Archiver » : lot D).
- **Fichiers** : `ProduitService`, `ProduitController`, `schemas.ts`, `Inventaire.tsx`.
- **Tests** : D3, D4, D5 rejoués ; droits ; concurrence.
- **Fini quand** : coût 1 000 et valeur 40 000 sur D3.
- **Dépendances** : 10-A. **Risque** : écriture comptable de l'écart (fiches 15 et 22) ; ici, journal seulement.

### 10-C · Droits, prix plancher, historique des prix (M)
- **Problème** : D7, D8, D15, D22.
- **Résultat** : personne ne vend sous mon prix sans mon accord ; je sais qui a changé un prix ; le coût reste chez moi.
- **Droits proposés** :

| Action | Admin, gérant | Vendeur | Caissier | Dépôt |
|---|---|---|---|---|
| Voir coût et marge | oui | non | non | non |
| Changer le prix catalogue | oui | non | non | non |
| Vendre au-dessus du plancher | oui | oui | oui | – |
| Vendre sous le plancher | oui, motif | accord gérant | accord gérant | – |
| Ajuster un emplacement | tous | non | non | le sien |

- **Base** : `produits.prix_plancher` ; `produit_prix_historique` (produit, champ, ancien, nouveau, utilisateur, origine, date) alimentée par trigger ; `mouvements_stock.utilisateur_id` ; `document_lignes.prix_catalogue`.
- **API** : `redactForRole` retire le coût pour tout rôle autre qu'admin et gérant, sur toutes les routes produit. Contrôle plancher unique dans `PricingService`, appelé par facture, comptoir, devis, BL ; message sans coût. Sans plancher saisi : réglage « plancher = coût moyen ». `stockMovementSchema` : seulement `ajustement` et `perte` (négative), motif obligatoire ; emplacement du dépôt imposé. Nom de l'auteur dans l'historique. Audit avec ancien et nouveau.
- **Fichiers** : `roleRedaction.ts`, contrôleurs produits/ventes, `Inventaire.tsx`, `NouvelleFacture`, `VenteComptoir`.
- **Tests** : matrice rôle × route ; 1 F → 422 ; accord ; « vente +50 » → 400.
- **Fini quand** : aucun coût dans une réponse vendeur, caissier ou lecteur.
- **Dépendances** : 10-A ; la validation ponctuelle du gérant se partage avec la fiche 24. **Risque** : bloquer la négociation ; d'où le plancher.

### 10-D · « Produits » : une page, une fiche, l'archivage (M)
- **Problème** : D14, D19, D23 ; quatre dialogues ; code mort.
- **Résultat** : un produit = une page (prix, stock par emplacement, mouvements, achats, historique).
- **Supprimer** : `PATCH /produits/:id/stock`, `GET /produits/suggestions`, `GET /produits/ventes` (aucun appel du front), `api.ts adjustStock`, colonnes `suivi_lot`, `image_thumbnail`.
- **Écrans** : `/produits` (redirection de `/inventaire`), `/produits/:id` ; filtre « Archivés » ; Archiver / Restaurer. Emplacements masqués si un seul est actif. « Informations d'achat » : uniquement les réceptions.
- **Base** : unicité de référence et de code-barres sur les produits actifs seulement (index partiels, insensibles à la casse).
- **Fichiers** : `Inventaire.tsx` (2 303 lignes, à découper), `routeAccess.ts`, `ProduitController.getPurchaseInfo`.
- **Tests** : redirections, archivage avec stock refusé, code réutilisable, restauration en conflit.
- **Fini quand** : plus de dialogue « Informations d'achat » ni « Historique ».
- **Dépendances** : 10-B. **Risque** : liens et raccourcis.

### 10-E · Créer un produit sans blocage (S)
- **Problème** : D10, D16, D17.
- **Étapes** : accepter `null` en catégorie ; `trim` et longueurs ; plafonds de prix et stock (message français, jamais 500) ; référence facultative, générée `P-00001` par `NumberingService` ; Entrée dans un champ code-barres passe au suivant ; erreur API affichée sous le champ ; catégories rapprochées sans casse ni espaces ; exemples adaptés au profil ; « Enregistrer et créer un autre », « Dupliquer » ; valider un EAN-13 (avertir, ne pas bloquer).
- **Fichiers** : `schemas.ts`, `Inventaire.tsx`, `ProduitService`, `errors.ts`.
- **Tests** : sans catégorie ; douchette ; espaces ; 1e14.
- **Fini quand** : nom et prix suffisent.
- **Dépendances** : aucune. **Risque** : doublons existants avant l'index de 10-D.

### 10-F · Une recherche qui trouve (M)
- **Problème** : D12, D13 ; 20 résultats sur 24 t-shirts.
- **Résultat** : tout article présent dans mon magasin se trouve en deux mots, avec ou sans accent.
- **Base/API** : `unaccent`, index trigramme sur un texte de recherche (nom, référence, catégorie, taille). Règle : tous les mots présents (préfixe) d'abord, ressemblance ensuite ; code et référence exacts en tête. Filtre `stock > 0` **dans** le SQL, avant la limite ; `en_stock=true`. Une seule fonction pour liste, ventes et Ctrl+K ; « Voir plus ».
- **Fichiers** : `ProduitService.searchFuzzy/getAll`, `StockMagasinService`, `api.ts`, `ProductCombobox`.
- **Tests** : jeu de 2 000 noms, les 18 requêtes du banc, MAG-2, < 100 ms.
- **Fini quand** : « cable », « rj45 », « riz » à MAG-2 trouvent.
- **Dépendances** : 10-A. **Risque** : extension `unaccent` sur l'hébergement.

### 10-G · Importer et exporter le catalogue Excel (M)
- **Problème** : D11 ; aucun import.
- **Résultat** : 2 000 articles en moins d'une heure, sans l'éditeur.
- **Écran** : Produits → Importer. Modèle à télécharger ; dépôt `.xlsx` ou `.csv` ; colonnes reconnues, sinon à choisir ; **simulation** (créés, modifiés, erreurs ligne par ligne) ; import ; rapport. Clé = référence, sinon code-barres. Colonnes : référence, nom, catégorie, code-barres, unité, prix achat, vente, gros, plancher, stock, emplacement, minimum, fournisseur.
- **API** : `POST /produits/import` (`simulation`), une transaction, 10 000 lignes, gérant et admin ; stock initial par mouvement ; un réimport met à jour les prix, **jamais le stock** sans case cochée. `GET /produits/export` complet, réutilisable à l'import.
- **Fichiers** : `ImportProduitService`, route hors limite de débit, page d'import.
- **Tests** : 2 000 lignes ; virgule et espaces des montants ; doublons ; réimport sans changement ; annulation totale.
- **Fini quand** : export puis import = 0 changement.
- **Dépendances** : 10-A, 10-E ; unités et tarifs ajoutés par 10-H. **Risque** : paquet `xlsx` (versions, sécurité).

### 10-H · Carton, paquet, pièce et tarifs gros (L, deux étapes livrables)
- **Problème** : section 3. Sans cela le grossiste part.
- **Résultat** : « 2 cartons + 3 bouteilles » sur la même ligne de stock ; le bon prix tout seul.
- **Principe** : le stock reste compté en **plus petite unité entière**. Donc **aucune décomposition** : le carton de 12 vaut 12. Affichage « 19 cartons + 4 ».
- **Base** : `produits.unite` ; `produit_conditionnements` (libellé, `facteur` entier, `code_barre` unique avec les produits, prix de vente, à l'achat/à la vente, défaut) ; `produit_tarifs` (conditionnement, niveau `detail`/`demi_gros`/`gros`, quantité minimale, prix) ; `tiers.niveau_tarif`. `document_lignes`, `commande_lignes`, `reception_lignes`, `facture_fournisseur_lignes`, `bon_livraison_lignes`, `retour_lignes` : `conditionnement_id`, `unite_libelle`, `facteur` (défaut 1) **figés**. La ligne garde quantité et prix **de l'unité vendue** (l'argent ne change pas) ; le stock bouge de quantité × facteur ; `prix_achat_unitaire` = coût × facteur.
- **API** : `resolvePrix(produit, conditionnement, quantité, client)` serveur : plus bas palier atteint, niveau du client, sinon prix du conditionnement. Scan d'un code carton = carton. Plancher par unité de base.
- **Écrans** : fiche (onglets Unités, Prix), sélecteur d'unité partout (comptoir d'abord), niveau sur le contact, tickets et PDF. Masqué sans conditionnement.
- **Étapes** : (1) unités, achat, vente, stock, retours ; (2) tarifs.
- **Tests** : 1 carton reçu, 5 pièces et 1 carton vendus ; coût et marge ; retour d'un carton ; annulation ; palier ; client gros ; scan.
- **Fini quand** : les deux fiches « huile carton » et « huile bouteille » du banc n'en font plus qu'une, au franc près.
- **Dépendances** : 10-A, 10-B, 10-C ; fiches 03, 07, 17. **Risque** : un chemin de stock oublié ; recenser chaque `quantite` avant de coder.

### 10-I · Vente au poids (L)
- **Problème** : 0,5 refusé ; riz, oignons, huile au litre.
- **Résultat** : 1,25 kg à 700 F le kilo, au comptoir.
- **Base** : les 20 colonnes de quantité en `NUMERIC(14,3)`, fonctions et `::int` adaptés ; `produits.vente_decimale` (faux). Entier exigé ailleurs (Zod, `FactureService.ts:370`, `applyStockMovement`).
- **Étapes** : migration ; parseurs et 14 schémas Zod ; champs avec virgule ; étiquettes, ticket ; « arrondi à 5 F » réglable.
- **Tests** : toute la suite ; 3 × 0,333 ; CMP ; inventaire.
- **Fini quand** : un produit normal refuse toujours 1,5.
- **Dépendances** : 10-H. **Risque** : large ; après stabilisation.

### 10-J · Tailles et couleurs en série (M)
- **Problème** : 24 fiches par t-shirt ; XL confondu avec XXL.
- **Résultat** : une saisie, 24 articles ; le modèle une fois en caisse, puis la taille.
- **Base** : `modeles` (nom, catégorie, prix) ; `produits.modele_id`, `taille`, `couleur`. **Le stock reste par produit.**
- **Écrans** : « Créer une série » (tailles × couleurs, quantités en grille, références et EAN-13 créés) ; liste groupée ; grille de stock ; comptoir : modèle puis cases. Prix modifiable pour tout le modèle.
- **Fichiers** : `ProduitService`, `ProductCombobox`, `VenteComptoir`, `Etiquettes`.
- **Tests** : série en une transaction, doublon, échange de taille, étiquettes.
- **Fini quand** : 24 articles en moins d'une minute.
- **Dépendances** : 10-E, 10-F. **Risque** : deux façons de faire ; module masqué hors habillement.

### 10-K · Numéros de série et garantie, version minimale (M)
- **Problème** : séries supprimées ; `garantie_mois` et `suivi_serial` existent, inutilisées.
- **Résultat** : un client revient avec son téléphone, je retrouve la vente et la fin de garantie.
- **Base** : `document_ligne_series` (ligne, numéro ; index).
- **Écrans** : case et mois sur la fiche ; à la vente, n numéros à scanner, **avertir sans bloquer** ; facture et ticket « Garantie 12 mois, jusqu'au … » ; recherche globale par numéro ; retour : numéro vérifié.
- **Fichiers** : `FactureService`, `ReturnService`, PDF, `GlobalSearch`.
- **Tests** : deux unités, doublon, annulation, retour.
- **Fini quand** : scanner un IMEI ouvre la facture.
- **Dépendances** : aucune. **Risque** : en faire un stock par numéro ; refuser.

### 10-L · Taxe et unité prêtes pour la TVA et la FNE (S)
- **Problème** : rien sur le produit.
- **Base** : `produits.taux_tva`, `code_taxe_fne` ; unité : 10-H. Aucun calcul ici : le moteur de prix est dans la fiche 03.
- **Écran** : champ « TVA » seulement si l'entreprise est assujettie ; changement en masse par catégorie ; colonne d'import.
- **Fichiers** : `schemas.ts`, `ProduitService`, fiche.
- **Tests** : non-assujetti, champ absent et taux ignoré.
- **Fini quand** : RME voit zéro champ TVA.
- **Dépendances** : fiche 25 (réglage). **Risque** : `027` impose `tva = 0`.

## 9. Questions pour le propriétaire

1. Plancher non saisi : bloquer sous le **coût moyen**, ou seulement avertir ? Proposé : bloquer vendeur et caissier.
2. La négociation est-elle libre au comptoir, ou bornée par une remise maximale par vendeur ?
3. Combien de niveaux de prix au départ ? Proposé : trois.
4. Prix saisis TTC ou HT pour un assujetti ? Proposé : TTC.
5. Vente au kilo dès le premier client alimentaire ? Sinon 10-I attend.
6. Le personnel dépôt ajuste-t-il le stock, ou compte-t-il seulement ?

## Non vérifié

- Temps de saisie (40 s par fiche) : estimation, aucun commerçant interrogé.
- Repli de stock dans BL et retours : lu, non rejoué.
- Vente à 1 F par le caissier : par l'API seulement (la caisse ne montre pas de champ prix).
- Les 2 000 produits sont générés : ils prouvent le mécanisme de D11 à D13, pas un catalogue réel.
- `nolyx_audit_neuve` : lecture seule (un emplacement, aucun produit).
