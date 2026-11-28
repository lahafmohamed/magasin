# 07 Vente comptoir et ticket

> **Contre-expertise du 2026-11-25** ([détail](../vagues/vague-1-contre-expertise.md)) : Verdict maintenu, à condition de bâtir le panier commun d'abord. D1 : atteignable par l'API, ou par une coupure réseau. D4 : la quantité géante n'est pas arrêtée par le stock mais par un plafond technique, avec un message en anglais. D7 : en partie voulu. D13 : ouvrir ou fermer la caisse d'une autre boutique est refusé. Les lots en double sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-25, sur la base jetable `nolyx_audit_2`, avec l'interface et l'API réelles. Montants en FCFA.

## 1. Verdict

**Fusionner.** La vente comptoir est le bon point de départ : elle doit absorber « Nouvelle facture » et devenir l'unique écran « Vendre ». **Mais elle ne peut pas être mise chez un commerçant aujourd'hui** : elle ralentit à chaque vente, une coupure réseau fausse la monnaie ou le panier, et un scan peut facturer un autre article.

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Besoin | 5 | 4 | 5 | 5 | 5 | 5 |
| Réponse actuelle | 2 | 2 | 2 | 1 | 2 | 1 |

Informatique : 4, car une partie passe par devis et facture. Grossiste : 1, car ni crédit, ni prix de gros, ni carton.

## 3. Parcours réel

**Par rôle.** Caissier et vendeur ont vendu à l'écran, le gérant par l'API ; l'admin a les mêmes droits dans le code (`routes/factures.ts:22`). Dépôt et lecteur : refusés par l'API (403). Le coût d'achat n'est pas envoyé au caissier.

**Ce qui marche (rejoué).**
- Vente en espèces de 10 000 : stock 158 → 156, caisse +10 000, écritures 53/411, monnaie rendue juste.
- Dernier article vendu par 3 comptes en même temps : 1 vente, 2 refus clairs.
- Double clic : une seule facture. Espèces, caisse fermée : refus clair (409). Vente depuis le dépôt : refusée (422).
- Deux scans à 120 ms d'écart : les deux articles entrent. Un scan prend environ 130 ms.
- Après « Nouvelle vente », le curseur revient dans le champ de scan.

**Gestes** (comptés à l'écran ; nombre de lettres et secondes : **supposés**, hors échange de l'argent).

| Articles | Douchette + souris | Clavier seul | Doigt, mobile 390 |
|---|---|---|---|
| 1 | 3 gestes, ~8 s | ~18 touches, ~15 s | ~8 gestes, ~15 s |
| 3 | 5 gestes, ~12 s | ~35 touches, ~30 s | ~19 gestes, ~35 s |
| 10 | 12 gestes, ~28 s | ~91 touches, ~80 s | ~55 gestes, ~95 s |

- Clavier : il faut 11, 18 puis 39 fois Tab pour atteindre « Encaisser » (1, 3, 10 articles, mesuré). Aucun raccourci ; Entrée à vide ne fait rien.
- Mobile : la page fait 1 660 px pour 3 articles et 2 731 px pour 10, sur un écran de 844. « Encaisser » est à 2 590 px. Ni total visible, ni scan par caméra.
- Repère métier : « moins de 5 gestes » par vente. Tenu à la douchette jusqu'à 3 articles, jamais au téléphone.

**200 ventes par jour ?** Les mains : oui avec une douchette. Le programme : **non**.

| Ventes déjà faites au « Client comptoir » | 83 | 183 | 283 | 383 | 487 | 651 | 754 |
|---|---|---|---|---|---|---|---|
| Temps serveur par vente (médiane, ms) | 102 | 246 | 367 | 441 | 631 | 910 | 870 |

Pour un client nommé (environ 25 factures), au même moment : **30 ms**. Trois comptes en même temps : 0,9 s, 1,7 s, 2,8 s, car ils font la queue (entre deux magasins aussi, déduit du code : même client). Quelques mesures ont été prises pendant d'autres essais. Extrapolation (non mesurée) : environ 7 s par vente après un mois à 200 ventes par jour, 20 s après trois mois.

