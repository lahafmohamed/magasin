# 05 · Retours et avoirs

> **Contre-expertise du 2026-11-26** ([détail](../vagues/vague-3-contre-expertise.md)) : Verdict maintenu, borné : un seul parcours et un seul écran, mais l'avoir reste une pièce numérotée (exigé par la FNE). Juste contre CLAUDE.md : `creer_avoir_depuis_retour()` n'existe plus, `facture_avoir_lignes` n'est écrite par personne. D1 : réservé au gérant, et la dette reste due ; le défaut est le geste permis sans avertissement. D6 : le retour fonctionne, ce sont les rapports (fiche 23) et l'écriture de l'avoir (03-C) qui l'ignorent. 05-A en deux étapes ; 05-G passe à la fiche 18. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-26, base `nolyx_audit_3`, données créées par l'ERP (API et écran). « Écran » : un employé y arrive à la souris. « API » : appel direct seulement.

## 1. Verdict

**Fusionner.** Retour et avoir sont deux documents, deux pages et deux circuits d'états pour un seul geste du commerçant : « le client rapporte, je rends l'argent ou je le garde en crédit ». Avant de fusionner, il faut réparer l'argent : aujourd'hui, l'ERP laisse rembourser en espèces une facture jamais payée, faire un retour sur une facture annulée, ou faire un avoir de 500 000 F sur une facture de 6 000 F. Et il ne baisse jamais le chiffre d'affaires.

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Retour client, stock remis | 4 | 5 | 5 | 4 | 4 | 5 |
| Crédit déduit d'un prochain achat | 3 | 4 | 4 | 5 | 4 | 4 |
| Remboursement | 4 | 4 | 4 | 3 | 4 | 4 |
| Défectueux, retour fournisseur | 2 | 5 | 2 | 3 | 3 | 3 |
| **Réponse actuelle** | 2 | 1 | 1 | 2 | 2 | 1 |

L'informatique est mal servie : un ordinateur en panne repart en stock vendable. L'habillement aussi : un échange de taille prend une vingtaine de gestes.

## 3. Parcours réel

| Cas | Qui (écran) | Étapes | Constat |
|---|---|---|---|
| Chemise rapportée, client remboursé | **gérant seul** | **12 gestes** à 390 px (compté), 2 pages, 4 fenêtres, 4 pièces (facture, retour, avoir, sortie de caisse) | Juste en stock et en caisse (jean : 26 → 25 → 26 ; caisse +14 000 puis −14 000). Le caissier reçoit « Accès réservé » |
| Échange contre une autre taille | gérant | ~20 gestes | La vente comptoir n'accepte pas d'avoir en paiement : rembourser puis revendre (deux mouvements de caisse), ou facture à crédit puis « Imputer » |
| Ordinateur en panne sous garantie | gérant | – | Aucun suivi : on fait un retour, l'ordinateur revient en **stock vendable**. Aucun retour fournisseur |
| Grossiste : 3 cartons abîmés déduits de la prochaine facture | gérant | 10 gestes, puis 3 à la facture suivante | Cartons remis en vente (136 → 139). Le surplus part sur de vieilles factures (D5) |
| Annuler un retour qui a son avoir | personne | – | « Annulez d'abord l'avoir » : aucune action ne le fait (B2) |

Quatre mots pour un seul geste : retour, avoir, remboursement, annulation. Le commerçant visé dit « reprendre » et « rendre l'argent ». L'écran lui demande de « créer l'avoir » après avoir « approuvé » : il ne saura pas pourquoi.

**Ce qui marche.** Retour et avoir réparés (migration 106 : avoir depuis un retour = 201, lignes lisibles). Trois remboursements simultanés du même avoir : un seul passe (les deux autres 409, 422). Deux approbations simultanées : stock +1 seulement. Retour remis au coût figé à la vente, ce qui est le bon principe. Espèces seulement si la caisse du magasin est ouverte, et l'écran nomme la caisse (décision de `CLAUDE.md`, bonne pour le commerçant). Écran lisible à 390 px.

## 4. Défauts prouvés

