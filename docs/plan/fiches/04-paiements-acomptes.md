# 04 · Paiements et acomptes clients

> **Contre-expertise du 2026-11-26** ([détail](../vagues/vague-2-contre-expertise.md)) : Verdict maintenu. D2 : la déduction de l'acompte à la création d'une facture est une décision écrite (CLAUDE.md). B1 : erreur rare au rythme réel, message « Vérifiez votre connexion » et non « Erreur serveur », nouvel essai sans doublon. « 13 sur 24 » n'est pas un taux : tout client dont un acompte a servi a un solde faux sur la fiche et la liste. Lot 04-C à découper en trois étapes et à faire après 08-A ; remplacer `solde_client_actuel`. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-25, base `nolyx_audit_1`, données créées par l'ERP. « Écran » : un employé y arrive à la souris. « API » : appel direct.

## 1. Verdict

**Simplifier.** Payer une facture marche bien. Le reste est faux ou incompréhensible : le solde du client ment dès qu'un acompte sert, l'acompte part sur des factures non choisies, un chèque impayé ne s'annule plus. Cinq mécanismes (paiement, acompte, imputation automatique, compensation, recalcul) là où le commerçant n'en voit que deux : **l'argent reçu** et **ce qu'il règle**.

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Encaisser une facture | 5 | 5 | 3 | 5 | 5 | 5 |
| Acompte (commande, mise de côté) | 4 | 5 | 4 | 4 | 4 | 4 |
| Versement global sur plusieurs factures | 4 | 2 | 1 | 5 | 4 | 5 |
| Compensation | 1 | 1 | 0 | 2 | 1 | 1 |
| **Réponse actuelle (tout)** | 2 | 2 | 2 | **1** | 2 | 1 |

## 3. Parcours réel

| Action | Qui (écran) | Étapes | Constat |
|---|---|---|---|
| Encaisser une facture ouverte | caissier, vendeur, gérant, admin | 2 (espèces) ou 4 (Wave) | **Bon** : montant prérempli, monnaie à rendre, lisible à 390 px |
| Depuis la liste ou la fiche contact | personne | – | **Aucun bouton** |
| 500 000 F sur 12 factures de 55 000 F | – | 10 factures × 4 gestes = **40 gestes**, plus un calcul de tête | 10 paiements, 10 reçus, 10 lignes de caisse pour un versement |
| Recevoir un acompte | **gérant, admin seulement** | 5 clics | L'API accepte caissier et vendeur, mais la fiche contact leur est fermée (`routeAccess.ts:158`) |
| Reçu d'acompte | personne | – | N'existe pas |
| Appliquer un acompte | tous les rôles vente | 3 clics | Prend plus que demandé (D2) |
| Défaire une application | personne | – | « Annulez l'application » : **cette action n'existe pas** |
| Modifier un paiement | personne | – | API seulement |
| Supprimer un paiement | admin, caisse encore ouverte | 2 clics | Gérant : 403. Après clôture : personne (D3) |
| Retrouver un paiement par sa référence Wave | personne | – | Aucune page ; recherche globale : « Aucun résultat » |
| Reçu de paiement | tous | 1 clic | PDF A4, ni 80 mm, ni WhatsApp |

Concurrence, **bon** : trois paiements simultanés du reste dû d'une facture, même envoi trois fois, acompte remboursé trois fois : un seul passe à chaque fois (mais le même envoi répond « Erreur serveur » aux doublons).

## 4. Défauts prouvés

### Argent

