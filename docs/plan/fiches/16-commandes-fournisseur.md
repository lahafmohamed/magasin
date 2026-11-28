# 16 Suggestions d'achat et commandes fournisseur

> **Contre-expertise du 2026-11-26** ([détail](../vagues/vague-4-contre-expertise.md)) : Verdict maintenu : le module reste (acomptes sur commande de l'importateur et du grossiste), mais il est caché par défaut hors grossiste et informatique (fiche 25). D1 à D4 et D7 ont une seule cause, la facture créée à la commande (`CommandeService.ts:233-246`), héritée du premier commit et jamais décidée. Propriétaire 16-A : il annule les factures fantômes avec contre-passation, sans suppression, y compris celles réglées par compensation ou acompte. D5 : par l'API seulement. B1 : « Réceptions » est un module à part, sa page resterait vide si on cache les commandes. 16-E est absorbé par 18-E et 16-G réduit à un bouton (03-L). 16-F et 16-H plus tard. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-26, base jetable `nolyx_audit_1`, interface et API réelles. Montants en FCFA. Caisse non utilisée. La base du banc est modifiée : CMD-2026-00001 (reçue) est repassée « en attente » par l'API (défaut D5).

## 1. Verdict

**Simplifier.** On garde la commande : le grossiste, l'informatique et l'importateur d'habits commandent à l'avance et versent souvent un acompte. Mais aujourd'hui une commande crée une dette et une écriture comptable le jour où on la passe, qui ne suivent ni la modification ni l'annulation, et qui doublent à l'arrivée de la vraie facture. On retire cette facture automatique, on verrouille les statuts, on rend la commande facultative pour recevoir (fiche 17), on fond « Suggestions d'achat » dans la page Commandes. Ensuite seulement : « en commande », ventes, WhatsApp.

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire boutique / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Besoin | 3 | 4 | 3 | 2 / 5 | 3 | 4 |
| Réponse actuelle | 1 | 2 | 1 | 1 / 1 | 1 | 1 |

- **Grossiste** : commande aux industriels et distributeurs en cartons, paie souvent avant chargement. Réponse 1 : pas de cartons (10-H), acompte invisible, dette fausse.
- **Informatique** : bon de commande écrit aux distributeurs, import de Dubaï avec acompte. Réponse 2 : le bon existe, la dette est fausse.
- **Habillement** : lots en Dubaï ou Chine, achats au marché. Réponse 1 : pas de grille taille × couleur (10-J), pas d'achat sans commande.
- **Alimentaire boutique** : commande au téléphone ou va au marché ; il lui faut une liste « à racheter », pas un bon formel.
- **Plusieurs sites** : 1, la commande n'a pas de boutique de destination et la suggestion est globale.

## 3. Parcours réel

| Rôle | À l'écran | Ce qui surprend |
|---|---|---|
| Gérant, 1440 et 390 | Suggestions → « Créer 2 commandes » → confirmer : 8 produits, 2 commandes, 3 gestes. Fiche → « Valider » → confirmer → « … » → PDF : 4 gestes, puis envoi à la main | Les mêmes 8 produits reviennent aussitôt ; bandeau rouge « Écarts détectés » sur toute commande neuve |
| Admin | Pareil | Supprimer : aucun bouton (API seulement) |
| Dépôt | Pas d'écran Commandes ni Suggestions ; réceptionne (fiche 17) | API sans prix (`roleRedaction.ts:26`), PDF 403 : correct |
| Caissier, vendeur, lecteur | Pas d'écran | L'API leur donne commandes, prix d'achat et rapprochement (200) |

**Ce qui marche (rejoué).** Regroupement par fournisseur. Double clic sur la confirmation : 2 commandes, pas 4. Fournisseur par défaut modifiable (8 `PUT /produits` 200, relus en base). **Réparé, vérifié** : réception de 1 imprimante sur 3 (REC-2026-00006), la commande reste « Validée ». Cartes mobiles lisibles (capture `sugg-390`, `nouvelle-cmd-390`).

**Ce qui bloque.**
- **Base du banc et client neuf** : aucun produit n'a de fournisseur par défaut. Les 8 suggestions sont « Aucun fournisseur », cases grisées, bouton inactif. Un produit créé depuis la commande naît sans fournisseur, minimum 0 (`CommandeProductPicker.tsx:537-546`).
- **Achat au marché ou au téléphone** : pas de réception sans commande (`phase3-schemas.ts:15`). Il faut créer, valider, réceptionner : 3 pièces et environ 12 gestes, plus une facture automatique.
- **Envoyer au fournisseur** : rien. Télécharger le PDF, puis WhatsApp hors de l'ERP.
- **Acompte à la commande** : rien sur la commande. Seul chemin : payer la facture automatique (fait : 1 000 F sur celle d'une commande annulée).
- **Stock « en commande »** : affiché nulle part (recherche dans `frontend/src` et `backend/src`).

## 4. Défauts prouvés

### Argent et stock

| N° | Fait | Preuve | Où |
|---|---|---|---|
| D1 | **Commander = devoir.** Chaque commande crée une facture fournisseur « en attente » et l'écriture 601 / 401 du montant commandé, le jour même, rien reçu | CMD-7 et CMD-8 : FF-2026-00005 (2 613 566,67) et 00006 (203 605,74), 601 débit / 401 crédit le 26/11. `reste_due` 0,00 alors que la liste « à payer » les compte. `CommandeService.ts:233-246`, trigger `trg_facture_fournisseur_ecriture` (`ci-baseline.sql:322-347, 7238`) | Écran |
| D2 | **Modifier ne corrige pas la comptabilité.** CMD-7 sans le Lenovo : commande et facture 1 053 566,67, écritures toujours 2 613 566,67 | Écart 1 560 000. Trigger sur INSERT seulement ; `update` réécrit la facture (`CommandeService.ts:299-315`) | Écran |
| D3 | **Annuler laisse la dette.** CMD-8 annulée : FF-6 reste « à payer », paiement de 1 000 F accepté. CMD-7 reçue 1 sur 3 (127 689) puis annulée par « Plus d'actions » : 1 053 566,67 toujours dus. La confirmation ne parle pas de la réception partielle | `updateStatut` ne touche pas la facture (`CommandeService.ts:329-358`) ; `GET /factures-fournisseur/payable` ; capture `cmd7-partielle-390` | Écran |
| D4 | **Une livraison, deux dettes.** CMD-9 : 5 sachets de riz (14 500), reçus 5. Vraie facture DRV-778 saisie : 2 factures à payer, 401 crédité de 29 000, contrôle « facturé 10 > reçu 5 » | `FactureFournisseurService.ts:184-189` compte toute facture non annulée. À l'écran la facture se saisit sans lien à la commande (`FacturesFournisseur.tsx` n'envoie pas `commande_id`) : la double dette est la même (lecture du code) | API ; écran par lecture |
| D5 | **Statuts sans garde.** CMD-1 reçue en entier → « annulée » → « en attente », donc modifiable ; une commande annulée revient « en attente » | Seul « livrée » est refusé (`CommandeService.ts:342`) ; `update` n'exige que « en attente » (ligne 283) | API seulement |
| D6 | **Réception d'une commande annulée.** Dépôt, CMD-8 annulée : +2 chemises au dépôt (REC-2026-00005, 201) | `ReceptionService.create` ne lit pas le statut ; seul l'écran filtre (`getPendingOrders`) | API seulement |
| D7 | **Supprimer laisse les écritures.** Admin supprime CMD-10 : facture effacée, 2 écritures de 14 500 restent | `CommandeService.ts:386-392` | API seulement |
| D8 | **On recommande deux fois.** Juste après la création de CMD-7 et CMD-8, la page repropose les 8 mêmes produits, « Créer 2 commandes », 2 817 172 | `ProduitService.ts:671-687` ignore les commandes ouvertes ; captures `sugg-1440`, `sugg-apres-1440` | Écran |

### Blocage

- **B1** · Réception impossible sans commande (voir § 3). Désactiver le module « Commandes » (`config/modules.ts:85`) supprime aussi toute réception (lecture du code).
- **B2** · Commande sans destination : `commandes_fournisseur` n'a pas d'emplacement ; la réception prend le magasin principal par défaut (`ReceptionService.ts:148`). Deux boutiques sans dépôt : on ne sait pas pour qui on achète.

### Gêne

- **G1** · Toute commande neuve affiche en rouge « Écarts détectés… quantité facturée (3) > quantité reçue (0) » : la facture automatique compte comme facturée (capture `cmd7-neuve-1440`). Le contrôle à trois voies ne veut rien dire tant que D1 existe.
- **G2** · Quantité = 2 × minimum − stock, sans ventes. Câble HDMI : 45 en stock, minimum 25, 57 vendus en 30 jours (données du banc) : non proposé, rupture dans 3 semaines. Produit neuf à minimum 0 et stock 0 : proposé, quantité 1 (AUD16-USB). Le stock d'un emplacement inactif compte (jointure sans filtre, `ProduitService.ts:678-679`, lecture). `tiers.delai_livraison` n'est lu nulle part.
- **G3** · Prix proposé = coût moyen (`ReceptionService` écrit `prix_achat` = CMP), pas le dernier prix du fournisseur : imprimante 127 688,89 proposée, plus bas payé 124 800. « Informations d'achat » compte les lignes de commande et le brouillon d'une commande annulée comme « dernier achat » (prolonge D19 de la fiche 10). Centimes : 03-B.
- **G4** · Bon de commande PDF : ni « livrer à », ni date prévue ; la note interne « Créée depuis les suggestions d'achat » part chez le fournisseur ; « Total : 203 / 605,74 FCFA » coupé ; colonne Remise toujours « - » ; commande annulée imprimable (fiche 27).
- **G5** · Liste : une commande reçue en partie s'affiche « Validée », sans reste à recevoir.
- **G6** · Caissier, vendeur, lecteur : `GET /commandes`, `/:id`, `/:id/match`, `/produits/reorder-suggestions` en 200 avec prix d'achat (`routes/commandes.ts:11-14`). Relève de 03-E.
- **G7** · Deux `POST /commandes` simultanés : CMD-9 et CMD-10. L'écran se protège. Principe de 07-A.

## 5. Comparaison

| | Mieux qu'ici | Ici, mieux |
|---|---|---|
| Odoo | Commande automatique si fournisseur sur la fiche, comme ici, mais unité d'achat par fournisseur [O3] ; facture « commandé ou reçu », rapprochement qui affiche « Exception » sans bloquer [O22] | Regroupement en un clic, mobile, gratuit |
| Sage 100 | Mini/maxi, réapprovisionnement toutes gammes, calcul des besoins en option [G1] | Rien à installer |
| Loyverse | Commande préremplie, payante [L13] | Gratuit, par fournisseur |
| Cahier, WhatsApp | Une liste envoyée en 10 secondes, sans prix | Historique, reste à recevoir |

Minimum attendu (concurrents.md, hypothèse métier) : quoi racheter selon les ventes, en cartons, par fournisseur, envoi WhatsApp, commande sans montant. Nous n'avons que « par fournisseur ».

## 6. Manques

- **Tous** : « en commande » visible ; envoi WhatsApp ; acompte visible ; réception sans commande (fiche 17).
- **Grossiste** : commande en cartons (10-H) ; minimum de commande du fournisseur, plus tard.
- **Informatique** : prix en dollars, **plus tard** (saisir en FCFA, frais d'approche à la réception, fiches 17 et 15) ; numéros de série à la réception (10-K).
- **Habillement** : grille taille × couleur (10-J) ; acompte d'import.
- **Plusieurs sites** : destination ; suggestion par boutique.
- **Plus tard** : plusieurs fournisseurs par produit avec leur prix ; prévision saisonnière ; portail fournisseur.

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** : la commande n'écrira plus rien en comptabilité (16-A), donc aucune TVA déductible ici : elle naît sur la facture fournisseur (fiche 18). Pour un assujetti, la commande affiche les prix HT et la mention « HT » ; saisie HT ou TTC selon la question 4 du suivi. Non assujetti : rien ne change. Dépend de 03-K.
- **FNE** : rien sur la commande.
- **Mobile money** : l'acompte au fournisseur part souvent par Wave ou Orange Money ; il passe par la caisse ou la banque (08-D, fiche 18). La commande montre seulement « acompte versé ».
- **WhatsApp** : « Envoyer au fournisseur » ouvre `wa.me/<téléphone>` avec le texte de la commande et le lien du PDF (lien public de 03-L étape 1).

## 8. Lots proposés

### 16-A · Une commande n'est pas une dette (M, priorité 1)
**Problème** : D1, D2, D3, D4, D7, G1. **Résultat** : commander n'engage aucune dette ni écriture ; la dette naît de la facture du fournisseur (fiche 18).
**API** : `CommandeService.create/update/delete` ne créent, ne modifient ni ne suppriment plus de facture. `computeMatch` ne compte que les factures saisies. « Informations d'achat » (`ProduitController.ts:461-500`) ne lit plus les lignes de commande comme achats. **Base** : migration de reprise, pour chaque brouillon automatique (`numero_facture_fournisseur = numero_commande`, `montant_paye = 0`) : statut « annulée » et contre-passation 401 / 601 datée du jour ; les brouillons payés sont listés, pas touchés ; `ci-baseline.sql`.
**Écrans** : fiche commande, la carte « Contrôle » devient « Commandé · Reçu · Reste » tant qu'aucune facture n'existe.
**Fichiers** : `CommandeService.ts`, `FactureFournisseurService.ts`, `ProduitController.ts`, `CommandeDetail.tsx`, migration.
**Tests** : créer, modifier, annuler, supprimer : 0 écriture, 0 facture ; D4 rejoué : une dette de 14 500.
**Fini quand** : balance 401 = factures fournisseur réellement saisies. **Dépend** : fiche 18 (facturer le reçu). **Risque** : un client a payé un brouillon : il reste valable, le lister.

### 16-B · Des statuts qui ne reviennent pas en arrière (S, priorité 1)
**Problème** : D3 (partielle), D5, D6, G5. **Résultat** : six états clairs ; une commande reçue ou annulée est figée.
**Base** : statuts `brouillon`, `envoyee`, `recue_partiel`, `recue`, `soldee`, `annulee` (reprise : `en_attente` → brouillon, `validee`/`expediee` → envoyée) ; `annule_par`, `motif`.
**API** : brouillon → envoyée ; brouillon ou envoyée sans réception → annulée ; reçue en partie → « Solder le reste » (soldée) ; tout autre passage 409. Réception refusée hors envoyée ou reçue en partie (409, à faire avec la fiche 17). `PUT` seulement en brouillon. Suppression : brouillon seulement.
**Écrans** : liste, colonne « Reste à recevoir » ; fiche, « Solder le reste » remplace « Annuler » dès une réception ; « Expédiée » disparaît.
**Fichiers** : `CommandeService.ts`, `ReceptionService.ts`, `schemas.ts`, `Commandes.tsx`, `CommandeDetail.tsx`, `StatusBadge`, migration.
**Tests** : D5 et D6 rejoués : 409, stock inchangé.
**Fini quand** : aucune route ne rouvre une commande reçue. **Dépend** : 16-A. **Risque** : question 3.

### 16-C · Ne pas racheter ce qui est déjà commandé (S, priorité 1)
**Problème** : D8, G2 (minimum 0), place dans le menu. **Résultat** : relancer la page juste après une commande ne propose plus rien.
**API** : suggestion si `stock + en_commande <= stock_min` et `stock_min > 0` ; quantité = cible − stock − en commande ; `en_commande` = commandé − reçu des commandes envoyées ou en brouillon ; emplacements inactifs exclus. **Écrans** : colonne « En commande » ; même chiffre sur la fiche produit ; « Suggestions d'achat » devient l'onglet « À racheter » de la page Commandes (entrée de menu retirée).
**Fichiers** : `ProduitService.ts`, `Reapprovisionnement.tsx`, `Commandes.tsx`, `routeAccess.ts`, `navConfig.tsx`, `modules.ts`, `Inventaire.tsx`.
**Tests** : générer puis recharger : liste vide ; réception partielle : reste compté.
**Fini quand** : D8 rejoué : 0 doublon. **Dépend** : 16-B. **Risque** : vieilles commandes jamais soldées qui gonflent « en commande » ; 16-B permet de les solder.

### 16-D · Pour quelle boutique on achète (S, priorité 4)
**Problème** : B2. **Résultat** : la commande dit où livrer ; la réception le propose ; le PDF l'imprime.
**Base** : `commandes_fournisseur.location_id` (défaut : boutique de l'utilisateur, sinon principale). **API** : schéma, création, `getOrderDetails`. **Écrans** : champ « Livrer à » caché pour un seul emplacement ; filtre par emplacement de l'onglet « À racheter ».
**Fichiers** : `schemas.ts`, `CommandeService.ts`, `ReceptionService.ts`, `Commandes.tsx`, `CommandeDetail.tsx`, `PDFService.ts`, migration.
**Tests** : commande pour MAG-2, réception proposée à MAG-2.
**Fini quand** : un magasin unique ne voit rien de nouveau. **Dépend** : fiche 13 (boutique de l'utilisateur), 10-A.

### 16-E · Acompte visible sur la commande (S, priorité 4)
**Problème** : § 3. **Résultat** : « Acompte versé 500 000 · reste 1 410 470 » sur la commande ; bouton « Verser un acompte ».
**Base** : `acomptes_fournisseur.commande_id` facultatif. **API** : le traitement reste celui de la fiche 18 ; la commande lit la somme.
**Fichiers** : `CommandeDetail.tsx`, `CommandeService.ts`, service des acomptes fournisseur, migration.
**Tests** : acompte puis facture : déduit une fois. **Dépend** : 16-A, fiche 18, 08-D (Wave, Orange).

### 16-F · Quantité proposée selon les ventes (M, priorité 4)
**Problème** : G2. **Résultat** : le câble qui part à 2 par jour est proposé avant la rupture.
**API** : `vendu_30j` par produit (et par emplacement avec 16-D) ; cible = ventes par jour × (délai fournisseur `tiers.delai_livraison` + jours de couverture, réglage, 30 proposé) ; le minimum reste un plancher ; arrondi au carton quand 10-H existe.
**Écrans** : colonnes « Vendu 30 j » et « Jours restants » ; tri par urgence.
**Fichiers** : `ProduitService.ts`, `Reapprovisionnement.tsx`, réglage dans `company_settings`.
**Tests** : jeu de ventes fixe, quantités attendues ; produit jamais vendu au-dessus du minimum : absent.
**Fini quand** : HDMI du banc proposé. **Dépend** : 16-C ; 10-H pour l'arrondi. **Risque** : ventes saisonnières ; la quantité reste modifiable.

### 16-G · Envoyer la commande sur WhatsApp (S, priorité 6)
**Problème** : § 3, G4. **Résultat** : en 2 gestes le fournisseur reçoit la liste ; la commande passe « envoyée ».
**Écrans** : « Envoyer au fournisseur » (WhatsApp, PDF), case « sans prix ». **Base** : `notes_fournisseur` séparée de la note interne. **PDF** : livrer à, date prévue, total sur une ligne, « ANNULÉE » en filigrane (avec fiche 27).
**Fichiers** : `CommandeDetail.tsx`, `PDFService.ts`, `utils/whatsapp`. **Tests** : lien `wa.me` avec téléphone international ; fournisseur sans téléphone : bouton absent.
**Dépend** : 03-L étape 1, 16-B, 16-D.

### 16-H · Prix proposé : le dernier prix de ce fournisseur (S, priorité 7)
**Problème** : G3. **Résultat** : la ligne propose 124 800 « payé le 12/10 chez HP Distribution », pas le coût moyen.
**API** : dernier prix de réception ou de facture de ce fournisseur, sinon `prix_achat`. **Fichiers** : `ProduitController.ts`, `CommandeProductPicker.tsx`, `ProduitService.ts`. **Dépend** : 16-A, 10-B, 03-B (entiers).

## 9. Questions au propriétaire

1. **Commande obligatoire pour recevoir ?** Proposé : non, réception directe (fiche 17) ; la commande devient la « liste à racheter » envoyée par WhatsApp. Si oui, l'achat au marché reste à 3 pièces.
2. Garde-t-on le contrôle à trois voies ? Proposé : caché tant que la fiche 18 ne l'a pas justifié.
3. Supprime-t-on « Expédiée » ? Pour un conteneur de Dubaï, « Arrivée prévue le » suffit-il ?
4. Le dépôt peut-il préparer une commande sans prix que le gérant envoie ? (aujourd'hui refusé, décision E2)
5. Jours de couverture par défaut : 30 ?
6. Prix en dollars dès le premier client informatique, ou plus tard ?

**À transmettre.** Fiche 17 : D6 et la réception sans commande. Fiche 18 : D4, brouillons à reprendre (16-A). 03-E : ajouter les routes de G6. Fiche 27 : G4.

**Non vérifié** : pratique réelle des commerçants (aucun interrogé) ; en-tête du PDF avec des paramètres d'entreprise remplis ; deux gérants générant en même temps ; thème sombre.