### Argent et stock

| N° | Défaut | Preuve (avant → action → après) | Atteint |
|---|---|---|---|
| **D1** | **Rembourser une vente jamais payée** | FAC-2026-00204, 135 000 F à crédit, 0 payé. Retour, avoir AVOIR-…002, « Rembourser » en espèces : 201. Caisse **−135 000**. La facture reste « En attente », **135 000 dus**, et le client figure toujours dans la balance âgée. `CreditNoteService.ts:681-753` ne regarde jamais la facture | Écran, sans avertissement |
| **D2** | **Retour sur une facture annulée** | FAC-…205 (2 câbles). Stock 43 → annulation 45 → retour approuvé **47**. Avoir de 7 000 F créé, remboursable. `ReturnService.ts:60` ne lit pas le statut ; le sélecteur propose la facture annulée sans alerte | Écran |
| **D3** | **Avoir libre sans plafond** | Sur FAC-…206 (6 000 F) : avoir de **500 000 F**, motif « Retour marchandise » par défaut, créé à l'écran ; un second (API), remboursé 500 000 F par Wave. La facture garde 6 000 F dus, sous 1 010 000 F d'avoirs. Aucun stock remis | Écran |
| **D4** | **Même produit sur deux lignes : remboursé au prix fort** | FAC-…206 = 5 000 + 1 000. Deux retours d'une unité valent 5 000 chacun : **10 000 crédités pour 6 000 vendus**. Prix lu par `LIMIT 1` sans ordre (`ReturnService.ts:108`) ; l'écran fusionne les deux lignes (`Retours.tsx:216`) | API ; écran en deux retours |
| **D5** | **L'avoir paie des factures non choisies** | AVOIR-…004 (45 000) imputé sur FAC-…209 (19 500). Message : « Les 25 500 FCFA restants passent au crédit du client ». En fait **7 280 sur FAC-2026-00009 et 18 220 sur FAC-2026-00119**, crédit restant 0. Le `montant` envoyé est ignoré (`schemas.ts:492`) | Écran |
| **D6** | **Le chiffre d'affaires et la marge ne baissent jamais** | CA du jour 336 500 → vente 14 000 → 350 500. Retour, avoir, remboursement : **350 500**, marge 103 050 inchangée. Compta : 701 inchangé, **411 +14 000** (le client « doit » ce qu'on lui a rendu). Aucun rapport ne lit `factures_avoir` (`ReportingService.ts:27-55, 229-256, 317-355`) | Écran |
| **D7** | **L'imputation compte comme un virement encaissé** | 3 « paiements » `virement` (45 000 F au total) issus d'un avoir, comptés dans les paiements du jour (`/paiements/stats` : 104 000 annoncés, 59 000 réellement reçus). `CreditNoteService.ts:593` → `toPaiementMethod(null)` = `virement` | Écran |
| **D8** | **Un article abîmé revient en vente** | « Cartons abîmés » : huile MAG-1 136 → 139 vendables. Aucun état « défectueux » | Écran |
| **D9** | **Stock fantôme effacé par le retour** (confirmé) | Produit créé à 0, « Ajuster +8 » : 8, aucun emplacement. Vente 1 : 7. Retour 1 : **1**. Le mouvement dit « avant 0, après 1 » : 6 pièces disparues sans trace | Écran |
| D10 | Retour simultané | 3 envois pour 1 basket vendue : 2 acceptés, stock 121 → **123**. Aucun verrou sur la facture | API (le bouton se désactive) |
| D11 | Avoir annulé puis revalidé | Avoir annulé, retour annulé (stock −10), avoir remis « valide », remboursé **14 000 F**. Marchandise jamais rendue (`CreditNoteService.ts:471`) | API |
| D12 | Avoir utilisé supprimé | Admin supprime AVOIR-…004 : 200. FAC-…209 reste payée par un avoir disparu des listes (`:837`) | API |

### Blocage

