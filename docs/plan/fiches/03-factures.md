# Fiche 03 : Factures

> **Contre-expertise du 2026-11-25** ([détail](../vagues/vague-1-contre-expertise.md)) : Verdict changé : la création fusionne dans « Vendre » (fiche 07), le reste s'améliore. Faux dans cette fiche : « aucune affectation » (elles existaient ; un vendeur peut facturer, lire et encaisser dans une autre boutique), « l'écran demande l'accord » (jamais au vendeur), « ni avoir » sur facture impayée (il existe). 4.10 : `net_30` fonctionne. Les lots en double sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 25/11/2026, banc `nolyx_audit_3`. Données créées par l'interface et l'API. « Lecture » = vu dans le code, pas rejoué.

## 1. Verdict

**AMÉLIORER.** La création, la sortie de stock et l'annulation sont solides. Mais une facture peut réclamer de la marchandise non livrée, une remise peut la rendre impossible à solder, et le PDF ne peut pas être remis à un client sérieux.

## 2. Utilité

| Profil | Note | Pourquoi |
|---|---|---|
| Général | 4 | Entreprises, crédit |
| Informatique | 5 | Facture exigée, garantie, entreprises |
| Alimentaire : boutique / grossiste | 1 / 5 | Boutique : ticket. Gros : crédit, 40 lignes, livraisons |
| Habillement | 2 | Le ticket suffit ; A4 seulement sur demande |

Un magasin : 4. Plusieurs sites : 4 (5 quand la liste filtrera par boutique).

## 3. Parcours réel

| Rôle | Ce qui marche | Ce qui bloque |
|---|---|---|
| Vendeur, 1440 | Client, scan, remise, création : 7 gestes, paiement ouvert ensuite. Double clic = 1 facture | Ne corrige rien, n'annule pas |
| Caissier, 390 | Client comptoir prérempli, pas de défilement latéral | Facture remisée impossible à encaisser (4.2) |
| Gérant | Annulation claire : stock 139 → 134 → 139, écritures miroir, solde à 0 | Doit tout ressaisir après une erreur |
| Dépôt | Création refusée (403) | Lit factures, CA et PDF par l'API (4.9) |
| Lecteur | Création refusée (403) | Lit par l'API, mais aucun écran facture |

**Totaux.** Montants entiers : identiques partout (31 000 en base, PDF, compte client). Avec centimes : liste, fiche et papier **22 504**, PDF **22 503,5**, compte client et grand livre **22 503,50** (FAC-2026-00225).

**Robustesse prouvée.** Deux annulations simultanées : 200 puis 409. Dernier article vendu par deux postes : 201 puis 422. Double conversion d'un BL : une facture. Facture à 0 F, quantité 1,5, dépôt comme point de vente : refusés.

**Défauts connus, revérifiés**

| Défaut | État |
|---|---|
| Écritures sans `compte_numero` | **Vrai** : 466 lignes sur 466 |
| Remise globale déséquilibrée | Trigger inchangé (débit `total`, crédit `sous_total`), mais **inatteignable** : l'API ignore la remise globale |
| BL → facture sans échéance, auteur, coût | **Corrigé** : FAC-209 a échéance 25/12, auteur 4, coût 13 423,07 |
| `convert_devis_to_facture()` | **Retirée** (migration 113) |
| Facture d'un mois clos | **Non vérifiable** : aucun code n'écrit `periodes_comptables`, donc aucun mois ne peut être clos |

## 4. Défauts prouvés

### Argent et stock

**4.1 Produit non livré : sorti du stock et facturé.** Écran « Nouveau BL », quantité livrée 0 (l'écran l'autorise) : il affiche 14 000 F. En base (BL-2026-00010), la ligne est livrée 5, 17 500 F. Même cas par modification, BL livré puis converti : stock 168 → 163, BL 14 000 F, **facture 31 500 F** (FAC-2026-00233). Cause : `quantite_livree || quantite_commandee` (`BonLivraisonService.ts:210,213,326,449,523,760`).

**4.2 Centimes en FCFA.** Remise 33,3 % sur 3 × 3 500 → 22 503,50 F.
- Le bouton « Saisir le reste dû (22 504) » est refusé : « Le montant dépasse le reste dû (22 504 FCFA) » (capture `03-paiement-mobile`).
- Avec 7 003 F sur 7 003,50 : « Partiellement payée », reste 1 F affiché, à vie (FAC-2026-00215).
- Papier : 3 × 2 335 = 7 004.

