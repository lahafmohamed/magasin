# 06 Relances et limite de crédit

> **Contre-expertise du 2026-11-27** ([détail](../vagues/vague-6-contre-expertise.md)) : Verdict maintenu. D1 : CLAUDE.md voulait que le gérant décide du crédit, mais un plafond de 0 veut dire illimité : 06-A est juste, CLAUDE.md doit dire « sans crédit ». D2 : l'écran est « Nouvelle facture » (facture créée avant le paiement) ; propriétaire 06-A côté serveur, 07-H retire l'écran. D3 : propriétaire 04-A, élargi à `ReportingService.ts` (Relances, Rapports, accueil) et à la liste des contacts, qui trie sur un autre chiffre que celui qu'elle affiche. D10 : la remise en stock à l'annulation est voulue ; le défaut est l'absence de geste « perte » (06-G, plus tard). 06-C découpé en 06-C1 (voir l'encours) et 06-C2 (accord du gérant, après le code PIN de la fiche 24). Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-27, base `nolyx_audit_3`, interface et API réelles (six rôles ; 1440 et 390 px). Montants en FCFA. Clients d'essai `AUDIT6 …` créés par l'ERP. Caisse : la session du 25/11 (ouverte depuis plus de 24 h, 409) a été clôturée par le gérant (attendu 60 000, compté 60 000), puis une session neuve ouverte au magasin 1 avec 50 000.

## 1. Verdict

**Améliorer.** Le plafond bloque vraiment, sur les trois chemins, même pour deux ventes simultanées ; la page Relances a la bonne base. Mais le crédit se prend sans être donné : un plafond à 0 veut dire « illimité », donc le Client comptoir, tout client créé par le caissier et tout client neuf achètent à crédit sans fin. Un même client doit 100 000 F sur la page Relances et le relevé, 64 500 F sur sa fiche, 84 500 F en vrai. La liste ignore l'échéance, n'envoie rien sur WhatsApp, oublie la date promise. On ne peut ni couper le crédit d'un client ni passer une dette en perte. La page devient « Crédit clients » : qui doit, depuis quand, qui n'a plus de crédit ; la carte des Rapports disparaît.

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire boutique / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Besoin | 4 | 4 | 2 | 3 / 5 | 4 | 5 |
| Réponse actuelle | 2 | 2 | 2 | 1 / 2 | 2 | 2 |

- **Grossiste et demi-gros** : « je paie à la fin du mois », « je laisse 50 000 ». Le crédit est son métier : plafond, échéance, relance chaque semaine.
- **Informatique** : entreprises et écoles à 30 jours ; montants élevés (un portable = 595 000 F).
- **Habillement** : surtout comptant ; un peu de crédit aux habituées.
- **Plusieurs sites** : la page ne filtre pas par boutique.

## 3. Parcours réel

| Rôle | À l'écran | Ce qui surprend |
|---|---|---|
| Gérant, 1440 et 390 | Menu → Relances : **2 gestes**. 15 débiteurs, 22 574 785 F, triés par montant. « Relancer » ouvre un formulaire : canal, réponse du client, « Me le rappeler le » | En tête : « Client comptoir, Aucun téléphone, 5 181 654 F ». Des factures du jour à « 0 j ». Rien n'envoie de message : on **note** une relance faite ailleurs |
| Vendeur, 390 | Nouvelle facture → client → riz × 3 → « Créer la facture » | Aucun encours ni plafond affiché. Après le clic : « Plafond de crédit dépassé… Limite: 100000.00, Encours actuel: 62000.00… » (capture `vendeur-facture-refus-390`). Aucune issue proposée |
| Caissier, 1440 | Nouvelle facture : Client comptoir présélectionné → souris → « Créer la facture » → fenêtre de paiement → « Annuler » | FAC-2026-00217 : **5 000 F dus par le Client comptoir** (capture `caissier-facture-comptoir-1440`) |
| Caissier, vendeur | Relances hors menu (`routeAccess.ts:128`) ; API 403 ; noter une relance : 403 | Ils ne voient pas qui doit, même en vendant à crédit |
| Dépôt, lecteur | Pas de page | API : relevé, compte et PDF d'un client : **200**, montants compris |

