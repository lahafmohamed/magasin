# 12 Inventaire physique

> **Contre-expertise du 2026-11-27** ([détail](../vagues/vague-5-contre-expertise.md)) : Verdict maintenu. D1 : la règle du delta est voulue (CLAUDE.md) et juste si la casse suit le comptage ; on bloque « Ajuster » pendant un inventaire (12-A), on garde la règle. D2 : le chiffre est juste pour ce qu'il nomme et la fenêtre prévient, mais le montant sorti manque. D4 : le stock fantôme n'est sur aucune feuille (10-A). Oubli : un transfert en préparation pendant le comptage retire le stock deux fois (12-A). 12-G est absorbé par 15-E et le rapport de 12-F par 15-D ; 12-F se réduit au CSV ; 12-D en deux étapes, « Fixer à » devient un inventaire d'un produit. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-27, base `nolyx_audit_1`, interface et API réelles (six rôles ; 1440 et 390 px). Montants en FCFA. INV = inventaire. « Ajuster » = bouton « Ajuster le stock » de la page Inventaire. La caisse du banc (ouverte le 25/11) n'a pas servi : la vente d'essai est une facture à crédit.

## 1. Verdict

**Améliorer.** Le cœur est juste et rare : boutique ouverte pendant le comptage, une vente ou un transfert entre comptage et validation n'est ni perdu ni compté deux fois, deux personnes qui scannent ensemble ne perdent aucun « +1 », la validation est unique. Mais trois chemins faussent le stock (l'« Ajuster » pendant un inventaire, l'option « Les sortir du stock » qui annonce 517 900 F pour en sortir 25,9 millions, deux saisies du même produit qui s'écrasent), et le patron n'a aucune réponse à « combien j'ai perdu ce mois ». L'« Ajuster » reste, **réservé au gérant**, avec un motif choisi et bloqué pendant un inventaire.

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire boutique / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Besoin | 4 | 4 | 4 | 3 / 5 | 4 | 5 |
| Réponse actuelle | 3 | 3 | 3 | 2 / 2 | 3 | 3 |

- **Informatique** : un portable manquant = 450 000 F. Pas de numéro de série (10-K).
- **Habillement** : tailles en fiches séparées, sans grille par modèle (10-J).
- **Alimentaire** : ni carton (10-H), ni kilo (10-I), ni péremption (question 33).
- **Plusieurs sites** : un inventaire par emplacement ; mais chacun compte partout (D5).

## 3. Parcours réel

| Rôle | À l'écran | Ce qui surprend |
|---|---|---|
| Gérant, 1440 | Inventaire physique → « Nouvel inventaire » → emplacement (catégorie, aveugle, notes) → ouvrir : **4 gestes**. Feuille = 23 produits en stock. Valider : **2 à 3 gestes** | Dans la fenêtre de validation, « Les sortir du stock » laisse affiché « −517 900 FCFA » (capture `12-gerant-valider-zero-1440`) |
| Vendeur, dépôt, 390 | Menu → ligne : **2 gestes**. Champ « Scanner un article » au focus ; Entrée = +1 ; message « Basket noire pointure 42 : 20 comptés ». 20 scans en **6,3 s** (serveur local). Pas de stock attendu, de coût ni d'écart | Pas de caméra : il faut une douchette. « Lenovo » tapé : « Aucun produit ne porte le code » |
| Caissier, lecteur | 403 partout | Le caissier ne peut pas aider à compter |
| Admin | Comme le gérant | — |

**Ce qui marche (rejoué, chiffres).**

| Cas | Avant | Pendant | Après validation | Juste ? |
|---|---|---|---|---|
| Vente pendant le comptage (riz, MAG-1) | 368, compté 366 | facture de 1 : 367 | **365** | Oui |
| Transfert pendant le comptage (sucre, dépôt) | 80, compté 80 | 5 partis : 75 | **75** | Oui |
| Stock baissé sous l'écart (lait, dépôt) | 80, compté 0 | 1 parti : 79 | 409 « recomptez ce produit » ; recompté 0 → 0 | Oui, mais **tout** l'inventaire est bloqué |
| 40 scans simultanés, 2 personnes | — | — | **40** | Oui |
| Deux validations au même instant | — | — | 200 et 409 ; un seul mouvement par ligne | Oui |
| Annulation | — | — | Stock inchangé ; comptage refusé ensuite (409) | Oui |
| Article en rayon, à 0 au dépôt (question 9) | Lenovo absent de la feuille | scanné 3 fois | ajouté, **+3** au dépôt à 520 000 | Oui |