**Après la vente.** Le caissier ne peut rien corriger : annuler, supprimer le paiement, créer un retour → 403. Le gérant ne peut pas annuler une facture payée (409) ; il doit enchaîner **cinq actions** : retour, approbation, avoir, validation, remboursement. Le résultat est juste (stock 129 → 130, caisse −5 000), mais irréaliste avec un client devant soi.

## 4. Défauts prouvés

### Argent et stock

| N° | Fait | Preuve |
|---|---|---|
| D1 | **Même vente envoyée 3 fois ensemble : 3 factures, 3 sorties de stock, 1 seul paiement**, et le serveur répond trois fois « payés en espèces » | FAC-2026-00203, 204, 205 ; câble 45 → 42 ; 204 et 205 « en attente », 0 paiement. `VenteComptoirService.ts:72` contrôle avant la transaction ; `PaiementService.ts:183` rend « déjà fait » et `VenteComptoirService.ts:131` l'ignore |
| D2 | **Réponse perdue puis nouvel essai : « Monnaie à rendre 0 » pour 5 000 payés avec 10 000** | FAC-00631, capture `vc-rejeu-monnaie-0.png` ; `VenteComptoirService.ts:221` |
| D3 | **Réponse perdue, on ajoute un article, on réessaie** : écran 8 500, vente enregistrée 5 000, l'article ajouté n'est jamais facturé | FAC-00699 ; câble 42 → 42 ; la clé ne change pas avec le panier (`VenteComptoir.tsx:110,251`) |
| D4 | **Scan tombé ailleurs.** Après un clic sur « + », scanner un câble (3 500) ajoute un riz (15 500). Dans la case quantité : 32 000 000 000 022 pièces (bloqué ensuite par le stock). Dans « Espèces reçues » (code à 8 chiffres) : vente validée, **monnaie à rendre 96 380 074**. Pendant la fenêtre « Vente enregistrée » : l'article scanné est perdu sans bruit | FAC-00975 ; `vc-scan-dans-quantite.png`, `vc-ean8-recu.png` |
| D5 | **Vente d'un article absent du magasin.** Si le produit n'a pas de ligne de stock dans la boutique, le stock global sert de repli : 3 pièces vendues à Yopougon, aucun emplacement débité ; la vente suivante efface la sortie (10 → 7 → 9). À l'écran : remplir le panier puis changer de magasin ; l'écran dit « la vente sera refusée », elle passe | FAC-00206, FAC-00905, `vc-change-magasin.png` ; `FactureService.ts:375,495` |
| D6 | **Prix libre par l'API** : portable à 595 000 vendu 1 F par un caissier, 1 000 F par un vendeur (achat 450 000). Aucun contrôle, aucune alerte | FAC-00208, 209 ; `schemas.ts:210` |
| D7 | **Client avec acompte** : acompte de 3 000, achat de 5 000 au comptoir → refusé (« dépasse le reste dû (2000) ») ; avec 2 000 → refusé aussi. Autre client : la vente consomme son acompte (3 000 → 0) pour une vieille facture, sans le demander | clients 14 et 2 (acompte passé sur FAC-00014) ; `FactureService.ts:593` |
| D8 | **Wave, carte… caisse fermée : vente acceptée sans mouvement de caisse ni écriture de trésorerie**, sans avertissement. Le soir, cet argent manque au rapprochement | paiement 169 : session vide, 0 écriture ; `PaiementService.ts:322` |
| D9 | Carte enregistrée au compte 53 (espèces). Prix 4 999,5 accepté : la caisse attend 10 432 699,50 | FAC-00212, FAC-00210 |

**Cause de la lenteur (D10).** Chaque vente remet à zéro puis réécrit une par une **toutes** les factures du client comptoir, deux fois (`FactureService.ts:593`, `PaiementService.ts:352`, `ClientAllocationService.ts:269,367`). Pour 950 factures, PostgreSQL compte 1 166 689 lignes de facture réécrites et une table de 57 Mo.

### Blocage