**Relancer les 10 plus gros retards sur WhatsApp, ce matin, au téléphone.** Aujourd'hui, par client : copier le numéro (le lien ouvre l'appel), ouvrir WhatsApp, nouvelle discussion, coller, taper message et montant, envoyer, revenir, « Relancer », choisir « WhatsApp », noter la réponse, enregistrer : **environ 15 gestes, 150 pour dix**. Joindre le relevé : 4 de plus. Avec 06-H : **2 gestes par client**, la relance notée d'office.

**Ce qui marche (rejoué).**

| Cas | Résultat |
|---|---|
| Plafond 100 000, facture de 62 000 puis 46 500 (vendeur) | 201, puis 422 |
| Deux factures de 62 000 au même instant (vendeur et caissier), plafond 100 000 | 201 et 422 : verrou du client (`CreditService.ts:28-34`) |
| Devis de 124 000 confirmé, plafond 100 000 | 422, devis resté en brouillon |
| Plafond fixé par le caissier | 403 « fixés par le gérant » |
| Statut « payée » forcé par le gérant | 400 : il découle des paiements |

## 4. Défauts prouvés

### Argent

| N° | Défaut | Preuve | Atteint |
|---|---|---|---|
| **D1** | **Crédit illimité par défaut** | `credit_max <= 0` = aucune limite (`CreditService.ts:43-46`). Formulaire du gérant : 0 par défaut (`Tiers.tsx:85`). Client créé par le caissier : forcé à 0 (`TiersController.ts:78`), puis **FAC-2026-00209 de 1 550 000 F à crédit**, acceptée, caissier seul. CLAUDE.md voulait « sans plafond de crédit », la fenêtre dit « plafond fixé par le gérant » : l'effet réel est l'inverse | Écran (parcours du D2) ; montant par l'API |
| **D2** | **Crédit au Client comptoir** | FAC-2026-00217 (écran) et FAC-2026-00202 (API) : impayées, sans nom ni téléphone. Plafond du Client comptoir : 0, illimité, aussi sur une base neuve (`nolyx_audit_neuve`). Ses avoirs paient la dette d'un autre anonyme (vague 3, 05-B) | Écran |
| **D3** | **Trois dettes pour un client** | « AUDIT6 Dette F » : 185 000 facturés, 85 000 versés (dont un acompte de 20 000), avoir de 15 500 non imputé, une facture annulée. **Vrai : 84 500.** Relances, relevé (écran et PDF), plafond : **100 000** (avoir ignoré). Fiche et liste des contacts : **64 500** (acompte compté deux fois). Global : accueil et relances 22 574 785 ; somme des soldes des contacts (SQL) 22 489 285 | Écran |
| D4 | Le plafond ignore l'argent laissé | « AUDIT6 Acompte B » : 93 000 dus, 50 000 laissés (net 43 000). Achat de 46 500 (net 89 500 < 100 000) : **422 « Encours actuel: 93000.00 »** | API (même chemin à l'écran) |

D3 et D4 : formule déjà confiée à **04-A** (vague 2, D1 et B5), rejouée et toujours vraie. 04-A doit ajouter à sa liste la balance âgée, la page Relances et l'accueil (`ReportingService.ts:65-160`) : elles lisent le reste dû des factures, pas la formule.

### Blocage

