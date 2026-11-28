# 02 Bons de livraison

> **Contre-expertise du 2026-11-26** ([détail](../vagues/vague-3-contre-expertise.md)) : Verdict changé en « Améliorer » : les deux retraits sont des réparations, et le module se cache déjà par profil. D2 et D11 sont les défauts D1 et D2 de la fiche 01, comptés une fois. D6 : la quantité imprimée est bien la quantité commandée, mais le total faux est le défaut D1. D7 : la remise en stock n'est juste que si la marchandise revient ; elle ne touche jamais une vente comptoir. 02-D, 02-H et 02-I réduits (03-D, 03-J, 03-L). Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-26, sur la base jetable `nolyx_audit_2`, avec l'interface et l'API réelles. Montants en FCFA. BL = bon de livraison.

## 1. Verdict

**Simplifier.** Le grossiste en a besoin chaque jour et l'informatique pour ses clients entreprises : on garde le module, facultatif selon le profil. Mais aujourd'hui il sort du stock ce qui n'est pas livré, facture plus que l'écran ne montre, livre un devis deux fois, ignore le plafond de crédit, exige un devis et ne sait ni annuler ni regrouper. On retire ces contraintes et ces trous avant d'ajouter quoi que ce soit.

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire boutique / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Besoin | 2 | 4 | 0 | 0 / 5 | 3 | 4 |
| Réponse actuelle | 1 | 2 | – | – / 1 | 2 | 1 |

- **Grossiste et demi-gros** : livraison en tricycle ou camion, le client signe le bon, paie en fin de mois sur plusieurs bons. Réponse 1 : devis obligatoire, une facture par bon, plafond de crédit aveugle.
- **Informatique** : livraison et installation chez une entreprise, qui paie sur « facture + BL signé ». Réponse 2 : la chaîne devis → BL → facture existe, mais le papier n'a ni signature ni bonne quantité.
- **Habillement, boutique** : jamais de BL. Le préréglage le cache déjà.
- **Plusieurs sites** : 1, car livrer depuis le dépôt est impossible à l'écran et le magasinier du dépôt ne voit pas les bons.

## 3. Parcours réel

| Rôle | À l'écran | Ce qui surprend |
|---|---|---|
| Vendeur, 1440 et 390 | Confirmer le devis crée le BL tout seul ; « Marquer comme livré », puis « Créer la facture » : 3 pièces, 7 clics dont 3 confirmations. Téléphone : cartes lisibles, aucun défilement latéral | Fait tout seul, crédit compris. Ne peut ni corriger ni annuler un bon |
| Gérant, admin | Pareil, plus « Créer les factures » sur des bons cochés | Une facture **par** bon, jamais une seule |
| Caissier, lecteur | Pas d'écran | L'API leur donne tout, prix compris |
| Dépôt | « Accès réservé » | C'est lui qui charge le camion. L'API lui montre pourtant prix et totaux |

**Ce qui marche (rejoué).** Le stock sort au clic « livré », pas à la création. Deux « livré » simultanés : une seule sortie (sucre au dépôt 80 → 77, deux réponses 200). Un bon ne se facture qu'une fois. La confirmation annonce le nombre d'unités et l'emplacement. **Corrigé depuis la fiche 03** : la facture d'un bon porte l'auteur et le coût (FAC-2026-00209 : gérant, coût 450 000) et l'échéance suit le délai du client.