- D11. Ni crédit, ni paiement partiel (422), ni remise, ni prix modifiable, ni mise en attente à l'écran. Paiement mélangé : accepté par l'API (4 000 espèces + 6 000 Wave), absent de l'écran.
- D12. Panier perdu en changeant de page, sans avertissement (1 ligne → 0).
- D13. Le vendeur affecté à Yopougon seulement voit « Boutique Audit » par défaut, et les deux magasins : il vend sur le stock et la caisse d'une autre boutique. L'API ne contrôle pas l'affectation.
- D14. Client neuf : aucun magasin de caisse, donc aucune vente en espèces (voir cadrage).

### Gêne

- D15. « cable » et « ecran » : 0 résultat (accents exigés).
- D16. Article épuisé : « Aucun produit ne correspond ». Le caissier ne sait pas si le code est inconnu ou le stock vide.
- D17. Référence mobile money non saisissable ; la même référence passe deux fois (FAC-00977, 978). Moov absent ; « Mobile Money » fait doublon avec Orange et MTN.
- D18. Ticket : coupé en 58 mm (`ticket58.png`) ; pas de référence Wave, pas de nom de boutique ni d'adresse propre à chaque magasin, articles dans un autre ordre que la saisie ; à la réimpression, plus d'espèces reçues ni de monnaie, et pas de mention « duplicata ».
- D19. Hors ligne : « Serveur injoignable », sans dire si la vente est enregistrée.
- D20. Boutons de 36 px sur ordinateur et dans les lignes sur mobile.

**Imprimante en panne** : la vente est gardée, réimpression possible depuis la facture. Sans réglage du navigateur, chaque ticket ouvre la boîte d'impression de Windows (non testé sur vraie imprimante).

## 5. Comparaison

Source : [faits/concurrents.md](../faits/concurrents.md).

| Sujet | Eux | Nous |
|---|---|---|
| Attente | Odoo, Loyverse : plusieurs tickets ouverts, nommés | Rien, panier perdu |
| Paiement mélangé | Ma Caisse : espèces, mobile money ou mixte | API seulement |
| Remise et prix | Odoo : droit « Price Control » ; Loyverse : accord du responsable par code PIN | Rien à l'écran, tout permis par l'API |
| Crédit | Odoo : compte client, le plafond avertit sans bloquer ; Sage : contrôle d'encours | Rien au comptoir ; ailleurs, notre plafond bloque vraiment |
| Coupure | Odoo garde la vente mais interdit de recharger ; Loyverse vend hors ligne | Rien, et résultats faux (D2, D3) |
| Échange | Odoo : remboursement depuis la vente | Cinq actions du gérant |
| Ticket | Loyverse : Bluetooth, USB ; Ma Caisse : Bluetooth ou PDF | 80 mm par navigateur, propre |
| Arrondi | Odoo, Loyverse : pas de 5 F, espèces seules | Demi-franc accepté |

**Nos avantages réels** : facture, stock, caisse et comptabilité en une seule opération ; pas de prix par poste ; français ; caisse Sage 100 retirée selon son forum. **À battre** : le cahier, plus rapide que nous au téléphone.

## 6. Manques par profil

| Manque | Général | Informatique | Habillement | Alim./grossiste | Verdict |
|---|---|---|---|---|---|
| Paiement mélangé, partiel, à crédit | ● | ● | ● | ●● | Premier mois |
| Remise et prix négocié avec plancher | ● | ● | ●● | ●● | Premier mois |
| Ticket en attente | ● | | ● | ●● | Premier mois |
| Échange ou annulation immédiate | ● | ● | ●● | ● | Premier mois |
| Scan par caméra, favoris tactiles (article sans code) | ● | | ● | ●● | Premier mois |
| Carton / pièce, prix de gros | | | | ●● | Premier mois (socle : fiche 10) |
| N° de série et garantie sur le ticket | | ●● | | | Premier mois (socle : fiche 10) |
| Prestation sans stock (installation, réparation) | ● | ●● | | | Premier mois (fiche 10) |
| Quantité décimale (vrac au kilo) | | | | ? | Plus tard, voir questions |
| Fidélité, promotions, afficheur client, badge | | | | | Plus tard |