| N° | Défaut | Preuve | Atteint |
|---|---|---|---|
| **B1** | Caissier et vendeur ne peuvent rien | Créer, approuver, rembourser : 403 ; page « Accès réservé ». Le client au comptoir attend le gérant | Écran |
| **B2** | « Annulez d'abord l'avoir » : impossible | Menu de l'avoir : PDF, Rembourser. `updateStatut` et `delete` n'ont aucun appelant à l'écran. Même phrase à l'annulation d'une facture (`FactureService.ts:791`) | Écran |
| B3 | Échange impossible en un geste | Aucun mode « avoir » à la caisse ; c'est le lot 07-J | Écran |
| B4 | Ni retour fournisseur ni SAV | Aucune table ; les types de mouvement de stock n'en ont pas (`ci-baseline.sql:3045`) | – |
| B5 | Retour d'un article vendu dans l'autre boutique | Vente à MAG-2, client revenu à MAG-1 : stock remis à MAG-2, espèces sorties de la caisse de MAG-2 (session 4). Le gérant de MAG-1 ne peut pas rembourser de son tiroir | Écran |

### Gêne

- PDF de l'avoir : ni date, ni facture d'origine, ni motif, ni « remboursé le … en espèces » (texte extrait).
- La facture propose « Créer un avoir » (motif par défaut « Retour marchandise », sans stock), pas « Retour ».
- Le dialogue de retour ne montre pas ce qui a déjà été rendu ; l'API répond « Retour créé et stock mis à jour » alors que rien n'a bougé.
- Dépôt et lecteur lisent les montants des avoirs et retours par l'API.
- Balance âgée : les avoirs non utilisés sont ignorés (client 4 : 861 906 dus contre 844 906 sur la fiche, écart = 17 000 d'avoirs). Confirmé, lot 04-A.
- `facture_avoir_lignes` : 0 ligne, **personne ne l'écrit**. `creer_avoir_depuis_retour()` n'existe pas (migration 106). À supprimer.

**Décisions de `CLAUDE.md` revues.** « Retour remis en stock à l'approbation seulement » : tient. « Rembourser l'avoir : gérant, caisse ouverte » : tient, mais sans plafond lié au payé (D1). « Un paiement règle sa facture » : l'imputation d'avoir ne le respecte pas (D5).

## 5. Comparaison

| | Eux | Nous |
|---|---|---|
| Odoo | Remboursement partiel depuis la vente ; carte cadeau comme avoir [O9]. Après facture : transfert inverse **et** avoir, deux documents [O21] | Deux documents aussi, et cinq actions |
| Sage | Bon de retour et avoir financier distincts [G1] | Idem, sans contrôle du montant |
| Loyverse | Retour depuis le reçu, droit dédié [L6] | Pas depuis le ticket ; gérant seul |
| Minimum attendu | Retrouver la vente par ticket ou client, échange avec complément, état (remis en stock, défectueux), motif, accord du gérant | Ni ticket, ni échange, ni état |

**Notre avance possible** : un seul document « Retour » qui finit en argent, crédit ou échange, en une transaction, avec accord du gérant au comptoir. Ni Odoo ni Sage ne le font en un écran.

## 6. Manques par profil

| Besoin | Profils | Quand |
|---|---|---|
| Retour depuis le ticket (scan) au comptoir, accord du gérant | Habillement, général | Premier mois |
| Échange de taille ou de modèle avec complément | Habillement | Premier mois (07-J) |
| État « défectueux » hors stock vendable | Tous | Premier mois |
| Retour d'avaries du grossiste déduit d'une facture choisie | Grossiste | Premier mois |
| Renvoyer au fournisseur un article défectueux | Informatique | Premier mois |
| Fin de garantie lue au retour | Informatique | Avec 10-K |
| Retour sans ticket (prix de la dernière vente), gérant seul | Habillement | À trancher (question 4) |
| Réparation, prêt d'appareil, suivi SAV | Informatique | Plus tard |
| Bon d'achat au porteur, expiration du crédit | Habillement | Plus tard |

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** (03-K) : chaque ligne de l'avoir reprend le taux de la ligne vendue ; un geste commercial en montant prend le taux unique de la facture, ou est refusé si elle en mélange plusieurs. Client non assujetti : rien de visible.
- **FNE** (03-L) : un avoir FNE se fait sur une facture certifiée, par ligne (`fne_item_id`) et quantité, sans prix modifiable. Terrain : chaque ligne de retour pointe la ligne vendue (lot 05-A), ce qui suffit. Sur une facture certifiée, interdire l'avoir en montant pur. Statut FNE de l'avoir dans une table à part, comme pour la facture.
- **Mobile money** : remboursement Wave ou Orange avec référence et téléphone du bénéficiaire, toujours dans la session de caisse (08-D).
- **WhatsApp** : « Envoyer le crédit » (`wa.me`, montant restant, lien) : la preuve que garde le client qui ne prend pas son argent.

## 8. Lots

Règle cible : **un retour rend au plus ce qui a été vendu ; il rembourse au plus ce qui a été payé ; il déduit d'abord ce qui est dû ; rien ne part ailleurs sans un geste.**

### 05-A · On ne rend que ce qui a été vendu (M, priorité 1)
**Problème** D2, D3, D4, D10, D11, D12. **Résultat** : impossible de créditer plus qu'une vente.
**Base** : `retour_lignes.document_ligne_id` (lien vers la ligne vendue) et `ligne_origine_id` sur les lignes d'avoir ; rattrapage sur la première ligne correspondante ; `ci-baseline.sql`.
**API** : facture annulée → 422 ; `SELECT … FROM factures … FOR UPDATE` avant le calcul du retournable, par ligne ; prix = celui de la ligne ; avoir libre : total des avoirs actifs ≤ total de la facture, motif « Retour marchandise » retiré ; « annulé » définitif ; suppression refusée dès qu'un avoir a servi.
**Écrans** : `Retours.tsx` (clé = ligne, « déjà rendu », factures annulées absentes), `NouvelAvoir.tsx` (plafond affiché).
**Fichiers** : `ReturnService.ts`, `CreditNoteService.ts`, `schemas.ts`, `phase3-schemas.ts`, migration.
**Tests** : rejouer D2, D3, D4, D10 (trois envois : un accepté), D11, D12.
**Fini quand** : Σ avoirs actifs d'une facture ≤ son total, toujours. **Dépend** : rien. **Risque** : retours existants sans ligne d'origine.

### 05-B · Rembourser ce qui est payé, déduire ce qui est dû (M, priorité 1)
**Problème** D1, D5, D7. **Résultat** : un retour sur une facture impayée baisse la dette ; seul l'argent reçu se rembourse ; le surplus reste un crédit visible.
**Base** : `factures_avoir.montant_impute`, `montant_rembourse`, reste calculé, contrainte « reste ≥ 0 ».
**API** : à la validation, imputation d'office sur la facture d'origine jusqu'à son reste dû (même vente, pas de choix) ; remboursable = min(reste de l'avoir, payé − déjà remboursé) ; remboursement partiel ; imputation sur une autre facture au `montant` choisi ; le surplus n'est plus distribué (appel à `recomputeClientAllocations` retiré) ; imputation écrite `methode_paiement = 'avoir'`, exclue des encaissements, du reçu et du tableau de bord.
**Fichiers** : `CreditNoteService.ts`, `paymentMethods.ts`, `PaiementController.getStats`, `Dashboard.tsx`, `AvoirDetail.tsx`.
**Tests** : FAC-…204 → facture soldée, remboursement refusé ; facture payée à moitié ; 45 000 sur 19 500 → 25 500 de crédit, FAC-…00009 et …00119 intactes ; encaissements du jour = argent reçu.
**Fini quand** : aucune sortie de caisse supérieure à ce qui est entré pour cette vente. **Dépend** : 04-B (même règle), 04-A (solde). **Risque** : avoirs déjà « utilisés » sans montant ; reprise à 100 %.

