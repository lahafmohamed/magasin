# 20 Employés, commissions, paie

> **Contre-expertise du 2026-11-27** ([détail](../vagues/vague-9-contre-expertise.md)) : Verdict maintenu, réduit : CNPS, ITS et bulletin conforme passent plus tard (20-E étapes 2-3, 20-H, 20-I). D2 a une double cause : la conversion écrit l'auteur, et le bon de livraison automatique porte celui qui accepte le devis ; même rétabli, le repli de la migration 100 paierait le gérant : seul l'auteur du devis désigne le vendeur (20-B1 : `vendeur_id` dès le devis). 20-A paie par la sortie « salaire » de 09-F (pas de table `paiements_salaire`) ; 09-G est absorbé par 08-D. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-27, base `nolyx_audit_2` (API 6142, interface 6152). Montants en FCFA. Cinq employés créés : un par l'écran, quatre par l'API (seul chemin pour lier un compte). La caisse du banc (session 2, du 25/11) refusait toute vente (« ouverte depuis plus de 24 heures ») : clôturée à l'attendu (60 000, écart 0) ; le caissier a ouvert la session 3 (fonds 50 000), laissée ouverte. Scripts : `%TEMP%\nolyx-agents\vague9-2\`.

## 1. Verdict

**Simplifier.** Le commerçant attend une liste du personnel, des avances retenues sur la paie, un « payer les salaires » qui sort l'argent et la commission juste de chaque vendeur. Rien de cela ne marche. Le module offre à la place des cycles de paie à trois états, un barème d'impôt et des horaires illisibles. Payer 714 531 F de salaires « en espèces » ne sort pas un franc du tiroir, et la commission va à celui qui clique « Facturer », pas au vendeur. On garde la fiche employé et la commission, réparées ; la paie devient « Salaires du mois », payés employé par employé ; CNPS et ITS deviennent une option par employé, cachée par défaut.

## 2. Utilité

| Besoin | Général | Informatique | Habillement | Alimentaire / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Liste, avances, salaires payés | 3 | 3 | 3 | 4 | 3 | 4 |
| Commission par vendeur | 1 | 4 | 4 | 1 | 2 | 3 |
| Paie légale (CNPS, ITS, bulletin) | 1 | 2 | 1 | 1 | 1 | 2 |
| Modules actuels | 1 | 1 | 1 | 1 | 1 | 1 |

Supposé : le grossiste paie des manutentionnaires à la semaine, avec beaucoup d'avances ; informatique et habillement paient leurs vendeurs à la commission ; peu d'employés sont déclarés. Les modules actuels valent 1 : l'argent ne bouge pas, les commissions sont fausses. Plusieurs sites : les mêmes besoins, par boutique.

## 3. Parcours réel

**Droits.** Admin et gérant : menu « Équipe » (Employés, Paie). Admin seul : « Paramètres paie et achats ». Caissier, vendeur, dépôt, lecteur : 403 par l'API sur les 8 routes testées (liste, fiche, commissions, cycles, détail, PDF, réglages, création). Conforme. Aucun employé ne voit son bulletin ni ses ventes.

| Geste | Rôle, largeur | Résultat |
|---|---|---|
| Créer un employé (7 champs) | gérant, 1440 | Marche. Ni compte de connexion, ni numéro Wave, ni boutique, ni « déclaré CNPS » (capture `emp-form-gerant-1440`) |
| Lier l'employé à son compte | — | Impossible ; API, à la création seulement |
| Générer novembre (3 gestes) | gérant | 5 bulletins |
| Prime, avance | — | Impossible ; API seulement |
| Valider puis payer (5 gestes) | gérant, 1440 | « Payé », un seul mode pour tous (capture `paie-payer-dialog-1440`) |
| Fiche employé | gérant, 390 | Commissions de l'année, « 0 payées » après la paie |

Mobile (390) : lisible (`paie-detail-gerant-390`) ; « Retenues » mêle CNPS, ITS et avance.

