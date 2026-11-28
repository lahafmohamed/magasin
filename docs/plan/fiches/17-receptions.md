# 17 Réceptions

> **Contre-expertise du 2026-11-26** ([détail](../vagues/vague-4-contre-expertise.md)) : Verdict maintenu. D1 (réceptions simultanées) : 7 ms de fenêtre, donc API ou renvoi réseau seulement ; le vrai risque à l'écran est D2, deux magasiniers qui saisissent la même livraison partielle. D3 : l'écart gérant / dépôt exige deux lignes du même produit, que l'écran refuse ; le vrai défaut touche tous les rôles : un coût 0 devient « coût inconnu ». D5 : une commande inexistante n'est acceptée qu'à quantités nulles. 17-D devient le parcours « Achat » de la boutique (absorbe 18-G), 17-H se fait en deux étapes, 17-G, 17-I et 17-J plus tard. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-26, sur la base jetable `nolyx_audit_2`, avec l'interface et l'API réelles (dépôt, gérant, admin, vendeur, caissier, lecteur ; 1440 et 390 px). Montants en FCFA. REC = réception. CMP = coût moyen d'achat (le « prix de revient moyen » de l'écran).

## 1. Verdict

**Améliorer.** La base est bonne : réception partielle et reliquat, magasinier qui ne voit aucun prix, coût repris de la commande, coût du dépôt qui suit l'article au transfert. Mais deux validations au même moment font entrer la marchandise plusieurs fois, un article offert gonfle la valeur du stock, une réception ne s'annule pas proprement, et personne ne voit ce qui a été reçu, cassé ou refusé. Le petit commerçant qui achète comptant au marché n'a, lui, aucun chemin court : il lui faut une réception sans commande.

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire boutique / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Besoin | 3 | 5 | 3 | 3 / 5 | 3 | 5 |
| Réponse actuelle | 1 | 3 | 1 | 1 / 2 | 1 | 3 |

- **Grossiste** : camions, cartons, casse, manquants. Réponse 2 : le reliquat marche ; rien pour la casse, le carton (10-H), le transport, la péremption.
- **Informatique** : achats importés, transport et douane à ajouter au coût. Réponse 3 : coût juste à l'entrée, sans frais.
- **Boutique, habillement, général** : achat au marché payé comptant. Réponse 1 : commande obligatoire.
- **Plusieurs sites** : le dépôt reçoit sans voir d'argent. Coût repris à la vente faux (10-B).

## 3. Parcours réel

| Rôle | À l'écran | Ce qui surprend |
|---|---|---|
| Dépôt, 1440 et 390 | Réceptions → « Réceptionner » → quantités pré-remplies au reste → corriger → « Valider » → confirmer : **5 gestes**. Aucun montant, API comprise. Téléphone : cartes lisibles, boutons + et − | Choix entre les **3 emplacements**, deux boutiques comprises, alors qu'il n'est affecté qu'au dépôt. « 48 unités » pour des cartons |
| Gérant | Même écran ; la confirmation donne la valeur (« 11 unités pour 240 000 FCFA ») | Aucun champ coût. Aucune liste des réceptions faites |
| Admin | Pareil ; suppression par l'API seulement | Aucun bouton pour annuler |
| Vendeur, caissier, lecteur | Pas d'écran ; `POST` 403 | L'API leur donne le coût de chaque ligne (`GET /receptions/:id` : `cout_unitaire` 4 000) et la valeur reçue (`/receptions/stats` : 7 861 044) : lot 03-E |

**Ce qui marche (rejoué).** Commande de 43, reçu 38 : la commande reste « Validée », reste 5 ; reliquat : « Livrée ». **Réparation d'octobre confirmée.** Un de trop : 422 qui nomme le produit. Coût de 1 F envoyé par le dépôt : ignoré, 12 000 retenu. Transfert vers MAG-1 : le coût du dépôt suit (10 à 1 000 + 5 à 3 000 = CMP 1 714,29). `CLAUDE.md` (« CMP recalculé à la réception seulement ») est périmé.

**Le camion** (commande 43 cartons ; 40 arrivent, 2 abîmés ; 3 manquent) : 5 gestes, 38 saisis. Mais casse et manquants deviennent un seul « reste 5 ». La note « 2 cartons abîmés refusés, 3 manquants » est enregistrée et **aucun écran ne l'affiche**. Pour dire « ils ne viendront pas », le gérant n'a que « Annuler la commande » : CMD-2026-00014, 16 reçus, passe « Annulée » (200).

**Le magasinier sans prix** reçoit seul ; le coût est celui de la commande (`ReceptionController.ts:65`). À garder.

**Achat au comptant** : commande, validation, réception, facture, paiement : 4 pièces (`phase3-schemas.ts:15`).

## 4. Défauts prouvés

### Argent et stock

| N° | Constat | Preuve | Où |
|---|---|---|---|
| D1 | **Deux validations au même moment font entrer la marchandise plusieurs fois.** Le « reste à recevoir » est lu sans verrouiller la commande | 8 commandes (6 articles × 5), 4 envois simultanés chacune : **30 réceptions au lieu de 8, 150 en stock au lieu de 40** par article : 660 000 F de stock fictif. `ReceptionService.ts:178-221`, aucun `FOR UPDATE` sur la commande | API ; écran si deux postes valident ensemble (rare) |
| D2 | **Une réception partielle saisie deux fois est doublée** | 8 sur 20, deux fois : 201, 201, stock 16. Un deuxième poste ouvert avant la première validation voit encore « Reste 20 ». Pas d'anti-doublon | Écran (deux personnes) et API |
| D3 | **L'article offert gonfle le stock, seulement si le gérant reçoit.** Un coût 0 devient « coût inconnu » | Lait : 10 cartons à 24 000 + 1 offert, reçus **à l'écran** par le gérant. Confirmation « 240 000 FCFA » ; stock **264 000**, CMP 24 000 au lieu de 21 818,18. La même commande reçue par le dépôt donne le bon CMP. `ReceptionService.ts:171-173, 302` | Écran |
| D4 | **Annuler une réception ne rend pas le coût** | 10 à 1 000, puis 10 à 3 000 ; suppression de la seconde : 10 en stock, CMP **2 000**, valeur 20 000 au lieu de 10 000. Stock déjà vendu : `GREATEST(0, …)` efface l'écart sans erreur (`:486-492`). Commande remise « Expédiée » quel que soit son état (`:517`). Aucun contrôle de période | API seulement (admin) |
| D5 | **Réception d'une commande annulée, non validée ou inexistante** | Annulée : 201, +5 écrans (250 000), la commande reste « Annulée ». « En attente » : 201, passe « Livrée ». Commande 999999 : REC-2026-00018 créée | API, dépôt compris |
| D6 | **Commande supprimée, réception orpheline.** `receptions.commande_id` sans clé étrangère | Suppression de la commande 17 : 200 ; REC-2026-00016 reste, sans fournisseur, 5 écrans sans origine. 2 orphelines en base | API (admin) |
| D7 | **Coût de vente = dernier emplacement réceptionné** (déjà signalé, lot 10-B) | MAG-1 10 à 1 000, dépôt 10 à 3 000. Vente à MAG-1 : coût figé **3 000** au lieu de 1 000. Coût vendu + stock restant = 42 000 pour 40 000 achetés | Écran |
| D8 | **La réception efface le stock fantôme** (déjà signalé, lot 10-A) | +10 « Ajuster » au dépôt, puis réception de 20 : **20 au lieu de 30**, 150 000 F disparus ; mouvement « 0 → 20 » juste après « 0 → 10 » | Écran |
| D9 | **Le prix de la facture fournisseur ne corrige jamais le coût** | `FactureFournisseurService.ts` ne lit ni n'écrit `cmp` ou `stock_par_location` (recherche : 0). Le coût reste celui de la commande | Lecture |

### Blocage

| N° | Constat | Preuve |
|---|---|---|
| D10 | **Ce qui a été reçu est invisible** : ni liste, ni fiche, ni note, ni auteur | `receptionService.getAll` et `getById` ne sont appelés nulle part ; le numéro REC n'apparaît que dans le choix « Réception liée » des factures fournisseur |
| D11 | **Ni casse, ni refus, ni surplus** : un seul nombre par ligne | 45 livrés pour 43 commandés : 422 ; les 2 en trop restent hors du stock |
| D12 | **Pas de réception sans commande** | `commande_id` obligatoire ; désactiver le module Commandes supprime aussi les réceptions (fiche 16) |
| D13 | **Le dépôt range dans n'importe quelle boutique** | Liste des 3 emplacements à l'écran ; API : dépôt → MAG-2, 201. Sujet de la fiche 13 |

### Gêne

- Pas de scan (`Receptions.tsx`) ni de lien vers les étiquettes.
- Quantités pré-remplies au reste : on valide sans compter.
- « Unités » pour des cartons (10-H).
- Date toujours « maintenant » ; bon du fournisseur seulement dans la note.
- `ecart` faux (« −38 » sur la réception qui solde) ; `/stats` compte 16 lignes pour 6 réceptions.
- CMP arrondi au centime : 14 399,97 au lieu de 14 400 (fiche 15).
- Facture fournisseur créée d'office : « facturé 43 > reçu 38 » dès la première réception (fiche 16, lot 16-A).

## 5. Comparaison

Source : [faits/concurrents.md](../faits/concurrents.md).

| Sujet | Odoo | Sage | Loyverse | Nous |
|---|---|---|---|---|
| Frais d'approche | Depuis la facture fournisseur, 5 répartitions, après validation [O19] | Non vérifié | Choisis à chaque réception, payant [L13] | Rien |
| Lot, péremption | 4 dates, réception bloquée sans lot [O10] | Option | Rien | Rien |

**Minimum attendu** (hypothèse du fichier) : reçu ≠ commandé, casse, frais répartis, nouveau prix de vente proposé, réception sans commande, étiquettes depuis une réception.

**On fait mieux** : le dépôt ne voit aucun prix, API comprise ; le reliquat suit chaque produit ; le coût du dépôt suit l'article au transfert. **Pour battre Odoo** : les frais de l'arrivage saisis **au moment du déchargement**, en FCFA, gratuitement (Loyverse le fait payer), et l'achat au comptant en un écran.

## 6. Manques par profil

| Profil | Premier mois | Plus tard (une ligne) |
|---|---|---|
| Grossiste | Casse et refus, frais de transport, cartons (10-H), scan ; date de péremption facultative | Lots, sortie « premier périmé » |
| Informatique | Frais d'approche, scan | Numéros de série à l'arrivée (10-K) |
| Habillement | Achat au comptant, scan | Saisie en grille taille × couleur (après 10-J) |
| Général, boutique | Achat au comptant | Photo du bon du fournisseur |

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** (03-K) : coût d'entrée hors taxe si l'entreprise récupère la TVA, taxe comprise sinon ; rien d'affiché pour le non-assujetti.
- **FNE** : la facture certifiée du fournisseur va sur la facture fournisseur (fiche 18) ; la réception garde le numéro du bon (17-E).
- **Mobile money** : achat comptant payé par Wave = mouvement d'argent (08-D, 18).
- **WhatsApp** : manquants et casse envoyés au fournisseur par `wa.me` (03-L).

## 8. Lots proposés

Ordre du cadrage. Prochaine migration : le numéro libre au moment du lot (dernière : `113`). Tout changement de schéma régénère `ci-baseline.sql`. Déjà ailleurs : stock fantôme **10-A**, coût par emplacement à la vente **10-B**, carton **10-H**, prix d'achat caché **03-E**, statuts et « Solder le reste » **16-B**, destination de la commande **16-D**, emplacement de l'utilisateur **fiche 13**.

### 17-A · Une réception n'entre qu'une fois (S)
- **Problème** : D1, D2, D5 (avec 16-B), D6.
- **Résultat** : deux personnes valident le même camion, la marchandise n'entre qu'une fois.
- **API** : dans `ReceptionService.create`, d'abord `SELECT … FROM commandes_fournisseur WHERE id = $1 FOR UPDATE` ; 404 si absente ; statut refusé (409, liste de 16-B) ; 422 si toutes les quantités valent 0 ; anti-doublon par clé (mécanisme du lot 07-A : même clé, même réponse).
- **Base** : clé étrangère `receptions.commande_id` → commande, `ON DELETE RESTRICT`, après la liste des orphelines (jamais supprimées).
- **Écran** : clé créée à l'ouverture du formulaire ; sur 409, relire « Déjà reçu » (déjà fait pour `OVER_RECEIPT`).
- **Fichiers** : `ReceptionService.ts`, `Receptions.tsx`, migration.
- **Tests** : course D1 (4 envois × 8 commandes) → 8 réceptions, 40 par article ; double envoi → une réception ; commande annulée → 409, stock inchangé ; supprimer une commande reçue → refus.
- **Fini quand** : la course donne 40. **Dépend** : 07-A, 16-B. **Risque** : orphelines chez un client : les rattacher à la main.

### 17-B · Le coût d'entrée ne dépend pas de qui reçoit (S)
- **Problème** : D3 ; le gérant ne peut pas corriger un prix faux à l'arrivée.
- **Résultat** : l'article offert baisse mon coût moyen ; même chiffre que je reçoive ou que le dépôt reçoive.
- **API** : coût de ligne = prix pondéré du produit sur la commande, pour tous les rôles ; un 0 est un vrai 0. `costedStockIn` distingue `null` (inconnu) et `0` (gratuit). Le gérant peut envoyer un autre coût.
- **Écran** : gérant seulement, colonne « Coût unitaire » pré-remplie et modifiable, aperçu « CMP 24 000 → 21 818 ».
- **Fichiers** : `ReceptionService.ts:159-174, 302`, `StockCostingService.ts:56-75`, `Receptions.tsx`.
- **Tests** : D3 → 21 818,18 et 240 000, par le gérant comme par le dépôt ; coût envoyé par le dépôt ignoré.
- **Fini quand** : la confirmation et le stock donnent la même valeur. **Dépend** : aucun. **Risque** : retours et ajustements passent aussi par `costedStockIn` : ils gardent `null`.

### 17-C · Annuler ou corriger une réception (M)
- **Problème** : D4 ; aucune correction à l'écran.
- **Résultat** : une erreur de saisie se répare ; stock et valeur reviennent au centime.
- **Écran** : sur la fiche réception (17-E), « Annuler la réception » et « Corriger une quantité » (en moins), gérant et admin, motif obligatoire, aperçu stock et valeur avant/après.
- **API** : `POST /receptions/:id/annuler` remplace `DELETE`. Verrou du stock ; 409 si l'emplacement n'a plus la quantité (« 7 déjà vendus : faites un retour fournisseur ») ; valeur − quantité × coût de la ligne, CMP = valeur ÷ quantité ; mouvement tracé ; statut de commande recalculé, jamais rouvert si annulée ; période vérifiée ; refus si une facture liée est payée.
- **Base** : `receptions.statut`, `annule_par`, `motif` ; on ne supprime plus.
- **Tests** : D4 → CMP 1 000, valeur 10 000 ; stock vendu → 409 ; période close → 409.
- **Fini quand** : aucune route ne supprime une réception. **Dépend** : 17-A, 17-E. **Risque** : vente entre-temps ; la formule par la valeur reste juste.

### 17-D · Réception sans commande, achat au comptant (M)
- **Problème** : D12 ; 4 pièces pour 10 sacs de riz achetés au marché.
- **Résultat** : « 10 sacs à 13 500 chez Diallo, payés en espèces » en un écran.
- **Écran** : « Achat direct » (gérant, admin ; caissier selon question 5) : fournisseur ou « Fournisseur divers », produits (recherche, scan), quantité, coût, emplacement, payé maintenant (mode, caisse) ou à crédit.
- **API** : `POST /achats/direct`, une transaction : réception sans commande (`commande_id` facultatif), facture fournisseur, paiement selon les règles de la fiche 18 et du lot 08-D.
- **Tests** : espèces → stock +10, CMP juste, tiroir −135 000, rien dû ; à crédit → dette fournisseur de 135 000.
- **Fini quand** : l'achat au marché tient en un écran. **Dépend** : 17-A, 17-B, fiche 18 (paiement avec mouvement d'argent). **Risque** : doublon avec « dépense marchandise » (fiche 09) : la dépense renvoie ici.