| N° | Défaut | Preuve | Atteint |
|---|---|---|---|
| D5 | **Impossible de couper le crédit d'un client** | 0 = illimité ; aucun état « bloqué ». Seule astuce : un plafond de 1 F (plafond 100 : refusé) | Écran |
| D6 | **La file ignore l'échéance** | « Impayé depuis » et les tranches partent de la date de facture (`ReportingService.ts:84-96`). Factures du jour à « 0 j » dans la liste. L'échéance est toujours le jour même : pas de délai dans la fiche contact (03-F) | Écran |
| D7 | **La date promise ne revient jamais** | « Me le rappeler le 28/11 » enregistré ; `GET /crm/rappels` le renvoie (`crm.ts:139`) ; **aucun** appel dans le front | Écran |
| D8 | Le vendeur découvre le plafond après coup | Ni encours ni disponible avant le clic ; message brut ; ni « payer une partie », ni « accord du gérant » | Écran |
| D9 | Pas de WhatsApp | Les canaux servent à noter (`Relances.tsx:36`) ; seul lien : `tel:` | Écran |
| D10 | **Aucune perte sur créance** | Seule voie : annuler, refusé dès qu'un franc est payé, et qui **remet les articles en stock** (FAC-2026-00214 : +2 souris, « Annulation facture »). Types d'avoir : retour, échange, remise, erreur | Écran |

### Gêne

| N° | Défaut | Preuve | Atteint |
|---|---|---|---|
| G1 | Sous-titre « du plus ancien impayé au plus récent », tri par montant | `ReportingService.ts:137` ; capture : 44 j, 44 j, 42 j, 46 j | Écran |
| G2 | « Dernière relance » lue sur les 200 dernières relances | `Relances.tsx:164` : au-delà, « Jamais relancé » à tort | Lu (code) |
| G3 | Deux balances âgées | Relances, et la carte des Rapports avec export CSV et filtre boutique (`Reporting.tsx:728`) | Écran |
| G4 | Relevé | Période sans solde d'ouverture : du 28/11 → **0** alors que 100 000 sont dus ; dates « 2026-11-27 » ; une ligne par article depuis le premier achat (04-A, fiche 27) | Écran |
| G5 | Relevé ouvert à tous | Dépôt et lecteur lisent relevé, compte et PDF (`tiers.ts:28-32`, sans contrôle de rôle) | API |
| G6 | Chaque refus de crédit consomme un numéro | 7 trous : 204, 205, 208, 210, 213, 215, 216 (03-D) | Écran |

## 5. Comparaison

| Sujet | Odoo | Sage 100 | Outils locaux | nolyxERP |
|---|---|---|---|---|
| Plafond | Avertissement orange, ne bloque pas [O12] | Contrôle d'encours automatique [G1] | « Crédit plafonné » attendu [D2] | **Bloque vraiment**, sûr à deux caisses ; mais 0 = illimité |
| Relances | Niveaux par jours de retard, même avant échéance ; e-mail, SMS, WhatsApp (Enterprise, à crédits) [O13][O14] | Côté Comptabilité [G7] | Message WhatsApp prêt, montant prérempli, échéances du jour, relevé PDF (Karnet [P5]) ; ancienneté (BokkCom [P8]) | Liste par client ; rien n'est envoyé |
| Relevé | Relevé de compte | Relevé | PDF | PDF article par article, comme le cahier ; faux dès un avoir |

Mieux chez eux : l'échéance (Odoo), le message prêt (locaux). Mieux chez nous : le blocage réel, le relevé détaillé. Sources : [faits/concurrents.md](../faits/concurrents.md), 25/11/2026.

## 6. Manques par profil

**Premier mois, tous profils** : crédit accordé client par client (06-A) ; client bloqué ; dette juste partout (04-A) ; échéance (03-F) et file « en retard » (06-D) ; promesse datée (06-F) ; relance WhatsApp avec relevé et numéro Wave (06-H).

- **Grossiste** : plafond en jours (« plus de crédit après 30 jours de retard ») ; facture de fin de mois (03-J) ; bons livrés dans l'encours (02-C).
- **Informatique** : échéance à 30 ou 60 jours ; relance par e-mail au comptable du client (lien du relevé, même texte).
- **Habillement, général** : crédit court aux habitués.
- **Plusieurs sites** : filtre par boutique.