Cause : `salesPrice.ts:33-36`, `PricingService.ts` (`roundMoney`).

**4.3 Les ventes n'existent pas en comptabilité.** CA 66 931 939 F, mais la balance ne montre que 411 = −79 003 et 53, 54, 419 : aucun 701. `ci-baseline.sql:290` écrit `compte_id` seul ; `GeneralLedgerService.ts:160,187,238` lisent `compte_numero`.

**4.4 Une facture payée se supprime.** `DELETE /factures/:id` (gérant, API ; aucun bouton). FAC-2026-00226 payée 22 000 F en espèces, puis supprimée : CA du mois 30 202 939 → 30 180 939, paiement et caisse intacts, stock non rendu, écritures intactes. Journal : ni montant, ni motif (`FactureService.ts:1110`). À ce moment 701 dépassait le CA de 52 000 F : la somme exacte des deux factures supprimées.

**4.5 Remise de devis perdue (API seule).** Devis −10 % puis −5 % = 132 525 F, **facture 155 000 F** (FAC-2026-00209). L'écran Devis n'a pas de remise : le défaut attend qu'on l'ajoute. Causes : `DevisService.ts:99`, `DocumentConversion.ts`.

**4.6 `POST /devis/:id/convert` oublie des livraisons (API, aucun écran).** BL de 62 000 et 93 000 F livrés : facture 93 000, devis « converti », l'autre BL ne se facture plus (400). Cause : `LIMIT 1`, `DevisService.ts:705`.

**4.7 Prix sans garde-fou.** Vendeur, par API : portable à 595 000 F facturé **1 F** (FAC-2026-00206). L'écran demande « l'accord d'un gérant » sans rien bloquer.

**4.8 Annuler une vieille facture change le mois passé.** FAC-2026-00007 (octobre, 90 000) annulée le 25/11 : CA d'octobre 35 542 500 → 35 452 500, 701 d'octobre inchangé. Les deux ne coïncideront plus.

### Blocage

**4.9 Confidentialité.** Dépôt, par API : factures, PDF, `/stats` (61 564 104 F), `/top-clients` : 200. Vendeur et caissier : coût d'achat dans la réponse ; CA cumulé de toutes les boutiques à l'écran (65 625 936 F, capture `03-liste-vendeur`).

**4.10 Pas de vente à crédit datée.** La fiche contact n'a **pas** de champ délai (formulaire lu à l'écran). Donc échéance = jour de la facture. Par l'API, « 45 jours » est accepté puis compté 0 jour (`dueDate.ts:11-21`). L'échéance ne se choisit pas sur la facture.

**4.11 Aucune correction.** Ni modifier, ni dupliquer, ni avoir sur une facture impayée (menu : PDF, ticket, annuler). Il faut un gérant, puis tout ressaisir. Pire : un acompte appliqué d'office bloque l'annulation (409, FAC-2026-00223). Le message dit de supprimer le paiement, qui renvoie à « annulez l'application de l'acompte », action inexistante.

**4.12 Le PDF n'est pas présentable.** Absents : date de facture, échéance, NCC du client, banque, déjà payé, reste dû, montant en lettres, régime. Le total se coupe sur deux lignes, un nom long recouvre la ligne suivante (`long.pdf`), l'en-tête n'est pas répété en page 2. Impression écran : mieux, mais sans adresse ni NCC du client, sans remise ; 48 lignes = 3 pages (plus une blanche en rendu headless, à confirmer sur imprimante).

**4.13 Facture annulée imprimée sans mention.** PDF et papier montrent « Total à payer 90 000 FCFA ».

**4.14 Trous de numérotation.** 212, 213 (plafond refusé), 220 (dernier article), 229 (caisse fermée) : 4 sur 28. Le numéro est pris avant les contrôles (`FactureService.ts:399` puis `:427`) sur une séquence qui ne revient pas.

**4.15 Ni service, ni ligne libre.** Produit « Installation » : 422, stock 0. Ligne « Transport » : 400.

**4.16 Plusieurs livraisons = plusieurs factures.** Devis 10, livré 4 + 6 → deux factures (5 600 et 8 400). Un BL sans devis n'existe pas (`schemas.ts`, `devis_id` requis).

### Gêne