### 05-C · L'article rendu va au bon endroit, dans le bon état (M, priorité 1)
**Problème** D8, D9, B5. **Résultat** : chaque ligne est « remise en rayon » ou « défectueuse » ; elle entre dans le magasin où le client revient ; l'argent sort de ce tiroir.
**Base** : `retour_lignes.etat` (`revendable`, `defectueux`), `retour_lignes.location_id` ; un emplacement « Défectueux » par magasin (créé avec le magasin, fiche 13), exclu de la vente, des alertes et de la valeur vendable.
**API** : emplacement = magasin de l'utilisateur (choix si plusieurs) ; coût = coût figé de la ligne vendue, sinon CMP ; tout passe par `applyStockMovement`.
**Fichiers** : `ReturnService.ts`, `StockCostingService.ts`, `CreditNoteService.rembourser`, `Retours.tsx`.
**Tests** : 3 cartons abîmés → vendable inchangé, Défectueux +3 ; vendu à MAG-2, rendu à MAG-1 → MAG-1 +1, caisse MAG-1 ; stock fantôme → 8.
**Dépend** : **10-A avant tout** (sinon un retour efface du stock), 13. **Risque** : CMP par emplacement (10-B).

### 05-D · Le retour baisse le chiffre d'affaires, la marge et les comptes (M, priorité 1)
**Problème** D6. **Résultat** : CA net = ventes − avoirs de la période ; marge diminuée de (prix − coût) des lignes rendues ; mêmes chiffres partout.
**Base** : vue `ventes_nettes` (lignes de facture moins lignes d'avoir, datées de l'avoir) lue par tous les rapports ; écriture à la validation de l'avoir : débit 701, crédit 411 ; rattrapage des avoirs existants.
**Fichiers** : `ReportingService.ts` (pnl, marges, tableau de bord, tendances, catégories, meilleurs produits), `FactureController` (stats), migration, `ci-baseline.sql`.
**Tests** : cycle vente → retour → remboursement : CA, marge, 411 et 701 égaux à l'avant-vente ; avoir libre : CA baisse, marge baisse du montant.
**Dépend** : 03-C (`compte_numero`), 03-D (CA net des annulations), 22 (garder la comptabilité), 23. **Risque** : double déduction avec une annulation de facture ; interdire avoir + annulation sur la même facture (déjà fait).

