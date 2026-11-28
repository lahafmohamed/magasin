# 18 · Factures fournisseur, paiements, acomptes, retour fournisseur

> **Contre-expertise du 2026-11-26** ([détail](../vagues/vague-4-contre-expertise.md)) : Verdict maintenu. D1 et D2 sont les défauts de la fiche 16 (propriétaire 16-A, 18-A absorbé, on annule au lieu de supprimer). D4 : 5 essais sur 6, en moins de 5 ms, par l'API seulement. D5 : « la plus ancienne d'abord » est une décision écrite (CLAUDE.md, migration 094) ; le total de la dette reste juste, mais la règle ne convient pas à un acompte versé pour une commande précise (question 28). D6 : même cause que le 701, propriétaire 03-C. La compensation n'est pas juste tant que la facture fantôme existe. 18-B dépend de 07-A, 08-A, 08-B et 08-D. 18-G, 18-J et 18-K sont absorbés, 18-H se fait en deux étapes. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-26, base `nolyx_audit_3`, données créées par l'ERP (API et écran) : fournisseurs « Audit18 … » (contacts 14 à 17), factures FF-2026-00005 à 00023. « Écran » : un employé y arrive à la souris. « API » : appel direct seulement. La caisse du banc (session 2, ouverte le 25/11, plus de 24 h) acceptait encore les mouvements : je l'ai utilisée telle quelle.

## 1. Verdict

**Simplifier.** Le commerçant veut savoir ce qu'il doit, à qui, pour quand, et payer en voyant l'argent sortir. Aujourd'hui, trois automatismes faussent la dette (une facture « fantôme » créée par chaque commande, l'imputation automatique des acomptes, le rapprochement à trois voies) et un paiement ne sort ni du tiroir ni des comptes. On répare l'argent, on retire les automatismes, on ajoute le retour fournisseur.

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Dette par fournisseur, échéances | 3 | 5 | 3 | 5 | 4 | 5 |
| Payer avec sortie d'argent | 4 | 5 | 4 | 5 | 5 | 5 |
| Acompte fournisseur | 2 | 3 | 4 | 4 | 3 | 3 |
| Retour fournisseur, avoir | 2 | 5 | 3 | 4 | 4 | 4 |
| Compensation client/fournisseur | 1 | 2 | 0 | 2 | 1 | 2 |
| Rapprochement à trois voies | 0 | 1 | 1 | 2 | 0 | 2 |

## 3. Parcours réel