- La remise (3 496 F) disparaît dès la création : ni fiche, ni papier, ni PDF. La colonne « Remise » du PDF lit un champ inexistant.
- Pas de clé anti-doublon : deux envois simultanés à l'API = deux factures (00217, 00218). L'écran protège du double clic, pas d'un réseau qui renvoie.
- `remise_globale` et `date_facture` envoyées à l'API : 201, ignorées.
- Liste : ni dates, ni échéance, ni « en retard » (32 factures le sont), ni boutique ; recherche « HDMI » ou « 22503 » : 0.
- `top-products` compte les annulées : 146 sacs au lieu de 130 (`FactureService.ts:1236`).
- Export : alerte de troncature impossible, `result.total` n'existe pas (lecture, `FactureController.ts:42`).
- Annulée : ni auteur, ni date, ni motif ; marge encore affichée.
- Facture à un fournisseur pur : acceptée. PDF inexistant : 500.

## 5. Comparaison

Source : [faits/concurrents.md](../faits/concurrents.md) (25/11/2026).

| | Ce qu'ils font de mieux | Ce que nous faisons de mieux |
|---|---|---|
| Odoo | Tarifs par client et quantité [O5], plusieurs ventes regroupées en une facture [O20], facture validée jamais modifiée [O21] | Annulation en un geste (stock + écritures) là où Odoo demande transfert inverse **et** avoir [O21] |
| Sage 100 | 50 souches, facturation périodique, tarifs par quantité, encours [G1] | Prix, téléphone, annulation lisible |
| Loyverse | Arrondi FCFA [L14] | Facture A4 (absente de leur index) |
| Locaux | Message WhatsApp de relance tout prêt [P5] | Stock, crédit et caisse reliés |

Face à Sage, notre PDF perd la vente dès la démonstration.

## 6. Manques

| Profil | Premier mois | Plus tard |
|---|---|---|
| Tous | Échéance, remise visible, « annuler et refaire », document sérieux, liste « en retard » | Facture récurrente, brouillon partagé (le devis suffit) |
| Grossiste | Unité carton/pièce et prix de gros (fiche 10), une facture pour plusieurs BL | Échéancier en tranches : une date plus des paiements partiels suffisent d'abord |
| Informatique | Ligne service, n° de série et garantie imprimés | Contrats de maintenance |
| Habillement | Facture A4 depuis un ticket | – |

Facture récurrente : **non**. Duplication : **oui**.

## 7. TVA, FNE, mobile money, WhatsApp

**TVA (réglage `assujetti_tva`, faux par défaut).** Prix saisis TTC : le total ne bouge jamais. Par ligne : `total_ht = arrondi(ttc / (1 + taux))`, `montant_tva = ttc − ht`.
- `document_lignes` : `taxe_code`, `taux_tva`, `total_ht`, `montant_tva`.
- `factures` : retirer `factures_tva_zero` ; la remplacer par un contrôle « TVA = 0 si non assujetti ». `total_ht`, `total_ttc` existent : corriger `update_facture_ht_ttc`.
- Écritures : 411 = TTC, 701 = HT, TVA au 4431 (le code dit 4457, plan français ; à valider par un comptable).
- Non assujetti : ni colonne, ni « HT », ni « TTC ».

**FNE.** Table `facture_fne` (1 pour 1), absente pour qui n'en veut pas : demandée, statut, `fne_id`, référence, jeton/QR, date, erreur ; sur les lignes `fne_item_id`. Client : type B2B/B2C/B2G/B2F et NCC contrôlé (7 chiffres + lettre). Règle à poser dès maintenant : **facture certifiée = ni annulée ni supprimée**, seulement un avoir par quantité. La remise globale devient un pourcentage par ligne (l'API ne connaît que cela).

**Mobile money.** Un texte « Payer par Wave / Orange » en pied de facture (réglage). Référence : fiche 04.

**WhatsApp.** `wa.me` avec un lien public : jeton aléatoire de 32 octets stocké haché, expiration, révocation, débit limité, `noindex`, PDF seul. Numéro client normalisé en 225 + 10 chiffres.

## 8. Lots proposés