**Les trois entrées de vente.** Recommandation : **un écran « Vendre »** qui finit de quatre façons : encaisser, encaisser une partie (reste à crédit), mettre en attente, enregistrer en devis. « Nouvelle facture » disparaît ; l'impression A4 devient un choix après la vente. « Devis » reste une liste à part : ce n'est pas une vente, mais on le crée et on le solde depuis « Vendre ».

| Profil | Menu | Dans « Vendre » |
|---|---|---|
| Habillement | Vendre | Favoris, échange ; devis caché |
| Alimentaire / grossiste | Vendre | Carton/pièce, client et crédit visibles |
| Informatique | Vendre, Devis | Série, garantie, facture A4 |
| Général | Vendre, Devis | Tout, replié |

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA.** Prix affichés TTC au comptoir, toujours. Client assujetti : code de taxe figé par ligne au moment de la vente ; le ticket ajoute HT, TVA, TTC par taux. Non assujetti : aucune ligne, aucun mot. Le calcul est un chantier commun (fiches 03, 10, 25).
- **FNE.** Choix vente par vente, après l'encaissement (« Facture normalisée ? »). À prévoir : type de client, NCC, téléphone à 10 chiffres, remise de ligne en %, un mode principal (l'API FNE n'en accepte qu'un), numéro certifié et QR sur le ticket. La validité d'une FNE en 80 mm n'est pas vérifiée.
- **Mobile money.** Le client scanne le QR affiché, le vendeur saisit. À l'écran : opérateur en un geste (Wave, Orange, MTN, **Moov**), bouton « Argent reçu, vérifié sur le téléphone du magasin », et **référence facultative** (les 4 derniers chiffres du numéro ou la référence du SMS). L'exiger ralentirait la file ; un réglage peut la rendre obligatoire au-dessus d'un montant. Pour le soir : total et nombre par opérateur, liste des ventes sans référence, alerte si une référence a déjà servi. Garder la place d'un futur statut « confirmé par l'opérateur ».
- **WhatsApp.** Bouton `wa.me` après la vente : boutique, numéro, articles, total, monnaie. Lien vers le document plus tard, avec un lien public sécurisé (fiche 27).

## 8. Lots

Ordre du cadrage. Chaque lot : tests serveur vitest avec base, tests écran, vérification au navigateur.

### 07-A — Une vente ne s'enregistre qu'une fois (S)
- **Problème** : D1, D2, D3, D19. **Résultat** : quelle que soit la coupure, une vente, la bonne monnaie, le bon panier.
- **Écran** : `VenteComptoir.tsx`. **Base** (prochaine migration + `ci-baseline.sql`) : `factures.cle_vente` unique, `empreinte_vente`, `especes_recues`, `monnaie_rendue`.
- **API** : `GET /factures/comptoir/:cle` (existe ou non).
- **Fichiers** : `VenteComptoirService.ts`, `FactureService.ts`, `routes/factures.ts`, `schemas.ts`, `api.ts`.
- **Étapes** : écrire la clé sur la facture dans la transaction ; conflit d'unicité → annuler et renvoyer la vente existante avec sa vraie monnaie ; même clé et panier différent → 409 « Vente FAC-… déjà enregistrée pour 5 000 » ; un paiement « déjà fait » dans une nouvelle facture lève une erreur ; après une erreur réseau, l'écran interroge la clé avant de rendre le panier modifiable.
- **Tests** : 3 envois simultanés ; rejeu ; panier modifié ; réponse perdue.
- **Fini quand** : D1 à D3 rejoués donnent 1 facture, la monnaie juste et un message clair.
- **Dépend de** : rien. **Risque** : clé vide pour les autres ventes (index partiel).