**Plus tard** : rappel envoyé tout seul (WhatsApp payant) ; intérêts et pénalités de retard ; score de risque ; reprise d'une dette passée en perte.

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** : aucune incidence ; la dette et le plafond se comptent toutes taxes comprises.
- **FNE** : une facture certifiée ne s'annule pas ; la perte sur créance (06-G) laisse donc la facture intacte. Une perte n'est pas une remise : pas d'avoir FNE (supposé, à confirmer avec le chantier FNE).
- **Mobile money** : le message de relance donne le numéro marchand Wave ou Orange de la boutique et demande la référence (saisie par 08-D). Un lien Wave par facture expire en 30 minutes ([mobile-money.md](../faits/mobile-money.md)) : à générer à l'ouverture du relevé public, plus tard.
- **WhatsApp** : 06-H (lien `wa.me` gratuit), sur le lien public de 03-L.

## 8. Lots proposés

Ordre du cadrage. Prochaine migration : le numéro libre au moment du lot (dernière : `113`) ; `ci-baseline.sql` régénéré. Déjà ailleurs : formule de la dette **04-A**, bons non facturés et message du refus **02-C**, délai de paiement **03-F**, numéros sans trou **03-D**, « Reste à crédit » de « Vendre » **07-H**, avoirs **05-B**, lien public **03-L**, code PIN **fiche 24**, écritures **fiche 22**.

### 06-A · Le crédit se donne, il ne se prend pas (M, priorité 1)
- **Problème** : D1, D2, D5.
- **Résultat** : seul le gérant ouvre le crédit d'un client ; personne n'achète à crédit sans cela ; le Client comptoir jamais.
- **Base** : `credit_max` NULL = sans limite (choix explicite), 0 = pas de crédit (défaut), > 0 = plafond. `tiers.credit_bloque`, `credit_bloque_motif`, `credit_bloque_le`. Migration : 0 reste 0 (aucun utilisateur réel) ; seeds de démonstration avec plafonds.
- **API** : `CreditService.assertWithinCreditLimit` refuse, dans l'ordre : code `PASS` (« Le client comptoir n'achète pas à crédit : choisissez ou créez le client ») ; client bloqué ; plafond 0 (« Pas de crédit accordé à ce client ; le gérant peut en ouvrir un ») ; puis le plafond. `TiersController.create` (caissier, vendeur) : 0. `PUT /tiers/:id` : blocage réservé au gérant, journalisé.
- **Écran** : fiche contact : « Crédit : non / plafond / sans limite », « Bloquer le crédit » avec motif ; texte de `NouveauClientDialog` juste.
- **Fichiers** : `CreditService.ts`, `TiersController.ts`, `TiersService.ts`, `schemas.ts:90-120`, `Tiers.tsx`, `TiersDetail.tsx`, `NouveauClientDialog.tsx`, seeds.
- **Tests** : D1 (1 550 000) → 422 ; FAC-217 → 422 ; bloqué avec plafond libre → 422 ; NULL → accepté ; comptoir payé → accepté.
- **Fini quand** : aucune facture impayée possible sans plafond posé par un gérant. **Dépend** : rien ; 07-H et 02-C appellent la même fonction. **Risque** : un client de démonstration sans plafond ne vend plus à crédit.

