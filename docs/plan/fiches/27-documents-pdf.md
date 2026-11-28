# 27 Documents imprimés et PDF

> **Contre-expertise du 2026-11-27** ([détail](../vagues/vague-8-contre-expertise.md)) : Verdict maintenu. D1 : la remise globale disparaît du PDF du devis et du bon seulement ; la remise de ligne est comptée mais la colonne affiche « - » ; la facture et l'avoir ne portent pas de remise globale. La conversion devis → facture perd les deux remises (03-A). Oubli : aucun reçu d'acompte, et l'imputation produit un reçu « MONTANT REÇU » trompeur (27-G). 27-B, 27-D, 27-E et 27-F sont découpés en deux étapes ; 27-A ne touche pas `print-layout.tsx`, supprimé par 27-C. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-27, base jetable `nolyx_audit_1` (API 6141, interface 6151), API et interface réelles (admin, gérant, vendeur, caissier, dépôt, lecteur ; 1440 et 390 px). Identité de l'entreprise, logo, client au nom long, factures, devis remisé, bon, avoir et paiements créés par l'ERP. Chaque PDF a été converti en image (pypdfium2) et regardé ; le texte a été extrait (pdfplumber). Ticket rendu avec le code réel de l'application (`ticket.ts` chargé par Vite). Exports ouverts avec Python (openpyxl), pas avec Excel. Caisse du banc : aucun refus 409 rencontré (paiements Wave), ni clôturée ni rouverte. Scripts : `%TEMP%\nolyx-agents\vague8-1\` ; PDF et images : sous-dossier `out\` ; captures : `%TEMP%\nolyx-captures\1\`.

## 1. Verdict

**Fusionner.** Une même facture sort sous deux gabarits A4 différents (« Imprimer » et « Télécharger le PDF »), et aucun n'est complet : le PDF, celui qu'on enverra par WhatsApp, n'a ni date, ni déjà payé, ni reste dû, oublie les remises et change de nom, de RCCM et de client quand on le réimprime. On garde un seul gabarit, le PDF du serveur, rendu juste, complet et figé ; le ticket reste à part, réglable en 58 ou 80 mm.

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire boutique / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Besoin | 4 | 5 | 4 | 4 / 5 | 4 | 5 |
| Réponse actuelle | 2 | 2 | 3 | 3 / 2 | 2 | 2 |

- **Informatique et grossiste (5)** : proforma, facture A4 pour entreprises et administrations, bon signé, relevé de fin de mois. Réponse 2 : PDF incomplet, faux dès qu'il y a remise ou acompte.
- **Habillement, alimentaire boutique (4)** : le ticket compte d'abord. Réponse 3 : ticket 80 mm propre, mais rien pour 58 mm, ni reste dû, ni duplicata.
- **Plusieurs sites (5)** : chaque boutique veut son adresse et ses numéros Wave et Orange sur le papier ; aujourd'hui une seule identité pour toutes (13-H).

## 3. Parcours réel

| Rôle, écran | Gestes | Ce qui surprend |
|---|---|---|
| Gérant 1440, facture payée en partie | « Imprimer » → aperçu → « Imprimer » → boîte du navigateur : 3 | Le papier montre date, échéance, déjà payé 150 000, reste 145 500, banque, mais **une page blanche** en plus (3 lignes → 2 pages A4) |
| Gérant, même facture | « ⋯ » → « Télécharger le PDF » : 2 | Autre document : ni date, ni déjà payé, ni reste, lignes dans un autre ordre |
| Caissier, vente comptoir | Encaisser → « Imprimer le ticket » → boîte → Imprimer : 3 (2 si « impression auto » est cochée sur le poste, décochée par défaut, `VenteComptoir.tsx:75-81`) | Sans mode kiosque du navigateur, la boîte d'impression s'ouvre à chaque vente (supposé, pas de vraie imprimante) |
| Gérant, réimpression d'un ticket | « ⋯ » → « Imprimer le ticket de caisse » : 3 | Pas de « duplicata », pas de reste dû |
| Paiement d'une facture | Toast « Imprimer le reçu » : 1 | Seul accès au reçu (`FactureDetail.tsx:236-257`) ; le toast parti, plus de reçu à l'écran |
| Vendeur 390 | « ⋯ » → PDF : le fichier se télécharge | Dans l'aperçu, le bouton « Imprimer » est coupé au bord droit (capture `27-apercu-390`). Aucun « Partager » |
| Admin, fiche fournisseur | « Télécharger le relevé (PDF) » | Écran : 5 mouvements, 369 540 F dus. PDF : vide, « Client : », 0 F |
| Dépôt, lecteur (API) | `GET /factures/202/pdf`, `/paiements/159/recu` : 200 | Montants lisibles alors que le dépôt ne doit voir que des quantités (CLAUDE.md) → 24-A1 |

Les « 4 PDF de vente cassés » de juillet sont réparés : facture, devis, bon et avoir répondent 200 avec leurs lignes.

## 4. Défauts prouvés

### Argent

| # | Défaut | Preuve | Où |
|---|---|---|---|
| D1 | **Le PDF recalcule son total et oublie les remises.** DEV-2026-00011 : total enregistré 1 176 000 ; PDF du devis et du bon BL-2026-00001 : **1 181 000** (remise globale de 5 000 perdue). Colonne « Remise » toujours « - » : on lit « 2 × 595 000 = 1 071 000 » sans explication | `PDFService.ts:813` lit `ligne.remise` (colonnes réelles : `remise_pct`, `remise_montant`) ; `:830-834` additionne les lignes. Déjà vu par 01-D2, propriétaire désormais 27 | Écran |
| D2 | **PDF d'une facture payée en partie : « Total : 295 500 FCFA »**, sans déjà payé (150 000) ni reste dû (145 500) | FAC-2026-00202, texte extrait | Écran |
| D3 | **Ticket réimprimé de la même facture** : « Total 295 500 · Wave 50 000 · Wave 100 000 », aucun « reste dû », aucune référence | `ticket.ts:114-118` ; capture `m-tickets.png` | Écran |
| D4 | **Relevé fournisseur vide.** HP Distribution : 3 factures (6 975 655), payé 6 606 115, dû 369 540 à l'écran ; PDF : « Client : HP Distribution Abidjan … Solde dû : 0 FCFA » | `TiersService.ts:327-343` ne lit que les ventes ; `PDFService.ts:637` « Client : » en dur ; capture `27-releve-fournisseur-ecran` | Écran |
| D5 | Relevé client sans l'avoir AVOIR-2026-00001 (3 500, validé) : solde 1 499 500 | Texte du PDF ; table `factures_avoir` | Écran |
| D6 | **Reçu n° 159 réimprimé après un 2e paiement** : « Total payé à ce jour 150 000 · Reste 145 500 » au lieu de 100 000 / 195 500 remis au client ce jour-là. Même numéro, deux montants | `PDFService.ts:348-349` lit l'état du jour | API (réimpression) |
| D7 | Facture annulée FAC-2026-00206 : PDF « Total : 9 000 FCFA », aucune mention (confirme 03, 4.13) | Texte du PDF | Écran |

La remise perdue à la conversion (facture FAC-2026-00203 à 1 304 000 pour un devis à 1 176 000) reste à 03-A : rejouée, confirmée.

### Blocage

| # | Défaut | Preuve | Où |
|---|---|---|---|
| D8 | **Facture PDF sans** date, heure, échéance, NCC du client, régime, centre des impôts, banque, mode de règlement, vendeur, montant en lettres, numéro de page ; page 2 sans titre ni en-tête de colonnes (60 lignes) | `buildDocumentPDF`, `PDFService.ts:702-843` ; `facture-60-p2.png` ; `tiers.nif` existe mais n'est jamais lu | Écran |
| D9 | **Réimpression = identité du jour.** FAC-2026-00202 après renommages : « Société Rachetée SA », RCCM CI-ABJ-2027-B-99999, client « NOUVEAU NOM CLIENT SARL », « Écran Dell 27 pouces (renommé) » | `PDFService.ts:115-118, 228-233, 240` ; `document_lignes.description` vide pour les produits | Écran |
| D10 | **Deux documents pour une facture** : l'aperçu montre dates, déjà payé, reste, banque ; le PDF l'adresse du client. Ordre des lignes différent (le PDF suit la saisie, l'aperçu et le ticket non : `FactureService.ts:220-225` sans `ORDER BY`) | `m-nav.png`, `m-60.png` | Écran |
| D11 | **Ticket figé à 80 mm** : `@page { size: 80mm auto }` est invalide (Chromium le lit vide, donc papier par défaut de l'imprimante) ; `body { width: 80mm }` coupe les prix sur 58 mm (fiche 07, `ticket58.png`) ; un nom de client long déborde : 452 px pour 302 | `ticket.ts:130-133` ; mesure du rendu | Écran |

### Gêne

| # | Défaut | Preuve |
|---|---|---|
| D12 | Ticket : pas de « duplicata », pas de code-barres du numéro, « Caissier » = créateur ; 30 articles = 403 mm (deux lignes par article) | `ticket205-80.png` |
| D13 | Aperçu navigateur : page blanche finale (60 lignes → 5 pages A4, la 5e vide ; le PDF tient en 2) ; « Ticket A5 » fait 200 mm de large (A5 = 148) ; vendeur jamais imprimé sur une facture (`FactureDetail.tsx:902-914` ne le passe pas) | `nav-a4-*.pdf` ; `print-layout.tsx` |
| D14 | Mise en page du PDF : bloc client décalé à droite quand il y a un logo, « Total : 1 181 000 / FCFA » coupé sur deux lignes, longue désignation qui chevauche le total ; relevé en dates « 2026-11-27 », sans logo ni adresse ; reçu sans logo, n° technique « 159 », sur A4 | `devis-remises-p1.png`, `m-releves.png` |
| D15 | Avoir PDF : ni facture d'origine, ni motif (« Câble défectueux » saisi), ni date | Texte du PDF |
| D16 | Excel des contacts : **12 téléphones sur 14 exportés « '+2250710049380 »** (apostrophe visible) ; la protection contre les formules est inutile en xlsx | `useExportExcel.ts:17-22` ; openpyxl |
| D17 | CSV : virgule et point décimal (`csv.ts:22`, question 41) ; inventaire « 12000.00 » ; export des factures sans période (203 factures d'un coup), sans mode de paiement, boutique ni vendeur ; avoirs limités à 200 sans avertir (`Avoirs.tsx:241`) | `factures.csv`, `inventaire.csv` |
| D18 | PDF comptables illisibles (textes superposés, « 1304000 », compte « - ») ; compte de résultat de novembre à 0 → fiche 22 | `m-gl.png` |
| D19 | Base neuve : `company_settings` vide jusqu'à la première ouverture des paramètres, donc en-tête vide | `sql('neuve')` → aucune ligne |

## 5. Comparaison

| | Odoo, Sage, outils locaux | nolyxERP |
|---|---|---|
| Mieux chez eux | Odoo : reçu papier, e-mail, SMS, WhatsApp, QR vers la facture. Loyverse et Ma Caisse : Bluetooth, USB, 58 et 80 mm, logo. Sage : modèles personnalisables. Attendu minimum (faits/concurrents.md) : 58 et 80 mm, A4/A5, logo, téléphone, montant en lettres, duplicata, garantie | 80 mm seul, rien de tout ça sauf le logo |
| Mieux chez nous | | Ticket sans logiciel à installer, n'importe quelle imprimante Windows ; message de ticket ; reçu de paiement et relevé client avec solde cumulé, que les cahiers n'ont pas |

## 6. Manques par profil

| Profil | Premier mois | Plus tard |
|---|---|---|
| Tous | Reçu de paiement accessible et sur ticket ; duplicata ; montant en lettres ; conditions de vente ; numéros Wave et Orange de la boutique (13-H) ; cachet et signature | Modèles personnalisables, envoi par e-mail |
| Informatique | Garantie et n° de série imprimés (10-K) ; proforma (03-G) | |
| Grossiste | Facture multi-pages numérotée ; relevé du mois ; bon signé (03-G) ; facture de fin de mois (03-J) | |
| Alimentaire boutique, habillement | Ticket 58 mm ; reste dû sur le ticket d'une vente à crédit | Impression Bluetooth directe (appli) |

Bon de caisse (sortie d'argent) : plus tard, avec 09-F.

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** (03-K) : client non assujetti, aucun mot « TVA » sur aucun papier (vrai aujourd'hui). Assujetti : bloc HT / TVA / TTC par taux sur PDF et ticket, taux figé dans l'instantané (27-D).
- **FNE** (03-L) : la facture doit porter date **et heure**, régime, NCC des deux parties (27-E). Réserver une zone pour le numéro certifié, le QR et le timbre, imprimés seulement s'ils existent. Un ticket 80 mm seul ne vaut pas FNE (`faits/fne.md`).
- **Mobile money** : numéros Wave et Orange de la boutique en pied (données : 13-H) ; référence du paiement sur ticket et reçu.
- **WhatsApp** (03-L étape 1) : le lien partage le PDF ; il faut d'abord qu'il soit juste (27-A) et unique (27-C).

## 8. Lots proposés

Absorbés : 03-G (sauf proforma et bon signé, qui restent à 03-G) et 07-K. Cités : 25-H identité, 25-D logo, 03-L FNE et WhatsApp, 03-K TVA, 12-F CSV négatifs, 13-H Wave par boutique, 10-K garantie, 24-A1 droits. Prochaine migration : numéro libre ; régénérer `ci-baseline.sql`.

### 27-A · Le papier dit le bon montant (S, priorité 1)
- **Problème** : D1, D2, D3, D7.
- **Résultat** : chaque papier reprend les totaux enregistrés : remise de ligne (% ou montant), sous-total, remise globale, total, déjà payé, reste dû ; facture annulée : bandeau « ANNULÉE – ne pas payer ».
- **Base, API** : aucune ; lire `sous_total`, `remise_globale`, `total`, `montant_paye`, `remaining_due`, `remise_pct`, `remise_montant`, `total_ligne`.
- **Fichiers** : `PDFService.ts`, `ticket.ts`, `print-layout.tsx` (jusqu'à 27-C).
- **Tests** : DEV-2026-00011 → 1 176 000 et remises visibles ; FAC-00202 → 150 000 / 145 500 sur PDF et ticket ; annulée → bandeau.
- **Fini quand** : plus aucun total calculé par addition de lignes dans un gabarit.
- **Risque** : faible.

### 27-B · Relevés justes (M, priorité 1)
- **Problème** : D4, D5, relevé en dates ISO.
- **Résultat** : le PDF montre les mêmes mouvements et le même solde que l'écran. Fournisseur : factures et paiements fournisseur, titre « Fournisseur ». Contact à la fois client et fournisseur : deux parties. Client : avoirs, imputations, remboursements.
- **API** : `getReleveDetaille(tiersId, { sens })` sur la même source que le tableau de `TiersDetail.tsx`.
- **Fichiers** : `TiersService.ts`, `PDFService.ts:620-700`.
- **Tests** : HP Distribution → 5 mouvements, 369 540 ; client 14 → avoir de 3 500.
- **Dépend** : 04-A (un seul chiffre de dette), 05-B. **Risque** : relevés déjà envoyés différents.

### 27-C · Un seul gabarit A4 : le PDF (M, priorité 2)
- **Problème** : D10, D13.
- **Résultat** : « Imprimer » ouvre le PDF du serveur dans un onglet ; l'aperçu maison et le format « Ticket A5 » disparaissent ; A5 vrai en option du PDF si le propriétaire le veut (question 6).
- **Fichiers** : `print-layout.tsx`, `print-preview.tsx` (supprimés), `FactureDetail.tsx`, `DevisDetail.tsx`, `BonLivraisonDetail.tsx`, `AvoirDetail.tsx`, `PDFService.ts` (reprend date, échéance, payé, reste, banque).
- **Étapes** : porter le contenu de l'aperçu dans le PDF, puis brancher « Imprimer », puis supprimer.
- **Tests** : 1, 25, 60 lignes ; pas de page blanche ; même ordre de lignes partout (`ORDER BY dl.id` dans `FactureService.ts:220-225`).
- **Dépend** : 27-A. **Risque** : bloqueurs de fenêtres sur téléphone.

### 27-D · Un document émis ne change plus (M, priorité 3)
- **Problème** : D6, D9, D12 (duplicata) ; question 62.
- **Résultat** : facture, devis, bon, avoir et reçu gardent l'identité, le client et les désignations du jour d'émission ; toute réimpression porte « DUPLICATA ».
- **Base** : table `company_settings_versions` (chaque enregistrement des paramètres crée une version) ; colonnes `emetteur_version_id` et `client_snapshot JSONB` sur les quatre pièces ; `document_lignes.description` remplie avec nom et référence à la création ; `nb_impressions` par pièce ; reçu : numéro `REC-AAAA-#####` (NumberingService) et montants « payé avant / reste après » calculés sur les paiements d'`id` inférieur.
- **Fichiers** : migration, `CompanySettingsService.ts`, services des quatre pièces, `PaiementService.ts`, `PDFService.ts`, `ticket.ts`.
- **Tests** : renommer entreprise, client, produit → ancienne facture inchangée ; reçu 1 identique après un 2e paiement ; 2e impression → « DUPLICATA ».
- **Dépend** : 27-C, 25-H. **Risque** : anciennes pièces sans instantané : reprendre l'état actuel une fois, à la migration.