### 17-E · Voir les réceptions et leurs écarts (M)
- **Problème** : D10 ; date, numéro du bon fournisseur, `ecart`, `/stats`.
- **Résultat** : je sais qui a reçu quoi, où, quand, et ce qui manquait.
- **Écran** : onglets « À recevoir » et « Reçues » (`DocumentListPage` : numéro, date, fournisseur, emplacement, reçu par, écart) ; fiche réception (lignes, note, montants pour gérant et admin) ; bloc « Réceptions » sur la fiche commande. Champs « N° du bon du fournisseur » et date d'arrivée (jamais future). Notification au gérant si écart.
- **API** : `ecart` = reçu − reste avant la réception ; `/stats` sur `COUNT(DISTINCT r.id)` ; lecture réservée à admin, gérant, dépôt (03-E).
- **Base** : `receptions.reference_fournisseur`.
- **Tests** : note visible du gérant ; caissier 403 ; écart −5 puis 0.
- **Fini quand** : la note du camion se lit sur la fiche commande. **Dépend** : aucun. **Risque** : aucun.

### 17-F · Casse, refus et surplus à l'arrivée (M)
- **Problème** : D11.
- **Résultat** : « 40 arrivés, 2 abîmés refusés » en une saisie, et je sais quoi réclamer au fournisseur.
- **Écran** : par ligne, « Reçu bon » et « Refusé » (motif : abîmé, mauvais article, en trop). Surplus accepté avec accord du gérant. Les manquants restent au reliquat ; « Solder le reste » est dans 16-B.
- **Base** : `reception_lignes.quantite_refusee`, `motif_refus`. Le refusé n'entre jamais en stock et nourrit la réclamation (avoir fournisseur, fiche 18). Abîmé gardé pour vente au rabais : état « défectueux » (05-C).
- **Tests** : camion → stock 38, refus 2 tracé, reste 3 ; surplus 45 sur 43 par le dépôt → attend le gérant.
- **Fini quand** : la casse se lit sans ouvrir une note. **Dépend** : 17-E, 16-B, fiche 18. **Risque** : question 2.