### 06-B · Une seule page « Crédit clients » (S, priorité 2)
- **Problème** : G3.
- **Résultat** : une page répond à qui doit, combien, depuis quand, qui est bloqué.
- **Écran** : `Relances` renommée « Crédit clients » (menu, `routeAccess.ts:128`) ; export CSV et filtre boutique repris des Rapports (filtre caché s'il n'y a qu'une boutique) ; la carte « Créances clients par ancienneté » des Rapports devient une tuile avec lien.
- **Fichiers** : `Relances.tsx`, `Reporting.tsx` (état `:200`, carte `:728`), `navConfig.tsx`, `routeAccess.ts`.
- **Tests** : tuile = total de la page ; magasin unique sans filtre.
- **Fini quand** : une seule liste des créances dans l'application. **Dépend** : rien (fiche 23 informée).

### 06-C · Vendre à crédit : je vois, je bloque, le gérant déroge (M, priorité 3)
- **Problème** : D8, D4 côté écran ; question 6.
- **Résultat** : avant de valider, le vendeur lit « Doit 62 000 · plafond 100 000 · disponible 38 000 ». Au-delà : refus, sauf accord du gérant ; ou paiement d'une partie.
- **API** : `GET /tiers/:id/credit` → encours (04-A, plus les bons de 02-C), plafond, disponible, plus grand retard, bloqué. Réglage `credit_retard_max_jours` (plafond en jours) : refus si une facture dépasse ce retard après échéance. Dérogation : `derogation: { pin, motif }` sur facture, bon et devis ; serveur : PIN d'un gérant (fiche 24), écrit `factures.derogation_par`, `derogation_motif` et l'audit. Message en FCFA, sans décimales.
- **Écran** : bandeau dans le récapitulatif (`NouvelleFacture.tsx`, puis « Vendre » de 07-H) ; au refus : « Encaisser une partie » ou « Accord du gérant ».
- **Fichiers** : `CreditService.ts`, `TiersController.ts`, `FactureService.ts`, `BonLivraisonService.ts`, `DevisService.ts`, `NouvelleFacture.tsx`, `VenteComptoir.tsx`, `company_settings`.
- **Tests** : A2 → 422 puis accepté avec PIN ; PIN de vendeur → 403 ; retard 31 jours avec réglage 30 → 422 ; deux dérogations simultanées.
- **Fini quand** : aucun refus surprise ; tout dépassement a un nom et un motif. **Dépend** : 06-A, 04-A, 02-C, 03-F, fiche 24. **Risque** : PIN partagé ; le journal le montre.

### 06-D · La file suit l'échéance (M, priorité 3)
- **Problème** : D6, G1, G2, D2 dans la liste.
- **Résultat** : on relance ce qui est en retard, le plus vieux d'abord.
- **API** : `getReceivablesAging` sur `date_echeance` : « Pas encore dû », « 1–30 », « 31–60 », « plus de 60 jours de retard » ; « En retard depuis » ; filtre par défaut « en retard » ; tri au choix (retard, montant) ; dernière relance et prochaine promesse par jointure sur `crm_interactions` (fin de la limite 200) ; Client comptoir à part, « Ventes anonymes à crédit » ; montant selon 04-A.
- **Écran** : colonnes et tri ; sous-titre juste ; tuile d'accueil « En retard » au lieu de « À recouvrer ».
- **Fichiers** : `ReportingService.ts:65-160`, `reports.ts`, `schemas.ts:741`, `Relances.tsx`, `receivables.ts`, `Dashboard.tsx`.
- **Tests** : facture à 30 jours créée hier : « Pas encore dû » ; 250 relances : dates justes ; magasin unique.
- **Fini quand** : aucune facture non échue dans « en retard ». **Dépend** : 03-F, 04-A. **Risque** : anciennes factures sans échéance : date de facture.

### 06-E · Qui voit la dette, qui relance (S, priorité 3)
- **Problème** : G5 ; caissier et vendeur aveugles.
- **Résultat** : le dépôt ne voit aucun montant ; le caissier répond « combien je dois ? » au comptoir.
- **API** : `GET /tiers/:id/compte`, `/releve-detaille`, `/pdf` : admin, gérant, caissier, vendeur (dépôt exclu ; lecteur selon la fiche 24). Écriture d'une relance : selon la question 3.
- **Fichiers** : `routes/tiers.ts`, `routes/crm.ts`, `routeAccess.ts`.
- **Tests** : dépôt → 403 ; caissier → 200.
- **Fini quand** et **dépend** : matrice de la fiche 24.

### 06-F · Promesse de paiement datée (M, priorité 4)
- **Problème** : D7.
- **Résultat** : « Promet 50 000 vendredi » revient vendredi ; tenue ou non, l'ERP le dit.
- **Base** : `crm_interactions.montant_promis`, `date_promesse`.
- **API** : promesse tenue si les paiements du client entre la relance et la date atteignent le montant ; `GET /crm/rappels` remplacé par « à rappeler aujourd'hui » (promesses échues, rappels).
- **Écran** : champs dans la fenêtre de relance ; filtre « À rappeler aujourd'hui » en tête de « Crédit clients » ; tuile d'accueil ; cloche.
- **Fichiers** : `CrmService.ts`, `crm.ts`, `schemas.ts`, `Relances.tsx`, `Dashboard.tsx`.
- **Tests** : promesse tenue, partielle, échue ; paiement avant la relance non compté.
- **Fini quand** : le 28/11 du banc apparaît le 28/11. **Dépend** : 06-D.

### 06-G · Passer une dette en perte (M, priorité 4)
- **Problème** : D10.
- **Résultat** : effacer une dette perdue sans fausser le stock ni le chiffre d'affaires.
- **Base** : table `pertes_creances` (facture, montant, motif, auteur, date).
- **API** : `POST /factures/:id/perte` (admin ; gérant selon la question 5) : reste dû soldé, stock intact, client bloqué (06-A), période close refusée ; écriture débit 654 / crédit 411 (fiche 22). Paiement ultérieur : plus tard.
- **Écran** : fiche facture, « Plus d'actions » → « Passer en perte », confirmation « Passer 100 000 F en perte ».
- **Fichiers** : `FactureService.ts`, `factures.ts`, migration, `FactureDetail.tsx`, rapport des pertes (fiche 23).
- **Tests** : stock inchangé ; reste dû 0 ; facture certifiée FNE acceptée ; vendeur → 403.
- **Fini quand** : D10 rejoué sans mouvement de stock. **Dépend** : 06-A ; 03-D (annuler n'est plus la voie).

### 06-H · Relancer sur WhatsApp en deux gestes (M, priorité 6)
- **Problème** : D9.
- **Résultat** : dix relances en 20 gestes, chacune notée sans clic de plus.
- **API** : lien public du relevé des impayés (factures ouvertes, échéance, retard, total) sur le mécanisme de 03-L ; normalisation 225 + 10 chiffres partagée.
- **Écran** : bouton « WhatsApp » par ligne : `wa.me/225…?text=` « Bonjour M. Koné, il reste 100 000 F sur vos factures, la plus ancienne due depuis le 12/10. Détail : [lien]. Wave : 07 … » ; ton poli ou ferme ; relance notée canal WhatsApp ; « Client suivant ». Numéros Wave et Orange de la boutique : paramètres (fiche 25).
- **Fichiers** : `Relances.tsx`, `TiersDetail.tsx`, route publique de 03-L, `company_settings`.
- **Tests** : numéro absent ou mal formé ; lien expiré, révoqué.
- **Fini quand** : une relance part depuis un téléphone en 2 gestes. **Dépend** : 03-L, 04-A, 06-D. **Risque** : montants visibles par qui reçoit le lien ; expiration obligatoire.

## 9. Questions pour le propriétaire

1. **Question 6** : proposé, oui, seul, dans le plafond posé par le gérant ; au-delà, accord du gérant (06-C).
2. **Plafond : bloquer ou avertir ?** Proposé : bloquer, sauf accord du gérant. Avertir (comme Odoo) simplifie 06-C, mais rend le plafond décoratif.
3. Le caissier et le vendeur peuvent-ils relancer et noter une relance ?
4. Plafond en jours : « plus de crédit après N jours de retard » ; N = 30 ?
5. Qui passe une dette en perte : l'admin seul, ou aussi le gérant sous un montant ?
6. **Question 13** : sans effet ici ; un acompte disponible baisse l'encours dans les deux cas (04-A).
7. **Question 26** : oui ; l'argent d'une vente impayée ne se rembourse pas (05-B).
8. Plafond maximal de 15 000 000 F (`schemas.ts:100`) : suffisant pour vos grossistes ?

## Non vérifié

Chemin du bon de livraison (02-C, contre-expertisé) ; relance au-delà de 200 (lu dans le code) ; e-mail ; plusieurs boutiques sur la page Relances (lu) ; WhatsApp réel ; profils habillement et général (même code).