### 03-A · Facturer ce qui a été livré (M, priorité 1)
**Problème** 4.1, 4.5, 4.6. **Résultat** : une ligne à 0 n'est ni sortie ni facturée ; le total du BL est celui de la facture.
**Écrans** : aucun nouveau. **API** : supprimer `POST /devis/:id/convert`.
**Fichiers** : `BonLivraisonService.ts`, `DevisService.ts`, `DocumentConversion.ts`, `schemas.ts`, `api.ts`.
**Étapes** : `??` au lieu de `||` aux six endroits ; ignorer les lignes à 0 ; refuser un BL tout à 0 ; reporter `remise_pct`, `remise_montant` et la remise globale devis → BL → facture ; refuser d'afficher comme « facturé » un BL annulé ; script listant les BL dont lignes ≠ total.
**Tests** : 10/0 livrés ; remises 10 % + 5 % ; deux BL partiels ; annulation.
**Fini quand** : BL 14 000 → facture 14 000, stock inchangé pour la ligne 0.
**Dépend** : prévenir la fiche 02. **Risque** : anciens BL incohérents ; ne pas les corriger en silence.

### 03-B · FCFA entiers et remises visibles (M, priorité 1)
**Problème** 4.2, remise invisible. **Résultat** : tout montant est entier ; le client voit prix, remise, net ; le patron peut consentir une remise ronde (155 000 → 150 000).
**Base** : `remise_pct`, `remise_montant` existent sur les lignes ; contrainte « montants entiers » sur factures et lignes nouvelles ; ajustement des restes < 1 F existants.
**API** : accepter `remise_pct` / `remise_montant` par ligne, `remise_globale` ; sinon 400, jamais ignorer.
**Fichiers** : `PricingService.ts`, `schemas.ts`, `FactureService.ts`, `salesPrice.ts`, `NouvelleFacture.tsx`, `FactureDetail.tsx`, `VenteComptoir.tsx`.
**Étapes** : arrondir la **ligne** à l'unité (pas le prix), même fonction partout ; remise globale répartie sur les lignes ; afficher.
**Tests** : 33,3 % × 3 ; 48 lignes ; paiement du montant affiché.
**Fini quand** : montant affiché = montant encaissable, quelle que soit la remise.
**Dépend** : 03-C si remise globale. **Risque** : devis et avoirs utilisent la même fonction.

### 03-C · Ventes visibles en comptabilité (M, priorité 1)
**Problème** 4.3. **Résultat** : balance et résultat montrent les ventes.
**Base** : migration : le trigger écrit `compte_numero` et `tiers_id`, crédite `total` (le net de remise) ; rattrapage `compte_numero` depuis `compte_id` ; mêmes lignes pour les factures fournisseur ; contrainte `compte_numero NOT NULL` ; régénérer `ci-baseline.sql`.
**Fichiers** : migration, `ci-baseline.sql`, `CreditNoteService.ts` (vérifier).
**Étapes** : compter avant, migrer, comparer. Le rattrapage doit passer le verrou de période.
**Tests** : facture, remise, annulation ; Σ débit = Σ crédit par pièce.
**Fini quand** : 701 = CA du mois + annulations.
**Dépend** : fiche 22 (garder ou réduire la comptabilité : si supprimée, ce lot saute). **Risque** : rattrapage en production.

### 03-D · Pièce inaltérable et numéros sans trou (M, priorité 1)
**Problème** 4.4, 4.8, 4.11 (acompte), 4.14. **Résultat** : rien ne disparaît ; une annulation dit qui, quand, pourquoi ; l'acompte redevient disponible.
**Base** : `annulee_le`, `annulee_par`, `motif_annulation` ; table `compteurs_documents(type, annee, dernier)` incrémentée sous verrou dans la transaction.
**API** : supprimer `DELETE /factures/:id` ; motif obligatoire à l'annulation ; `idempotency_key` sur `POST /factures`, comme la vente comptoir ; l'annulation détache l'application d'acompte (un vrai encaissement bloque toujours).
**Fichiers** : `FactureService.ts`, `NumberingService.ts`, `AcompteService.ts`, `FactureDetail.tsx`, routes.
**Étapes** : numéro pris **après** les contrôles ; reprise du compteur depuis le maximum existant ; CA mensuel = factures du mois moins annulations du mois (fiche 23).
**Tests** : refus plafond, stock, caisse → numéro suivant contigu ; acompte + annulation → acompte disponible ; CA d'octobre inchangé.
**Fini quand** : 20 refus, 0 trou.
**Risque** : le verrou sérialise les factures (acceptable à cette taille).