### 07-B — Vente comptoir à vitesse constante, acompte respecté (M)
- **Problème** : D7, D10. **Résultat** : moins de 150 ms, le premier jour comme dans un an ; un client avec acompte achète normalement.
- **Fichiers** : `FactureService.ts:593`, `PaiementService.ts:280-357`, `ClientAllocationService.ts`, `VenteComptoirService.ts`.
- **Étapes** : vente payée en entier → pas de recalcul du compte (le trigger `update_facture_payment_status` pose déjà le payé et le statut) ; solde du client ajusté par différence ; jamais d'acompte consommé ; pour les autres chemins, recalcul limité aux factures ouvertes ou touchées, en une seule requête ; option « utiliser l'acompte » proposée à l'écran.
- **Tests** : 5 000 factures au client comptoir ; 3 caisses simultanées ; acompte présent ; tests E1 existants inchangés.
- **Fini quand** : médiane < 150 ms à 5 000 factures et aucune facture ancienne réécrite.
- **Dépend de** : accord avec la fiche 04 (même moteur). **Risque** : fort, cœur des soldes ; comparer les soldes avant et après sur une copie.

### 07-C — On ne vend que ce que le magasin possède (S)
- **Problème** : D5, D16. **Résultat** : plus de sortie de stock invisible.
- **Fichiers** : `FactureService.ts:370-560`, `VenteComptoir.tsx`, `ProduitService.ts:searchFuzzy`, `api.ts` (`ventesService`).
- **Étapes** : un produit sans ligne dans l'emplacement y vaut 0 ; migration qui crée les lignes manquantes au magasin principal pour les produits sans aucune ligne ; « Encaisser » bloqué si une quantité dépasse ; changer de magasin recontrôle le panier ; article épuisé affiché « Rupture ici, 12 à Vridi » ; script de contrôle listant les produits où le total diffère de la somme des emplacements.
- **Tests** : vente sans ligne → 422 ; somme = total après chaque vente.
- **Fini quand** : D5 refusé par l'API et l'écran. **Dépend de** : fiche 10. **Risque** : ventes refusées sur un stock mal réparti ; prévoir la liste avant mise à jour.

### 07-D — Le scan arrive toujours au panier (S)
- **Problème** : D4. **Résultat** : on scanne sans regarder l'écran.
- **Fichiers** : nouveau `hooks/useScanner.ts`, `VenteComptoir.tsx`, `ProductCombobox.tsx`, `MoneyInput`, `NumericField`.
- **Étapes** : détecter une rafale (au moins 6 caractères, moins de 50 ms entre deux, puis Entrée) partout sur la page et l'envoyer à l'ajout ; remplacer la fenêtre « Vente enregistrée » par un panneau qui disparaît au premier scan suivant ; curseur rendu au scan après « + », « − », billet ou mode ; quantité plafonnée au stock ; espèces reçues supérieures à 10 fois le total : confirmation ; bip et message pour un code inconnu.
- **Tests** : les quatre cas de D4. **Fini quand** : chacun ajoute le bon article. **Dépend de** : rien. **Risque** : frappe humaine très rapide ; seuil réglable.

### 07-E — Prix, remise et plancher contrôlés par le serveur (M)
- **Problème** : D6, D9 (demi-franc), D11. **Résultat** : négocier sans vendre à perte par erreur ou par fraude.
- **Base** : `produits.prix_plancher` (fiche 10), `remise_max_pct` par rôle, table `autorisations_vente` (qui, qui a accordé, ligne, ancien prix, nouveau prix).
- **API** : prix catalogue relu par le serveur ; écart refusé hors droit (403 `PRIX_NON_AUTORISE`) ; accord d'un gérant par code PIN ; montants entiers.
- **Fichiers** : `schemas.ts`, `VenteComptoirService.ts`, `FactureService.ts`, `VenteComptoir.tsx`.
- **Écran** : toucher le prix d'une ligne → prix ou remise ; remise sur le total, répartie sur les lignes.
- **Tests** : caissier à 1 F refusé ; gérant accepté et journalisé ; 4 999,5 refusé.
- **Fini quand** : aucune vente sous le plancher sans accord tracé. **Dépend de** : fiches 10, 24 (PIN). **Risque** : catalogue sans plancher → règle « jamais sous le coût ».

