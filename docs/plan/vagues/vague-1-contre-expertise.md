# Vague 1 · Contre-expertise (fiches 10, 07, 03)

2026-11-25, base `nolyx_audit_4`, scripts neufs, données créées par l'écran ou l'API.

## 1. Résultat

45 défauts contrôlés (argent/stock et blocages) : **35 confirmés, 10 nuancés, 0 faux**. Cinq affirmations annexes sont fausses (section 6) et les fiches se contredisent sur leurs lots (section 4).

« Écran » = un employé y arrive à la souris. « API » = il faut un appel direct avec un compte autorisé : moins grave.

## 2. Défauts rejoués

### Fiche 10 · Produits

| N° | Statut | Preuve rejouée | Atteint par |
|---|---|---|---|
| D1 stock fantôme | **Confirmé, pire qu'écrit** | +10 au dépôt, −3 vendus à MAG-1, +5, réception de 20 à MAG-1 : total **20 au lieu de 32** ; MAG-1 20 (attendu 17), dépôt 0 (attendu 15). Transfert depuis le dépôt : 409, « 0 disponible ». **Avec un seul magasin aussi** : +10 par « Ajuster le stock », l'écran dit « Stock augmenté », la liste dit « Rupture », la réception de 20 donne 20 au lieu de 30. **Un retour suffit** : 7 en stock, retour de 1 → **1 au lieu de 8** | Écran |
| D2 vente du stock d'ailleurs | Confirmé | 10 au dépôt, vente de 3 à MAG-1 : total 7, dépôt 10 ; +1 au dépôt → **11 au lieu de 8**. Même repli dans les BL, rejoué (livré à MAG-2, MAG-1 reste à 10) | API ; écran par détour (panier rempli, puis changement de magasin) |
| D3 coût corrigé sans effet | Confirmé | 200 000 F inchangés, puis 5 500 et 220 000 F | Écran |
| D4 coût oublié | Confirmé | 10 à 0, puis 10 à 1 000 → 500 | Écran |
| D5 fiche qui écrase le coût | Confirmé | 1 200 → 1 000, figé à la vente | Écran |
| D6 suppression en stock | Confirmé | 90 124 652 → 89 624 652, sans avertissement | Écran |
| D7 vente à 1 F | Confirmé | Vendeur, écran à 135 000 F : FAC-2026-00210 à 1 F, sans alerte. Caissier : API | Écran |
| D8 mouvements incohérents | **Nuancé** | « vente +50 », « perte +5 » : API seulement. L'auteur manque dans l'historique, **mais il est dans le journal d'audit**. À l'écran : le dépôt ajuste les trois emplacements | API / écran |
| D9 stock initial sans mouvement | Confirmé | 10 pièces, 0 ligne | Écran |
| D10 sans catégorie | Confirmé | 400, « Impossible d'enregistrer » | Écran |
| D11 export | Confirmé | 100 lignes sur 139 | Écran |
| D12 recherche à MAG-2 | **Nuancé** | Faux avec 23 produits (« riz » : 1 résultat). Vrai au-delà de 20 articles ressemblants : 48 T-shirts, 15 visibles sur 42 à MAG-1 | Écran |
| D13 accents | Confirmé | « cable », « ecran » : 0 ; « rj45 » : 0 en vente, 1 en liste | Écran |
| D14 référence perdue | Confirmé | 400 ; PUT sur supprimé : 200 | Écran / API |
| D15 coût visible | Confirmé | 6 routes, caissier, vendeur, lecteur ; la recherche de vente le cache | API |

### Fiche 07 · Comptoir

| N° | Statut | Preuve rejouée | Atteint par |
|---|---|---|---|
| D1 triple envoi | **Nuancé (gravité)** | 3 factures, 3 sorties, 1 paiement. À l'écran le double clic est bloqué : il faut une coupure pendant que le serveur travaille ; la lenteur l'aide | API |
| D2 monnaie 0 | Confirmé | 10 000 reçus pour 3 500 : « Monnaie 0 » | Écran, coupure |
| D3 panier changé | Confirmé | 8 500 affichés, 3 500 enregistrés, souris non sortie | Écran, coupure |
| D4 scan ailleurs | **Nuancé** | Après « + » : 3 riz. Code à 8 chiffres : monnaie 96 381 574. Article perdu pendant la fenêtre. Mais la quantité géante n'est pas arrêtée par le stock : un plafond d'un milliard, message **en anglais**, qui arrête aussi l'EAN-13 dans « Espèces reçues » | Écran |
| D5 article absent | Confirmé | Câble vendu à Yopougon : total 44, MAG-1 45 | Écran |
| D6 prix libre | Confirmé | 1 F, 201 (pas de champ prix au comptoir) | API |
| D7 acompte | **Nuancé** | Client sans dette : refusé à 5 000 et à 2 000. Client endetté : la vente passe et l'acompte solde une vieille facture, comportement voulu (`ClientAllocationService.ts`, `CLAUDE.md`) | Écran |
| D8 Wave, caisse fermée | Confirmé | Paiement sans session, 0 écriture de trésorerie | Écran |
| D9 carte au 53, 4 999,5 | Confirmé | Demi-franc : API seulement | Écran / API |
| D10 lenteur | Confirmé | Ci-dessous | Écran |
| D11, D12 | Confirmés | Partiel 422, mixte 201 ; panier 1 → 0 | Écran |
| D13 mauvaise boutique | **Nuancé** | Défaut MAG-1 pour un vendeur affecté à MAG-2 : vrai. Ouvrir, fermer ou lire la caisse d'ailleurs est refusé (403) ; y encaisser, une fois ouverte, passe | Écran |
| D14 client neuf | Confirmé | Base neuve : 1 emplacement, 0 magasin | Écran |