### 05-E · Un seul « Retour » : rendre, puis rembourser, créditer ou échanger (L, priorité 2, trois étapes)
**Problème** : 4 pièces et 12 gestes pour une chemise ; deux circuits d'états ; B2. **Résultat** : une entrée de menu « Retours » ; un document, dont le numéro d'avoir est imprimé dessus.
**Écrans** : (1) trouver la vente : scan du ticket, numéro, client ; (2) cocher les lignes, état, motif ; (3) « Valider » : stock, avoir et déduction de la facture d'origine en une transaction ; (4) issue : « Rendre l'argent » (mode), « Garder en crédit », « Échanger » (ouvre « Vendre » avec le crédit, 07-J). Sur la facture : « Retour » à côté de « Annuler » ; « Geste commercial » remplace « Créer un avoir » (sans produit, plafonné). « Annuler le retour » : tout s'inverse si le crédit n'a pas servi ; sinon refus qui dit quoi faire.
**API** : `POST /retours`, `/retours/:id/valider`, `/rembourser {montant, mode}`, `/imputer {facture_id, montant}`, `/annuler {motif}`. **Supprimés** : statut `brouillon`, `PATCH /avoirs/:id/statut`, `DELETE /avoirs/:id`, `POST /avoirs/from-retour`, table `facture_avoir_lignes`, colonne `retours.total_remboursement` (calculée), écritures `compte_client_lignes` (avec 04-C). `/avoirs` reste en lecture une version.
**Fichiers** : `ReturnService.ts` + `CreditNoteService.ts` → `RetourService.ts` ; `routes/{retours,avoirs}.ts` ; `Retours.tsx`, `Avoirs.tsx`, `AvoirDetail.tsx`, `NouvelAvoir.tsx` → `Retours`, `RetourDetail`, `NouveauRetour` ; `routeAccess.ts`, `navConfig.tsx`, `FactureDetail.tsx`, `GlobalSearch.tsx` ; migration de `create_avoir_from_retour()`.
**Étapes** : (1) API transactionnelle ; (2) écrans, 390 px d'abord ; (3) retrait de l'ancien, redirections.
**Tests** : les quatre cas de la section 3 ; tests `AvoirFromRetour`, `AvoirRembourser`, `CreditNoteApply`, `ReturnService` réécrits ; double clic sur Valider.
**Fini quand** : chemise rendue contre argent en **6 gestes**, une page, un document. **Dépend** : 05-A à 05-D. 07-J s'appuie dessus. **Risque** : faible, aucun utilisateur réel.

