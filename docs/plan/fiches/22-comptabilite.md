# 22 Comptabilité

> **Contre-expertise du 2026-11-27** ([détail](../vagues/vague-9-contre-expertise.md)) : Verdict maintenu : le calcul reste, les écrans faux partent (22-A, tôt) ; 22-B à 22-H passent avant le premier mois clos d'un client, pas en tête. Journée rejouée : 0 compte juste sur 12 ; l'ancien lot 03-C seul n'en rendait juste qu'un (601). 03-C et 09-J disparaissent (remplacés par 22-C, 22-D, 22-E) ; 04-E, 05-D, 06-G et 18-D perdent leur partie écriture ; 23-A rétrécit ; 03-D et 08-K n'ont plus de contre-passation à écrire. Oublis : une facture supprimée garde ses écritures ; un avoir imputé est compté en « virement » ; un acompte fournisseur n'écrit rien. « Poche du gérant » n'est pas un compte. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-27 sur `nolyx_audit_1` (API 6141, interface 6151), API et interface réelles, `CAISSE_GL_POSTING=true`. Montants en FCFA. J'ai clôturé la caisse du banc (session 2, ouverte le 25/11, comptée à l'attendu : 60 000, écart 0) et ouvert la mienne (session 3, Boutique Audit, fonds 50 000), clôturée en fin de journée. Les SYSCOHADA cités sont **supposés** (sans recherche) : un cabinet doit les relire.

## 1. Verdict

**Simplifier : la comptabilité sort des écrans et devient un export juste pour le cabinet.** Aujourd'hui elle est fausse partout : sur une journée de 16 opérations, aucun compte n’a le bon solde, et le bilan met les clients au passif et annonce une perte un jour de 303 000 de factures. Le commerçant visé ne lit pas une balance ; son cabinet fait la déclaration annuelle dans son propre logiciel. Ce qu'il lui faut : des écritures exactes, déduites des pièces, un mois figé, un fichier importable.

**Question 10 : trois choix.**

| Ce qui change | Complète dans l'ERP | **Cachée + export (proposé)** | Supprimée |
|---|---|---|---|
| 03-C | Gardé, rattrapage en base | Absorbé par 22-C, sans rattrapage | Saute |
| 04-E (419), 05-D et 06-G (écriture), 09-J, part comptable de 18-D | Chacun écrit ses lignes | Une règle chacun (22-B) | Sautent |
| 15-I (variation de stock) | À écrire | Proposée dans l'export (22-H) | État 15-E seul |
| 03-K | Écritures + déclaration de TVA | Lignes 44 du journal (22-I) | TVA sur les documents seulement (23-J) |
| 23-A avant 03-C | Obligatoire, plus `GeneralLedgerService.ts:161,188,239` et `ComptabiliteService.ts:114` | Sans objet : le journal lit des dates de pièce | Sans objet |
| 08-J (numéro comptable des comptes d'argent) | Requis | Requis | Inutile |
| À construire | Lettrage, à-nouveaux, clôture annuelle, états SYSCOHADA, immobilisations, paie comptable : plusieurs mois | 22-A à 22-I | Rien ; le cabinet ressaisit depuis les listes (27-H) |

La version complète refait Sage, que les cabinets ivoiriens connaissent déjà. La suppression jette un mécanisme presque prêt et fait payer au commerçant la ressaisie de son cabinet.

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Export juste pour le cabinet | 2 | 4 | 2 | 4 | 2 | 4 |
| Module actuel | 0 | 0 | 0 | 0 | 0 | 0 |

**Ce qu'attend le comptable** (supposé) : journal des ventes et avoirs ; un journal par caisse, banque et compte Wave ou Orange ; achats et paiements fournisseurs ; dépenses par nature ; dettes clients et fournisseurs au dernier jour ; stock valorisé au 31 décembre ; numéros sans trou ; mois qui ne bougent plus.

**Ce que le commerçant lit lui-même** : ventes, bénéfice du mois (23-H), argent par caisse (23-E), dettes (04-A), stock. Tout vient des pièces, jamais de la comptabilité. Pour les plus petits (moins de 60 M de ventes en négoce, supposé), le SYSCOHADA admet un simple journal « recettes et dépenses » (système minimal de trésorerie) : l'ERP peut le donner tel quel.

## 3. Parcours réel

**Rôles.** Admin et gérant : menu « Gestion › Comptabilité », quatre onglets, 1 440 et 390 px, aucune erreur. Saisie d’une écriture : 7 gestes, lisible au téléphone (capture `22-dialog-390`). Caissier, vendeur, dépôt, lecteur : « Accès réservé » ; 403 en lecture et en saisie. Le cabinet n'a aucun accès prévu.

**Écrire, corriger, supprimer.** Admin et gérant écrivent, sur n'importe quel compte, 701 compris (PC-2026-00018). Personne ne corrige ni ne supprime : aucune route (404). C'est sain, mais aucun bouton « contre-passer ». Déséquilibrée : 422. Mois clos : intestable, aucun mois ne peut être clos (D8).

**Journée du 27/11 rejouée par l'ERP.** Ventes comptant 10 000 espèces, 3 500 Wave, 7 000 carte ; à crédit 150 000 (FAC-205) et 35 000 (FAC-207) ; devis 97 500 remisé de 10 000, livré puis facturé (FAC-206) ; avoir 15 000 sur FAC-205 ; acompte 20 000 espèces, imputé d'office sur deux vieilles factures ; Wave 50 000 et virement 20 000 reçus ; loyer 30 000 espèces, taxi 2 000 Wave ; achat 100 000 (FF-005) payé 60 000 en espèces ; 20 000 remis au patron ; clôture avec 1 000 de manquant.

| Compte (SYSCOHADA, numéro ERP) | Attendu | Écran « Balance » | |
|---|---|---|---|
| 411 Clients | Débit 167 500 | **Crédit 90 500** | Faux |
| 701 Ventes | Crédit 278 000 | 0 (303 000 cachés) | Faux |
| 4191 Avances clients (419) | 0 | Crédit 20 000 | Faux |
| 571 Caisse (53) | −21 000 (fonds 50 000 → compté 29 000) | +7 000 | Faux |
| 552 Wave (54) | +51 500 | +53 500 | Faux |
| 52 Banque, 51 carte | +27 000 | absent (dans 53) | Faux |
| Coffre ou poche du gérant | −60 000 | absent | Faux |
| 601 Achats | Débit 100 000 | 0 (caché) | Faux |
| 401 Fournisseurs | Crédit 40 000 | 0 (100 000 cachés) | Faux |
| 622 Loyer | Débit 30 000 | 0 ; 30 000 au 604 | Faux |
| 618 Transport | Débit 2 000 | 0 | Faux |
| 104 Exploitant | Débit 20 000 | 0 ; 20 000 en charge (65) | Faux |
| 658 Écart de caisse | Débit 1 000 | 0 | Faux |

Attendu : 399 000 au débit et au crédit. Obtenu : équilibré (160 500), mais **0 compte juste sur 13**. Pièces : `ecritures_comptables` 413 à 442 ; capture `22-balance-1440` (elle montre aussi mes essais de saisie : 701 = 100, 75 = 1 000).

## 4. Défauts prouvés

### Argent (justesse des comptes, à l'écran)

| N° | Défaut | Preuve |
|---|---|---|
| D1 | **Aucune vente ni aucun achat dans la balance** (déjà signalé, confirmé). 199 factures du banc (61 459 100) et mes 6 factures : 411 et 701 par `compte_id` seul. Année : **411 créditeur de 100 400**. PDF « Bilan » : « Clients » au **passif**, « Résultat net −48 800 » ; « Compte de résultat » du 27/11 : ventes 100 (ma saisie d'essai), perte 48 900 | `ci-baseline.sql:302-306, 334-342` ; `GeneralLedgerService.ts:160` ; PDF du 27/11 |
| D2 | Journée fausse sur chaque compte | Tableau de la section 3 |
| D3 | **Six gestes sans écriture** : avoir AVOIR-2026-00001 (0 ligne), acompte imputé 20 000 (paiements 162, 163 : 419 reste créditeur à vie), paiement fournisseur 60 000 espèces (FF-2026-00005), dépense Wave DEP-2026-00014, manquant de 1 000 (session 3), paie payée (`PayrollService.ts:313-330`, lu) | Lignes 413-442 |
| D4 | **Mauvais comptes** : carte 7 000 et virement 20 000 en caisse (53) ; remise au patron en charge (65) ; loyer en « achats stockés » (604) ; `categories_depenses.compte_comptable_id` vide et jamais lu ; 53, 54, 51, 4456, 4457 ne sont pas les numéros SYSCOHADA (571, 552, 521, 4452, 4431 : supposé) | `CaisseMagasinService.ts:565-582` ; pièces PC-2026-00004, 7, 8, 9 |
| D5 | Écritures de caisse datées du **jour de saisie**, pas de la pièce : un paiement ou une dépense antidatés tombent aujourd'hui | `CaisseMagasinService.ts:614` (`CURRENT_DATE`) ; fiche 09 D10 |
| D6 | **Client neuf : aucun encaissement n'est écrit.** `provision-client.sh:78-90` n'écrit pas `CAISSE_GL_POSTING`, `.env.example:13` le met à faux, `CaisseMagasinService.ts:562` sort alors sans rien écrire. La balance ne montre que les saisies manuelles et les compensations ; après 03-C, toutes les factures y resteraient impayées pour toujours | Lecture |
| D7 | **Remise globale** : la conversion la perd (FAC-206 = 97 500, devis et bon 87 500 ; déjà 01-D2, 02-D11, propriétaire 03-A). Une fois 03-A fait, le trigger passera débit 411 87 500, crédit 701 97 500 : pièce déséquilibrée. 03-C la couvre (il crédite le total) : **03-C doit passer avec ou avant 03-A** | `ci-baseline.sql:303-306` ; SQL facture 206 |

**03-C suffit-il ?** Pour faire apparaître 701 et 601, oui. Pas pour la justesse : avoirs et acomptes imputés manquent (D3), donc 411 reste trop haut ; il faut aussi 23-A sur `GeneralLedgerService.ts:161, 188, 239` et `ComptabiliteService.ts:114` (factures horodatées, `13:51:11`), que la liste de 23-A ne cite pas.

### Blocage

| N° | Défaut | Preuve |
|---|---|---|
| D8 | **Aucun mois ne peut être clos** : rien n'écrit `periodes_comptables` (0 ligne, banc et client neuf ; ni route ni écran). Le verrou 075 (trigger présent) ne sert donc jamais. Saisie datée du 15/01/2020 et du 30/06/2031 acceptée, numérotée « PC-2026 » | PC-2026-00013, 00014 ; seules lectures : `PeriodService.ts:13`, `FactureService.ts:249` |
| D9 | **Rien d'utilisable par le cabinet** : export CSV à l'écran, colonne compte = « null — null » pour chaque ligne de facture ; ni client, ni compte tiers, ni format importable ; le lecteur reçoit 403 | Fichier `ecritures.csv` ; `GeneralLedger.tsx:579` |

### Gêne

| N° | Défaut | Preuve |
|---|---|---|
| D10 | `GET /general-ledger/document/facture/205` : 0 ligne (lit `reference_*`, le trigger écrit `piece_*`) ; aucun appelant | API |
| D11 | Saisie par l'API : débit et crédit sur une ligne, date « n importe quoi », journal « CAISSE », 10¹⁴ → **500** ; pièce à 0 acceptée (PC-2026-00011) ; numéro pris avant contrôle : trous 12, 15, 16, 17. L’écran bloque les trois premiers | API |
| D12 | Sous-titre « (SYSCOHADA) » sur un plan de 14 comptes, en partie français | Capture |

**202 factures annulées sans contre-passation (production)** : données de test, aucun utilisateur. **Aucune reprise** : le premier client part d'une base neuve (fiche 28) ; 22-F vide les écritures de test.

## 5. Comparaison

| | Odoo | Sage 100 | Loyverse, outils locaux | Nous (après les lots) |
|---|---|---|---|---|
| Écritures | Complètes, la caisse écrit à la clôture de session [O9] | Le métier de Sage, connu des cabinets [G5] | Aucune, des intégrations [L1] | Déduites de chaque pièce, mode par mode, boutique par boutique |
| Pour le cabinet | Plan ivoirien non vérifié | Transfert gestion → comptabilité (supposé) | Ressaisie | Fichier mensuel figé, importable |

**Pour qu'un cabinet accepte notre export** : comptes SYSCOHADA réglables, numéros sans trou (03-D), mois figé, nom et compte du client, TVA séparée, référence du paiement (Wave, chèque) pour rapprocher, format importable dans son logiciel. **Nous ferons mieux** : ni saisie ni double logiciel pour le commerçant, Wave et FNE compris.

## 6. Manques

- **Grossiste** (souvent au réel, TVA possible) : comptes tiers pour les gros clients, TVA séparée, journal par boutique.
- **Informatique** : NCC du client et référence FNE dans l'export (B2B, B2G).
- **Habillement, général** : journal « recettes et dépenses » suffisant (supposé).
- **Plusieurs sites** : une caisse comptable par boutique (5711, 5712), un compte Wave par numéro marchand (13-H).
- **Plus tard** : immobilisations, amortissements, déclaration annuelle (chez le cabinet).

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** : non assujetti, aucune ligne 44 et rien à l'écran. Assujetti : vente 411 TTC / 701 HT / 4431 TVA ; achat 601 HT / 4452 TVA / 401 TTC ; avoir inverse. Taux lu sur la ligne figée (03-K) ; le total du mois sert à 23-J.
- **FNE** : la facture certifiée s'écrit comme une autre ; l'export porte sa référence. Un avoir FNE se fait par quantité (`faits/fne.md`) : déjà la règle de 03-L. Achat de stickers : une catégorie de dépense.
- **Mobile money** : un compte par opérateur et par numéro marchand ; la commission de l'opérateur viendra avec l'intégration (plus tard).
- **WhatsApp** : lien `wa.me` vers l'export du mois pour le cabinet (03-L).

## 8. Lots proposés

Prochaine migration : le numéro libre au moment du lot (dernière : `113`) ; tout changement de schéma régénère `ci-baseline.sql`, toute donnée de base va aussi dans `ci-ref-data.sql`. **Pourquoi calculer le journal au lieu de stocker chaque écriture :** cinq endroits écrivent aujourd'hui, avec deux clés de compte et trois conventions de date, et six gestes n'écrivent rien (D3). Une seule fonction qui lit les pièces ne peut rien oublier, change de compte sans réécrire le passé, et se fige à la clôture (22-G).

### 22-A · Cacher la comptabilité au commerçant (S, priorité 2)
**Problème** : D1, D9, D10, D12 sous les yeux du patron ; saisie libre du 701 (PC-2026-00018). **Résultat** : aucun écran ne montre un compte ; le bénéfice vient de 23-H.
**Écrans** : « Comptabilité » retirée du menu, de `routeAccess.ts` et de `modules.ts` ; `/general-ledger` et `/comptabilite` redirigent vers les Rapports.
**API** : supprimer `POST /comptabilite/ecritures`, `GET /comptabilite/grand-livre/:n`, toutes les routes `/general-ledger` (PDF bilan, résultat, grand livre compris). `/comptabilite/tresorerie` reste à 21-B.
**Fichiers** : `GeneralLedger.tsx`, `App.tsx`, `navConfig.tsx`, `api.ts`, `routes/general-ledger.ts`, `routes/comptabilite.ts`, `GeneralLedgerController.ts`, `GeneralLedgerService.ts`, `ComptabiliteService.ts`, `PDFService.ts:132, 592, 606`, tests.
**Tests** : routes retirées → 404 ; aucun rôle ne voit « Comptabilité ». **Fini quand** : plus un numéro de compte à l'écran. **Dépend** : rien. **Risque** : aucun utilisateur ne s'en sert.

### 22-B · Règles de comptabilisation SYSCOHADA réglables (M, priorité 1)
**Problème** : D4. **Résultat** : chaque événement a son compte, proposé, relu par un cabinet, réglable par l'admin.
**Base** : `regles_comptables (evenement, mode_paiement, categorie_depense_id, magasin_id, compte_debit, compte_credit, depuis)` ; plan complété ; `categories_depenses.compte_comptable_id` rempli. Proposition (supposée) : espèces 571x par boutique ; Wave, Orange, MTN, Moov 552x ; virement 521 ; chèque et carte 51 ; avances 4191, 4091 ; patron 104 ; loyer 622 ; transport 618 ; électricité 605 ; téléphone 628 ; écart 658/758 ; perte 651 ; salaires 661/422 ; stock 31/6031 ; TVA 4431/4452.
**Écran** : Paramètres › « Comptes du cabinet » (admin) : événement → compte, date d'effet.
**Fichiers** : migration, `ci-ref-data.sql`, `ReglesComptablesService.ts`, page Paramètres.
**Tests** : chaque événement × mode × catégorie trouve une seule règle ; une règle datée n'atteint pas un mois clos.
**Fini quand** : un cabinet a signé la table. **Dépend** : 08-J, 25-H (forme juridique : 104 ou compte courant d'associé). **Risque** : numéros faux sans relecture.

### 22-C · Journal des ventes et des encaissements, calculé (M, priorité 1)
**Problème** : D1, D2, D3 (avoir, acompte imputé), D7. Absorbe 03-C, 04-E, l'écriture de 05-D et de 06-G.
**Résultat** : pour toute période, lignes déduites des pièces : facture 411/701 au net de remise ; avoir 701/411 ; encaissement par mode ; acompte reçu mode/4191, imputé 4191/411 ; remboursement ; compensation ; perte 651/411 (après 06-G).
**Base** : fonction `journal_comptable(du, au)` sur les règles 22-B, datée par la date de la pièce (`::date`) ; numéro de pièce = celui du document.
**Étapes** : ventes et avoirs ; encaissements ; acomptes ; perte.
**Attention** : une imputation d'acompte crée des `paiements` marqués « espèces » (162, 163) : l'argent reçu est l'acompte ; les compter en caisse le doublerait.
**Fichiers** : migration, `JournalComptableService.ts`, tests.
**Tests** : journée de la section 3 : 411 = débit 167 500, 701 = crédit 278 000, 4191 = 0 ; chaque pièce équilibrée ; chaque facture, avoir, paiement du mois a ses lignes.
**Fini quand** : la partie clients du tableau est juste. **Dépend** : 22-B, 03-A, 04-C. **Risque** : double compte acompte et paiement.

### 22-D · Journal des achats et des paiements fournisseur (S, priorité 1)
**Problème** : D1 (601), D3 (paiement fournisseur). Absorbe la part comptable de 18-D.
**Résultat** : facture fournisseur 601/401 ; paiement 401/mode ; acompte mode/4091 puis 4091/401 ; avoir fournisseur (18-H2) 401/601.
**Base** : même fonction, sources `factures_fournisseur`, `paiements_fournisseur`, `acomptes_fournisseur`.
**Tests** : FF-2026-00005 : 601 débit 100 000, 401 crédit 40 000 après 60 000 payés.
**Fini quand** : la partie fournisseurs du tableau est juste. **Dépend** : 22-B, 18-B, 16-A. **Risque** : commande comptée comme dette avant 16-A.

### 22-E · Journal de caisse : dépenses, patron, banque, écarts, salaires (M, priorité 1)
**Problème** : D3 (dépense Wave, manquant, paie), D4, D5. Absorbe 09-J.
**Résultat** : dépense au compte de sa catégorie et à sa date ; apport mode/104 ; retrait du patron 104/mode ; versement en banque 521/571 ; écart 658/571 ou 571/758 (ou dette du caissier, question 17) ; salaire 661/422, puis 422/mode.
**Base** : sources `depenses`, `mouvements_caisse` (divers), `sessions_caisse.ecart`, bulletins payés.
**Étapes** : dépenses ; divers et écarts ; salaires (après la fiche 20).
**Tests** : journée : 571 = −21 000, Wave = +51 500, 622 = 30 000, 104 = 20 000, 658 = 1 000.
**Fini quand** : le tableau de la section 3 sort entier. **Dépend** : 22-B, 08-D, 08-B, 09-E, fiche 20. **Risque** : dépense comptée deux fois (pièce et mouvement).

### 22-F · Retirer l'ancien moteur d'écritures (S, priorité 2)
**Problème** : D6 ; deux clés de compte ; cinq écrivains. **Résultat** : une seule source ; plus de réglage d'environnement.
**Base** : supprimer `trg_facture_client_ecriture`, `trg_facture_fournisseur_ecriture`, leurs fonctions, `ensure_plan_compte` ; vider les écritures de test (202 annulées comprises).
**Fichiers** : migration, `CaisseMagasinService.ts:546-627`, `FactureService.ts:899-925`, `CompensationService.ts:65-76`, `.env.example`, `CLAUDE.md`, `AvoirRembourser.test.ts`.
**Tests** : plus aucune mention de `CAISSE_GL_POSTING` ; vente, annulation et compensation passent sans écrire.
**Fini quand** : `ecritures_comptables` ne reçoit que les mois figés (22-G). **Dépend** : 22-C, 22-D, 22-E. **Risque** : un événement oublié ; le test d'exhaustivité le voit.

### 22-G · Clôture du mois (M, priorité 3)
**Problème** : D8, D5. **Résultat** : « Clôturer octobre » (admin) : contrôles (caisses fermées, numéros sans trou, journal équilibré), journal figé dans `ecritures_comptables`, plus aucune pièce d'argent datée d'octobre créée ni modifiée. Réouverture par l'admin avec motif, au journal d'audit.
**Base** : `periodes_comptables` (+ `clos_par`, `clos_le`, `motif_reouverture`) ; `assert_mois_ouvert(date)` dans les triggers de `factures`, `factures_avoir`, `paiements`, `acomptes_*`, `depenses`, `factures_fournisseur`, `paiements_fournisseur`, `mouvements_caisse` ; garder le verrou 075.
**Écran** : Rapports › « Export comptable » : mois, état, « Clôturer ».
**Tests** : dépense datée d'un mois clos → 422 ; le mois en cours ne se clôture pas ; réouverture journalisée.
**Fini quand** : un mois exporté ne change plus. **Dépend** : 03-D, 08-K, 22-C à 22-E. **Risque** : bloquer une vente ; d'où le mois en cours exclu.

### 22-H · Export pour le cabinet (M, priorité 3)
**Problème** : D9. **Résultat** : pour un mois clos, Excel et CSV : journal (code, date, pièce, compte, compte tiers, nom, libellé, débit, crédit, mode, référence de paiement, référence FNE), balance de contrôle, soldes clients et fournisseurs, état du stock (15-E) et variation 31/6031 proposée en fin d'exercice ; variante « recettes et dépenses ». Lien `wa.me` (03-L).
**API** : `GET /export-comptable/:annee/:mois?format=xlsx|csv` (admin, gérant).
**Fichiers** : service, aide CSV de 27-H, page de 22-G.
**Tests** : débit = crédit ; un mois clos ré-exporté donne le même fichier ; import d'essai chez un cabinet.
**Fini quand** : un cabinet importe un mois sans retouche. **Dépend** : 22-G, 27-H, 15-E. **Risque** : format d'import à obtenir d'un cabinet.

### 22-I · TVA dans le journal (S, priorité 5)
**Problème** : `factures_tva_zero` (03-K) ; plan à 4456/4457. **Résultat** : section 7 ; non assujetti inchangé.
**Base** : lit `taux_tva`, `montant_tva` des lignes (03-K) ; 4431, 4452 remplacent 4457, 4456.
**Tests** : 18, 9 et 0 % mêlés : 4431 du mois = TVA collectée de 23-J.
**Fini quand** : HT + TVA = TTC dans le journal. **Dépend** : 03-K, 22-B, 22-C, 22-D. **Risque** : arrondis par ligne.

## 9. Questions

1. Question 10 : comptabilité cachée et exportée vers le cabinet (proposé) ?
2. Avez-vous un cabinet pour relire 22-B et donner son format d'import ? Quel logiciel ?
3. Le cabinet a-t-il son compte, ou l'admin lui envoie le fichier chaque mois (proposé) ?
4. Qui clôture, et jusqu'à quand (proposé : l'admin, avant le 10 du mois suivant) ?
5. Argent pris par le patron : compte de l'exploitant ou compte courant d'associé, selon la forme juridique (25-H) ?
6. Journal « recettes et dépenses » pour les plus petits dès le premier client ?