### 27-E · Une facture que l'on peut remettre (M, priorité 3)
- **Problème** : D8, D14, D15.
- **Résultat** : en-tête répété, « page x/y » ; bloc client aligné à gauche avec adresse, téléphone, NCC ; date et heure, échéance, vendeur ; remises ; total, déjà payé, reste dû ; montant en lettres (« Deux cent quatre-vingt-quinze mille cinq cents francs CFA ») ; modes de règlement et référence ; NCC, RCCM, régime, centre des impôts, banque, Wave et Orange de la boutique ; conditions de vente (texte des paramètres) ; cadre « Cachet et signature ». Avoir : facture d'origine, motif, date. Champs vides : rien d'imprimé.
- **Fichiers** : `PDFService.ts` (gabarit unique), `utils/montantEnLettres.ts` (nouveau, testé de 0 à 999 999 999), `CompanySettings.tsx` (conditions de vente).
- **Tests** : 1, 25, 60 lignes ; nom de 120 caractères ; avec et sans logo ; paramètres vides.
- **Dépend** : 27-C, 25-H, 13-H, 03-B (FCFA entiers). **Risque** : lettres fausses sur les montants ronds : table de tests.

### 27-F · Ticket 58 et 80 mm (M, priorité 3)
- **Problème** : D3, D11, D12 ; question 70.
- **Résultat** : réglage par poste (58 / 80 mm) ; nom de la boutique qui vend (13-H) ; articles dans l'ordre de saisie, une ligne par article à quantité 1 ; noms longs repliés ; reste dû et « Vente à crédit » ; référence du paiement (4 derniers caractères) ; espèces reçues et monnaie relues (07-A) ; DUPLICATA (27-D) ; code-barres du numéro (`utils/barcode.ts`) ; blocs TVA et FNE seulement s'ils existent ; aide « imprimer sans boîte » (mode kiosque).
- **Fichiers** : `ticket.ts` (`@page` en hauteur mesurée après rendu, largeur par réglage), `print.ts`, `VenteComptoir.tsx`.
- **Tests** : rendu 58 et 80 ; 30 articles < 250 mm ; nom long ; réimpression.
- **Fini quand** : testé sur une vraie 58 mm et une vraie 80 mm. **Dépend** : 27-D, 07-A. **Risque** : pilotes d'imprimante.