**Lenteur, mesure calme** (12 cœurs occupés à 21 %)

| Cas | Temps |
|---|---|
| Aller-retour SQL nu | 0,16 ms |
| Client neuf, tout compris (`tsx` aussi) | **29 ms** |
| Client comptoir, 543 factures | **760 ms** (370 à 1 384) |
| Trois caisses ensemble | 1,1 / 2,7 / 4,2 s |
| MAG-1 et MAG-2 ensemble | 0,8 et 1,6 à 2,4 s |
| Trois clients différents ensemble | 36 à 172 ms |

Part du banc : 30 ms au plus, et les écarts entre mesures. Le reste est structurel : chaque vente réécrit quatre fois toutes les factures du client (2 089 lignes par vente à 515 factures, environ 1 090 commandes SQL) ; 2 % seulement sont des mises à jour légères, les autres touchent 11 index. L'attente entre deux magasins est maintenant **mesurée**. « 7 s après un mois » reste une extrapolation plausible.

### Fiche 03 · Factures

| N° | Statut | Preuve rejouée | Atteint par |
|---|---|---|---|
| 4.1 livré 0 | Confirmé | BL-2026-00009 : 10 000 à l'écran, ligne livrée 5. Autre BL : 10 000 → facture 27 500, stock −5 | Écran |
| 4.2 centimes | Confirmé | Remise 33,3 % : FAC-2026-00849 à 7 003,50 ; « Saisir le reste dû (7 004) » refusé à l’écran. Payer 12 003 sur 12 003,50 laisse « 1 FCFA » | Écran |
| 4.3 701 absent | Confirmé, **déjà connu** (`CLAUDE.md`) | Balance : 411, 419, 53, 54 | Écran |
| 4.4 suppression payée | Confirmé | 718 → 717 factures, paiement gardé | API, aucun bouton |
| 4.5 remise devis | Confirmé | 132 525 → 155 000 | API |
| 4.6 livraison oubliée | Confirmé | BL de 62 000 bloqué (400) | API, aucun bouton |
| 4.7 prix libre | **Nuancé** | Vrai, mais la demande d'accord n'apparaît **jamais** au vendeur : le coût lui est caché, l'écran calcule avec 0 | Écran |
| 4.8 mois passé | **Nuancé** | 35 542 500 → 35 452 500, 701 inchangé. La contre-passation du jour est correcte : c'est le rapport qui est faux | Écran |
| 4.9 confidentialité | Confirmé | Dépôt : 8 routes sur 8 en 200 | API |
| 4.10 délai | **Nuancé** | « 45 jours », « 30 jours » → 0 jour ; `net_30` marche (25/12) | Écran |
| 4.11 aucune correction | **Nuancé** | Acompte bloquant : vrai (409 puis 409). Mais un avoir sur facture impayée **existe** (retour → avoir, gérant) | Écran |
| 4.12 à 4.16 | Confirmés | PDF sans date ni échéance, « Total » coupé, annulée sans mention ; 4 refus = 4 trous ; ligne libre 400 | Écran |

**Droits par boutique (testables).** Un vendeur de MAG-1 peut facturer à MAG-2 (201), lire ses factures et PDF (200), encaisser en Wave (201), en espèces si la caisse est ouverte (201), et mettre les espèces d'une facture MAG-2 dans la caisse de MAG-1 (API, `session_caisse_id`). Aucun contrôle côté ventes. L'écran « Affectations » écrit `utilisateur_locations`, la fiche utilisateur `user_location_roles` : après changement, le vendeur a les deux boutiques.

**« Aucun code ne ferme un mois »** : vrai. Aucune écriture dans `periodes_comptables` hors tests, table vide, aucune route.

## 3. Verdicts