### 05-F · Le caissier saisit, le gérant autorise (S, priorité 3)
**Problème** B1. **Résultat** : caissier et vendeur créent le retour depuis le ticket ; valider et rendre l'argent : gérant, ou caissier avec le code du gérant (fiche 24) ; sans accord seulement si même jour, même caisse, sous le plafond (question 2).
**API** : création ouverte à `caissier`, `magasin_staff` ; validation et remboursement par `manager`, `admin` ou accord ; motif obligatoire ; qui crée, valide, rend : écrit sur le retour et visible à la clôture (08). Dépôt et lecteur : sans montants (03-E).
**Fichiers** : `routes/retours.ts`, `RetourService.ts`, `routeAccess.ts`. **Tests** : matrice rôle × action × plafond.
**Dépend** : 05-E, 24 (code), 08-E. **Risque** : fraude au remboursement ; plafond et liste du jour à la clôture.

### 05-G · Défectueux : renvoyer au fournisseur ou passer en perte (M, priorité 4)
**Problème** B4, D8. **Résultat** : depuis l'emplacement Défectueux, « Renvoyer au fournisseur » (bon imprimé, stock sorti, montant attendu) ou « Passer en perte ».
**Base** : `retours_fournisseur` (`RF-AAAA-#####`, fournisseur, statut `envoye`/`regle`/`perdu`, lignes produit, quantité, coût, facture fournisseur facultative) ; type de mouvement `retour_fournisseur`.
**Fichiers** : nouveau `RetourFournisseurService.ts`, route, page. L'avoir du fournisseur déduit de sa facture : fiche 18 ; le remplacement reçu : fiche 17.
**Tests** : 1 ordinateur défectueux → renvoyé → stock Défectueux 0, valeur juste.
**Dépend** : 05-C, 18, 10-K (numéro de série). **Risque** : en faire un module SAV ; la réparation et le prêt restent « plus tard ».

**Ordre** : A, B, C (après 10-A), D, E, F, G.

**À transmettre** : fiche 27 (le PDF de l'avoir doit porter la date, la facture d'origine, le motif, le remboursement et son mode) ; fiche 13 (emplacement Défectueux, magasin du retour) ; fiche 18 (avoir fournisseur) ; fiche 06 (facture rendue encore relancée : réglé par 05-B) ; fiches 22 et 23 (05-D) ; 03-E (lecture des montants par le dépôt).

## 9. Questions pour le propriétaire

1. **Fusion** : un seul document « Retour » qui finit en argent, crédit ou échange (recommandé), ou garder retour et avoir séparés comme Sage ?
2. **Caissier** : peut-il reprendre et rembourser seul une vente du jour à sa caisse sous un plafond (proposé : 25 000 F), ou faut-il toujours le gérant ? Lié aux questions ouvertes 8 et 16.
3. **Vente impayée** : un retour la déduit toujours de la facture (recommandé), jamais de remboursement ?
4. **Sans ticket** : reprendre un article sans facture retrouvée (gérant, prix de la dernière vente), ou refuser ?
5. **Crédit non utilisé** : sans limite de durée (proposé), ou expiré après un an ?
6. **Retour fournisseur** : premier mois pour l'informatique (recommandé, lot 05-G), ou avec la fiche 18 ?

**Non vérifié** : période comptable close ; retour d'une facture issue d'un bon de livraison ; avoir au « Client comptoir » imputé avec surplus (il paierait les ventes impayées d'autres clients anonymes : supposé) ; impression réelle ; aucun commerçant interrogé.