### 07-F — L'argent non espèces est toujours compté (S)
- **Problème** : D8, D9 (carte), D17. **Résultat** : le soir, chaque opérateur se rapproche.
- **Étapes** : toute vente comptoir exige une caisse ouverte, quel que soit le mode ; compte par mode (espèces, mobile money, banque pour la carte) ; ajouter `moov_money`, masquer « Mobile Money » à la saisie ; champ référence facultatif, seuil réglable ; avertir si une référence a déjà servi en 24 h ; aperçu de clôture : total et nombre par opérateur, ventes sans référence.
- **Fichiers** : `PaiementService.ts:235,322`, `CaisseMagasinService.ts:564`, `paymentMethods.ts`, `paymentMethod.ts`, contraintes CHECK (migration), `VenteComptoir.tsx`.
- **Tests** : Wave caisse fermée → 409 ; écriture par mode ; Moov de bout en bout.
- **Fini quand** : somme des ventes = somme des mouvements, par mode. **Dépend de** : fiche 08. **Risque** : anciennes lignes `mobile_money` à garder lisibles.

### 07-G — Chacun vend dans son magasin (S)
- **Problème** : D13, D14. **Résultat** : le vendeur de Yopougon ne choisit rien.
- **Étapes** : `GET /produits/ventes/locations` filtré par affectation ; défaut = magasin de l'utilisateur, mémorisé ; refus API hors affectation (gérant et admin exemptés) ; magasin unique : champ absent.
- **Fichiers** : `ProduitController.ts:113`, `StockMagasinService.ts:120`, `useSalesStock.ts`, deux tables d'affectation à unifier (fiche 13).
- **Tests** : vendeur affecté à 4 → 403 sur 1. **Fini quand** : D13 corrigé. **Dépend de** : fiches 08, 13. **Risque** : utilisateur sans affectation → message vers le gérant.

### 07-H — Un seul écran « Vendre » (L)
- **Problème** : trois entrées ; D11. **Résultat** : même écran pour payer, payer en partie, vendre à crédit, faire un devis.
- **Étapes** : renommer `/vente-comptoir` en `/vendre` (redirections) ; plusieurs modes avec reste à payer calculé ; « Reste à crédit » (client nommé obligatoire, plafond vérifié, échéance) ; « Enregistrer en devis » et « Reprendre un devis » ; supprimer `NouvelleFacture.tsx` et l'entrée « Nouvelle facture » ; présentation par profil (section 6) ; facture A4 après la vente.
- **Fichiers** : `VenteComptoir.tsx`, `VenteComptoirService.ts`, `schemas.ts:202`, `routeAccess.ts`, `navConfig.tsx`, `profilsActivite.ts`, `useVenteParDefaut.ts`, `useKeyboardShortcuts.ts`.
- **API** : `POST /factures/comptoir` accepte un paiement inférieur au total avec `credit: true`.
- **Tests** : 4 issues × 4 profils ; plafond dépassé ; espèces 4 000 + Wave 6 000.
- **Fini quand** : aucune fonction de l'ancienne page ne manque et un seul lien de vente existe. **Dépend de** : A, B, E, F ; fiches 01, 03, 04, 06. **Risque** : régression de la facture ; garder l'ancienne page cachée une version.

### 07-I — Panier gardé et tickets en attente (M)
- **Problème** : D12, D11. **Résultat** : le client qui retourne chercher un article ne bloque plus la file ; rien ne se perd.
- **Étapes** : panier sauvegardé sur le poste à chaque changement (lecture protégée) ; bouton « Mettre en attente », nom facultatif ; table `ventes_en_attente` par magasin, reprise sur un autre poste, sans réservation de stock ; purge et liste à la clôture.
- **Fichiers** : `VenteComptoir.tsx`, nouveau service et route, migration.
- **Tests** : rechargement, deux postes, stock vendu entre-temps. **Fini quand** : 3 tickets en attente repris dans le désordre. **Dépend de** : A, H. **Risque** : prix changé entre-temps → prévenir.