**Gérant** (seul avec l'admin à voir la page, `routeAccess.ts:154`) :
- **Achat à crédit** : 5 écrans (commande, validation, réception, facture, paiement). Les lignes se tapent deux fois : choisir la réception ne remplit pas la facture (`FacturesFournisseur.tsx:296`). Ça « marche », mais la dette est doublée (D1).
- **Payer** : 3 champs, simple. « Espèces » est proposé sans choix de caisse ; le mode par défaut est « Virement ».
- **Acompte** : depuis la fiche du contact. Il part sur la plus vieille facture, pas sur celle visée (D5).
- **Échéances** : « Échue » en rouge dans la liste, triée par date de facture. Rien ne dit quoi payer cette semaine.

**Caissier, vendeur** : pas de page ; paiement refusé (403). Le livreur payé en espèces au comptoir n'a aucun chemin. L'API leur montre pourtant toutes les factures (D10).

**Achat au marché, payé comptant** : aucun chemin. Une réception exige une commande (`createReceptionSchema`), donc commande → réception → facture → paiement, et l'argent ne sort pas. Contournement : une dépense « Divers ». Elle sort l'argent mais compte la marchandise deux fois si elle est aussi réceptionnée (fiche 09).

**Retour fournisseur** : n'existe pas.

**Ce qui marche (prouvé)** : l'acompte en espèces sort du tiroir et passe 401/53 ; remboursement partiel d'acompte juste (100 000 versés, 50 000 remboursés, facture 80 000 → reste 30 000 : la migration 095 tient) ; compensation juste côté fournisseur (30 000 → 10 000, écriture 401/411, tiroir intact) ; paiement plus grand que le reste refusé (400) ; double-clic à l'écran : un seul paiement. Mobile 390 : liste en cartes et fiche lisibles.

## 4. Défauts prouvés

### Argent et stock

| N° | Constat, chiffres | Preuve | Atteint |
|---|---|---|---|
| D1 | **Chaque commande crée une facture fournisseur.** Commande de 10 SSD à 65 000 : dette 0 → **650 000** avant toute livraison. Facture réelle saisie : **1 300 000**, comptes 601/401 à 1 300 000. Après 600 000 payés, la fiche du contact affiche « Vous lui devez **700 000** » ; la vraie dette est **50 000** | `CommandeService.ts:233-246` ; facture FF-2026-00005 « n° CMD-2026-00007 » ; capture `tiers14-390` | Écran |
| D2 | Commande annulée : la facture fantôme reste (dette 80 000 au lieu de 30 000). Commande supprimée : facture effacée, mais 601/401 de 50 000 restent au journal. Si un acompte est dessus, suppression refusée : **200 000 F bloqués** sur une facture qui n'existe pas | `PUT /commandes/8/statut`, `DELETE /commandes/8` et `/7` (400) | Écran (annuler), admin |
| D3 | **Payer en espèces ne sort rien du tiroir ni des comptes.** Écran : 6 000 F espèces, mouvements de caisse 5 → 5. API : 100 000 F, 412 écritures avant et après ; `session_caisse_id` vide | `FactureFournisseurService.ts:434-458` | Écran |
| D4 | **Paiements simultanés : 6 essais sur 6 surpayés.** Trois paiements de 60 000 sur 100 000 : 120 000 ou 180 000 payés ; la facture affiche « payé 60 000, reste 40 000 », on paierait encore | Lecture sans verrou `:405`, mise à jour qui écrase le trigger `:450-458` | API ou deux postes |
| D5 | Acompte de 200 000 en espèces « pour SSD-A-001 » : il part sur la facture fantôme ; SSD-A-001 reste à 250 000. Aucun choix | `SupplierAllocationService.ts:65-73` | Écran |
| D6 | **Les achats n'apparaissent pas dans la balance.** Balance (`/general-ledger/trial-balance`) : 401 = débit 300 000 (les deux acomptes), crédit 0 ; aucun 601. Au journal, 9 717 044 F de factures d'achat existent (dont les 1 300 000 du contact 14), mais par `compte_id` sans `compte_numero`. Paiements directs : aucune écriture (D3) | trigger `create_ecritures_facture_fournisseur` | Écran Comptabilité |
| D7 | Facture au-dessus de la réception acceptée sans un mot : 8 × 30 000 pour 5 × 20 000 reçus → 201. Le coût du stock reste calculé à 20 000 : 140 000 vont en charge, pas dans le coût | `POST /factures-fournisseur` (TOL-CHER) ; `stock_par_location` | Écran |
| D8 | Le blocage du rapprochement rend toute facture impossible : avec « bloquer », une facture exacte (5 reçus, 5 facturés) est refusée « facturée (10) > reçue (5) », à cause du fantôme | 422 `THREE_WAY_MATCH_FAILED` | Écran (réglage admin) |
| D9 | Réception d'un autre fournisseur acceptée : facture du contact 16 liée à REC-2026-00005 du contact 14, donc rattachée à sa commande | facture 20, `commande_id` 7 ; liste des 100 réceptions non filtrée | Écran |
| D10 | Application manuelle d'un acompte : le registre auxiliaire compte le paiement deux fois (−50 000 → −100 000). Le **caissier** peut la faire (201). Ce registre (`compte_fournisseur_lignes`) n'est lu par **aucun** code | `AcompteService.ts:541-547` ; `routes/acomptes.ts:18` ; recherche sans lecteur | API |
| D11 | Caissier, vendeur, dépôt, lecteur lisent factures, prix d'achat (65 000) et dette (200). Contraire à la décision « le dépôt ne voit que des quantités » | `routes/factures-fournisseur.ts:16-21` | API |

### Blocage

| N° | Constat | Preuve | Atteint |
|---|---|---|---|
| B1 | Aucune annulation, aucune correction : ni facture, ni paiement (404 sur annuler, supprimer, modifier) | routeur, 3 routes | Écran |
| B2 | Le caissier ne peut pas payer un livreur (403) ; le gérant qui paie n'a pas de caisse (D3) : l'achat payé à la livraison n'a aucun chemin juste | 403 | Écran |
| B3 | Retour fournisseur inexistant : pas de type de mouvement, pas d'avoir fournisseur (le registre prévoit « avoir », personne ne l'écrit) | `mouvements_stock_type_mouvement_check` | Écran |
| B4 | Relevé PDF d'un fournisseur : « Client : Audit18 Fournisseur SSD… Solde dû : 0 FCFA » quand l'écran dit 700 000 | `GET /tiers/14/releve-detaille/pdf` | Écran |
| B5 | Quantité 2,5 (kilo) → 500 ; numéro déjà saisi → 500 avec le nom de la contrainte ; date « abc » → 500 | colonne `quantite integer` | API (doublon : écran) |

