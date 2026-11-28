# Fiche 01 : Devis

> **Contre-expertise du 2026-11-26** ([détail](../vagues/vague-3-contre-expertise.md)) : Verdict maintenu : la saisie partage le composant panier de « Vendre » (07-H étape 1), la page « Nouveau devis » reste. D2 : la remise ne se saisit que par l'API, mais le mauvais prix sort d'une conversion faite à l'écran. Lot 01-D supprimé (remise : 03-B et 03-A) ; 01-E à placer tôt ; 01-F et 01-G plus tard. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-26, banc `nolyx_audit_1` (API 6141, interface 6151). Données créées par l'interface et l'API. « Lecture » = vu dans le code, pas rejoué. Montants en FCFA. BL = bon de livraison.

## 1. Verdict

**SIMPLIFIER.** Le devis, que le client ivoirien appelle « facture proforma », est vital pour l'informatique et utile au grossiste. Mais aujourd'hui il affiche trois prix différents dès qu'il porte une remise, se livre et se facture sans limite, ignore sa date de validité, et ne devient une vente qu'en passant de force par un BL. On le garde comme document à part (liste, fiche, proforma, relance). Sa saisie rejoint l'écran « Vendre » (07-H). Il devient une vente ou une livraison en un geste, sans jamais dépasser ce que le client a accepté.

## 2. Utilité

| Profil | Note | Pourquoi |
|---|---|---|
| Informatique | 5 | Entreprises, écoles, administrations et appels d'offres demandent une proforma avant leur bon de commande |
| Alimentaire : boutique / grossiste | 0 / 3 | Grossiste : proforma pour cantines, ONG, revendeurs ; le quotidien se vend sans devis |
| Général | 3 | Clients professionnels, de temps en temps |
| Habillement | 1 | Uniformes et tenues de groupe seulement |

