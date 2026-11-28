# Vague 5 · Contre-expertise (fiches 12, 11, 15)

27/11/2026, `nolyx_audit_4`, scripts neufs (`%TEMP%\nolyx-agents\vague5-4\`), données créées par l'API (produits « V54 » 24 à 32, contacts 14 et 15, inventaires 1 à 3). Étiquettes : rendu et décodage refaits (motifs JsBarcode, arrondi au point, encre simulée, ZXing). Caisse du banc (ouverte le 25/11, environ 46 h) inutilisée : ventes à crédit.

## 1. Résultat

21 défauts rejoués : **17 confirmés, 4 nuancés, 0 faux, 0 non rejoué**. Doublons : 12-D4 (= 10-A), 15-D5 (= 10-B, 17-D7) ; 15-D4 a pour cause 17-B. « Lu » = vu dans le code.

## 2. Défauts rejoués

### Fiche 12 (7 confirmés, 2 nuancés)

| N° | Statut | Preuve | Atteint |
|---|---|---|---|
| D1 double correction | Confirmé | Huile : système 17, compté 14, « Ajuster » −3 → 14, validé → **11**, réel 14 | Écran |
| D2 aperçu | **Nuancé** | Point 2 | Écran |
| D3 écrasement | Confirmé | Câble : vendeur 5, gérant 3 → **3** (saisie `fixer`, `InventairePhysiqueDetail.tsx:372`) | Écran, deux téléphones |
| D4 fantôme | **Nuancé** | +10 au dépôt sans ligne d'emplacement : absent des **deux** feuilles. Ajouté à la main, dépôt 10, boutique 3 → stock **3** au lieu de 13 | Écran |
| D5 dépôt | Confirmé | Compte à MAG-1 (200), ajuste MAG-1 (200), « vente » −1 (201). Écran : liste et comptage, pas « Ajuster » | API ; écran pour compter |
| D6 « Fixer à » | Confirmé (lu) | Écart calculé dans le navigateur (`Inventaire.tsx:1279-1287`) | Écran, rare |
| D7 pertes | Confirmé | `compte_par` = dernier compteur ; `mouvements_stock` sans utilisateur ni coût ; 0 « ajustement » dans `ReportingService.ts` | – |
| D8 CSV | Confirmé | Point 3 | Écran |
| D9 fin d'année | Confirmé (lu) | Seule action : « Exporter en CSV » | – |

### Fiche 11 (3 confirmés, 1 nuancé)

| N° | Statut | Preuve |
|---|---|---|
| D1 lisible à 203 | **Nuancé** | Point 6 |
| D2 arrondi | Confirmé | Écart de barre à 203 ppp : 0,41 module (Code 128 de 15 caractères), 0,47 (`6001234500017`), 0,37 (EAN-13 en 40 × 25) |
| D3 jeu B | Confirmé | `6001234500017` : 178 modules contre 123 ; refusé en 40 × 25, où le jeu optimal donne 2,07 points, lu partout |
| D4 papier | Confirmé (lu) | 4 formats en dur ; 3 × 70 = 210 mm, 8 × 37,125 = 297 : sans marge |

### Fiche 15 (7 confirmés, 1 nuancé)

| N° | Statut | Preuve | Atteint |
|---|---|---|---|
| D1 deux valeurs | **Nuancé** | Point 4 | Écran |
| D2 bon facturé | Confirmé | Point 5 | Écran |
| D3 pertes | Confirmé | Perte −2 SSD (4 492,76) : coût des ventes 19 554 266,67 avant et après | Écran |
| D4 coût zéro | Confirmé | 5 pièces à 0 : valeur +0, « marge potentielle » +15 000 | API |
| D5 autre site | Confirmé (= 10-B) | Vente à MAG-2, pièces à 1 000 : coût figé **1 666,67** | Écran |
| B1 date | Confirmé | `?date=2026-01-01` : même valeur | – |
| B2 site, produit | Confirmé (lu) | `getStockValuation()` sans paramètre | – |
| B3 comptabilité | Confirmé | Base neuve : 14 comptes, aucun en 3 ni 603 | – |

## 3. Points précis

**1. « Ajuster » pendant un inventaire : règle voulue, geste à fermer.** L'écart `compté − stock au moment du comptage` est appliqué en delta (`CLAUDE.md`). C'est juste si la casse suit le comptage (14 bonnes comptées, 3 cassées ensuite : 11 est vrai), faux si les 3 manquaient déjà. Le système ne peut pas savoir : on bloque le geste (12-A), on garde la règle. Ni `Inventaire.tsx` ni `addStockMovement` ne lisent les inventaires. Même mécanisme : le transfert (oubli 1).

**2. Aperçu de « Les sortir du stock ».** La fenêtre affiche `valeur_ecart` (`InventairePhysiqueDetail.tsx:207-209`), somme de `(compté − théorique) × cmp` (`InventaireService.ts:83`) : une ligne non comptée vaut NULL et sort de la somme. Le choix ne recalcule rien ; `valider()` met ces lignes à 0 après le clic (`:515-526`). Rejoué : affiché −16 300, sorti −66 300. Nuance : le texte sous le choix dit « tout son stock est sorti » et le chiffre est juste pour ce qu'il nomme. Il manque le montant. 12-B est juste.

**3. CSV : protection voulue, mal ciblée.** Voulue (`utils/csv.ts:5-12`) et nécessaire : l'Excel 365 de la machine (anglais) exécute `=1+1` et `-2+3` même entre guillemets. Mais elle touche les nombres : Excel affiche `'-72000`, apostrophe visible, en texte, et la somme oublie la perte (lignes −72 000 et `'-72000` : somme −72 000). Correctif : ne jamais préfixer une valeur numérique, garder le préfixe pour le texte. Excel français : supposé ; LibreOffice absent : non vérifié.

**4. Deux valeurs : la page a raison.** Rapports lit `produits.stock × produits.prix_achat` (`ReportingService.ts:266`) ; ce prix suit le dernier site dont le CMP a changé (`trg_sync_cmp`, réception **ou transfert**) et toute saisie à la main. Les lecteurs cités par `CLAUDE.md` sont justes (`:560`, et `ComptabiliteService` n'en lit plus) ; il oublie la tuile. **Plusieurs sites** : SSD, page 30 000,05, Rapports 33 333,40 ; banc, 5 538,24 d'écart sur 5 produits. **Un seul site** : égal, sauf prix d'achat modifié à la main (Rapports +5 000, page 0) et stock fantôme (2 700 contre 0). Nuance : la fiche dit « dernier site réceptionné ».

**5. Bon livré, facturé plus tard.** Ligne du bon : coût 0,00. Conversion : `COALESCE(NULLIF(dl.prix_achat_unitaire, 0), p.prix_achat)` (`DocumentConversion.ts:63`) : **2 246,38** au lieu de 1 666,67. « Ouvert (4) » de `CLAUDE.md` est périmé (FAC-2026-00203 a échéance et créateur, coût non nul) et remplacé par ce défaut. Propriétaire **15-B** : le bon fige le coût à sa sortie de stock, par la fonction de 10-B ; 02-A, un coût par livraison partielle ; 03-A ne l'écrase pas.

**6. Étiquettes à 203 ppp.** Un point = 0,125 mm (300 ppp : 0,085 ; 600 : 0,042). Seuil de l'ERP, 0,19 mm = 1,52 point. Code 128 de 15 caractères en 50 × 30 : 0,214 mm = 1,71 point à 203, 2,52 à 300, 5,05 à 600. Mon décodage : **lu** sur image propre à 203 (fiche : non lu), **non lu dès 0,25 point d'encre** ; à 1,9 point et plus, lu avec encre ; EAN-13 internes (3,21 et 2,53 points) lus partout. D1 est borné aux codes longs saisis à la main ; le code interne passe. Seuil sûr : 2 points. Thermiques 203 ppp courantes : supposé, non recherché.

**7. Quantité d'étiquettes : défaut des étiquettes.** Chemise M : 97 = dépôt 80 + MAG-2 16 + MAG-1 1, trois vraies lignes, aucun fantôme. La page lit `produits.stock` (`Etiquettes.tsx:74, 163`), total des sites. 10-A n'y change rien : **11-C**. Un seul site : juste.

## 4. Verdicts

- **12 « Améliorer » : maintenu.** Contre-argument : supprimer « Ajuster » au profit de l'inventaire. Il tient à moitié : « Fixer à » est un comptage et passe par un inventaire d'un produit (D6 disparaît) ; la casse garde « Déclarer une perte » (retrait, motif). 12-D ainsi.
- **11 « Améliorer » : maintenu, réduit.** Contre-argument : cacher la page hors habillement. Il tient pour le grossiste, pas pour le vrac ni les accessoires (fiche 25). 11-A se réduit.
- **15 « Améliorer » : maintenu pour le calcul ; écran fusionné.** Contre-argument : fusionner la page dans Rapports. Il tient : deux écrans, deux valeurs. Onglet « Stock » des Rapports (site, catégorie, produit, pertes, stock qui dort) ; le moteur CMP reste (15-F).

## 5. Propriétaires et lots

| Sujet | Propriétaire | Cité par |
|---|---|---|
| Ajustement manuel | **12-D** (droits, motif, plus de « vente ») ; pendant un inventaire **12-A** ; stock hors emplacement **10-A verrou** | question 11 |
| Une seule valeur | **15-A** | fiche 23 |
| Coût figé à la livraison | **15-B** | 02-A, 03-A, 10-B |
| Coût sur chaque mouvement | **15-C** (coût, valeur, CMP après, utilisateur) | 10-B, 12-D (motif), 17-H2 |
| Pertes du mois, dans la marge | **15-D** | 12-F (rapport absorbé), fiche 23 |
| État au 31 décembre | **15-E** | 12-G absorbé |
| Une seule marge | **15-G** | 03-E, fiche 23 |
| Stock qui dort | **15-H** | fiche 23 |
| Variation de stock | **Fiche 22** (03-C, question 10) | 15-I retiré, 15-E chiffre |
| Export CSV | **12-F**, réduit au CSV | fiche 27 |
| Scan et douchette | champ « scanner ou chercher » **10-F** | 12-E, 17-G ; 11-A imprime |
| Code du fabricant | **11-B** | plusieurs codes : 10-H |
| Prix changés à réimprimer | **11-H** | 17-J, 10-C |
| Étiquettes par site | **11-C** | 10-A |
| Transfert pendant un inventaire | **12-A** | fiche 13 |
| Prix d'achat saisi à la main | **10-B** | 15-A |

- **Absorbés** : 12-G (15-E), 15-I (fiche 22), rapport de 12-F (15-D). **Découpés** : 12-D (étape 2 : comptage limité aux emplacements, après fiche 13) ; 11-F (étape 1 : taille jamais coupée, sans 10-J).
- **Chevauchement** : 12-D et 15-C ajoutent `utilisateur_id` et `cout_unitaire` à `mouvements_stock` : 15-C seul ; 12-D garde `motif_code`.
- **Dépendances** : 11-C dépend de 17-E, pas de 17-G ; 11-G pas de 11-D ; 15-D de 12-D ; 12-E de 10-F.
- **Invérifiables** : 12-B « la capture affiche 25 366 684 » → « aperçu = résultat, au centime » ; 11-A « 100 % décodés » → « décodés à 203 ppp avec 0,25 point d'encre » ; 12-E « 300 produits à deux » → « produit sans code trouvé en 2 lettres ».
- **Trop gros** : 11-A sans choix d'imprimante (module entier de 0,125 mm, 2 au moins) ; 11-D : 40 × 30, A4 de 65 et calage d'abord.
- **Pas au premier mois** : 11-H, 15-H, 11-F étape 2, éditeur de 11-D. 15-E : avant le premier 31 décembre d'un client.

## 6. Ordre d'exécution (nouveaux en gras)

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
11. **12-A double correction**
12. **15-A une valeur**
13. **12-B aperçu juste**
14. **15-C coût des mouvements**
15. **12-C compter à plusieurs**
16. **12-D étape 1**
17. 03-B
18. 03-A
19. 02-B
20. 02-A
21. **15-B coût du bon**
22. 02-C
23. 01-A
24. 05-A étape 1
25. 05-A étape 2
26. 04-A
27. 05-B
28. 05-D
29. **15-D pertes**
30. **12-F CSV**
31. 05-C
32. 16-A
33. 16-B
34. 17-A
35. 17-B
36. 04-J
37. 08-D
38. 07-F
39. 04-E
40. 08-B
41. 18-B
42. 08-C étape 1
43. 08-K
44. 18-C
45. 17-E
46. 17-C
47. 04-D
48. 09-C
49. 03-D
50. 02-D
51. 10-C
52. 03-E
53. **15-G une marge**
54. **15-F onglet Stock**
55. 08-E
56. 09-B
57. 07-D
58. 09-D
59. 01-E
60. 04-C étape 1
61. 04-C étapes 2-3
62. 18-E
63. 18-D
64. 18-F
65. 16-C
66. 08-F
67. 10-D
68. 07-H étape 1
69. 07-H étape 2
70. 02-E
71. 05-E étapes 1-2
72. 05-E étape 3
73. 05-F
74. 09-E
75. 09-F
76. 17-D
77. 09-H
78. 07-B
79. 01-B
80. 08-H
81. 08-I étape 1
82. 10-F
83. **12-E téléphone et papier**
84. **11-B code fabricant**
85. **11-A code lisible**
86. **11-E paquets**
87. **11-D papier**
88. **11-F étape 1**
89. 03-F
90. **11-C quoi et combien**
91. **12-D étape 2**
92. 03-G
93. 01-C
94. 02-F
95. 02-G
96. 16-D
97. 17-F
98. 18-I
99. 09-I
100. 10-H
101. 16-F
102. **15-H stock qui dort**
103. 17-H1
104. 04-F
105. 04-G
106. 04-I
107. 07-J
108. 07-I
109. 10-G
110. 10-I
111. **11-G rayon**
112. 10-J
113. **11-F étape 2**
114. 10-K
115. 03-I
116. 18-H1
117. 18-H2
118. 02-H
119. 03-J
120. **15-E 31 décembre**
121. 03-C
122. 17-H2
123. 03-K
124. 03-L
125. 16-G
126. 01-F
127. 04-H
128. 08-J
129. 08-L
130. 08-C étape 2
131. 07-L
132. 08-I étape 2
133. 16-H
134. 17-J
135. **11-H prix changés**
136. 17-G
137. 17-I
138. 01-G
139. 09-J

## 7. Oublis

1. **Transfert en préparation pendant un inventaire : stock retiré deux fois.** Sucre au dépôt 30 ; transfert de 5 vers MAG-1, marchandise partie ; compté 25, validé ; « Terminer » : dépôt **20**, MAG-1 5. Réel 25 et 5 : 5 unités perdues. Le stock ne bouge qu'à « Terminer » (`StockTransferService.ts:310`). Écran. Pour 12-A : signaler les transferts en préparation au comptage et à la validation ; état « expédié » : fiche 13.
2. **Un prix d'achat modifié à la main change la marge, pas la valeur.** Un seul site : clavier reçu à 1 000, prix d'achat saisi 1 500 : CMP 1 000, page inchangée, Rapports +5 000, vente suivante figée à **1 500** (`FactureService.ts:375, 394`). Écran. Pour 10-B : coût de vente au CMP du site, coût moyen en lecture seule sur la fiche produit (question 39).

## 8. Erreurs dans les fiches

- **12** : D2 « chiffre faux » (partiel, averti) ; D4 « attendu 10 » (le fantôme n'est sur aucune feuille) ; marchandise partie avant le comptage non testée (oubli 1).
- **11** : D1 « non décodé à 203 » (lu sur image propre) ; « blocage » pour les seuls codes longs saisis à la main.
- **15** : D1 « dernier site réceptionné » : dernier CMP modifié, transfert compris (SSD 2 246,38 → **1 623,19** après un transfert vers MAG-2). Même formule dans `01-SUIVI.md` et 17-D7.
- **CLAUDE.md** : « ouvert (4) » périmé ; « lecteurs unifiés » faux pour la tuile de Rapports.
- **Consigne** : la caisse du banc avait environ 46 h.

## Questions nouvelles

36. « Ajuster » : garder seulement « Déclarer une perte », toute correction de quantité passant par un inventaire d'un produit ?
37. Transfert : la marchandise part-elle avant « Terminer » ? Faut-il un état « expédié » ?
38. La page Valorisation devient-elle l'onglet « Stock » des Rapports ?
39. Prix d'achat saisi à la main : interdit après la première réception, ou appliqué au coût moyen ?
40. Étiquettes visibles par défaut pour habillement, alimentaire boutique et informatique, cachées chez le grossiste ?
41. Export CSV : point-virgule et virgule décimale par défaut ?

## Non vérifié

Excel français, LibreOffice ; douchette, thermique ; deux vrais téléphones ; période close ; dépôt à 1440 ; aucun commerçant.