### 07-J — Annuler ou échanger tout de suite (M)
- **Problème** : section 3, cinq actions. **Résultat** : échange de taille en moins d'une minute.
- **Étapes** : depuis « Dernières ventes » ou le scan du numéro du ticket (code-barres) : « Annuler la vente » (même session, caissier avec accord du gérant) et « Échanger » (lignes rendues, lignes prises, complément ou remboursement) ; une transaction qui appelle les services retour, avoir et remboursement existants ; état « à remettre en rayon » ou « défectueux ».
- **Fichiers** : nouveau `EchangeService.ts`, `ReturnService.ts`, `CreditNoteService.ts`, `VenteComptoir.tsx`.
- **Tests** : stock, caisse et écritures nets ; session fermée ; double annulation ; vente Wave.
- **Fini quand** : une erreur se corrige en 3 gestes, tracée. **Dépend de** : E (accord), fiche 05. **Risque** : fraude à l'annulation → motif obligatoire, visible à la clôture.

### 07-K — Ticket complet et prêt pour TVA, FNE, WhatsApp (M)
- **Problème** : D18, D2. **Résultat** : un ticket lisible, sur papier ou téléphone.
- **Étapes** : réglage par poste 58 ou 80 mm ; nom, adresse, téléphone du magasin ; articles dans l'ordre ; référence, 4 derniers chiffres ; espèces reçues et monnaie relues (lot A) ; « Duplicata » ; code-barres du numéro ; reste dû ; série et garantie si présents ; blocs TVA et FNE (numéro, QR) imprimés seulement si renseignés ; bouton `wa.me` ; aide « imprimer sans fenêtre » (mode kiosque du navigateur) ; logo chargé avant impression.
- **Fichiers** : `ticket.ts`, `print.ts`, `FactureService.ts:getById` (tri des lignes), `CompanySettings.tsx`, migration (colonnes d'emplacement).
- **Tests** : rendu 58/80, non assujetti sans le mot TVA, duplicata. **Fini quand** : testé sur deux vraies imprimantes. **Dépend de** : A ; fiches 25, 27. **Risque** : pilotes d'impression.

### 07-L — Rapide au clavier et au téléphone (M)
- **Problème** : section 3, D15, D20. **Résultat** : moins de 5 gestes pour 1 article au téléphone.
- **Étapes** : mobile : barre fixe en bas (total, « Encaisser ») et ligne sur une rangée ; scan par caméra (`BarcodeDetector`, repli sur une bibliothèque) ; grille de favoris par magasin ; recherche sans accents (`unaccent`) ; clavier : Entrée à vide → encaissement, touches de fonction pour les modes, « 3* » avant un scan pour la quantité ; cibles de 44 px.
- **Fichiers** : `VenteComptoir.tsx`, `ProductCombobox.tsx`, `ProduitService.ts:486-600`, migration (`unaccent`, favoris).
- **Tests** : « cable » trouve « Câble » ; Tab ≤ 3 jusqu'à « Encaisser » ; axe sans erreur grave.
- **Fini quand** : vente de 3 articles en ≤ 12 gestes sur Android d'entrée de gamme. **Dépend de** : D, H ; fiche 29 (hors ligne). **Risque** : caméra refusée sans HTTPS.

## 9. Questions pour le propriétaire

1. Le vrac (riz, sucre, huile au kilo ou au litre) fait-il partie de la cible ? Si oui, les quantités entières bloquent toute la base.
2. Jusqu'où un vendeur peut-il baisser un prix sans accord : rien, un pourcentage, ou jusqu'au plancher ?
3. Une seule caisse par magasin pour tous les vendeurs, ou un tiroir par caissier ? Aujourd'hui, un écart n'appartient à personne.
4. Référence mobile money : facultative partout, ou obligatoire au-dessus d'un montant (proposé : 50 000) ?
5. La vente à crédit au comptoir : le vendeur peut-il l'accorder seul dans la limite du plafond ?
6. Vente en rupture affichée mais présente en rayon (stock mal saisi) : refuser toujours, ou permettre au gérant de forcer ?

**Non vérifié** : vraie douchette, vraie imprimante, tiroir-caisse, Android réel ; temps humains (estimés) ; lenteur au-delà de 790 ventes (extrapolée) ; attentes des commerçants (aucun interrogé).