Un magasin : 3. Plusieurs sites : 4 (devis fait en boutique, livré plus tard, souvent depuis le dépôt : impossible aujourd'hui, fiche 02-G).

## 3. Parcours réel

| Rôle, écran | Ce qui se passe | Gestes |
|---|---|---|
| Vendeur, téléphone 390 | Devis pour l'École : client, deux produits, quantité, « Créer le devis ». Marche, lisible. Aucun champ remise, conditions de paiement ou délai de livraison (capture `01-nouveau-devis-390`) | 9 |
| Gérant, téléphone 390 | Confirmer (2) → Ouvrir le BL (1) → Marquer livré (2) → Créer la facture (2). Marche. Le devis reste « Confirmé » ensuite, jamais « Facturé » (capture `07-devis28-apres-facture-390`) | 7, puis l'encaissement sur un autre écran |
| Gérant | Confirmer un devis de 1 920 000 pour l'École (plafond 5 M, encours 3,79 M) : refusé, toast brut « Limite: 5000000.00, Encours actuel: 3792605.00… » | Bloqué |
| Vendeur, bureau | « Nouveau bon de livraison » propose DEV-2026-00012, déjà livré et facturé deux fois, avec 5 sur 5 (capture `05-nouveau-bl-dev12`) | 3 |
| Caissier, dépôt, lecteur | Pas d'écran Devis (normal). L'API leur donne pourtant prix et totaux (gêne) | — |

**Devis → acompte → livraison partielle → facture → solde**, rejoué par l'API sur DEV-2026-00028 (10 sacs de riz à 15 500, client demi-gros) : faisable sans erreur, mais en deux factures (62 000 et 93 000), avec un BL à corriger puis un second BL à saisir. Environ 40 gestes à l'écran (compté sur le code, pas rejoué en entier). L'acompte de 50 000 noté « acompte devis DEV-2026-00028 » est parti sur FAC-2026-00007 du 12 octobre : les deux factures du devis réclament les 155 000 en entier (D6).

## 4. Défauts prouvés

### Argent et stock

**D1 · Un devis se livre et se facture sans limite (écran).** DEV-2026-00012, 5 câbles HDMI : BL automatique livré puis facturé (FAC-2026-00203), second BL plein, livré, facturé (FAC-2026-00204). **Stock 45 → 35, facturé 35 000 pour un devis de 17 500.** DEV-2026-00028 déjà livré 4 + 6 : un troisième BL de 10 est encore accepté (BL-2026-00018, 155 000). Même constat que 02 (D2) ; deux causes côté devis :
- le lien ligne de devis → ligne de BL est toujours vide : `DevisService.ts:98-104` ne lit pas `id`, la ligne 171 écrit donc `parent_ligne_id = NULL` (vérifié sur BL-2026-00001) ;
- le devis reste « accepte » quand son BL est facturé : seul `POST /devis/:id/convert`, sans bouton, pose « converti » (`DevisService.ts:727`). Il reste donc proposé à « Nouveau BL » pour toujours.

**D2 · Trois prix pour un même devis (API ; l'écran n'a pas de remise).** DEV-2026-00011 : 3 portables à −10 %, 3 écrans, remise globale 5 %.

| Endroit | Total |
|---|---|
| Base, liste, choix du devis dans « Nouveau BL » | 1 910 925 |
| Fiche du devis à l'écran | 2 011 500 |
| PDF (colonne « Remise » : « - ») | 2 011 500 |
| Aperçu avant impression (capture `04-devis11-impression`) | 2 190 000 |
| **Facture FAC-2026-00202** | **2 190 000**, soit 279 075 de plus que le prix accepté |

Causes : conversion (relève de 03-A) ; et affichage propre au devis, qui recalcule au lieu de lire le total : `DevisDetail.tsx:237`, `print-layout.tsx:106-111` (quantité × prix), `PDFService.ts:813` (lit une colonne `remise` qui n'existe pas) et `:829-833`.

**D3 · Statuts sans garde-fou (API).**
- DEV-2026-00013 : confirmé (BL de 2 unités), repassé « brouillon », porté à 20 unités (70 000), reconfirmé. **Le BL reste à 2 unités, 7 000.** La reconfirmation reprend l'ancien BL sans contrôle.
- Un devis refusé ou annulé se reconfirme et crée son BL. L'écran promet pourtant « ne pourra plus être confirmé ».
- Un devis se marque « refusé » après livraison ; son BL ne se facture plus. Annuler le BL rend bien le stock.
- Cause : aucune table de transitions (`DevisService.ts:428`, `:546-628`).

**D4 · La validité ne sert à rien.** Validité au 1er janvier 2020 : acceptée, puis confirmée aux prix d'alors (DEV-2026-00017, liste : « Confirmé », « valable jusqu'au 1 janv. 2020 »). Le statut « expiré » n'existe pas (`ci-baseline.sql:2278`). Une validité « pas une date » donne une erreur 500 (`schemas.ts:317`). En informatique, un prix vieux d'un mois peut être faux de 5 % (dollar, euro).

### Blocage

**D5 · Impossible de chiffrer un article sur commande.** Serveur Dell créé, pas encore reçu : `POST /devis` → 422 « Article non disponible à la vente — stock dépôt. » Message faux (rien au dépôt). Cause : `DevisService.ts:301-330` exige une ligne de stock en boutique. L'écran appelle le même service. C'est le cas courant d'un appel d'offres.

**D6 · L'acompte d'un devis ne va pas au devis.** Voir § 3. Décision voulue (CLAUDE.md : un acompte sans facture cible s'impute « plus ancienne d'abord ») ; elle ne convient pas à un acompte de commande. Relève de 04-I, qui gagne ici sa preuve.

**D7 · Le plafond bloque l'accord du client.** Rien n'est livré ni dû à la confirmation, mais elle est refusée (§ 3). Décision voulue (CLAUDE.md), liée au BL créé d'office (`DevisService.ts:112`). Message brut, sans dérogation.

**D8 · « Envoyé » est inatteignable à l'écran.** Aucun bouton ne pose ce statut (`DevisDetail.tsx:308-320` ; recherche dans `frontend/src`). Le tableau de bord du magasin le lit (`Dashboard.tsx:1105`).

### Gêne

- **Proforma incomplète.** PDF : ni date, ni validité, ni notes, ni conditions. Aperçu : ni notes, ni conditions. Nulle part : délai de livraison, montant en lettres, NCC du client, « Bon pour accord », cachet. `conditions` est accepté par l'API, jamais affiché.
- Dépôt, caissier, lecteur : `GET /devis/11` et son PDF répondent 200 avec prix et total (`routes/devis.ts:13-22`, aucun contrôle de rôle). CLAUDE.md veut un dépôt sans montants.
- Vendeur : portable à 595 000 chiffré à 1 F (DEV-2026-00026) ; relève de 10-C.
- Double appel de création : deux devis (DEV-2026-00023 et 00024).
- `PUT` d'une remise seule : enregistrée, total inchangé (DEV-2026-00020 : remise 5 000, total 35 000).
- L'admin supprime par l'API un devis confirmé et livré : 404, son BL se facture encore (FAC-2026-00211). L'écran cache ce bouton.
- Ni « Dupliquer », ni « Vendre », ni relance.
- **Corrigé, vérifié** : annuler un devis dont le BL est livré est refusé (409 `DEVIS_BL_LIVRE`), comme l'écrit CLAUDE.md. Trois confirmations simultanées ne créent qu'un BL.

## 5. Comparaison

| | Ce qu'ils font mieux | Ce que nous faisons mieux |
|---|---|---|
| Odoo | Devis repris en caisse, soldé ou avec acompte [O11] ; modèles et signature en ligne (non sourcé) | Devis, stock, crédit et caisse au même endroit, utilisable au téléphone |
| Sage 100 GC | Devis → commande → préparation → BL → facture ; suivi des « devis perdus » [G1] | Moins d'étapes, rien à installer |
| Outils locaux | Rien sur le devis (index Loyverse) | Le devis existe |

Minimum attendu (concurrents.md, hypothèse métier) : saisie rapide, validité, PDF et lien WhatsApp, passage en vente sans ressaisie, prix figés. Nous avons la saisie rapide. La validité est affichée mais sans effet ; le reste manque ou est faux.

## 6. Manques

| Profil | Premier mois | Plus tard (une ligne) |
|---|---|---|
| Informatique | Remise négociée ; proforma complète ; article sur commande ; ligne de service (03-I) ; WhatsApp ; dupliquer | Versions V1/V2, modèles, signature en ligne, « vu » |
| Grossiste | Proforma en cartons (10-H) ; livrer en plusieurs fois (02-A) ; depuis le dépôt (02-G) | Réservation de stock |
| Général | Proforma, devis → vente en un geste | — |
| Habillement | Rien : menu caché par défaut (fiche 25) | Uniformes par taille (10-J) |

**Réserver le stock d'un devis accepté : piège au premier mois.** Une réservation oubliée bloque la vente au comptoir ; la colonne a déjà été retirée (migration 078). Plus tard, afficher « 3 promis » à titre d'information.

**Prix figé ou prix du jour ?** Figé pendant la validité : c'est l'engagement du devis. Devis expiré : la confirmation demande de prolonger et montre les prix qui ont changé.

**Révision, duplication, modèles, suivi.** « Dupliquer » couvre la version 2 et le modèle : premier mois. « Envoyé » et « à relancer » : premier mois, car ils viennent gratuitement avec le bouton WhatsApp. « Vu » et versions liées : plus tard.

**Devis, « Vendre » ou proforma ?** Le devis n'est pas un écran de saisie de plus : c'est un mode de « Vendre » (« Enregistrer en devis », « Reprendre un devis », déjà dans 07-H). Il garde sa liste et sa fiche, car il vit des semaines (relance, accord, livraison). Le mot imprimé se règle : « Facture proforma » par défaut (question 1).

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** : une proforma pour une entreprise assujettie montre HT, TVA 18 %, TTC. Les colonnes `tva`, `total_ht`, `total_ttc` existent, forcées à 0 (`DevisService.ts:347`). Calcul de 03-K, taux figé sur la ligne du devis, recopié à la conversion. Non assujetti : rien de visible. 03-K doit nommer le devis.
- **FNE** : une proforma ne se certifie pas. Mais le devis doit déjà porter le type de client (B2B, B2G pour l'administration) et son NCC, repris de la fiche client (03-L), pour que la facture qui en sort soit certifiable sans ressaisie. Remise globale répartie par ligne (03-L).
- **Mobile money** : pied de proforma « Payer par Wave / Orange : n° … » (réglage de 03-G) ; acompte du devis par mobile money (04-I).
- **WhatsApp** : « Envoyer sur WhatsApp » = `wa.me` + lien public vers le PDF (mécanisme 03-L), qui pose « Envoyé » et sa date. E-mail : aucun envoi dans le code (aucun SMTP) ; plus tard.

## 8. Lots proposés

Déjà attribués ailleurs, cités ici : reste à livrer, fin du BL d'office et bouton « Livrer » → **02-A** (lui transmettre la cause `parent_ligne_id`, D1) ; remise conservée à la conversion et suppression de `POST /devis/:id/convert` → **03-A** ; plafond qui compte les BL → **02-C**, puis fiche 06 ; lecture des devis réservée aux rôles de vente et au lecteur → **03-E** (même règle que les factures) ; prix plancher → **10-C** ; acompte sur devis → **04-I** ; anti-doublon → **07-A**.

### 01-A · Un cycle de vie qui tient (S, priorité 1)
**Problème** : D3, D4, D7, devis jamais « Facturé » (D1), suppression d'un devis livré. **Résultat** : Brouillon → Envoyé → Confirmé → Livré en partie (02-A) → Facturé ; Refusé, Annulé et Expiré sont des fins. Un devis expiré ne se confirme qu'après prolongation.
**Écrans** : « Expiré » (calculé : validité dépassée et statut brouillon ou envoyé) dans la liste, ses puces et la fiche ; exclu de « Devis à confirmer » du tableau de bord. Confirmer un expiré ouvre « Prolonger jusqu'au… » et liste les prix du catalogue qui ont changé.
**Base** : aucune (expiré calculé). **API** : table de transitions dans `updateStatut` ; retour à « brouillon » interdit dès qu'un BL existe ; « refusé » interdit après livraison ; « converti » posé quand tout le livré est facturé et que rien ne reste ; `date_validite` = date ISO ≥ date du devis, sinon 400 ; confirmation d'un expiré : 409 `DEVIS_EXPIRE` sauf `prolonger_jusqu_au` ; `DELETE` seulement sans BL. La confirmation ne contrôle plus le plafond (02-A retire le BL d'office ; 02-C contrôle au BL) : elle avertit seulement, montants formatés.
**Fichiers** : `DevisService.ts`, `DocumentConversion.ts`, `BonLivraisonService.ts` (passage « converti »), `schemas.ts:317,336`, `DevisController.ts`, `SalesDocumentQuery.ts`, `StatusBadge.tsx`, `Devis.tsx`, `DevisDetail.tsx`, `Dashboard.tsx`.
**Étapes** : transitions ; validité ; statut automatique ; écrans.
**Tests** : les cinq essais de D3 et D4 → 409 ou 400, jamais 500 ; devis livré 4 + 6 puis facturé deux fois → « Facturé » ; expiré prolongé → confirmé.
**Fini quand** : aucun devis facturé n'apparaît « Confirmé » ; aucune transition interdite ne passe.
**Dépend** : 02-A (statut « livré en partie »), 02-C. **Risque** : devis existants dans un état devenu interdit ; ne bloquer que les nouvelles transitions.

### 01-B · Vendre un devis en un geste (M, priorité 2)
**Problème** : facturer un devis exige BL, « livré », puis facture (7 gestes), et l'encaissement ailleurs ; le client qui revient payer et emporter n'a pas besoin de BL. **Résultat** : sur un devis confirmé, deux actions : « Vendre » ouvre « Vendre » prérempli avec le reste à livrer, puis facture, sortie de stock et paiement en une transaction, acompte du devis déduit ; « Livrer » (02-A) quand la livraison est séparée. Les deux passent par le même contrôle du reste.
**Écrans** : `DevisDetail.tsx` (action principale selon l'état), « Vendre » (07-H : « Reprendre un devis »).
**API** : `devis_id` accepté par la vente de 07-H ; contrôle sous verrou du devis : quantités ≤ reste, prix et remises du devis repris (prix figés tant que valide) ; devis « Facturé » si plus rien ne reste.
**Fichiers** : `VenteComptoirService.ts`, `FactureService.ts` (`createInTransaction`), `DevisService.ts`, `DevisDetail.tsx`, `VenteComptoir.tsx`.
**Étapes** : API ; bouton ; reprise de l'acompte (04-I).
**Tests** : 3 portables vendus d'un coup → stock −3, facture = devis ; 2 puis 1 ; double clic ; devis expiré refusé.
**Fini quand** : devis → facture payée en 3 gestes.
**Dépend** : 07-H, 02-A, 03-A, 04-I, 01-A. **Risque** : deux chemins de sortie ; un seul calcul du reste pour les deux.

### 01-C · Une « facture proforma » présentable (M, priorité 3)
**Problème** : gêne « proforma incomplète ». **Résultat** : un document qu'une administration accepte : titre réglable « Facture proforma » ou « Devis », numéro, date, validité, client avec adresse et NCC, remises, total (HT/TVA/TTC si 03-K), montant en lettres, délai de livraison, conditions de paiement, garantie, notes, coordonnées bancaires, cadre « Bon pour accord » (date, cachet, signature du client). Les mentions de l'entreprise viennent de 03-G.
**Base** : `devis.delai_livraison` (texte court) ; `company_settings.titre_devis` (`proforma` / `devis`), `conditions_devis_defaut`. Régénérer `ci-baseline.sql`.
**Écrans** : `NouveauDevis.tsx` : « Conditions de paiement » et « Délai de livraison » préremplis ; `DevisDetail.tsx` les affiche ; réglage dans `CompanySettings.tsx`.
**Fichiers** : `PDFService.ts` (bloc devis du gabarit 03-G), `schemas.ts`, `DevisService.ts`, migration.
**Tests** : 3 et 30 lignes ; avec et sans TVA ; titre « Devis » choisi ; habillement.
**Fini quand** : PDF et aperçu montrent les mêmes champs et le total en base ; 25 lignes tiennent sur une page.
**Dépend** : 03-G, 01-D. **Risque** : mentions à faire valider par un comptable ivoirien.

### 01-D · Remise négociée, même total partout (M, priorité 4 ; étape 1 en priorité 1)
**Problème** : D2 ; aucune remise à l'écran, alors qu'on négocie toujours. **Résultat** : remise par ligne (% ou montant) et remise globale, ronde si on veut (1 910 925 → 1 900 000) ; fiche, aperçu, PDF, BL et facture montrent le même total.
**Écrans** : `NouveauDevis.tsx` (et le mode devis de « Vendre ») ; `DevisDetail.tsx` : sous-total, remise, total = `devis.total`.
**API** : `PUT` d'une remise seule recalcule le total ; la modification garde les remises existantes ; plancher (10-C).
**Fichiers** : `NouveauDevis.tsx`, `DevisDetail.tsx`, `api.ts` (types), `DevisService.ts` (`update`), `print-layout.tsx` et `PDFService.ts` tant que 03-G n'est pas fait.
**Étapes** : 1) les trois affichages lisent `total_ligne` et `devis.total` (avec 03-A) ; 2) la remise à l'écran, **jamais avant 03-A**, sinon D2 devient atteignable à l'écran.
**Tests** : −10 % puis −5 % ; remise ronde ; modifier un devis remisé ne perd rien ; même total en base, fiche, aperçu, PDF, BL, facture.
**Fini quand** : DEV-2026-00011 rejoué donne 1 910 925 partout, facture comprise.
**Dépend** : 03-A, 03-B (FCFA entiers), 10-C. **Risque** : remise globale à répartir par ligne pour la FNE (03-L).

### 01-E · Chiffrer un article sur commande (S, priorité 4)
**Problème** : D5. **Résultat** : un devis accepte un produit sans stock ; le stock se contrôle à la livraison ou à la vente.
**API** : retirer l'exigence d'une ligne de stock en boutique à la création et à la modification (`DevisService.ts:301-330`) ; le BL et la vente gardent leur contrôle. **Écrans** : colonne « Stock » : « sur commande » quand 0 ; l'étiquette « Stock du dépôt » de la fiche devient « disponible au dépôt ».
**Fichiers** : `DevisService.ts`, `NouveauDevis.tsx`, `DevisDetail.tsx`.
**Tests** : produit neuf sans stock : devis 201, BL refusé tant que rien n'est reçu ; produit au dépôt seulement : devis 201.
**Fini quand** : le serveur Dell se chiffre. **Dépend** : 10-E (créer le produit), 03-I (services). **Risque** : promettre ce qu'on n'a pas ; afficher le délai (01-C).

### 01-F · Envoyer et relancer (M, priorité 6)
**Problème** : D8 ; aucun envoi. **Résultat** : « Envoyer sur WhatsApp » pose « Envoyé » (date, auteur) ; puce « À relancer » (envoyé depuis 7 jours, non expiré) avec message prêt : « Bonjour, notre proforma DEV-… de 1 910 925 F reste valable jusqu'au … » ; chaque relance notée comme interaction CRM `relance`.
**Base** : `devis.envoye_le`, `devis.relance_le` ; `liens_publics` de 03-L étendu au devis.
**API** : `POST /devis/:id/lien`, `POST /devis/:id/envoye`, filtre `a_relancer`.
**Fichiers** : `DevisService.ts`, `routes/devis.ts`, `DevisDetail.tsx`, `Devis.tsx`, `Dashboard.tsx`, route publique de 03-L.
**Tests** : numéro mal formé ; lien expiré, révoqué ; devis refusé : plus de relance.
**Fini quand** : proforma ouverte sur un téléphone en 2 gestes, « Envoyé » posé sans clic de plus.
**Dépend** : 03-L, 01-C. **Risque** : prix visibles par qui reçoit le lien ; expiration et révocation obligatoires.

### 01-G · Dupliquer (S, priorité 8)
**Problème** : refaire une configuration pour un autre client, ou une version 2 après négociation, oblige à tout ressaisir. **Résultat** : « Dupliquer » sur tout devis ouvre le formulaire prérempli, client modifiable, prix du jour signalés s'ils ont changé.
**Base** : `devis.origine_devis_id`. **Fichiers** : `DevisDetail.tsx`, `NouveauDevis.tsx`, `DevisService.ts`.
**Tests** : copie d'un devis refusé ; produit archivé signalé ; l'original ne change pas.
**Fini quand** : version 2 en 3 gestes. **Dépend** : 01-D. **Risque** : faible.

## 9. Questions au propriétaire

1. Mot imprimé : « Facture proforma » (proposé par défaut, sauf habillement) ou « Devis » ? Change 01-C.
2. Confirmer un devis crée-t-il encore un BL ? Même question que 02 (n° 2). Proposé : non, boutons « Vendre » et « Livrer ». Si oui, 01-B se réduit au bouton « Vendre » et le plafond reste à la confirmation.
3. Plafond à la confirmation : avertir (proposé) ou bloquer ? Le blocage se fait alors à la livraison (02-C, fiche 06).
4. Devis expiré : bloquer la confirmation sans prolongation (proposé) ou seulement avertir ?
5. Le vendeur peut-il confirmer seul un devis à crédit ? Aujourd'hui oui (rejoint la question 6 du suivi).
6. Menu Devis caché pour l'habillement (proposé) ?

**Non vérifié** : envoi par e-mail ; impression papier ; rendu visuel du PDF (l'extraction montre des « � » à la place des accents, à regarder) ; 30 lignes ; modification et confirmation simultanées (lecture : `update` ne verrouille pas, `DevisService.ts:419`) ; parcours acompte entier à l'écran.

**À transmettre** : 02-A, cause `parent_ligne_id` vide ; fiche 06, message de plafond brut et sans dérogation ; fiche 25, menu Devis par profil ; fiche 27, proforma (01-C) ; 04-I, preuve D6.