### Gêne

- G1 : la réception choisie ne remplit pas les lignes ; la liste montre les 100 dernières réceptions, de tous les fournisseurs, déjà facturées ou non.
- G2 : pas de vue « à payer cette semaine », pas de balance âgée fournisseur (aucune route) ; `GET /factures-fournisseur/payable` existe, aucun écran ne l'appelle. Les factures fantômes n'ont pas d'échéance. Facture datée 2031 avec échéance 2020 acceptée.
- G3 : la fiche n'affiche pas l'historique des paiements ; pas de photo de la facture alors que l'API des pièces jointes l'accepte (`attachments.ts:7`).

## 5. Comparaison

- **Odoo** : facture « commandé » ou « reçu », préremplie ; rapprochement à trois voies qui affiche « Exception » **sans bloquer** [O22]. Paiement depuis un journal caisse ou banque, donc l'argent bouge.
- **Sage** : « bon à payer » dès l'offre Standard [G1].
- **Loyverse** : rien. Outils locaux : rien de vérifié sur les achats.
- **Mieux chez nous** : acompte fournisseur par la caisse avec écriture ; compensation ; relevé client + fournisseur sur une fiche ; modes mobile money.
- **Minimum attendu** (étude) : ce que je dois, à qui, quand ; paiement partiel avec mouvement d'argent ; photo de la facture. Le rapprochement à trois voies est « à justifier pour la cible » : pour 1 à 5 boutiques, un avertissement suffit.

## 6. Manques par profil

- **Informatique** : renvoyer un ordinateur en panne au distributeur (avec numéro de série, 10-K), recevoir un échange ou un avoir ; échéances à 30 jours.
- **Alimentaire / grossiste** : achat au marché payé comptant en un geste ; cartons abîmés renvoyés ou passés en perte ; quantités décimales (10-I) ; frais d'approche (fiche 17).
- **Habillement** : acompte versé à l'importateur **sur une commande**, déduit de sa facture.
- **Tous** : « à payer cette semaine » ; photo de la facture ; qui a payé, de quelle caisse.
- Plus tard : paiement groupé de plusieurs factures, lettre de relance fournisseur, devises.

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** : la facture porte une colonne `tva` (toujours 0) et le trigger sait passer la TVA déductible (4456). Pour un client assujetti : TVA par ligne, total HT dans le coût d'achat, 4456 au débit. Invisible sinon (03-K).
- **FNE** : garder le numéro certifié et le lien du QR de la facture du fournisseur, plus sa photo. C'est la preuve de la TVA déductible (supposé, à confirmer avec le chantier FNE).
- **Mobile money** : les modes Wave, Orange, MTN existent pour le paiement et la référence aussi. Manquent : le compte qui paie (Wave de la boutique, du patron) et le passage par la session (08-D, 08-J).
- **WhatsApp** : lien `wa.me` pour envoyer au fournisseur le bon de retour ou l'avis de paiement (03-L étape 1).