**Ce qui bloque.**
- **Fin de mois du grossiste** : liste, filtre « Livré », recherche du client, cocher 4 bons, « Créer les factures » : 5 gestes, mais **4 factures** (FAC-00210, 00211…). Le client en voulait une.
- **Livraison partielle** : le bon créé à la confirmation reste « À livrer » pour tout le devis. Pour livrer 6 sur 10, il faut un deuxième bon à la main. Rien ne calcule le reste à livrer.
- **Livrer depuis le dépôt** : aucun champ emplacement dans le formulaire ; le bon part de la boutique du devis.
- **Annuler un bon** : aucun bouton (menu « … » = « Télécharger le PDF »). Annuler le devis répond pourtant « annulez d'abord ce bon de livraison » (`DevisService.ts:604`).
- **Bon sans devis** : refusé (`BonLivraisonService.ts:146`). Le grossiste dont le client commande par téléphone doit d'abord faire un devis et le confirmer.
- **Bon livré il y a un mois, jamais facturé** : seule la liste affiche « À facturer 5 », sans montant ni âge. Rien sur l'accueil du gérant ni de l'admin ; aucun service de rapport ne lit `bons_livraison` (recherche dans `services/`).

**Livré non facturé, facturé non livré.** Un bon livré non facturé a quitté le stock mais n'est ni dans le chiffre d'affaires, ni dans l'encours du client, ni dans le contrôle du plafond : il est invisible. « Facturé non livré » n'existe pas : une facture directe sort le stock tout de suite (voir 6, « plus tard »).

## 4. Défauts prouvés

### Argent et stock