### 17-G · Recevoir au scan (M)
- **Problème** : pas de scan ; quantités pré-remplies sans comptage.
- **Résultat** : le magasinier bipe chaque carton, l'écran compte.
- **Écran** : champ scan en tête ; code-barres puis référence ; un bip = +1, ou le contenu du carton si son code est connu (10-H) ; article hors commande : message ; réglage « Compter depuis zéro ». Après validation : « Imprimer les étiquettes de ces articles » (fiche 11).
- **Fichiers** : `Receptions.tsx`, logique de scan de l'inventaire physique à réutiliser.
- **Tests** : 43 bips = 43 ; code inconnu ; 390 px.
- **Fini quand** : un camion se reçoit sans clavier. **Dépend** : 10-H (carton), fiche 11. **Risque** : douchette qui envoie Entrée et valide le formulaire.

### 17-H · Frais d'approche (M, deux étapes)
- **Problème** : coût d'entrée = prix du fournisseur seul ; transport, douane, transit, manutention oubliés ; la marge est surestimée.
- **Résultat** : le coût du carton comprend le camion.
- **Étape 1, à l'arrivée** (gérant) : bloc « Frais de l'arrivage » : libellé, montant, payé (sortie d'argent, 09-F, 09-E) ou dû (facture du transporteur) ; réparti selon la valeur (défaut) ou la quantité ; ajouté au coût avant le CMP, avec aperçu.
- **Étape 2, après coup** (facture du transitaire) : ajout sur une réception passée ; la part des unités en stock monte leur valeur, celle des vendues va en charge.
- **Base** : table `reception_frais` (réception, libellé, montant, répartition, dépense ou facture liée) ; `reception_lignes.cout_frais`.
- **Tests** : 100 000 + 300 000 de marchandise, 40 000 de frais par valeur → +10 000 et +30 000 ; étape 2 avec la moitié vendue.
- **Fini quand** : la marge d'un produit importé tient compte du transport. **Dépend** : 17-B, 09-E, 09-F, fiche 18 ; écritures en fiche 22. **Risque** : frais saisi deux fois (dépense et réception) : la dépense doit pointer la réception.

### 17-I · Date de péremption à l'arrivée (S)
- **Problème** : aucune date dans la base (module retiré en juin) ; lait, conserves, biscuits.
- **Résultat** : je sais quels cartons périment le mois prochain.
- **Écran** : date facultative par ligne, montrée seulement pour un produit « périssable » ; liste « Périme dans 30 jours » par emplacement.
- **Base** : `reception_lignes.date_peremption`, `produits.perissable`. Reste estimé « premier entré, premier sorti », sans suivi de lot à la vente.
- **Tests** : deux arrivages puis des ventes → l'alerte vise le plus ancien restant.
- **Fini quand** : le grossiste voit ses dates sans cahier. **Dépend** : 17-E. **Risque** : estimation fausse si on vend d'abord le récent ; le dire à l'écran.

### 17-J · Nouveau prix de vente proposé (S)
- **Problème** : le coût monte, le prix de vente reste, la marge fond sans alerte.
- **Résultat** : après la réception, « coût 12 000 → 13 500, marge 8 %, prix proposé 16 500 », accepté en un geste.
- **Écran** : gérant, résumé après validation des produits dont le coût bouge de plus de 5 %.
- **API** : prix de vente seul, avec l'historique et les droits du lot 10-C.
- **Tests** : réception plus chère → proposition ; acceptée → prix changé et tracé.
- **Fini quand** : aucune hausse de coût ne passe sans être montrée. **Dépend** : 10-B, 10-C. **Risque** : arrondis au prix rond (03-B).

## 9. Questions pour le propriétaire

1. Un vendeur de boutique peut-il recevoir une livraison faite directement à la boutique ? (aujourd'hui 403)
2. Carton abîmé : toujours refusé, ou gardé pour une vente au rabais ?
3. Le dépôt compte-t-il « depuis zéro » par défaut, ou part-il de la quantité commandée ?
4. Frais d'approche répartis selon la valeur ou la quantité par défaut ?
5. Achat direct : le caissier peut-il payer un fournisseur depuis le tiroir, et jusqu'à quel montant ?
6. Surplus (45 pour 43) : accepté avec accord du gérant, ou refusé ?
7. Date de péremption dès le premier client alimentaire, ou plus tard ?

**À transmettre.** Fiche 13 : D13. Fiche 15 : le transfert recalcule aussi le CMP (`CLAUDE.md` périmé), arrondi au centime. Fiche 18 : D9, la facture fournisseur doit pouvoir corriger le coût des unités encore en stock.

## Non vérifié

Double clic à l'écran (bouton bloqué pendant l'envoi, d'après le code) ; douchette ; facture liée payée ; période close.