### 03-E · Prix plancher et confidentialité (M, priorité 1)
**Problème** 4.7, 4.9. **Résultat** : un vendeur ne vend pas sous le plancher sans accord ; le coût et le CA total restent au patron.
**Base** : `produits.prix_plancher` (avec fiche 10), réglage « remise maximale par rôle ».
**API** : 422 `PRIX_SOUS_PLANCHER` sauf gérant, ou accord par code du gérant (fiche 24) ; `GET /factures*` réservé aux rôles vente + lecteur ; retirer `prix_achat_unitaire` et les statistiques globales aux autres que gérant/admin.
**Fichiers** : `routes/factures.ts`, `FactureService.ts`, `VenteComptoirService.ts`, `roleRedaction.ts`, `Factures.tsx`.
**Tests** : matrice rôle × route ; 595 000 à 1 F.
**Fini quand** : dépôt 403 partout, vendeur à 1 F refusé.
**Dépend** : 10, 24. **Risque** : bloquer une vraie négociation ; d'où l'accord sur place.

### 03-F · Crédit daté et liste utile (M, priorité 3)
**Problème** 4.10, liste. **Résultat** : « 15 jours » sur la fiche client, échéance modifiable sur la facture, filtre « En retard ».
**Base** : `delai_jours` entier (0 à 180), reprise de `net_30` et « 30 jours ». Plafond de crédit : le délai reste réservé au gérant.
**API** : `date_echeance` à la création ; liste `du`, `au`, `en_retard`, `location_id` ; recherche par produit et montant exact ; troncature d'export réparée ; `top-products` sans annulées.
**Fichiers** : `dueDate.ts`, `Tiers.tsx`, `NouvelleFacture.tsx`, `Factures.tsx`, `FactureService.ts`, `DocumentConversion.ts`.
**Tests** : 0, 15, 45 jours ; refus d'un délai texte ; magasin unique : pas de filtre boutique.
**Fini quand** : 45 jours donne le 09/01/2027 depuis le 25/11/2026.
**Dépend** : 06. **Risque** : relances déjà basées sur l'échéance.