### 27-G · Reçu de paiement à portée de main (S, priorité 3)
- **Problème** : D6, D14 (reçu), accès par toast seulement.
- **Résultat** : bouton « Reçu » sur chaque ligne de paiement de la facture et du compte client ; reçu en A5 ou au format du ticket du poste ; logo, montant en lettres.
- **Fichiers** : `FactureDetail.tsx`, `TiersDetail.tsx`, `PDFService.ts:342-442`, `ticket.ts`.
- **Tests** : réimprimer un reçu d'hier ; caissier autorisé, dépôt refusé (24-A1).
- **Dépend** : 27-D.

### 27-H · Exports pour le comptable (M, priorité 3)
- **Problème** : D16, D17 ; question 41.
- **Résultat** : CSV en point-virgule et virgule décimale par défaut (même aide que 12-F, qui garde les nombres négatifs) ; xlsx sans apostrophe, montants en nombres, dates en dates ; export des factures par période et boutique avec modes de paiement, vendeur, remise, statut ; classeur « Ventes du mois » (factures, encaissements par mode, avoirs) ; avoirs sans limite de 200.
- **Fichiers** : `csv.ts`, `useExportExcel.ts`, `Factures.tsx`, `Avoirs.tsx`, `FactureController.getAllExport`.
- **Tests** : fichiers relus par openpyxl (types) et ouverts dans un tableur français.
- **Dépend** : 12-F. **Risque** : un comptable qui veut la virgule : réglage.

