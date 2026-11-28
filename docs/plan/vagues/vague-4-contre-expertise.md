# Vague 4 · Contre-expertise (fiches 16, 17, 18)

26/11/2026, `nolyx_audit_4`, scripts neufs (`%TEMP%\nolyx-agents\vague4-4\`), données créées par l'API : contacts 17 à 19, produits « V4 … ». La caisse du banc, ouverte depuis 27 h, accepte encore les mouvements ; gardée, aucun test n'en exigeait une neuve.

## 1. Résultat

39 lignes, 4 doublons : **35 défauts, 30 confirmés, 5 nuancés, 0 faux, 0 non rejoué**. « Lu » = vu dans le code.

**Une cause, comptée une fois : la facture fantôme** (`CommandeService.ts:233-246`, 601/401 par trigger). Elle explique 16-D1 à D4, D7, G1, 18-D1, D2, D8, la moitié de 18-D5 et l'oubli 1. Doublons : 18-D1 (16-D1/D4), 18-D2 (16-D3/D7), 16-D6 (17-D5), 16-B1 (17-D12).

## 2. Défauts rejoués

### Fiche 16 (8 confirmés)

| N° | Statut | Preuve | Atteint |
|---|---|---|---|
| D1 dette à la commande | Confirmé | 10 SSD : facture FF-6 de 650 000, 601 D / 401 C, fiche contact 0 → **650 000** | Écran |
| D2 modifier | Confirmé | Facture 1 814 000 → 254 000, écritures restées à 1 814 000 | Écran |
| D3 annuler | Confirmé | Facture « en attente » après annulation ; 1 000 payés dessus (200) | Écran |
| D4 deux dettes | Confirmé | 5 reçus, vraie facture 325 000 : dette **975 000** ; « facturé 15 > reçu 5 » | Écran |
| D5 statuts | Confirmé | Livrée → annulée → en attente → modifiée : 200, 200, 200 | API |
| D7 supprimer | Confirmé | Facture effacée, 601/401 de 14 500 restent | API, admin |
| D8 recommander | Confirmé | 19 cartouches commandées : toujours proposées | Écran |
| B2 destination | Confirmé (lu) | Pas d'emplacement ; réception au magasin principal (`ReceptionService.ts:148`) | Écran |

### Fiche 17 (10 confirmés, 3 nuancés)

| N° | Statut | Preuve | Atteint |
|---|---|---|---|
| D1 course | Confirmé | 8 commandes × 4 envois : **28 réceptions au lieu de 8, 140 au lieu de 40** | API (point 2) |
| D2 partielle × 2 | **Nuancé** | 8 puis 8 sur 20 : 201, 201, stock 16. Une seconde livraison partielle est légitime : sans clé de formulaire, rien ne les distingue | Écran, deux personnes |
| D3 article offert | **Nuancé** | Point 3 | API (écart), écran (défaut) |
| D4 annuler | Confirmé | 10 à 1 000 + 10 à 3 000, suppression : CMP **2 000**, valeur 20 000 ; commande remise « expédiée » | API, admin |
| D5 commande close | **Nuancé** | Annulée : 201, stock 5 → 10. En attente : 201, « livrée ». 999999 : 422 ; 201 seulement **à quantités nulles** (REC-76, aucun stock) | API |
| D6 orpheline | Confirmé | Commande supprimée (200) ; REC-8 pointe la commande 13 disparue | API, admin |
| D7 coût de vente | Confirmé (= 10-B) | MAG-1 à 1 000, dépôt à 3 000 ; vente MAG-1 : coût figé **3 000** | Écran |
| D8 stock fantôme | Confirmé (= 10-A) | « Ajuster » +10 au dépôt : aucune ligne d'emplacement ; réception de 20 : **20** | Écran |
| D9 facture et coût | Confirmé (lu) | `FactureFournisseurService.ts` : 0 occurrence de `cmp` ou `stock_par_location` | – |
| D10 à D12 | Confirmés (lus) | `receptionService.getAll/getById` jamais appelés ; 422 `OVER_RECEIPT` ; `commande_id` obligatoire | Écran |
| D13 boutique | Confirmé | Dépôt → MAG-2 : 201 | API |

### Fiche 18 (12 confirmés, 2 nuancés)

| N° | Statut | Preuve | Atteint |
|---|---|---|---|
| D3 espèces | Confirmé | Point 6 | Écran |
| D4 simultanés | **Nuancé** | 5 essais sur 6 surpayés (180 000), affiché « payé 60 000 » ; fenêtre < 5 ms | API |
| D5 acompte | **Nuancé** | Point 4 | Écran |
| D6 balance | Confirmé | Point 5 | Écran |
| D7 surfacture | Confirmé | 8 × 3 000 pour 5 × 1 500 reçus : 201, CMP 1 500 inchangé | Écran |
| D8 bloquer | Confirmé | Facture exacte refusée : 422 « facturée (10) > reçue (5) » | Écran, admin |
| D9 autre fournisseur | Confirmé | Contact 18 sur la réception du 17 : `commande_id` 8 (du 17) | Écran |
| D10 application | Confirmé | Caissier : 201 ; registre : « acompte » **et** « paiement » de 50 000 au débit | API |
| D11 lecture | Confirmé | Caissier, vendeur, dépôt, lecteur : 200, totaux visibles | API |
| B1 à B3 | Confirmés (lus) | Aucune route annuler/modifier ; caissier 403 ; pas de type `retour_fournisseur` | Écran |
| B4 relevé | Confirmé (lu) | « Client : » en dur (`PDFService.ts:637`) ; solde non rejoué | Écran |
| B5 saisie | Confirmé | 2,5 → 500 ; doublon → 500 avec le nom de la contrainte ; « abc » → 500 | API |

## 3. Points précis

**1. Facture à la commande : héritée, jamais décidée.** Présente dès le premier commit (`fe2544e`, mai), déplacée en juillet (`61b9c1b`) ; la migration 082 la cite comme code existant ; ni `CLAUDE.md` ni les anciens audits n'en parlent. Effets mesurés : fiche contact 650 000 avant livraison, puis 975 000 pour 325 000 réels ; liste « à payer » comprise ; balance aveugle (point 5), journal doublé ; « bloquer » refuse toute facture juste ; compensation (oubli 1).

**2. Simultanéité.** Deux envois décalés de 0 ms : 2 doublons sur 3 ; de 5 à 300 ms : 0. Une réception dure 7 ms. Deux postes dans cette fenêtre : pratiquement jamais ; le risque vient d'un renvoi réseau ou d'un script. Paiements : même mesure. Le risque réel à l'écran est D2, sans fenêtre : deux magasiniers saisissent la même livraison partielle. D1 et 18-D4 passent « API ».

**3. Coût de l'article offert.** Le gérant envoie le prix de chaque ligne (`Receptions.tsx:296`) ; un 0 devient « inconnu » (`ReceptionService.ts:302`) et `costedStockIn` reprend le CMP. Le dépôt reçoit la moyenne pondérée du produit (`:159-174`), 21 818,18, positive. L'écart exige deux lignes du même produit, refusées à l'écran (`CommandeProductPicker.tsx:665`) : API seulement. Le vrai défaut touche tous les rôles : ligne unique à 0 reçue par le dépôt sur 10 à 1 000 : CMP **1 000**, valeur 11 000, au lieu de 909,09 et 10 000.

**4. Acompte sur la plus vieille facture : voulu.** `CLAUDE.md` (passe d'octobre) et la migration 094 : l'argent sans facture cible part « plus ancienne d'abord » ; l'acompte n'a aucun champ cible (`recordAcompteSchema`). Mesuré : dette 969 000 → 769 000, juste au total, posée sur la fantôme. Un acompte fournisseur paie presque toujours une commande précise (import, camion prépayé), et le fournisseur l'impute là : la règle ne convient pas. Question 13, comme 04-C : « proposé, jamais automatique » des deux côtés.

**5. Balance : même cause que le 701.** Les deux triggers (`ci-baseline.sql:290-318`, `:322-347`) écrivent `compte_id` sans `compte_numero` ; la balance joint sur `compte_numero` (`GeneralLedgerService.ts:160`). Mesuré : 398 écritures de vente sur 398, 14 d'achat sur 14 sans numéro ; balance : 401 débit 200 000 (l'acompte), 53, 411 ; ni 601 ni 701. Propriétaire **03-C** (une migration, deux triggers, reprise) ; fiche 22 relit les lecteurs ; 18-D garde registre et relevé.

**6. Espèces fournisseur : reconfirmé.** 6 000 : mouvements de caisse 1 → 1, écritures 432 → 432, `session_caisse_id` vide ; l'acompte, lui, sort (401 D / 53 C). 18-B règle les espèces en appelant `enregistrerMouvement`, mais dépend de 08-A (verrou), 08-B (sortie bornée au tiroir) et 08-D (autres modes, renvoyés à la fiche 18). 09-F ne donne que la porte.

## 4. Verdicts

- **16 « Simplifier » : maintenu.** Contre-argument : la petite boutique ne passe pas de commande écrite, il faut cacher le module. Il tient pour l'affichage (caché par défaut hors grossiste et informatique, fiche 25), pas pour le module : importateur et grossiste versent des acomptes sur commande.
- **17 « Améliorer » : maintenu.** Contre-argument : fusionner réception, facture et paiement. Il tient pour la boutique (17-D), pas pour le dépôt qui reçoit sans voir de prix.
- **18 « Simplifier » : maintenu.** Contre-argument : la plupart des lots ajoutent. Il ne tient pas : fantôme, imputation automatique, blocage à trois voies et registre auxiliaire partent.
- **Un seul « Achat » ?** Oui pour le **parcours**, non pour la **donnée** : un écran (fournisseur, articles, coût, payé ou dû, 17-D) écrit réception, facture et paiement en une transaction ; le grossiste garde les trois pièces séparées. Question 27.

## 5. Lots

- **Découpés** : 18-H et 17-H. **Absorbés** : 18-A (16-A), 16-E (18-E), 18-G (17-D), 18-J (03-E, 18-E), 18-K (03-K, 03-L, 08-J).
- **Contradiction** : 16-A annule les fantômes, 18-A les supprime : on annule avec contre-passation, sans suppression (comme 18-C). Dépendance circulaire 16-A ↔ 18-A retirée.
- **Dépendances oubliées** : 16-A traite les fantômes réglés par compensation ou acompte (oubli 1, triggers 095) ; 18-B dépend de 07-A, 08-A, 08-B ; 17-C de 18-C et 16-B ; 17-D de 18-B, 09-E, 09-F, fiche 13 ; 18-E de 04-C et de la question 13.
- **Invérifiables** : « sans clavier » (17-G) → « 43 bips = 43 » ; « sans cahier » (17-I) → liste attendue sur deux arrivages ; « aucune hausse ne passe » (17-J) → « hausse > 5 % listée ».
- **Pas au premier mois** : 16-H, 17-G, 17-I, 17-J ; 16-F ensuite.

| Sujet | Propriétaire | Cité par |
|---|---|---|
| Commande qui crée une facture | **16-A** | 18-A |
| États de commande | **16-B** ; garde de réception **17-A** | 17-C |
| Commande facultative, réception sans commande, achat comptant | **17-D** | 16, 18-G, 09-E |
| Acompte fournisseur | **18-E** (question 13, comme 04-C) | 16-E |
| Paiement fournisseur qui sort l'argent | **18-B** | 08-A, 08-B (borne), 08-D (modes), 09-F (porte) |
| Anti-doublon | **07-A** (mécanisme) | 17-A, 18-B, chacun avec son verrou |
| Annuler commande / réception / facture | **16-B / 17-C / 18-C** | 08-K |
| Refus à l'arrivée | **17-F** | – |
| Défectueux | **05-C** | 18-H1 |
| Retour et avoir fournisseur | **18-H1, 18-H2** | 17-F |
| Coût d'entrée (0, rôles) | **17-B** | – |
| Coût par emplacement, correction | **10-B** | fiche 15 |
| Frais d'approche, écart de prix de la facture | **17-H1, 17-H2** | 18-F (affiche), fiche 15 |
| Prix d'achat proposé / prix de vente proposé | **16-H / 17-J** (après 10-C) | – |
| WhatsApp | **03-L étape 1** | 16-G (bouton, note fournisseur) |
| TVA déductible, FNE fournisseur | **03-K, 03-L** | 18-K |
| Achats et ventes dans la balance | **03-C** | 18-D, fiche 22 |
| Qui lit les achats | **03-E** | 18-J, 16-G6, 17 |

**Ordre d'exécution** (nouveaux en gras)

1. 08-G
2. 10-E
3. 08-A
4. 04-B
5. 07-A
6. 09-A
7. 10-A reprise
8. 10-A verrou
9. 07-C
10. 10-B
11. 03-B
12. 03-A
13. 02-B
14. 02-A
15. 02-C
16. 01-A
17. 05-A étape 1
18. 05-A étape 2
19. 04-A
20. 05-B
21. 05-D
22. 05-C
23. **16-A commande sans dette**
24. **16-B états figés**
25. **17-A réception unique**
26. **17-B coût zéro gratuit**
27. 04-J
28. 08-D
29. 07-F
30. 04-E
31. 08-B
32. **18-B payer sort l'argent**
33. 08-C étape 1
34. 08-K
35. **18-C annuler facture, paiement**
36. **17-E voir les réceptions**
37. **17-C annuler une réception**
38. 04-D
39. 09-C
40. 03-D
41. 02-D
42. 10-C
43. 03-E
44. 08-E
45. 09-B
46. 07-D
47. 09-D
48. 01-E
49. 04-C étape 1
50. 04-C étapes 2-3
51. **18-E acompte choisi**
52. **18-D une seule dette**
53. **18-F facture depuis la réception**
54. **16-C à racheter**
55. 08-F
56. 10-D
57. 07-H étape 1
58. 07-H étape 2
59. 02-E
60. 05-E étapes 1-2
61. 05-E étape 3
62. 05-F
63. 09-E
64. 09-F
65. **17-D achat direct**
66. 09-H
67. 07-B
68. 01-B
69. 08-H
70. 08-I étape 1
71. 10-F
72. 03-F
73. 03-G
74. 01-C
75. 02-F
76. 02-G
77. **16-D livrer à**
78. **17-F casse et refus**
79. **18-I à payer cette semaine**
80. 09-I
81. 10-H
82. **16-F selon les ventes**
83. **17-H1 frais à l'arrivée**
84. 04-F
85. 04-G
86. 04-I
87. 07-J
88. 07-I
89. 10-G
90. 10-I
91. 10-J
92. 10-K
93. 03-I
94. **18-H1 retour fournisseur**
95. **18-H2 avoir fournisseur**
96. 02-H
97. 03-J
98. 03-C, achats compris
99. **17-H2 coût corrigé après coup**
100. 03-K
101. 03-L
102. **16-G envoyer la commande**
103. 01-F
104. 04-H
105. 08-J
106. 08-L
107. 08-C étape 2
108. 07-L
109. 08-I étape 2
110. **16-H dernier prix fournisseur**
111. **17-J prix de vente proposé**
112. **17-G réception au scan**
113. **17-I péremption**
114. 01-G
115. 09-J

## 6. Oublis

1. **Une commande non livrée efface la dette d'un client.** Contact 13 (client et fournisseur), commande de 50 000 : dette fournisseur 0 → 50 000 ; compensation de 50 000 (201) : la fantôme passe « payée » ; commande annulée : elle reste payée, la créance client est partie, suppression refusée (400). Et la fiche client baisse de **100 000** (2 399 310 → 2 299 310 : paiement « virement » **et** acompte « utilisé », 50 000 chacun) : pour 04-J. Écran, gérant.
2. **La trésorerie prévisionnelle ignore les factures fournisseur** : elle lit les commandes non livrées par date prévue (`ComptabiliteService.ts:165-179`). Mesuré : 35 factures ouvertes (2 191 786, mes essais), aucune dans `/comptabilite/tresorerie`. Pour la fiche 21.

## 7. Erreurs dans les fiches

- **17** : D3 « seulement si le gérant reçoit » (point 3) ; D5 « 999999 créée » sans « quantités nulles » ; D1 « écran si deux postes » (point 2).
- **18** : D4 « 6 sur 6 » (5 ici, API) ; D5 est une décision écrite ; § 3 « compensation juste » (oubli 1) ; 18-A supprime ce que 18-C interdit.
- **16** : B1, « Réceptions » est un module à part (`modules.ts:99-103`) : la page reste, vide.
- **CLAUDE.md** : dernière migration 113, pas 111.

## Questions nouvelles

27. Un seul écran « Achat » pour la boutique, commande cachée hors grossiste et informatique ?
28. Acompte fournisseur : rattaché à une commande et proposé à la facture, comme pour le client (question 13) ?

## Non vérifié

PDF ouverts ; période close ; douchette ; deux postes réels (mesure par l'API) ; aucun commerçant interrogé.