- **07 « Fusionner » : maintenu.** Meilleur argument contraire : Odoo et Sage séparent caisse et facture ; un grossiste saisit 40 lignes ; on supprimerait l'écran qui marche au profit de celui que la fiche juge impropre. Il tient pour l'**ordre**, pas pour la cible : ce qui manque au comptoir (remise, crédit, client), la facture l'a déjà, et un petit commerce ne veut qu'une porte. Condition : panier commun d'abord, `NouvelleFacture` supprimée après une liste de parité écrite.
- **10 « Améliorer » : maintenu.** Contre-argument : le mal est un double stock et quatre dialogues, donc « Simplifier », et H à K bâtissent sur du faux. Juste pour l'ordre, mais le grossiste part sans cartons.
- **03 « Améliorer » : changé en « Fusionner ».** Si 07 absorbe la création, B, F, H et I améliorent une page condamnée (`NouvelleFacture.tsx`). La création part dans « Vendre » ; liste, fiche, PDF et annulation s'améliorent.

## 4. Lots : un propriétaire par sujet

| Sujet | Doublons | Propriétaire |
|---|---|---|
| Stock par emplacement | 10-A, 07-C | **10-A** ; 07-C ne garde que l'écran (sinon deux migrations rivales) |
| Prix plancher | 10-C, 07-E, 03-E | **10-C**, règle par rôle, PIN plus tard |
| Coût et CA cachés | 10-C, 03-E | **03-E**, seul |
| FCFA entiers | 03-B, 07-E | **03-B** |
| Anti-doublon | 07-A, 03-D | **07-A**, une clé sur `factures` |
| Séries, garantie | 10-K, 03-I (modèles incompatibles) | **10-K** |
| Service sans stock | 03-I ; 07 renvoie à la fiche 10, **qui n'a pas ce lot** | **03-I** |
| Recherche, accents | 10-F, 07-L | **10-F** |
| Unités, tarifs | 10-H | **10-H** |
| TVA | 10-L, 03-K, 07-K | **03-K**, avec 10-L ; réglage en fiche 25 |
| FNE | 10-L, 03-L, 07-K | **03-L**, séparé de WhatsApp ; `tiers.ncc` double `tiers.nif` |
| Boutique de l'utilisateur | 07-G, 03-F | **Fiche 13** |
| Ticket, PDF | 07-K, 03-G | **Fiche 27** |
| Acompte | 07-B, 03-D | **07-B** avec la fiche 04 |
| Annuler, échanger | 03-D, 03-H, 07-J | **03-D** annule, **07-J** échange |

- **Ordre** : 07-H (priorité 2) attend le PIN (fiche 24, vague 7) par 07-E. 03-C (priorité 1) attend la fiche 22 (vague 9) : décider avant.
- **Trop gros** : 10-A (séparer la reprise et le verrou par trigger), 07-H (panier commun, puis suppression), 03-D (cinq sujets).
- **Réparation fausse** : 10-A range le stock fantôme au magasin principal, alors que les mouvements disent où (dépôt, dans mon essai). Il ne rend pas les pièces effacées ; l'écart avec la somme des mouvements les montre, sauf stock initial (D9).
- **Dépendances oubliées** : 03-A ne limite pas livré ≤ commandé ; 10-B écrit un coût unique partout et aggrave l'oubli n° 2.
- **Invérifiables ici** : 07-K (deux imprimantes), 07-L (Android), 10-J (« une minute »), 07-H (« aucune fonction ne manque », sans liste).
- **Pas au premier mois** : ticket repris sur un autre poste (07-I), compteur d'ouvertures (03-L), remise maximale en plus du plancher (07-E). Vente au poids : 10 dit « premier mois », 07 « plus tard ».

## 5. Oublis

1. **Un devis se livre deux fois, à l'écran.** Confirmer le devis crée un BL complet ; « Nouveau bon de livraison » repropose le même devis, quantités pleines, sans avertir (BL-2026-00008 et 00009). Jusqu'à la facture, par l'API : devis de 5, stock 168 → 158, FAC-2026-00762 et 00763 de 17 500 chacune.
2. **Le coût figé à la vente est celui du dernier emplacement réceptionné.** MAG-1 : 10 à 1 000. Réception de 10 à 3 000 à MAG-2. Vente à MAG-1 : coût **3 000**, marge 500 au lieu de 2 500 (`sync_cmp_to_produit`, `ReceptionService.ts:328`). Les marges multi-sites sont fausses.
3. **Crédit sans limite ni nom.** À l'écran, un caissier laisse une facture impayée au « Client comptoir » (FAC-2026-00822). Par l'API, il crée un client (plafond 0 = illimité) et lui facture 2 975 000 F à crédit.

## 6. Erreurs dans les fiches

- 03 : « aucune affectation dans le banc » ; « l'écran demande l'accord » (pas au vendeur) ; « ni avoir sur une facture impayée ».
- 07 : quantité géante « bloquée par le stock ».
- 10 : D8, « l'historique ne dit jamais qui » sans citer le journal d'audit ; D12 sans sa condition.
- 10 (4 000 mots) et 07 (4 203) dépassent la limite de 3 500.

## Non vérifié

Arrondi de la fiche (D5) à l’écran ; service à stock 0 ; gestes et touches Tab ; ticket 58 mm ; vraie douchette ; plus de 560 factures ; colonne « gêne ».