### 03-G · Un seul document, digne de Sage (M, priorité 3)
**Problème** 4.12, 4.13. **Résultat** : même feuille à l'écran, en PDF et sur WhatsApp.
**Contenu** : logo, coordonnées, RCCM, NCC (« NIF » renommé ; « AI » retiré, absent de l'arrêté), régime, centre des impôts, banque, client (adresse, téléphone, NCC), date et heure, échéance, vendeur, remises, déjà payé, reste dû, montant en lettres, texte libre, cachet/signature, filigrane ANNULÉE ou DUPLICATA, page x/y, en-tête répété.
**Base** : `company_settings` : régime, centre des impôts, pied de facture.
**Fichiers** : `PDFService.ts` (gabarit unique), `print-layout.tsx`, `CompanySettings.tsx`, `utils/montantEnLettres.ts`.
**Étapes** : le PDF devient la source ; « Imprimer » ouvre ce PDF ; l'ancien gabarit part.
**Tests** : 1, 25, 48 lignes ; nom long ; payée, partielle, annulée ; montants en lettres.
**Fini quand** : 25 lignes sur une page, totaux = base.
**Dépend** : 27, à faire ensemble. **Risque** : imprimantes A5.

### 03-H · Annuler et refaire, dupliquer (S, priorité 3)
**Problème** 4.11. **Résultat** : le gérant corrige en 3 gestes ; l'ancienne facture reste, barrée, liée à la nouvelle.
**Écrans** : « Corriger » sur une facture sans paiement → annulation puis formulaire prérempli ; « Dupliquer » sur toutes.
**Base** : `remplace_facture_id`. **API** : `POST /factures/:id/corriger`, une transaction (annule + crée).
**Fichiers** : `FactureService.ts`, `FactureDetail.tsx`, `NouvelleFacture.tsx`.
**Tests** : changer client, prix, quantité ; échec de la nouvelle → ancienne intacte.
**Fini quand** : aucune ressaisie, stock juste.
**Dépend** : 03-D. **Risque** : facture FNE certifiée (interdire).

### 03-I · Services, note client, série et garantie (M, priorité 4)
**Problème** 4.15. **Résultat** : facturer installation et transport ; imprimer « Garantie 12 mois, n° de série … ».
**Base** : `produits.type` (`stock`/`service`), `document_lignes.numeros_serie text[]`, `garantie_mois` (existe sur le produit, recopié), `factures.note_client`.
**API** : ligne libre (`description`, sans produit) autorisée au gérant ; service sans stock ; numéros = quantité, facultatifs, unicité contrôlée.
**Écrans** : champ série seulement si `suivi_serial`, profil informatique.
**Fichiers** : `FactureService.ts`, `StockCostingService.ts`, `NouvelleFacture.tsx`, `VenteComptoir.tsx`, document.
**Tests** : service sans mouvement de stock ; annulation ; commerçant habillement : rien de visible.
**Dépend** : 10, 03-G. **Risque** : code qui suppose `produit_id` non nul (retours, marge).

### 03-J · Une facture pour plusieurs livraisons (M, priorité 4)
**Problème** 4.16. **Résultat** : le grossiste choisit un client, coche ses BL livrés du mois, une facture.
**Base** : table `facture_bons(facture_id, bl_id)` ; `factures.bl_id` conservé pour l'historique.
**API** : `POST /factures/depuis-bl {bl_ids}` : même client, même emplacement, non facturés. L'annulation remet les BL à « livré » (choix proposé : garder la livraison ou la reprendre).
**Écrans** : sélection dans Bons de livraison ; caché pour habillement.
**Fichiers** : `DocumentConversion.ts`, `BonsLivraison.tsx`, `FactureService.ts`.
**Tests** : 3 BL, dont un partiel ; double envoi ; annulation.
**Fini quand** : Σ BL = facture, aucun BL facturé deux fois.
**Dépend** : 03-A, 02. **Risque** : lien BL unique supposé ailleurs.

### 03-K · TVA optionnelle (L, priorité 5)
**Problème** : `factures_tva_zero` interdit la TVA. **Résultat** : section 7.
**Base/API** : section 7, plus `produits.taxe_code`, `assujetti_tva`, `regime_imposition` ; le taux est figé sur la ligne.
**Écrans** : réglage, produit, facture, document, avoir ; tout masqué si non assujetti.
**Fichiers** : migration, `PricingService.ts`, `FactureService.ts`, `DocumentConversion.ts`, `CreditNoteService.ts`, `PDFService.ts`, `ReportingService.ts`.
**Étapes** : base ; calcul partagé ; écritures ; écrans ; état de TVA du mois.
**Tests** : 18, 9, 0 % mélangés ; arrondis ; non assujetti : captures identiques à avant ; annulation, avoir.
**Fini quand** : HT + TVA = TTC sur ligne, pièce, grand livre.
**Dépend** : 03-B, 03-C, 22. **Risque** : CA affiché HT ou TTC selon l'écran ; à figer.

### 03-L · Lien WhatsApp et terrain FNE (M, priorité 6)
**Problème** : aucun envoi ; modèle non prêt. **Résultat** : « Envoyer sur WhatsApp » en 2 gestes.
**Base** : `liens_publics` (hachage, document, expiration 90 jours, révoqué, ouvertures), `facture_fne`, `tiers.type_fne`, `tiers.ncc`.
**API** : `POST /factures/:id/lien`, `DELETE`, `GET /api/public/d/:jeton` (PDF seul).
**Fichiers** : nouvelle route publique, `FactureDetail.tsx`, `deploy/nginx-client.conf.template`.
**Étapes** : lien ; numéro normalisé ; facture annulée → page « annulée » ; interdire annulation et suppression si certifiée.
**Tests** : jeton faux, expiré, révoqué ; énumération ; débit.
**Fini quand** : ouverture sans compte sur téléphone, aucune autre donnée exposée.
**Dépend** : 03-G. **Risque** : facture accessible à qui détient le lien ; expiration et révocation obligatoires.

## 9. Questions au propriétaire

1. Prix produits : TTC partout, y compris pour les entreprises assujetties (ma recommandation), ou HT au choix ?
2. Le vendeur peut-il annuler sa propre facture du jour, impayée ? Je propose non : le gérant, ou son code sur place.
3. Sous le prix plancher : bloquer sauf code du gérant (proposé), ou avertir ?
4. Garde-t-on la comptabilité (fiche 22) ? Si non, 03-C devient un simple export.
5. Une correction doit-elle reprendre le même numéro ? Je propose non : nouvelle facture liée, l'ancienne barrée.

**Non vérifié** : mois clos (fonction absente), filtrage par boutique d'un vendeur affecté (aucune affectation dans le banc ; lecture : aucun contrôle), impression sur vraie imprimante, ticket 80 mm (fiche 07), volumes au-delà de 230 factures.