| N° | Fait | Preuve | Où |
|---|---|---|---|
| D1 | **« 0 livré » est livré, sorti et facturé.** Écran « Nouveau BL » : écran Dell livré 0, total affiché 1 785 000. La fiche du bon dit ensuite « Qté livrée 2 », ses lignes font 2 055 000 sous un total de 1 785 000 ; l'impression dit 2 055 000. « Une facture de 1 785 000 sera créée » → **FAC-2026-00209 : 2 055 000**. Stock des écrans 11 → 9 | BL-2026-00016 ; captures `nouveau-bl-1440`, `detail-bl-livre-1440`, `print-bl-1440` ; `quantite_livree \|\| quantite_commandee`, `BonLivraisonService.ts:210,213,326,449,523,760`, contre `??` ligne 181 | Écran |
| D2 | **Un devis se livre et se facture plusieurs fois.** DEV-2026-00012 : riz 10, huile 2, 185 000. Bon automatique + bon partiel (riz 6, huile 0) + reliquat (riz 4, huile 2), tous livrés : **riz −20, huile −6** ; factures 123 000 + 92 000 + 185 000 = **400 000** | BL-00002 à 00004, FAC-00203 à 00205 ; aucun cumul livré par ligne de devis | Écran (contre-expertise vague 1, oubli 1) |
| D3 | **Livré plus que commandé, commandé plus que le devis.** Devis de 2 souris : bon de 50 souris livrées plus un portable hors devis à 1 000 F, accepté et livré (stock −50, −1). À l'écran, 3 portables commandés sur un devis de 2 passent sans avertissement | BL-2026-00009 ; capture `nouveau-bl-1440` ; `schemas.ts:343-349` sans borne | API (livré > commandé) ; écran (commandé > devis) |
| D4 | **Le plafond de crédit ne voit pas les bons.** Client plafonné à 1 500 000, encours 352 220. Deux bons de 697 500 livrés : le contrôle voit toujours 352 220 et accepte un 3e devis, dont le bon est livré sans contrôle (200). Après facturation : **encours 1 747 220** | BL-00005 à 00007 ; `CreditService.ts:48-53` ne lit que `factures` ; aucun contrôle au passage à « livré » | Écran |
| D5 | **Stock pris nulle part** (repli, fiche 10 D2). Bon de Yopougon pour un câble absent de Yopougon : total 45 → 40, boutique principale toujours 45, mouvement « emplacement 4, 45 → 40 ». Une vente d'un câble à la boutique principale : total **44**. Les 5 câbles livrés ont disparu | BL-2026-00011, FAC-00208 ; `BonLivraisonService.ts:461-485` + trigger `trg_sync_produits_stock` | API (écran si le devis est fait à Yopougon, non rejoué) |
| D6 | **Le PDF ment au livreur.** Bon de 6 sacs livrés sur 10 : PDF « Qté 10 », ligne 93 000 (= 6 × 15 500), total **123 000** ; l'écran dit 93 000. Un bon annulé s'imprime sans mention | `bl-3.pdf` ; `PDFService.ts:829` lit `quantite` | Écran |
| D7 | **Annuler la facture d'un bon remet en stock ce qui est chez le client.** FAC-00203 annulée pour « erreur de prix » : riz 203 → 209, huile 129 → 131, bon annulé. Pour refacturer il faut un nouveau bon, qui ressort le stock | Message « articles remis en stock… BL-2026-00003 est annulé » ; décision `CLAUDE.md`, juste pour une vente au comptoir, fausse ici | Écran (gérant) |
| D8 | **Aller-retour de statut : deux sorties.** Livré → « valide » (200) → livré : deux mouvements −2 | BL-2026-00008 ; `BonLivraisonService.ts:409-438` | API |
| D9 | **Bon livré modifiable.** 5 écrans sortis de la boutique ; modification : livré 1, emplacement dépôt (200) ; annulation : **+1 au dépôt** (80 → 81), boutique toujours 11. 4 écrans perdus, 1 fantôme au dépôt | BL-2026-00010 ; `BonLivraisonService.ts:271` ne bloque que « facturé » et « annulé » | API |
| D10 | **Bon jamais facturable.** Deux bons livrés (4 et 6 cartons) ; `POST /devis/:id/convert` en facture un et passe le devis « converti » ; l'autre répond 400 « On ne peut pas facturer sans devis confirmé » | BL-2026-00020 (94 000) ; `DevisService.ts:699-705` (`LIMIT 1`) | API (aucun bouton) |
| D11 | Remise du devis perdue : devis et bon à 199 500 (10 % sur le riz), **facture 215 000** | DEV-00011, BL-00001, FAC-00202 ; `DevisService.ts:98-163` ne copie pas `remise_pct` | API (le formulaire de devis n'a pas de remise) |

### Blocage

| N° | Fait | Preuve |
|---|---|---|
| B1 | Pas de bon sans devis confirmé | `BonLivraisonService.ts:146`, `schemas.ts:353` |
| B2 | Pas d'annulation ni de correction à l'écran | `BonLivraisonDetail.tsx` : actions « livré », « facturer », PDF |
| B3 | Une facture par bon ; pas de facture de fin de mois | FAC-00210 et 00211 ; dialogue « Une facture sera créée pour chacun » |
| B4 | Livrer depuis le dépôt : écran impossible, API possible (BL-00018, dépôt 80 → 77) ; la facture est alors rattachée au dépôt | `NouveauBonLivraison.tsx` n'envoie pas `location_id` ; FAC-00212 |
| B5 | Le préréglage « libre-service », appelé à devenir « alimentaire / grossiste », **cache** les BL | `profilsActivite.ts:51` |

### Gêne

- Liste : « Montant total 7 778 500 » compte les bons annulés (228 000) ; « À facturer » sans montant.
- Formulaire : ni adresse, ni date prévue, ni emplacement, que l'API accepte pourtant.
- Papier (écran et PDF) : prix toujours imprimés, ni signature, ni adresse de livraison, ni livreur, ni véhicule ; « Date de livraison : — » car la colonne n'existe pas (`ci-baseline.sql:1473`).
- Un admin supprime par l'API un bon facturé (BL-00004) ; la facture garde un lien vers un bon disparu.

## 5. Comparaison

Sources : [faits/concurrents.md](../faits/concurrents.md), fiche 02 et ligne T6 ([O3], [O11], [O12], [G1]).

| | Mieux que nous | Nous, mieux |
|---|---|---|
| Odoo | Carton converti en unités à la livraison ; « livrer plus tard » depuis la caisse avec adresse obligatoire ; plafond en avertissement | Plus simple : un bon, un clic « livré » |
| Sage 100 | Préparation et BL séparés, périodicité de livraison, contrôle d'encours automatique, facturation périodique | Prix, téléphone, français simple |
| Loyverse | Rien | Tout |

Minimum attendu (même étude) : reste à livrer, signature, plusieurs bons sur une facture, bon sans prix pour le dépôt, caché au détail. Nous n'avons que le dernier point.

## 6. Manques

| Profil | Premier mois | Plus tard |
|---|---|---|
| Grossiste | Bon sans devis ; reste à livrer ; facture du mois sur plusieurs bons ; bon sans prix signé ; plafond qui compte les bons ; liste « livré non facturé » avec âge | Tournées et livreurs ; frais de livraison facturés |
| Informatique | Bon signé avec adresse et contact ; livraison partielle d'une commande d'entreprise | Numéros de série sur le bon (10-K) |
| Plusieurs sites | Choisir boutique ou dépôt ; le dépôt voit les bons à préparer, sans prix | Transfert automatique quand le dépôt livre pour la boutique |
| Tous | Annuler un bon à l'écran | « Facturé, livré plus tard » (acompte, retrait différé : 04-I) |

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA optionnelle** (03-K) : un bon imprimé sans prix n'a rien à afficher. Avec prix, il montre HT, TVA et TTC comme la facture. La facture issue de bons reprend le taux de chaque ligne ; client non assujetti : rien de visible.
- **FNE** : elle certifie la facture, jamais le bon. Préparer : la facture de fin de mois reprend le type de client et le NCC (03-L). Une facture certifiée ne s'annule plus : ses bons restent « livrés », un retour passe par l'avoir (05).
- **Mobile money** : rien sur le bon ; le client paie la facture (04).
- **WhatsApp** : deux boutons gratuits. « Au client » : lien vers le PDF du bon, preuve de livraison. « Au livreur » : adresse, téléphone, liste sans prix. Les liens publics viennent de 03-L.

## 8. Lots proposés

### 02-A · On ne livre jamais plus que le devis (M, priorité 1)
**Problème** : D2, D3 ; « 0 livré » (D1) est réglé par 03-A. **Résultat** : un devis de 10 se livre en 6 puis 4, jamais 20 ; chaque ligne montre « livré 6 / reste 4 ».
**Écrans** : Nouveau BL propose le reste, bloque au-delà ; fiche devis : « Livré partiellement ». **Base** : migration, vue ou colonne « livré cumulé » par ligne de devis (bons livrés ou à livrer, hors annulés) ; statut devis `livre_partiel`. **API** : refus 409 si livré > commandé ou > reste ; ligne hors devis refusée sauf case « ajout ». La confirmation d'un devis ne crée plus de bon : bouton « Livrer » (confirmé par la question 2).
**Fichiers** : `BonLivraisonService.ts`, `DevisService.ts`, `schemas.ts`, `NouveauBonLivraison.tsx`, `DevisDetail.tsx`, migration, `ci-baseline.sql`.
**Tests** : 10 = 6 + 4 ; 7e de trop refusé ; deux bons simultanés sur le dernier reste : un seul passe (verrou sur le devis).
**Fini quand** : le scénario D2 sort 10 et 2, facture 185 000. **Dépend** : 03-A. **Risque** : anciens devis déjà surlivrés ; les lister, ne pas corriger en silence.

### 02-B · Un bon livré est figé (S, priorité 1)
**Problème** : D8, D9, suppression d'un bon facturé. **Résultat** : le stock ne bouge qu'aux deux gestes prévus.
**API** : transitions permises : valide → livré, valide → annulé, livré → annulé (remise en stock), livré → facturé (conversion). Tout autre retour : 409. `PUT` refusé dès « livré » (notes exceptées). `DELETE` seulement pour « valide ».
**Fichiers** : `BonLivraisonService.ts`, `schemas.ts`. **Tests** : D8 et D9 rejoués : 409, stock inchangé.
**Fini quand** : aucune route ne change quantité ou emplacement d'un bon livré. **Risque** : aucun écran n'utilise ces chemins.

### 02-C · Le plafond compte les bons non facturés (S, priorité 1)
**Problème** : D4. **Résultat** : un client plafonné à 1 500 000 ne reçoit pas 2 millions de marchandise.
**API** : encours = factures dues + bons « à livrer » et « livrés » non facturés ; contrôle à la création **et** à « livré » (montant du bon). Message : « Encours 1 747 220 dont 1 395 000 livrés non facturés ».
**Fichiers** : `CreditService.ts`, `BonLivraisonService.ts`, tests. **Tests** : scénario D4 : 3e bon refusé (422).
**Fini quand** : encours affiché = encours contrôlé. **Dépend** : fiche 06 reprend la règle (bloquer ou avertir, question 4). **Risque** : un bon modifié puis livré ; recalculer au passage « livré ».

### 02-D · Annuler à l'écran, sans fausser le stock (M, priorité 1)
**Problème** : B2, D7. **Résultat** : le gérant annule un bon en 2 gestes ; une facture de bon annulée ne remet en stock que ce qui revient.
**Écrans** : fiche bon, « Plus d'actions » → « Annuler le bon » (motif). Bon livré : « La marchandise est revenue ? » oui → stock rendu ; non → refus, passer par un retour. Annulation d'une facture issue de bons : même question ; non → les bons redeviennent « livrés » et refacturables.
**API** : `PATCH /statut` avec motif ; `FactureService.remettreEnStock` reçoit `marchandise_revenue`. **Base** : `annule_le`, `annule_par`, `motif_annulation` sur `bons_livraison`.
**Fichiers** : `BonLivraisonDetail.tsx`, `FactureDetail.tsx`, `FactureService.ts`, `BonLivraisonService.ts`, `api.ts`, migration.
**Tests** : facture de bon annulée sans retour : stock inchangé, bon « livré », nouvelle facture possible.
**Fini quand** : D7 rejoué : riz reste 203. **Dépend** : 03-D (motif, pièce inaltérable). **Risque** : bon d'une facture déjà payée : l'annulation reste interdite (04-D).

### 02-E · Bon sans devis, module facultatif par profil (M, priorité 2)
**Problème** : B1, B5. **Résultat** : le grossiste fait un bon depuis le client et les produits, en 1 écran ; l'habillement ne voit jamais de bon.
**Écrans** : Nouveau BL : « Depuis un devis » ou « Nouveau » (client, produits, comme la facture). **API** : `devis_id` facultatif dans `createBonLivraisonSchema` et `BonLivraisonService.create`/`convertToFacture` (contrôle du devis seulement s'il existe).
**Profils** : grossiste et informatique l'affichent ; habillement et boutique le cachent ; module caché = aucun bon créé ailleurs. Corriger `profilsActivite.ts:51` au renommage du profil.
**Tests** : bon sans devis → livré → facture ; profil habillement : aucun menu, aucune route.
**Fini quand** : 3 gestes de moins pour une commande au téléphone. **Dépend** : 02-A, fiche 01, fiche 25. **Risque** : vendeur qui fait crédit seul (question 6 du suivi).

### 02-F · Le bon que signe le client (M, priorité 3)
**Problème** : D6, gêne « papier ». **Résultat** : le livreur part avec un bon juste, sans prix si le patron le veut, signé au retour.
**Écrans** : formulaire : adresse (préremplie du client), date prévue, livreur, véhicule (texte libre). Impression : quantité **livrée**, total = écran, choix « avec prix / sans prix » (défaut par profil), téléphone, cadre « Reçu en bon état : nom, signature, date », mention « ANNULÉ ».
**Base** : `livreur`, `vehicule`, `livre_le` (date réelle du clic « livré »). **Fichiers** : `PDFService.ts`, `print-layout.tsx`, `BonLivraisonDetail.tsx`, `NouveauBonLivraison.tsx`, migration.
**Tests** : 6 sur 10 : papier « 6 », total 93 000 partout ; sans prix : aucun montant.
**Fini quand** : écran, impression et PDF identiques. **Dépend** : fiche 27 (gabarit unique). **Risque** : signature électronique : plus tard.

### 02-G · Livrer depuis le dépôt (M, priorité 3)
**Problème** : B4, D5, dépôt sans accès. **Résultat** : vente à la boutique, livraison par le dépôt ; le stock du dépôt baisse une fois, la vente reste à la boutique.
**Écrans** : choix « Sortie : boutique / dépôt ». Dépôt : liste « À préparer », quantités seules, bouton « Livré ».
**Base/API** : `bons_livraison.location_id` = sortie ; la facture prend l'emplacement du devis ou du vendeur ; `GET /bons-livraison` retire les montants pour `depot_staff` ; `PATCH livre` ouvert au dépôt pour ses bons. Plus de repli sur `produits.stock` : stock absent = 409.
**Fichiers** : `BonLivraisonService.ts`, `DocumentConversion.ts`, `routes/bons-livraison.ts`, `routeAccess.ts`, pages BL.
**Tests** : sortie dépôt 10 → dépôt −10, boutique 0, facture « boutique » ; article absent : 409.
**Fini quand** : D5 rejoué : refus. **Dépend** : 10-A (stock par emplacement), fiche 13. **Risque** : magasin unique : le choix ne s'affiche pas.

### 02-H · Fin de mois du grossiste (M, priorité 4)
**Problème** : B3, bons oubliés. **Résultat** : « 12 bons livrés à Chez Tantie, 1 380 000, le plus ancien a 27 jours » ; une facture en 3 gestes.
**Écrans** : liste groupée par client (livrés non facturés, montant, âge) ; « Facturer le mois » appelle 03-J ; tuile du gérant « Livré non facturé » ; montant total sans les annulés.
**Fichiers** : `SalesDocumentQuery.ts`, `BonsLivraison.tsx`, `Dashboard.tsx`.
**Tests** : 3 bons dont un partiel → une facture = somme ; aucun bon facturé deux fois.
**Fini quand** : la question « qu'ai-je livré sans facturer ? » a une réponse sur l'accueil. **Dépend** : 03-J, 02-A. **Risque** : un mois très chargé ; facture de 200 lignes (03-G).

### 02-I · WhatsApp : bon au client, au livreur (S, priorité 6)
**Problème** : aucun envoi. **Résultat** : 2 gestes par message.
**Écrans** : fiche bon : « Envoyer au client » (lien du PDF), « Envoyer au livreur » (numéro saisi ; adresse, téléphone du client, liste sans prix).
**Fichiers** : `BonLivraisonDetail.tsx`, route publique de 03-L. **Tests** : lien expiré refusé ; texte sans prix.
**Fini quand** : message correct sur un Android. **Dépend** : 03-L, 02-F. **Risque** : lien transféré ; expiration obligatoire.

## 9. Questions au propriétaire

1. Un bon sans devis : oui (proposé) ? Sinon le grossiste fait deux pièces par commande.
2. Confirmer un devis crée-t-il le bon (aujourd'hui), ou seulement le bouton « Livrer » (proposé) ? Change 02-A.
3. Bon imprimé : sans prix par défaut pour le grossiste, avec prix pour l'informatique (proposé) ?
4. Plafond atteint à la livraison : bloquer sauf accord du gérant, ou avertir comme Odoo ? Le compte des bons non facturés (02-C) vaut dans les deux cas.
5. Facture d'un bon annulée : demander si la marchandise revient (proposé), ou toujours la remettre en stock ?
6. Fin de mois : un bouton par client (proposé), ou des factures automatiques le dernier jour ?
7. Le magasinier du dépôt marque-t-il lui-même « livré » ?