Valeur : MAG-1 passe de 28 177 452,38 à 27 694 584,13, soit −482 868,25 = vente (−13 423,07) + « Ajuster » (−3 299,52) + inventaire (−466 145,66), au centime.

**Les 300 articles un dimanche, à deux téléphones (supposé).** Aucun produit du banc n'a de code-barres. Sans étiquettes (fiche 11), chaque produit se cherche par son nom : 15 s × 300, soit 40 min à deux, sur une feuille triée par nom (6 pages de 50), sans filtre par catégorie. Avec douchettes et étiquettes : environ 2 s par unité ; pour 2 000 unités, 35 min à deux. Les deux partagent **un seul** inventaire, sans voir les comptages de l'autre (aucun rafraîchissement). Réseau coupé : le scan échoue avec un message, on rescanne ; mais une réponse perdue après enregistrement, puis rescannée, compte **+2**.

## 4. Défauts prouvés

### Argent et stock

| N° | Constat | Preuve | Où |
|---|---|---|---|
| D1 | **« Ajuster » pendant un inventaire corrige deux fois.** Rien ne prévient ni ne bloque | Huile : 433, comptée 430 ; le gérant retire 3 « casse vue pendant l'inventaire » (433 → 430) ; validation : **427**, réel 430. 3 bouteilles retirées deux fois : 3 299,52 F de perte inventée. `ProduitService.addStockMovement` ne lit pas `inventaires` | Écran |
| D2 | **« Les sortir du stock » annonce un chiffre faux.** La fenêtre garde la valeur des seules lignes comptées | MAG-1 : « valeur de l'écart : −517 900 FCFA » affiché, choix coché ; les 20 lignes non comptées valent **1 711 unités, 25 366 684 F**. Au dépôt, l'aperçu disait −100 000 ; validé : **−48 036 000**, 720 unités sorties d'un clic. `InventairePhysiqueDetail.tsx:207-209` | Écran |
| D3 | **Deux saisies du même produit s'écrasent.** La saisie dans la feuille remplace la quantité (`mode: 'fixer'`) ; la feuille ne se rafraîchit pas | Câble : vendeur 5 (rayon), gérant 3 (réserve) → **3** ; les 5 sont perdus. Aucun `setInterval` ni flux dans la page | Écran (deux téléphones) |
| D4 | **Stock fantôme : l'inventaire le voit partout et ne le range nulle part** (cause : lot 10-A) | Produit 24, +10 « Ajuster » au dépôt : aucune ligne d'emplacement. Inventaire dépôt : attendu 10, compté 9, validé ; toujours aucune ligne, transfert depuis le dépôt : 409 « 0 disponible ». À MAG-1, le même article attend **9** : compter 0 en boutique effacerait le stock du dépôt. `InventaireService.ts:56-63` | Écran |
| D5 | **Le dépôt agit hors de son emplacement** (le vendeur aussi, d'après le code) | Dépôt (affecté au dépôt seul) : compte dans l'inventaire de MAG-1 (200), ajuste le stock de MAG-1 (+1, 200), et passe une **fausse « vente »** de stock (`POST /produits/7/mouvements`, 201). `produits.ts:25,34-35`, `inventaires.ts:17` | API ; écran pour le comptage |
| D6 | **« Fixer à » d'« Ajuster » calcule l'écart dans le navigateur.** Une vente entre l'ouverture et l'envoi fausse le résultat | `Inventaire.tsx:1279-1287` (écart = saisi − stock lu à l'ouverture), envoyé en delta `:1319-1326` | Lu ; écran |

### Blocage

| N° | Constat | Preuve |
|---|---|---|
| D7 | **Aucune réponse à « combien j'ai perdu ».** Seule la valeur **nette** est affichée ; ni état mensuel, ni motif, ni compteur ; l'« Ajuster » n'a de valeur nulle part | INV-1 : « −466 145,66 » = manquants −480 145,66 + surplus +14 000. `compte_par` ne garde que le dernier : 40 scans par deux personnes → « gerant » seul. `mouvements_stock` n'a pas de colonne utilisateur (`ci-baseline.sql:3033-3046`) ; aucun rapport ne lit les ajustements (recherche : 0) |
| D8 | **L'export CSV rend chaque perte illisible** : tout nombre négatif part en texte | Ligne exportée : `"20","26","'-6","12000","'-72000"`. La protection contre les formules (`utils/csv.ts:12`) préfixe tout « - ». Tous les exports CSV de l'ERP sont touchés. Séparateur virgule : Excel français ouvre tout en une colonne (supposé) |
| D9 | **Pas d'état de fin d'année** : ni valeur du stock compté, ni total, ni PDF, ni plusieurs emplacements ensemble | Actions de la page : « Exporter en CSV » seul ; colonnes : compté, attendu, écart, coût, valeur de l'écart |

### Gêne

| N° | Constat | Preuve |
|---|---|---|
| D10 | Comptage « à l'aveugle » contournable | Le vendeur lit le stock de MAG-1 (158 souris) et le coût (2 974,79) par `GET /produits` (coût : lot 03-E) |
| D11 | Ajouter un article hors feuille sans code-barres exige la référence exacte | « Lenovo » → 422 ; « inf-lap-002 » → accepté |
| D12 | Pas de feuille papier, pas de filtre catégorie dans la feuille (recherche : nom, référence, code), un seul inventaire par emplacement | `InventaireService.ts:245-249` ; 409 à la deuxième ouverture |
| D13 | Aucun avertissement pour un inventaire ancien ; un 409 bloque toute la validation | `valider()` ne lit pas les dates (`:504-629`) |
| D14 | Un scan renvoyé après coupure compte deux fois | Même scan envoyé deux fois → 2. Pas de clé anti-doublon |
| D15 | Aucune écriture comptable, aucun contrôle de période (déjà signalé) | 408 → 410 écritures : les deux nouvelles sont la facture FAC-2026-00202 ; 410 après la seconde validation. `PeriodService` absent du service |

## 5. Comparaison

| | Odoo | Sage 100 | Loyverse | nolyxERP |
|---|---|---|---|---|
| Inventaire tournant | Par emplacement, fréquence en jours, comptage confié à un utilisateur [O18] | Saisie ou import [G1] | Complet ou partiel (catégorie, fournisseur) [L12] | Par emplacement, catégorie ; pas de fréquence |
| Stock qui bouge pendant le comptage | **Demande confirmation** [O18] | NV | Rien [L12] | Écart en delta, **juste** ; 409 si incohérent |
| Scan | ° | NV | +1 par scan, sauvegarde 30 s [L12] | +1 par scan, enregistré à chaque scan |
| Stock attendu | ° | NV | Visible [L12] | Masqué aux compteurs |
| Prix | Inclus | Option selon gamme | Stock avancé **payant** [L1] | Inclus |

**Mieux chez eux** : fréquence et compteur désigné (Odoo), partiel par fournisseur (Loyverse), import (Sage). **Mieux chez nous** : boutique ouverte sans erreur, aveugle, gratuit. **À rattraper** : feuille papier, valeur des écarts pour le patron (`concurrents.md` §2.2).

## 6. Manques par profil

- **Tous, premier mois** : état des pertes (12-F), feuille papier et comptage à deux (12-E), état de fin d'année (12-G).
- **Grossiste** : compter « 19 cartons + 4 » (10-H, dont les tests citent déjà l'inventaire).
- **Alimentaire** : kilo (10-I) ; péremption et lots : **plus tard** (question 33).
- **Informatique** : compter par numéro de série : **plus tard**, après 10-K.
- **Habillement** : grille taille × couleur au comptage : **plus tard**, après 10-J.
- **Plus tard** : scan par caméra (fiche 29), fréquence automatique, import Excel.

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** (supposé) : un assujetti qui perd de la marchandise peut devoir reverser la TVA déduite, sauf destruction justifiée. L'inventaire fournit seulement les pertes **par motif** et par période (12-F). Non assujetti : rien. Propriétaire : 03-K.
- **FNE** : une perte n'est pas une vente (supposé) ; rien à préparer. **Mobile money** : sans objet.
- **WhatsApp** : envoyer au patron le lien du rapport d'inventaire validé (bouton de 03-L étape 1).
- **Comptabilité** (supposé) : en inventaire intermittent, la variation de stock se passe une fois l'an depuis l'état du 31 décembre ; écriture : fiche 22 ; état : 12-G.

## 8. Lots proposés

Ordre du cadrage. Prochaine migration : le numéro libre au moment du lot (dernière : `113`). Tout changement de schéma régénère `ci-baseline.sql`. Déjà ailleurs : stock fantôme **10-A** (règle D4), coût par emplacement **10-B**, valorisation et CMP **fiche 15**, coût visible du vendeur **03-E**, carton **10-H**, kilo **10-I**, étiquettes **fiche 11**, emplacement de l'utilisateur **fiche 13**, écriture comptable **fiche 22**, lien WhatsApp **03-L**.

### 12-A · Pas de double correction (S)
- **Problème** : D1, D6.
- **Résultat** : pendant un inventaire, une casse se corrige dans l'inventaire, une seule fois.
- **API** : `ProduitService.addStockMovement` (types `ajustement` et `perte`) : si un inventaire `en_cours` couvre cet emplacement (et la catégorie du produit, s'il y en a une), 409 `INVENTAIRE_EN_COURS` « Inventaire INV-… en cours ici : corrigez le comptage ». Ventes, réceptions, transferts, retours : inchangés. « Fixer à » : envoyer `{ fixer_a, stock_lu }` ; le serveur verrouille la ligne, 409 si le stock a changé, sinon calcule le delta.
- **Écran** : message dans « Ajuster » avec lien vers l'inventaire.
- **Fichiers** : `ProduitService.ts`, `ProduitController.ts`, `schemas.ts` (`adjustStockSchema`), `Inventaire.tsx`.
- **Tests** : D1 → 409, stock 430 ; produit hors catégorie → accepté ; « Fixer à » avec une vente entre-temps → 409 ; vente → acceptée.
- **Fini quand** : D1 donne 430. **Dépend** : rien. **Risque** : inventaire oublié ouvert ; le message le nomme.

### 12-B · Une validation qui dit la vérité (S)
- **Problème** : D2, D13.
- **Résultat** : je vois ce que je valide, en unités et en francs, avant de cliquer.
- **API** : `GET /inventaires/:id/apercu?non_comptes=ignorer|zero` (gérant, admin) : lignes ajustées, unités en plus et en moins, valeur des manquants, valeur des surplus, valeur sortie par « zéro », date du plus ancien comptage. Même calcul que `valider()`, sans écrire. Sur 409 `RECOMPTAGE_REQUIS`, renvoyer **tous** les produits à recompter, pas le premier.
- **Écran** : la fenêtre affiche l'aperçu du choix coché ; avec « Les sortir du stock », le bouton devient « Sortir 1 711 articles (25 366 684 FCFA) » ; avertissement si un comptage a plus de 7 jours ; lien « Voir les produits à recompter ».
- **Fichiers** : `InventaireService.ts`, `InventaireController.ts`, `inventaires.ts`, `inventaire-schemas.ts`, `InventairePhysiqueDetail.tsx`, `api.ts`.
- **Tests** : aperçu = résultat, au centime, dans les deux modes ; trois produits à recompter → trois ; compteur → 403.
- **Fini quand** : la capture `12-gerant-valider-zero` affiche 25 366 684. **Dépend** : rien. **Risque** : calcul en double ; partager une seule fonction.

### 12-C · Compter à plusieurs sans s'écraser (M)
- **Problème** : D3, D14, D7 (compteur).
- **Résultat** : deux téléphones comptent le même rayon ou le même produit à deux endroits ; tout est additionné, et je sais qui a compté quoi.
- **Base** : table `inventaire_comptages` (ligne, utilisateur, quantité, mode, clé unique `cle_client`, date). `quantite_comptee` = somme, par compteur, de ses ajouts et de sa dernière saisie.
- **API** : `compter()` écrit un comptage puis recalcule la ligne, dans la même transaction ; `cle_client` déjà vue → même réponse (mécanisme du lot 07-A). `GET /inventaires/:id/lignes` renvoie le détail par compteur au gérant.
- **Écran** : clé générée par scan ; feuille relue toutes les 10 s et au retour sur l'onglet ; détail « Salif 5 · Awa 3 » ; « Effacer mon comptage ».
- **Fichiers** : migration, `InventaireService.ts`, `inventaire-schemas.ts`, `InventairePhysiqueDetail.tsx`, `api.ts`.
- **Tests** : D3 → 8 ; 40 scans simultanés → 40 ; même clé deux fois → 1 ; effacer le comptage d'un seul compteur.
- **Fini quand** : D3 et D14 rejoués justes. **Dépend** : 07-A. **Risque** : recomptage complet par une seule personne ; le gérant voit le détail.

### 12-D · Ajuster : réservé, motivé, chiffré (M)
- **Problème** : D5, D7 (pas de motif ni de valeur), question 11.
- **Résultat** : seul le gérant corrige hors inventaire ; chaque perte a motif et valeur.
- **Droits proposés** : « Ajuster » au gérant et à l'admin ; le dépôt et le vendeur **comptent** (selon la question 11 : si le dépôt ajuste, seulement à son emplacement, motif obligatoire, montant visible du gérant). Comptage limité aux emplacements de l'utilisateur (`user_location_roles`), gérant et admin partout ; caissier ajouté aux compteurs.
- **Base** : `mouvements_stock.utilisateur_id`, `cout_unitaire`, `motif_code` (`casse`, `vol`, `perime`, `erreur`, `consommation`, `don`, `trouve`, `inventaire`).
- **API** : `POST /produits/:id/mouvements` n'accepte plus que `ajustement` et `perte` (plus de fausse « vente ») ; motif obligatoire ; coût figé au CMP de l'emplacement.
- **Écran** : liste des motifs à la place du texte libre (le texte reste en complément).
- **Fichiers** : migration, `routes/produits.ts`, `schemas.ts`, `ProduitService.ts`, `StockCostingService.ts`, `InventaireService.ts`, `inventaires.ts`, `routeAccess.ts`, `Inventaire.tsx`.
- **Tests** : dépôt → 403 sur « Ajuster » (ou 403 hors de son emplacement selon la réponse) ; type `vente` → 400 ; compter à MAG-1 avec le compte dépôt → 403 ; caissier compte à sa boutique → 200.
- **Fini quand** : D5 rejoué refusé. **Dépend** : fiche 13 (emplacement de l'utilisateur). **Risque** : casse au dépôt ; elle passe par un inventaire d'un produit.

### 12-E · Comptage au téléphone et sur papier (M)
- **Problème** : D11, D12, caissier exclu.
- **Résultat** : à deux, on se partage la boutique par rayon ; un article sans code se retrouve par son nom ; on peut compter sur papier puis saisir.
- **Écran** : champ de scan avec proposition par nom (2 lettres) quand aucun code ne correspond ; filtre « Catégorie » dans la feuille ; « Imprimer la feuille » (par catégorie, colonnes référence, nom, case « Compté », sans stock attendu si aveugle, signature) ; saisie rapide de la feuille papier dans le même ordre.
- **API** : `search` de la feuille porte aussi sur la catégorie ; filtre `categorie`.
- **Fichiers** : `InventaireService.ts`, `inventaire-schemas.ts`, `InventairePhysiqueDetail.tsx`, `utils/print.ts`.
- **Tests** : « Leno » propose le Lenovo ; feuille de 300 lignes imprimée ; filtre catégorie.
- **Fini quand** : 300 produits sans code comptés à deux. **Dépend** : 12-C. **Risque** : faible.

### 12-F · Mes pertes du mois (M)
- **Problème** : D7, D8.
- **Résultat** : « Ce mois, 480 145 F de manquants, 14 000 F de surplus, dont 450 000 F d'un portable à MAG-1 » ; par motif, produit, emplacement, compteur.
- **API** : `GET /reports/pertes?du&au&location_id` (gérant, admin) : inventaires validés et ajustements, manquants et surplus **séparés**, valeur au coût figé.
- **Écran** : rapport « Pertes et écarts » (tableau, export) ; l'en-tête d'un inventaire validé montre manquants et surplus séparés.
- **CSV** : dans `utils/csv.ts`, un nombre (`/^-?\d+([.,]\d+)?$/`) n'est jamais préfixé ; séparateur point-virgule et virgule décimale pour Excel français (vérifier les autres exports).
- **Fichiers** : `ReportingService.ts`, `routes/reports.ts`, nouvelle page ou onglet de Reporting, `InventairePhysiqueDetail.tsx`, `utils/csv.ts` et ses tests.
- **Tests** : INV-1 → −480 145,66 et +14 000 ; un « Ajuster » `vol` compté ; CSV : `-72000` reste un nombre ; `=SUM(1)` reste neutralisé.
- **Fini quand** : la question tient en un écran. **Dépend** : 12-D (motif, coût). **Risque** : coût figé faux tant que 10-B n'est pas fait.

### 12-G · État du stock compté au 31 décembre (M)
- **Problème** : D9.
- **Résultat** : le 31 décembre, je compte mes trois emplacements et j'imprime un état signé, valorisé, pour mon comptable.
- **Écran** : « Inventaire de fin d'année » : un inventaire complet par emplacement, ouverts ensemble ; après validation, état par catégorie et par emplacement, total général, date et signatures, PDF et CSV.
- **API** : `inventaires.annee_fiscale` ou regroupement ; `GET /inventaires/etat?groupe=` ; valeur = compté × coût retenu par la fiche 15.
- **Fichiers** : migration, `InventaireService.ts`, `PDFService.ts`, `InventairesPhysiques.tsx`.
- **Tests** : trois emplacements, total = somme ; ligne non comptée signalée.
- **Fini quand** : un état imprimé sans retouche Excel. **Dépend** : 12-B, 12-F, fiche 15 (méthode de valeur), fiche 27 (PDF). **Risque** : comptage le 2 janvier ; dire « stock compté le … », pas « au 31/12 », tant qu'aucun stock à date n'existe (fiche 15).

## 9. Questions pour le propriétaire

1. **Question 11** : proposition, le dépôt compte et ne corrige pas. Sinon, correction à son seul emplacement, avec motif.
2. **Question 9** : dans un inventaire, un article à 0 se scanne et entre (prouvé). À la vente, la question reste ouverte (10-A).
3. Le caissier peut-il compter ?
4. Pendant un inventaire, l'« Ajuster » est-il bloqué (proposé) ou seulement averti ?
5. Motifs de perte obligatoires : la liste de 12-D convient-elle ?
6. Au-delà de quel écart l'admin (le patron) doit-il valider lui-même ?
7. Le gérant voit-il les écarts par compteur ? Une perte peut-elle être imputée à un employé ?
8. Inventaire du 31 décembre : boutique fermée ou ouverte ?

**À transmettre.** Fiche 15 : l'écart est valorisé au coût figé au comptage ; un stock fantôme compté n'entre pas dans `valeur_stock` (produit 24, 9 000 F hors valeur). Fiche 13 : le transfert ne bouge le stock qu'à « Terminer ». Fiche 22 : la vente n'écrit ni 603 ni 31. Fiche 29 : pas de caméra, pas de file d'attente hors ligne pour les scans. Tous les exports CSV : D8.

## Non vérifié

Douchette réelle ; réseau lent (mesures en local) ; période close (aucune dans le banc) ; inventaire de 3 semaines (lu) ; « Ajuster » du dépôt sur une boutique à l'écran (prouvé par l'API).