| N° | Défaut | Preuve | Atteint |
|---|---|---|---|
| **D1** | **Le solde client est faux dès qu'un acompte, un avoir imputé ou une compensation est utilisé** | Client T7 : 660 000 facturés, 500 000 versés. Fiche : « **340 000 F, vous lui devez** » ; il **doit** 160 000, comme le dit le PDF de la même page. 13 clients faux sur 24. `calculer_solde_client` (`ci-baseline.sql:131`) et `TiersService.ts:201` retirent l'acompte **et** les paiements qui en sortent, et oublient `partiellement_utilise`. Avoir imputé (T11) : vrai −40 000, liste −100 000, fiche 0, relevé 0 | Écran |
| **D2** | **L'acompte se dépense tout seul** | « Acompte de 10 000 F appliqué à la facture FAC-…235 », mais **40 000 partent aussi sur FAC-…234**, acompte à 0 (`AcompteService.ts:357`). Rembourser 10 000 sur 50 000 : les 40 000 restants partent sur une facture (`:440`). Une nouvelle facture à crédit prend aussi l'acompte | Écran |
| **D3** | **Chèque impayé : impossible à défaire** | 200 000 par chèque, caisse clôturée : supprimer, changer montant ou mode, annuler la facture : 409, même admin, même caisse rouverte. La facture reste « Payée » ; aucun bouton. Idem si le caissier a tapé Espèces au lieu de Wave la veille | Écran |
| **D4** | **Un acompte non espèces n'existe ni en caisse ni au grand livre** | Wave 80 000, caisse ouverte : ni session, ni mouvement, ni écriture (`AcompteService.ts:161-186`). Son remboursement, lui, sort : compte 54 à **−80 000** | Écran |
| **D5** | Compte 419 jamais soldé | Appliquer un acompte n'écrit rien ; rembourser débite 411. Après l'essai : 419 = **842 000** contre 184 000 d'acomptes réels | Écran |
| **D6** | **Compensation** non verrouillée, mal dirigée, remboursable en espèces | « Compensation enregistrée sur FAC-…337 » : c'est **FAC-…336** qui est payée. Trois compensations simultanées de 50 000 passent pour 100 000 possibles (`CompensationService.ts:27`, sans verrou) ; le surplus est ensuite **remboursé en espèces** : 50 000 sortis pour de l'argent jamais entré. À l'inverse, compenser les 100 000 dus est refusé (D1) | Écran ; triple envoi, surplus : API |
| D7 | Paiement supprimé = effacé | Ligne supprimée ; le journal garde numéro, facture, montant, mode : plus de référence, de date ni d'encaisseur (`PaiementService.ts:606`) | Écran (admin) |
| D8 | Compte auxiliaire jamais lu et faux | `compte_client_lignes` est écrite à 16 endroits, lue nulle part. Paiement de 40 000 porté à 60 000 puis supprimé : 120 000 au lieu de 100 000 | Invisible |
| D9 | « Encaissements » du tableau de bord | Acompte reçu : 0. Facture qui l'absorbe : +90 000 « encaissés » le jour où rien n'entre (`PaiementController.ts:182`, pas de filtre sur l'origine) | Écran |
| D10 | Espèces dans la caisse d'un autre magasin | Vendeur de MAG-1, facture MAG-1, tiroir MAG-2 : 201 (aussi pour un acompte) | API |
| D11 | Dates et centimes | 01/01/2031 et 01/01/2019 acceptés ; 1 000,5 F accepté ; 0,004 F répond « Paiement de 0 FCFA enregistré » | API |

### Blocage

| N° | Défaut | Preuve | Atteint |
|---|---|---|---|
| **B1** | **Deux factures du même client payées en même temps : l'une échoue** | 10 paires sur 10 en Wave, 10 sur 10 en espèces, 3 sur 4 au Client comptoir, 2 sur 4 entre vente comptoir et encaissement : « Erreur serveur » après 1 s, un interblocage PostgreSQL par échec (35 → 36). Deux ventes comptoir, ou 60 ms d'écart : 0 échec. Aucun argent perdu, mais la fenêtre grandit avec les factures du client (vente : 760 ms à 543 factures, vague 1) | Écran, deux postes (rejoué par API) |
| B2 | Acompte appliqué par erreur : définitif | Supprimer 409, annuler la facture 409, rembourser 422 | Écran |
| B3 | Acompte Wave saisi sans magasin : non remboursable | L'écran n'exige pas le magasin, puis affiche « magasin_id ou session_caisse_id requis » | Écran |
| B4 | « Erreur serveur » au lieu d'une phrase | Clé de plus de 80 caractères, date illisible, passage en espèces sans caisse | API |
| B5 | Plafond de crédit sans l'acompte | Plafond 100 000, acompte 10 000, facture 105 000 : refusée | API |

### Gêne

- **Le reçu change.** Reçu n° 197 de 50 000 : « Reste à payer 105 000 ». Réimprimé après le solde : « **Reste à payer 0** ». Numéro interne (197), avec trous : les applications d'acompte le consomment.
- Même référence Wave sur deux factures : accepté sans alerte.
- Le relevé PDF oublie acomptes disponibles et avoirs, et repart de 0 quand on choisit une période.
- Référence sans exemple pour Wave ; « Mobile Money » à côté de trois opérateurs ; pas de date (un virement d'hier est daté d'aujourd'hui) ; note du remboursement ignorée.
- « Recalculer les soldes » (admin) annonce 0 changement alors que 13 fiches sont fausses.
- API : `date_fin` de `/paiements` exclut le jour même (1 ligne au lieu de 109) ; dépôt et lecteur lisent paiements, reçus et totaux (→ 03-E).

**Décisions de `CLAUDE.md` revues.** « Un paiement règle sa facture » : **tient**, partout. « Un acompte ne s'utilise que par son action » : **ne tient pas** (D2). « Plus ancienne d'abord pour l'argent sans facture » : voulu, mais mauvais ici : l'acompte d'un ordinateur commandé paie la souris achetée à crédit entre-temps.

## 5. Comparaison

| | Eux | Nous |
|---|---|---|
| Odoo | Dépôt sur compte, choix des factures à solder en caisse [O12] ; acompte % ou fixe sur devis ou commande [O11] ; Wave, Orange, MTN absents des terminaux documentés [O16] | Choix des factures : absent. Acompte lié à rien |
| Sage | Règlements toutes gammes ; encours contrôlé [G1] | Facture par facture |
| Loyverse | Encaissement immédiat seul | Mieux |
| Karnet, eBoutik | Versements partiels, qui doit combien [P5][P7] | Le nôtre est faux (D1) |
| Ma Caisse | Opérateur noté, paiement mixte, monnaie [P3] | Égal, sans Moov |

**Notre avance** : monnaie à rendre, caisse fermée annoncée, un double clic n'encaisse qu'une fois.
**Minimum non tenu** : reçu de versement, solde avant/après.

## 6. Manques par profil

| Besoin | Profils | Quand |
|---|---|---|
| « Encaisser un client » : un montant, plusieurs factures, un reçu | Grossiste, général | Premier mois |
| Annuler un encaissement après clôture, chèque impayé | Tous | Premier mois |
| Acompte lié à un devis ou à une mise de côté, avec reçu | Informatique, habillement | Premier mois |
| Page des encaissements : mode, référence, magasin, jour | Tous | Premier mois |
| Caissier : recevoir un acompte, voir la dette d'un client | Tous | Premier mois |
| Moov, téléphone du payeur | Tous | Premier mois |
| Import de relevé d'opérateur, échéancier, bordereau de chèques | – | Plus tard |

**À supprimer** : le moteur d'imputation automatique (`ClientAllocationService`, 1 016 lignes), « Recalculer les soldes » et ses deux routes, `compte_client_lignes`, `appliquer_acomptes` / `skip_acompte_application`, la modification libre d'un paiement, l'origine « reversal » jamais écrite, la compensation depuis la facture. Ce moteur réparait d'anciennes données de test.

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** : rien sur un paiement. Un acompte peut rendre la TVA exigible : à confirmer avant 03-K.
- **FNE** : rien au-delà de mode, date, référence (03-L).
- **Mobile money** : le QR du magasin suffit. Le vendeur choisit l'opérateur, saisit la fin de la référence et, s'il veut, le téléphone du payeur (prérempli). Terrain : `operateur`, `reference_operateur`, `telephone_payeur`, `frais`, `statut_rapprochement` (`non_pointe`, `pointe`, `conteste`), `origine` (`saisie`, `import`, `api`). Un paiement automatique ne sera qu'une autre `origine`.
- **WhatsApp** : « Envoyer le reçu » ouvre `wa.me/225…` avec montant, reste dû et lien vers le reçu.

## 8. Lots

Règle cible, une phrase : **un versement = de l'argent reçu une fois ; il règle les factures choisies ; le surplus est un acompte ; rien ne bouge sans un geste.**

### 04-A · Un seul solde client, juste partout (M, priorité 1)
**Problème** D1, relevé, B5. **Résultat** : fiche, liste, relevé, PDF et plafond donnent le même chiffre.
**Formule** : Σ restes dus des factures vivantes − Σ `montant_restant` des acomptes non remboursés − Σ restes des avoirs valides non utilisés.
**Base** : migration réécrivant `calculer_solde_client` et `calculer_solde_net` ; `ci-baseline.sql`.
**Fichiers** : `TiersService.ts` (`getCompte`, `getReleveDetaille` ; supprimer `getClientsWithBalance`, `getClientCompte`, sans appelant), `PDFService.generateRelevePDF`, `CreditService.ts`, `TiersDetail.tsx`.
**Étapes** : fonction unique ; relevé avec solde d'ouverture, acomptes, avoirs, remboursements ; l'application d'acompte devient une mention, pas un crédit.
**Tests** : acompte disponible, partiel, utilisé, remboursé en partie ; avoir émis, imputé, remboursé ; compensation ; les quatre vues comparées.
**Fini quand** : T7 = 160 000 partout ; 0 client faux sur 24. **Dépend de** : rien. **Risque** : la fiche 06 lit ces soldes.

### 04-B · Rien ne bouge sans un geste (S, priorité 1)
**Problème** D2. **Résultat** : appliquer 10 000 prend 10 000 ; rembourser 10 000 rend 10 000.
**Étapes** : passer `acomptePoolCap` à tous les appels sans plafond (`AcompteService.ts:357,440`, `FactureService.ts:593,1172`, `BonLivraisonService.ts:698`, `DevisService.ts:746`, `CreditNoteService.ts:611` ; compensation : 04-J) ; à la création d'une facture, proposer « Utiliser l'acompte de 50 000 F » : facture et comptoir (07-B).
**Tests** : les quatre scénarios D2 ; tests E1 adaptés.
**Fini quand** : somme des applications = somme des gestes. **Dépend de** : rien ; question 1.

### 04-C · Moteur d'imputation supprimé (M, priorité 2)
**Problème** B1, lenteur de 07-B, D8, recalcul inutile. **Résultat** : encaisser ne réécrit qu'une facture ; plus d'échec croisé.
**Étapes** : (1) reste dû = total − paiements vivants, trigger ne touchant jamais une facture annulée ; (2) chaque écriture d'argent verrouille d'abord la ligne `tiers`, puis les factures par identifiant croissant ; (3) retirer les 12 appels, les routes `recompute-*`, le bouton, `compte_client_lignes` et ses écritures.
**Fichiers** : `ClientAllocationService.ts` (supprimé), appelants, migration, `TiersDetail.tsx`, `PaymentHistory.tsx`.
**Tests** : 10 paires de B1, 0 échec ; 5 000 factures au Client comptoir, moins de 150 ms ; soldes identiques avant et après sur une copie.
**Dépend de** : 04-A, 04-B. **Seul responsable du moteur : 07-B s'appuie dessus.** **Risque** : fort ; étapes livrables séparément.

### 04-D · Annuler un encaissement, proprement (M, priorité 1)
**Problème** D3, D7, B2. **Résultat** : le gérant annule un paiement à tout moment, avec motif (« chèque impayé », « mauvais mode », « erreur ») ; la facture redevient due ; le reçu reste consultable, barré.
**Base** : `paiements.statut` (`valide`, `annule`), `annule_le`, `annule_par`, `motif`, `mouvement_annulation_id` ; idem `acompte_applications`.
**API** : `POST /paiements/:id/annuler` (gérant, admin), `POST /acomptes/applications/:id/annuler` ; retirer `DELETE` et `PUT /paiements/:id`.
**Étapes** : session d'origine ouverte → contre-mouvement dedans. Session close, espèces → argent rendu (sortie de la caisse ouverte) ou erreur de saisie (écart tracé, sans sortie) ; autres modes : écriture inverse sans toucher au tiroir. Application d'acompte : le montant redevient disponible. Période close : écriture datée du jour. « Changer le mode » = annuler et refaire.
**Tests** : les six refus de D3 ; compensation ; stats et PDF excluant les annulés.
**Fini quand** : chèque impayé → facture « En attente », client débiteur, trace complète.
**Dépend de** : 08 (écart de caisse), 04-B. Remplace la partie « acompte » de 03-D. **Risque** : chaque `SUM(paiements)` doit ignorer les annulés (liste à dresser).

### 04-E · L'acompte passe par la caisse et le bon compte (S, priorité 1)
**Problème** D4, D5, D9, B3. **Résultat** : tout acompte est compté le jour reçu, par mode.
**Étapes** : magasin obligatoire (champ caché s'il n'y en a qu'un) ; session ouverte exigée pour tous les modes, comme 07-F ; mouvement `acompte_client` pour chacun ; application → écriture 419 vers 411 ; remboursement → débit 419 ; les encaissements du tableau de bord = paiements directs + acomptes reçus − remboursements.
**Fichiers** : `AcompteService.ts`, `CaisseMagasinService.ts` (catégories), `PaiementController.getStats`, `TiersDetail.tsx`.
**Tests** : Wave, chèque, espèces ; 419 = acomptes disponibles après 10 opérations.
**Dépend de** : 07-F, 08 ; 22 pour le 419 (si la comptabilité disparaît, cette partie saute).

### 04-F · « Encaisser un client » (L, priorité 4, trois étapes)
**Problème** : 40 gestes pour un versement. **Résultat** : depuis la fiche, la liste des factures, la caisse ou la recherche : client, 500 000 F, mode, Enregistrer. Les plus anciennes sont cochées d'avance, modifiables ; le surplus devient un acompte, écrit en toutes lettres.
**Base** : `versements` (`numero` sans trou, `tiers_id`, `montant`, `mode`, champs de la section 7, `date_versement`, `magasin_id`, `session_caisse_id`, `mouvement_caisse_id`, `statut`, `solde_avant`, `solde_apres`, `cree_par`, `cle_envoi` unique) ; `versement_id` sur `paiements` et `acomptes_clients`.
**API** : `POST /tiers/:id/versements {montant, mode, affectations?}`, une transaction, un mouvement, une écriture ; `GET` du détail. `POST /factures/:id/paiements` = versement à une affectation.
**Étapes** : (1) base et API ; (2) écran, 390 px d'abord, pour caissier et vendeur ; (3) fiche « Ce que doit ce client » ouverte aux rôles de vente.
**Tests** : 500 000 sur 12 × 55 000 = 9 soldées, 1 à 5 000, 2 intactes ; surplus ; trop-perçu ; double envoi ; deux caisses.
**Fini quand** : 5 gestes, 1 reçu, 1 ligne de caisse. **Dépend de** : 04-A à 04-D. **Risque** : Client comptoir exclu (pas de dette anonyme).

### 04-G · Reçu numéroté, figé, envoyable (M, priorité 4)
**Problème** : reçu qui change, aucun reçu d'acompte. **Contenu** : n° `REC-2026-00001`, magasin, date et heure, client, montant en chiffres et en lettres, mode, référence, factures réglées, **solde avant et après figés**, encaisseur, « Annulé » ou « Duplicata » s'il y a lieu ; 80 mm et A4/A5 ; « Envoyer sur WhatsApp ».
**Fichiers** : `PDFService.ts`, `utils/ticket.ts`, `PaymentHistory.tsx`, page publique à jeton (03-L).
**Tests** : reçu de 50 000 réimprimé après le solde : identique ; acompte ; annulé.
**Dépend de** : 04-F, 03-L (lien), gabarit de la fiche 27. Compteur sans trou : mécanisme de 03-D. **Risque** : jeton devinable ; aléatoire, révocable, daté.

### 04-H · Journal des encaissements et mobile money (M, priorité 4 puis 6)
**Problème** : paiement contesté introuvable, double référence. **Résultat** : page « Encaissements » (gérant, admin ; caissier limité à ses paiements du jour) : recherche par référence, téléphone, client, montant ; filtres mode, magasin, jour, annulés, sans référence ; total par opérateur, à comparer au relevé ; case « pointé ».
**API** : `GET /versements` (filtres, jour de fin inclus) ; référence dans la recherche globale ; avertissement si la référence a déjà servi (magasin, 30 jours), jamais bloquant.
**Fichiers** : `PaiementController.getAll`, page neuve, `routeAccess.ts`, `PaymentModal.tsx` (exemple de référence par opérateur, téléphone, date du virement).
**Tests** : « Wave 50 000 d'hier » retrouvé en 2 gestes ; doublon signalé. **Dépend de** : 04-F, 07-F (Moov). Import d'un relevé : plus tard.

### 04-I · Acompte de commande et mise de côté (M, priorité 4)
**Problème** : l'acompte n'est lié à rien. **Résultat** : sur un devis, « Recevoir un acompte » ; il est réservé, proposé à la facture, remboursé ou gardé si le devis est annulé, au choix du gérant.
**Base** : `document_type`, `document_id` sur l'acompte. **Fichiers** : `AcompteService.ts`, `DevisDetail.tsx`, `DevisService.ts`.
**Tests** : devis 600 000, acompte 200 000, facture à 400 000 dû ; achat d'une souris entre-temps : acompte intact.
**Dépend de** : 04-B, 01. **Risque** : réserver le stock est hors sujet (13).

### 04-J · Compensation réduite et verrouillée (S, priorité 1)
**Problème** D6. **Résultat** : uniquement sur la fiche d'un contact client **et** fournisseur, gérant ; on choisit les factures des deux côtés.
**Étapes** : verrou `tiers` avant lecture ; montants contrôlés sur les factures choisies, plus sur les soldes ; un seul enregistrement de compensation affecté aux factures, plus d'acompte remboursable ; `refundClient` refuse une compensation ; annulation liée ; retirer le bouton de la facture.
**Fichiers** : `CompensationService.ts`, `AcompteService.ts`, `FactureDetail.tsx`, `TiersDetail.tsx`.
**Tests** : trois envois simultanés : deux acceptés au plus ; remboursement refusé. **Dépend de** : 04-A ; question 3 (sinon, masquer le bouton en attendant).

### 04-K · Qui encaisse, où, quand (S, priorité 3)
**Problème** D10, D11, B4. **Résultat** : caissier et vendeur encaissent factures et acomptes de **leur** boutique ; seul le gérant annule, rembourse, date en arrière.
**Étapes** : toujours la session du magasin de la facture (ignorer celle envoyée) ; contrôle de boutique (fiche 13) ; date : ni future, ni antérieure à la facture, sauf gérant ; montants entiers (03-B) ; longueurs Zod = colonnes ; conflit d'unicité → renvoyer le paiement existant.
**Fichiers** : `schemas.ts`, `PaiementService.ts`, `AcompteService.ts`, `routes/{paiements,acomptes,tiers}.ts`.
**Tests** : matrice rôle × magasin × action ; doublon simultané : trois 200/201 identiques.
**Dépend de** : 13, 24, 03-B. Lecture par le dépôt : 03-E.

**Ordre** : A, B, J, E, D, C, K, F, G, H, I.

## 9. Questions pour le propriétaire

1. À la création d'une facture, l'acompte libre d'un client : **proposé** (recommandé), ou déduit d'office ? D'office : 04-I réserve celui d'une commande.
2. Encaissement espèces annulé après clôture : sortie de la caisse du jour, ou écart constaté sans sortie ? (recommandé : choix du gérant, motif obligatoire)
3. Compensation : la garder pour les contacts client et fournisseur, ou la supprimer ? (recommandé : garder réduite, invisible sinon)
4. Versement : le plus ancien d'abord, modifiable (recommandé), ou l'employé choisit toujours ?
5. Le caissier voit-il la dette totale d'un client, ou seulement le reste de chaque facture ?

Lié aux questions ouvertes : 5 (caisse ou tiroir) change 04-D ; 7 (référence) change 04-H ; 10 (comptabilité) change 04-E.

**Non vérifié** : plus de 600 factures ; impression réelle ; période close ; fréquence des chèques impayés ; aucun commerçant interrogé.