### 27-I · PDF sur téléphone (S, priorité 8)
- **Problème** : bouton « Imprimer » coupé à 390 (capture `27-apercu-390`), aucun « Partager ».
- **Résultat** : « Partager » (`navigator.share` avec le fichier, sinon téléchargement) sur la facture, le devis, le reçu.
- **Fichiers** : `services/api.ts` (`downloadPdfBlob`), pages de détail.
- **Tests** : capture 390 ; Android et iPhone réels.
- **Dépend** : 27-C ; le lien WhatsApp reste 03-L.

## 9. Questions pour le propriétaire

1. Question 62 : une réimpression garde l'identité de son jour (proposé : oui) ?
2. Question 70 : 58 mm accepté dès le premier client (proposé : oui, réglage par poste) ?
3. « DUPLICATA » sur toute réimpression, ticket et A4 (proposé), ou ticket seul ?
4. Montant en lettres : facture seule, ou aussi devis et reçu (proposé) ?
5. Conditions de vente et de garantie : un texte libre par entreprise, imprimé en pied (proposé) ?
6. On supprime l'aperçu « maison » au profit du PDF seul ? Faut-il un vrai A5 ?
7. Question 41 : point-virgule et virgule décimale par défaut ?

## Non vérifié

Vraies imprimantes (58, 80 mm, A4, A5), Bluetooth, mode kiosque ; vrais téléphones (téléchargement, partage, impression) ; ouverture dans Excel français (fichiers lus par Python) ; bulletin de paie et bilan (fiches 20, 22) ; relevé client à l'écran face à l'avoir.