**Bulletin refait à la main.** Awa Koné, vendeuse, base 150 000, commission 2 %, prime 10 000 et avance 25 000 (saisies par l'API).

| Ligne | À la main | ERP |
|---|---|---|
| Commissions : FAC-204 (700), 207 (140), 209 (280), 210 (700) ; 205 annulée, exclue | 1 820 | 1 820 |
| Brut | 161 820 | 161 820 |
| CNPS 6,3 % | 10 194,66 | 10 194,66 |
| ITS : (brut − CNPS − 75 000) × 16 % | 12 260,05 | 12 260,05 |
| Net, avance déduite | 114 365,29 | 114 365,29 |

Les quatre autres bulletins concordent (320 092 ; 106 528,31 ; 82 837,20 ; 90 708). Le calcul suit son code ; ce qui est faux, c'est ce qu'il prend (D2, D3, D5) et ce qu'il produit (D1, D6). Si le vendeur est l'auteur du devis, la commission juste d'Awa est 700 + 140 + 700 + 1 100 (FAC-206) + 480 (FAC-211) = **3 120**, jean rendu repris. Elle a reçu 1 820.

## 4. Défauts prouvés

### Argent

**D1. Payer les salaires ne sort aucun argent.** PAIE-2026-0001, 714 530,80 nets, payé « Espèces » à l'écran : mouvements de caisse 3 → 3, écritures 430 → 430, dépenses 12 → 12 ; la session 3 attend toujours 74 000 dans le tiroir. `markRunPaid` n'écrit que dans `payslips` et `payroll_runs` (`PayrollService.ts:313-330`), qu'aucun autre service ne lit : ni trésorerie, ni bénéfice, ni comptabilité. Écran. Confirme les fiches 21 (D6) et 09.

**D2. La commission va à celui qui clique, pas au vendeur.** Devis du vendeur (55 000), BL facturé par le gérant : FAC-2026-00206 porte le gérant, aucune commission. Devis du vendeur converti par `POST /devis/12/convert` (gérant) : FAC-211, aucune. Même chemin facturé par le vendeur : FAC-207, 140. Au comptoir, le caissier qui encaisse la prend (FAC-208, 100 à Koffi) ; `factures` n'a pas de colonne « vendeur ». Cause : la conversion écrit l'auteur = celui qui convertit (`DocumentConversion.ts:120`), donc le repli sur l'auteur du BL puis du devis (`100_commission_vente_auto.sql:42-46`) ne sert plus. Écran. Awa perd 1 580 sur le mois.

**D3. Une commission n'est jamais reprise.** Jean de FAC-209 rendu (retour traité) : commission 280 inchangée. FAC-204 (35 000, jamais payée) annulée après la paie : les 700 payés en novembre ne sont retenus nulle part (décembre : commission 0, retenue 0), et la fiche d'Awa affiche 1 120 pour l'année contre 1 820 sur son bulletin payé. La commission est due dès la facture, même impayée (FAC-204 : payé 0). Écran.

**D4. Avance et prime : rien à l'écran, net négatif par l'API.** Aucun champ ; `api.ts` n'a pas la fonction. `PUT /payroll/payslips/:id` accepte 200 000 de retenue sur un brut de 90 000 : net −117 162,80, total du cycle 514 530,80. L'avance versée le 10 n'a aucun lien avec la retenue. API.

**D5. Dates d'embauche ignorées.** Fatou, embauchée le 15/12/2026, a un bulletin plein (100 000) en octobre et en novembre ; Moussa, embauché le 27/11, aussi (90 000). Seul filtre : `actif = true` (`PayrollService.ts:188`). Pas de date de départ : qui part le 10 n'est pas payé. Écran.

**D6. Des centimes.** Nets à 114 365,29 et 106 528,31 ; le PDF imprime « 114 365,29 FCFA » ; total affiché 714 531, somme des nets affichés 714 530. Écran. Dépend de 03-B.

**D7. Le gérant fixe son propre salaire et se paie seul.** `PUT /employes/4` (sa fiche) : 400 000 → 900 000, 200. Il génère, valide et paie sans personne. Le journal garde « 900 000 » sans l'ancienne valeur. Écran.

### Blocage

**B1. Pas de commission pour un employé créé à l'écran.** Pas de champ « compte », et le schéma de modification retire `utilisateur_id` (`schemas.ts:649-652`) : `PUT` répond 200 et l'ignore. Le trigger exige ce lien : Moussa, taux 2 %, ne touchera jamais rien. Écran.

**B2. Commissions « en attente » pour toujours.** Après la paie : 6 lignes `en_attente`, aucune `payee` (aucun code ne les met à jour) ; fiche employé « 0 payées ». Écran.

**B3. Bulletin incomplet.** Ni NCC, ni numéros CNPS, ni date d'embauche, ni dates de période, ni jours payés, ni cumul, ni la note « avance du 10/11 » ; « Autres retenues » sans détail ; mode imprimé « espece » (`PDFService.ts:445-520`). Écran. Mentions légales exactes : à valider.

**B4. Un mode, un jour, tout le monde.** Le dialogue paie les 5 bulletins d'un coup, un seul mode (« Virement » par défaut, `Payroll.tsx:134`), sans référence, date ni boutique. Koffi en espèces et Awa par Wave : impossible. Écran.

### Gêne

- **G1.** Horaires écrits, jamais lus : `POST /employes/shifts` 200, aucune lecture (`GET /employes/shifts` 400), aucun écran.
- **G2.** CNPS et ITS pour tous : pas de case « déclaré » ; une vendeuse non déclarée voit 6,3 % retenus sur un papier officiel. Pas de situation de famille.
- **G3.** API : modifier un taux sans renvoyer le plafond efface le plafond (1 647 315 → vide, `PayrollService.ts:415`) ; remis par l'API. Changement de taux non journalisé.
- **G4.** Supposé, sans source : plafond CNPS de 1 647 315 tiré d'un ancien SMIG ; pas de tranche à 28 % ; base ITS « brut − CNPS » (`PayrollService.ts:73`), sans réduction pour charges de famille, sans CMU ni autres charges patronales. À faire valider par un comptable ivoirien.
- **G5.** La création d'un employé lié est attribuée à l'employé lui-même (créé par l'admin, auteur « vendeur », `EmployeService.ts:155`). Fiche 26.
- Non reproduit : deux générations simultanées du même mois → une seule (409).

## 5. Comparaison

Source : [faits/concurrents.md](../faits/concurrents.md), section 20.

| | Ils font mieux | Nous faisons mieux |
|---|---|---|
| Sage | Commission par représentant [G1] ; paie dans un produit dédié | Demain : salaire payé depuis la caisse, même outil |
| Loyverse | Ventes par employé, pointage, 5 $ par employé [L1][L7] | Barème CNPS et ITS (à valider) |
| Odoo | Applications RH ; paie ivoirienne non vérifiée | — |
| Outils locaux | Dépense « salaires », simple [P6] | — |

L'étude fixe le minimum : « ventes et commission par vendeur, avance sur salaire ; la paie légale reste souvent au comptable ». Nous faisons l'inverse.

## 6. Manques par profil

| Profil | Premier mois | Plus tard |
|---|---|---|
| Tous | Avance retenue d'office ; salaire payé par employé depuis caisse, Wave ou banque ; entrée et départ ; numéro Wave ; boutique | Congés, absences, pointage, prêts, heures supplémentaires, déclaration CNPS électronique |
| Informatique | Commission au vrai vendeur, reprise sur retour | Commission sur marge |
| Habillement | Choisir la vendeuse au comptoir | Classement des vendeuses |
| Alimentaire / grossiste | Paie à la semaine ou à la journée (supposé) | Primes au tonnage |

Bulletin officiel : premier mois seulement pour qui déclare. Déclaration CNPS : un export pour le comptable suffit d'abord.

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** : rien ; avec 03-K, commission sur le hors taxe.
- **FNE** : rien.
- **Mobile money** : préparer `employes.telephone_paiement` et `operateur`, et sur chaque paiement de salaire : mode, référence, téléphone, compte d'argent (21-C).
- **WhatsApp** : « Envoyer le bulletin » par lien `wa.me` (03-L étape 1), seul accès d'un employé sans compte.

## 8. Lots

Déjà ailleurs : avance comme sortie **09-E** ; porte « Sortie d'argent » **09-F** ; source **09-G** ; « paie ou dépense, jamais les deux » **09-H** ; entiers **03-B** ; ventes du vendeur **23-I** ; droits **24-A1** ; code PIN **24-I** ; module caché côté serveur **25-E** ; réglages dans la page Paie **25-A**.

### 20-A · Payer un salaire sort l'argent (M, priorité 1)
- **Problème** : D1, B4.
- **Résultat** : le gérant paie chaque employé, ou tous, en choisissant la source : tiroir, Wave ou Orange, banque, « payé par le patron ». Tiroir, accueil (23-E), bénéfice (23-H) et comptabilité le voient.
- **Écrans** : `Payroll.tsx` : « Payer » par ligne et « Payer tout » ; source, mode, référence, date.
- **Base** : `paiements_salaire` (`payslip_id`, `montant`, `source`, `magasin_id`, `session_caisse_id`, `mouvement_caisse_id`, `mode`, `reference`, `telephone`, `date`, `cree_par`, `statut`) ; `payslips.montant_paye`, état « partiel ».
- **API** : `POST /payroll/payslips/:id/paiements`, une transaction : verrou du bulletin, session du magasin, garde « la caisse n'a que… » (08-B), mouvement `salaire`, écritures (charge contre dette au salarié, puis dette contre caisse, Wave ou banque). `POST /payroll/:id/payer` boucle dessus. Anti-doublon 07-A, annulation 08-K.
- **Fichiers** : `PayrollService.ts`, `CaisseMagasinService.ts`, `routes/payroll.ts`, `schemas.ts`, `Payroll.tsx`, `ReportingService.ts`.
- **Étapes** : (1) tiroir ; (2) autres sources (09-G, 21-C) ; (3) écritures (fiche 22) ; (4) dépense « Salaires » refusée si la paie est active.
- **Tests** : 82 837 espèces → tiroir −82 837 ; deux fois → 409 ; tiroir insuffisant → 422 ; caisse fermée → 409.
- **Fini quand** : D1 rejoué, tiroir, accueil et bénéfice bougent du montant exact.
- **Dépend de** : 08-A, 08-B, 09-F, 09-G ; fiche 22. **Risque** : salaires déjà saisis en dépenses.

### 20-B · La commission au vrai vendeur, reprise si la vente repart (M, priorité 1)
- **Problème** : D2, D3, B1, B2.
- **Résultat** : chaque vente a un vendeur ; sa commission suit la facture, se retire à l'annulation ou à l'avoir, et passe « payée » avec le salaire.
- **Écrans** : fiche employé : « Compte de connexion » ; « Vendre » (07-H) : « Vendu par » (par défaut l'utilisateur) ; devis et BL l'affichent.
- **Base** : `vendeur_id` sur `factures`, `devis`, `bons_livraison` ; `commissions_ventes` : montant signé, `avoir_id`, `payslip_id`. Trigger : `vendeur_id`, sinon BL, sinon devis, sinon auteur ; ligne négative datée du jour à l'annulation ou à l'avoir.
- **API** : `updateEmployeSchema` accepte `utilisateur_id` (unique) ; les conversions recopient `vendeur_id` ; la paie somme les montants signés puis marque `payee`.
- **Fichiers** : nouvelle migration, `DocumentConversion.ts`, `FactureService.ts`, `VenteComptoirService.ts`, `DevisService.ts`, `EmployeService.ts`, `PayrollService.ts`, `Employes.tsx`.
- **Étapes** : (1) lien compte–employé ; (2) `vendeur_id` ; (3) reprises ; (4) « payée ».
- **Tests** : 5 chemins facturés par le gérant → commission au vendeur ; annulation après paie → −700 le mois suivant ; retour partiel → reprise au prorata.
- **Fini quand** : le scénario de la section 3 donne 3 120 à Awa en novembre, −700 en décembre.
- **Dépend de** : 07-H, 05-B, 24-J ; questions 2 et 3. **Risque** : anciennes factures sans vendeur (repli sur l'auteur).

### 20-C · Avance, prime et retenue à l'écran (M, priorité 1)
- **Problème** : D4.
- **Résultat** : l'avance du 10 apparaît seule en retenue ; prime ou retenue avec motif ; net jamais négatif, reste reporté.
- **Écrans** : bulletin : lignes « Prime », « Avance du 10/11 », « Retenue » ; fiche : avances en cours.
- **Base** : `payslip_lignes` (`type`, `montant`, `motif`, `depense_id`), reste à retenir.
- **API** : `POST`/`DELETE /payroll/payslips/:id/lignes` remplacent le `PUT` ; la génération reprend les avances (nature avance, 09-E) ; garde net ≥ 0.
- **Fichiers** : `PayrollService.ts`, `schemas.ts`, `api.ts`, `Payroll.tsx`, `PDFService.ts`.
- **Tests** : avance 150 000 sur 90 000 → 90 000 retenus, 60 000 reportés ; prime → CNPS recalculée si déclaré.
- **Fini quand** : D4 rejoué donne net 0 et un report, sans API.
- **Dépend de** : 09-E, 20-A. **Risque** : avances saisies comme dépenses ordinaires.

### 20-D · Entrée, départ et prorata (S, priorité 1)
- **Problème** : D5. **Résultat** : on ne paie que les jours de présence ; un départ est payé.
- **Écrans** : « Date de départ » et motif ; bulletin « 4 jours sur 30 ».
- **Base** : `employes.date_sortie`, `motif_sortie`. **API** : génération sur `date_embauche ≤ fin` et départ vide ou `≥ début` ; prorata (question 6) corrigeable.
- **Fichiers** : `PayrollService.ts:173-190`, `EmployeService.ts`, `schemas.ts`, `Employes.tsx`.
- **Tests** : Fatou absente d'octobre et novembre ; Moussa 12 000 en novembre ; départ le 10 → 10/30.
- **Fini quand** : D5 rejoué. **Dépend de** : rien. **Risque** : faible.

### 20-E · Francs entiers ; CNPS et ITS pour qui est déclaré (M, priorité 1)
- **Problème** : D6, G2, G3, G4.
- **Résultat** : montants entiers ; un non-déclaré a un salaire sans CNPS ni ITS ; un déclaré a des retenues validées, famille comprise.
- **Base** : `employes.declare_cnps` (faux par défaut), `numero_cnps`, `parts_fiscales` ; valeurs par défaut migrées **après** validation, aussi dans `ci-ref-data.sql`.
- **API** : arrondi au franc (règle 03-B) ; plafond absent = inchangé ; taux journalisés.
- **Fichiers** : `PayrollService.ts:50-86, 409-422`, `schemas.ts:700-731`, `Employes.tsx`.
- **Étapes** : (1) entiers et case « déclaré » ; (2) taux validés par un comptable ivoirien, puis migration ; (3) parts fiscales.
- **Tests** : Awa déclarée → 114 365 ; non déclarée → 136 820 ; somme des nets = total.
- **Fini quand** : aucun centime ; trois bulletins vérifiés par un comptable.
- **Dépend de** : 03-B. **Risque** : responsabilité légale ; « à vérifier par votre comptable » tant que l'étape 2 manque.

### 20-F · Un seul écran « Personnel », caché par défaut (M, priorité 2)
- **Problème** : deux menus et une page de réglages pour une liste et un paiement mensuel ; « cycle », « brouillon », « valider » ; horaires morts (G1).
- **Résultat** : menu « Personnel » : la liste (poste, boutique, numéro Wave, salaire, avance) et l'onglet « Salaires du mois » (à payer, payé). CNPS, ITS, bulletin officiel : option « Je déclare mes employés ».
- **Écrans** : `Employes.tsx` et `Payroll.tsx` fusionnés ; validation implicite au premier paiement.
- **Base** : `employes.location_id`, `telephone_paiement`, `operateur` ; route `POST /employes/shifts` retirée.
- **API** : `GET /employes?location_id` ; module caché, serveur compris (25-E).
- **Fichiers** : `routes/employes.ts`, `EmployeService.ts:302-352`, `modules.ts`, `routeAccess.ts`, `ParametresFinance.tsx`.
- **Tests** : magasin unique sans colonne boutique ; module caché → refus de l'API.
- **Fini quand** : payer novembre en 3 gestes ; plus de « cycle ».
- **Dépend de** : 25-A, 25-B, 25-E, 13-F ; question 1. **Risque** : faible.

### 20-G · Qui fixe les salaires (S, priorité 3)
- **Problème** : D7. **Résultat** : le gérant voit et paie sa boutique, ne change pas son salaire ; l'ancienne valeur reste au journal.
- **API** : salaire et taux réservés à l'admin (ou accord 24-I) ; refus sur sa propre fiche ; liste par boutique (13-D1).
- **Écrans** : salaire en lecture pour le gérant. **Fichiers** : `routes/employes.ts`, `EmployeService.ts:178-243`, `Employes.tsx`.
- **Tests** : gérant sur sa fiche → 403 ; admin → journal « 400 000 → 900 000 ».
- **Fini quand** : D7 rejoué donne 403. **Dépend de** : 24-A1, 24-I, 13-D1 ; question 4. **Risque** : faible.

### 20-H · Bulletin conforme et état du mois (M, priorité 4)
- **Problème** : B3 ; rien pour le comptable.
- **Résultat** : bulletin aux mentions validées pour un déclaré ; reçu de salaire signé pour les autres ; état mensuel en Excel.
- **Base** : NCC et numéro CNPS de l'entreprise (25-H) ; `numero_cnps`, `categorie` de l'employé.
- **API** : PDF sur le gabarit unique (27-A) : identité légale, période, jours, détail des retenues, mode en clair, référence, cumul, signature ; `GET /payroll/:id/etat` (27-H).
- **Écrans** : « Bulletin », « Exporter l'état du mois ». **Fichiers** : `PDFService.ts:445-520`, `PayrollController.ts`.
- **Tests** : trois cas de 20-E. **Fini quand** : un comptable l'accepte.
- **Dépend de** : 27-A, 27-H, 25-H, 20-E. **Risque** : conformité non vérifiée.

### 20-I · Wave, Orange et WhatsApp pour le salaire (S, priorité 6)
- **Problème** : section 7, B4. **Résultat** : un salaire Wave porte référence et numéro ; le bulletin part par WhatsApp.
- **Base** : celle de 20-A et 20-F. **API** : lien signé et court vers le PDF (03-L étape 1).
- **Écrans** : bouton « WhatsApp » par bulletin. **Fichiers** : `PayrollController.ts`, `Payroll.tsx`.
- **Tests** : lien expiré → 410 ; sans numéro → bouton grisé avec la raison.
- **Fini quand** : le bulletin d'Awa s'ouvre depuis WhatsApp. **Dépend de** : 20-A, 03-L. **Risque** : lien qui circule.

**Plus tard** : pointage, congés, prêts, heures supplémentaires, 13e mois, déclaration CNPS électronique, virement Wave groupé.

**Supprimé** : route des horaires, page « Paramètres paie et achats » (25-A), états « brouillon » et « validé ».

## 9. Questions au propriétaire

1. Question 69, proposé : « Personnel » visible par défaut en informatique et habillement, caché ailleurs ; CNPS, ITS et bulletin officiel cachés partout jusqu'à « Je déclare mes employés ».
2. Commission due à la vente (aujourd'hui) ou à l'encaissement ? Reprise sur retour et avoir (proposé : oui) ?
3. Au comptoir, qui touche la commission : le caissier, ou le vendeur choisi (proposé) ?
4. Le gérant change-t-il les salaires ? Proposé : l'admin seul ; jamais le sien.
5. Payer les salaires depuis le tiroir : permis, jusqu'à quel montant (question 16) ?
6. Prorata : jours calendaires (proposé) ou ouvrés ?
7. Qui valide les taux CNPS et ITS avant la première paie déclarée : un comptable payé par vous, ou le client ?
8. Bulletin par WhatsApp à l'employé sans compte (proposé) ?

**À transmettre.** CLAUDE.md : le repli « vendeur = auteur du BL puis du devis » est mort depuis la migration 113 ; « Employés/commissions/shifts ✅ » et « Payroll ✅ » sont faux. Fiche 22 : aucune écriture de salaire. Fiche 23 : le bénéfice ignore les salaires. Fiche 26 : G5 ; changements de salaire et de taux sans ancienne valeur.