## 8. Lots proposés

### 18-A · La commande ne crée plus de facture (M, priorité 1)
**Problème** D1, D2, D8 ; moitié de D5. **Résultat** : la dette naît de la facture reçue, jamais de la commande.
**Base** : migration : factures dont `numero_facture_fournisseur = numero_commande` et `reception_id IS NULL` → sans paiement : contre-passation 601/401 puis suppression ; avec acompte imputé : applications supprimées (l'acompte redevient disponible, triggers 094/095). **API** : `CommandeService.create/update/delete` n'écrivent plus `factures_fournisseur`.
**Fichiers** : `CommandeService.ts:233-246, 297-318, 377-390`, `CommandeDetail.tsx` (lien « facture »), migration, `ci-baseline.sql`.
**Tests** : commande → dette 0 ; réception + facture → dette = facture ; rapprochement facturé = 10 ; migration rejouée deux fois.
**Fini quand** : dette, écriture et écran disent 50 000 dans le scénario D1. **Dépend** : fiche 16 (même lot, un seul responsable). **Risque** : fantômes déjà payés chez un client : liste avant migration.

### 18-B · Payer sort l'argent, une seule fois (M, priorité 1)
**Problème** D3, D4, B2. **Résultat** : espèces payées = tiroir baissé, écriture 401/53 ; jamais plus que le reste.
**Écran** : dialogue de paiement : caisse (boutique de l'utilisateur par défaut) quand l'argent sort d'un tiroir ; caisse fermée → message clair.
**API** : `recordPayment` : `SELECT … FOR UPDATE` ; plus de mise à jour manuelle (le trigger suffit) ; facture annulée refusée ; `idempotency_key` (colonne présente) ; `caisseMagasinService.enregistrerMouvement` (décaissement, `paiement_fournisseur`), qui poste déjà 401/53 ; contrôle de période sur la date du paiement.
**Fichiers** : `FactureFournisseurService.ts:398-479`, `FacturesFournisseur.tsx:540-657`, schéma Zod.
**Tests** : 6 × 3 paiements simultanés → jamais plus que le total ; 6 000 espèces → tiroir −6 000, écritures 401 D / 53 C.
**Dépend** : 08-A, 08-D (modes non espèces), 08-B (tiroir insuffisant). **Risque** : paiement par le patron hors caisse → 08-J.

### 18-C · Annuler une facture ou un paiement (M, priorité 1)
**Problème** B1. **Résultat** : une erreur se corrige sans effacer : annuler, puis refaire.
**API** : `POST /factures-fournisseur/:id/annuler` (gérant, admin, motif ; refusé s'il reste un paiement vivant) : contre-passation 601/401 datée du jour. `POST /paiements-fournisseur/:id/annuler` : `deleted_at`, contre-mouvement de caisse (08-K), contre-écriture.
**Écran** : « Plus d'actions » de la fiche ; `useConfirm` « Annuler la facture ».
**Tests** : facture payée → annuler le paiement, puis la facture ; dette et tiroir revenus à l'état d'avant. **Fichiers** : `FactureFournisseurService.ts`, routeur, `FacturesFournisseur.tsx`. **Fini quand** : aucune suppression physique. **Dépend** : 18-B, 08-K. **Risque** : annulation dans une période close → refus clair.

### 18-D · Une seule dette, la même partout (S, priorité 2)
**Problème** D10, D6, B4 ; trois chiffres pour une dette (fiche, registre, comptes). **Résultat** : fiche, liste, relevé et balance disent la même somme.
**Étapes** : supprimer `compte_fournisseur_lignes` (aucun lecteur) et ses 6 écritures (plus `seed-fournisseurs-excel.mjs`) ; `reste_due` toujours `total − paiements vivants` ; statistiques sans les factures annulées ; relevé PDF : modèle « Fournisseur » ; `compte_numero` dans le trigger d'achat, **dans la même migration que 03-C**.
**Fichiers** : `FactureFournisseurService.ts`, `AcompteService.ts`, `CompensationService.ts`, `PDFService.ts:620`, `TiersService.ts:209-260`, migration.
**Tests** : scénario D1 corrigé : 50 000 sur la fiche, le relevé PDF, la balance (401 crédit). **Dépend** : 18-A, 03-C. **Risque** : seeds qui écrivent la table.

### 18-E · Plus d'imputation automatique ; l'acompte se choisit (M, priorité 2)
**Problème** D5, D10 (droit du caissier). **Résultat** : symétrique de 04-C : un paiement règle la facture sur laquelle il est saisi.
**Étapes** : 1) `acomptes_fournisseur.commande_id` facultatif ; à la saisie d'une facture, acomptes disponibles proposés (cochés si même commande) ; 2) retirer `allocateAvailableAdvances` de la création de facture, d'acompte et de la compensation (qui choisit ses factures : 04-J) ; retirer `recomputeSupplierState` ; 3) appliquer : gérant et admin seulement.
**Fichiers** : `SupplierAllocationService.ts` (supprimé), `FactureFournisseurService.ts:365-370`, `AcompteService.ts:240-249`, `routes/acomptes.ts:18`, `TiersDetail.tsx`, dialogue de création.
**Tests** : acompte « pour SSD-A-001 » → SSD-A-001 baisse ; remboursement partiel (095) inchangé. **Dépend** : 18-A, question 13 (même règle qu'au client).

### 18-F · Saisir depuis la réception, écart signalé (M, priorité 2)
**Problème** G1, D7, D9, B5. **Résultat** : je choisis la réception, les lignes se remplissent ; un écart s'affiche, sans bloquer.
**Écran** : réceptions du fournisseur choisi, non facturées ; quantités et coûts préremplis ; bandeau « Facturé 8, reçu 5 : +140 000 F ».
**API** : `GET /receptions?tiers_id&non_facturee=1` ; création : réception d'un autre fournisseur → 422 ; numéro en double → 409 en français ; `quantite numeric(15,3)` (après 10-I) ; dates contrôlées. Supprimer `three_way_match_config`, sa route et son réglage ; le rapprochement de la fiche commande reste en lecture.
**Fichiers** : `FacturesFournisseur.tsx:191-530`, `FactureFournisseurService.ts:150-317`, `ParametresFinance.tsx`, schémas. **Dépend** : 18-A ; l'écart de prix vers le coût : 10-B. **Tests** : facture 8 × 30 000 pour 5 × 20 000 → bandeau, 201 ; réception d'un autre fournisseur → 422. **Risque** : un grossiste veut bloquer → réglage plus tard.

### 18-G · Achat payé à la livraison, en un geste (M, priorité 4)
**Problème** B2, double compte avec la dépense. **Résultat** : « Achat comptant » : fournisseur (ou « Fournisseur divers »), articles, mode, caisse → réception, facture et paiement dans **une** transaction.
**Écran** : depuis Réceptions et l'accueil ; la catégorie de dépense « Achat de marchandises » y renvoie (09-E).
**Tests** : 10 cartons, 50 000 espèces → stock +10, coût juste, tiroir −50 000, dette 0, aucune dépense.
**Dépend** : 18-B, fiche 17 (réception sans commande), question 4 ci-dessous. **Fichiers** : nouveau `AchatComptantService.ts` (réutilise réception, facture, 18-B), route, dialogue. **Risque** : caissier qui achète sans contrôle → plafond.

### 18-H · Retour fournisseur et avoir (L, priorité 4, deux étapes)
**Problème** B3, lot 05-G transféré. **Résultat** : renvoyer un article défectueux ou en trop, puis obtenir un avoir, un échange ou un remboursement.
**Étape 1** : `retours_fournisseur` (`RF-AAAA-#####`, fournisseur, réception ou facture d'origine, lignes, coût, motif, statut `envoye`/`regle`/`perdu`) ; mouvement `retour_fournisseur` depuis l'emplacement choisi (Défectueux : 05-C) ; sortie au coût de la réception d'origine, sinon CMP ; bon imprimé et lien `wa.me`.
**Étape 2** : « Avoir reçu » : avoir fournisseur numéroté qui baisse la dette (401 D / 601 C), ou remboursement par la caisse ; « Échange » : nouvelle réception sans facture ; « Perdu » : passe en perte (type `perte`).
**Tests** : ordinateur de 450 000 renvoyé → stock −1, valeur −450 000, attendu 450 000 ; avoir → dette −450 000. **Fichiers** : nouveau `RetourFournisseurService.ts`, route, page ou onglet de Réceptions, migration. **Dépend** : 05-C, 10-A, 10-K, 18-C. **Risque** : glisser vers un module SAV : réparation et prêt « plus tard ».

### 18-I · « À payer cette semaine » et fiche complète (M, priorité 4)
**Problème** G2, G3. **Résultat** : la balance âgée d'une petite boutique, sans rapport à part. **Écran** : puces « En retard », « Cette semaine », tri par échéance ; total par fournisseur ; échéance proposée = date + `tiers.delai_paiement` ; fiche : paiements (date, mode, caisse, qui), photo de la facture (`AttachmentPanel`) ; accueil du gérant : total à payer sous 7 jours.
**API** : réutiliser `/payable`, filtre par fournisseur. **Fichiers** : `FacturesFournisseur.tsx`, `Dashboard.tsx`. **Tests** : facture à 3 jours → « Cette semaine ». **Dépend** : 18-A.

### 18-J · Qui voit et paie les achats (S, priorité 3)
**Problème** D11. **Étapes** : routes de lecture réservées au gérant et à l'admin ; dépôt : quantités seulement (03-E) ; paiement par le caissier selon la question 2. **Fichiers** : `routes/factures-fournisseur.ts`, `routes/acomptes.ts`, `routes/tiers.ts:28-32`. **Tests** : 403 pour vendeur et lecteur ; dépôt sans montant.

### 18-K · TVA déductible et terrain FNE, mobile money (S, priorité 5 puis 6)
**Étapes** : 1) TVA par ligne visible si l'entreprise est assujettie, 4456 (03-K) ; 2) `fne_numero`, `fne_lien` facultatifs et photo ; 3) compte payeur mobile money (après 08-J) ; référence obligatoire au-delà d'un seuil (question 7). **Tests** : client non assujetti : aucun champ TVA. **Dépend** : 03-K, 03-L, 08-J.

**Ordre** : A, B, C, D, E, F, J, G, H, I, K. Compensation : rien de plus que 04-J.

## 9. Questions pour le propriétaire

1. **Q14 compensation** : la garder, réduite et visible seulement sur un contact client **et** fournisseur (recommandé, 04-J), ou la supprimer ? Côté fournisseur, elle est juste.
2. **Qui paie un fournisseur** : gérant seulement (aujourd'hui), ou aussi le caissier pour un livreur, sous un plafond (proposé : 50 000 F) ?
3. **Acompte fournisseur** : rattaché à une commande et proposé à la facture (recommandé), ou déduit automatiquement de la plus vieille facture (aujourd'hui) ?
4. **Achat au marché** : un geste « Achat comptant » (recommandé, 18-G) ou on force commande → réception → facture ?
5. **Rapprochement à trois voies** : supprimé et remplacé par un avertissement (recommandé), ou gardé derrière un réglage ?
6. **Retour fournisseur** : dans le premier mois pour l'informatique (recommandé) ?

**À transmettre** : fiche 16 (une commande déjà reçue peut être annulée : `PUT /commandes/7/statut` → 200) ; fiche 17 (réception sans commande) ; fiche 15 (écart facture/réception hors du coût) ; fiche 22 (601 et 401 hors balance ; la caisse est postée au 53, le plan SYSCOHADA la place au 57 : à vérifier).

**Non vérifié** : période comptable close ; caisse fermée pour un acompte ; impression réelle du bon de commande ; aucun commerçant interrogé.
