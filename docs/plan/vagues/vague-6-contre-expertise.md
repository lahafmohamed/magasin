# Vague 6 · Contre-expertise (fiches 13, 14, 06)

27/11/2026, `nolyx_audit_4`, scripts neufs (`%TEMP%\nolyx-agents\vague6-4\`), données créées par l'API : vendeur `v6yop` (fiche utilisateur, MAG-2 seul), TRF-1 à 45, DEM-1 à 3, FAC-202 à 213, contacts 14 à 16. Caisse du banc clôturée sans écart (60 000), sessions 3 (MAG-1) et 4 (MAG-2) ouvertes. DEP-1 fermé en fin d'essai (D4).

## 1. Résultat

26 défauts rejoués : **23 confirmés, 3 nuancés, 0 faux, 0 non rejoué**. « Lu » = vu dans le code.

## 2. Défauts rejoués

### Fiche 13 (10 confirmés, 1 nuancé)

| N° | Statut | Preuve | Atteint |
|---|---|---|---|
| D1 double exécution | Confirmé | Point 1 | API |
| D2 mauvais tiroir | Confirmé, preuve refaite | Point 2 | Écran |
| D3 nom | Confirmé | Point 3 | API |
| D4 site fermé | Confirmé | DEP-1 vidé, TRF-44 en route, fermé 200, exécuté 200 : 5 souris dans un site inactif ; `PUT actif:true` 200 sans effet | API (pas de bouton « Fermer ») |
| D5 départ avant | Confirmé | Sucre dépôt 80, TRF-36 de 5 créé, inventaire compté 75 validé, « Exécuter » : **70**, réel 75 | Écran |
| D6 dépôt partout | Confirmé | `depot` (DEP-1 seul) crée et exécute TRF-1 MAG-1 → MAG-2 | Écran |
| B1 création | Confirmé | `POST /stock-locations` : 500 | Écran |
| B2 affectations | **Nuancé** | Deux tables lues (`CaisseMagasinService.ts:179-199, 740-749`) ; mais la fiche utilisateur écrit `est_defaut` sur le premier site (`AdminUserService.ts:69-74`) ; personne ne le lit pour vendre | Écran |
| B3 modifier | Confirmé | `PUT {location_type, actif}` : 200, rien ne change | API |
| B4 réception | Confirmé | Vendeur, caissier : `complete` 403 | Écran |
| B5 tout ou rien | Confirmé (lu) | 409 dès qu'une ligne manque (`StockTransferService.ts:264-267`) | Écran |

### Fiche 14 (4 confirmés, 1 nuancé)

| N° | Statut | Preuve |
|---|---|---|
| D1 stock trop tôt | Confirmé | DEM-1, riz 10 : boutique 368 → **378** au clic du dépôt ; clôture avec 9 reçus : 200, toujours 378 |
| D2 bloquée | **Nuancé** | Point 5 |
| D3 rien ne se défait | Confirmé | Annuler TRA-37 : 400 ; DEM-1 clôturée (admin) : 400 |
| D4 autre boutique | Confirmé | Vendeur MAG-1 : DEM-3 pour MAG-2 exécutée, clôture **403** |
| D6 sans dépôt | Confirmé (lu) | Aucun profil ne cache le module ; dépôt exigé (`DemandeService.ts:285-289`) |

### Fiche 06 (9 confirmés, 1 nuancé)

| N° | Statut | Preuve |
|---|---|---|
| D1 crédit illimité | Confirmé | Client créé par le caissier : plafond 0 ; FAC-209, **1 190 000** à crédit, 201 |
| D2 Client comptoir | Confirmé | Point 7 |
| D3 trois dettes | Confirmé | Point 8 |
| D4 acompte ignoré | Confirmé | Plafond 100 000, dû 93 000, acompte 50 000 laissé ; achat 46 500 : 422 « Encours actuel: 93000.00 » |
| D5 couper le crédit | Confirmé (lu) | Aucune colonne d'état bloqué |
| D6 échéance | Confirmé (lu) | Tranches sur `date_facture` (`ReportingService.ts:84-96`) |
| D7 promesse | Confirmé (lu) | Aucun appel front à `/crm/rappels` |
| D8 refus surprise | Confirmé | Message brut « Limite: 100000.00 » |
| D9 WhatsApp | Confirmé (lu) | Canal noté seulement (`Relances.tsx:36`) |
| D10 perte | **Nuancé** | Facture réglée en partie : annulation 409 ; non réglée : articles remis en stock, **décision documentée** (`CLAUDE.md`). Le défaut est l'absence de geste « perte » |

## 3. Points précis

**1. Fiche 13 D1 : API seulement.** Quatre « Exécuter » simultanés, quatre essais : **3, 2, 4 et 4 sorties** pour 1 demandé. Une exécution dure 10 ms. Décalage de 0 à 3 ms : 11 doubles sur 12 ; de 5 à 100 ms : 0 sur 19. L'état est lu sans verrou (`StockTransferService.ts:236-238`). Comme la vague 4 : renvoi réseau ou script, pas deux postes. 13-A reste en tête : il coûte peu.

**2. Fiche 13 D2 : l'ERP, pas le banc.** Le vendeur de la fiche gardait MAG-1 dans `user_location_roles`. Rejoué avec `v6yop`, MAG-2 seul. Ouvrir la caisse de MAG-1 : **403**. Pourtant l'écran propose « Boutique Audit (MAG-1) » (capture `v6-vendeur-mag2-vente`) et le serveur aussi : vente sans `location_id` → FAC-202 à MAG-1. Il encaisse FAC-205 (crédit de MAG-1). Tiroir MAG-1 **+12 800**, le sien +5 000. Causes : défaut = site principal (`useSalesStock.ts:91-93`), aucun contrôle à la vente, paiement dans la caisse de la facture (`PaiementService.ts:217-233`).

**3. Fiche 13 D3 : la ligne.** `StockMagasinService.ts:22-29`, copiée dans `ProduitController.ts:113-127` :

```sql
sl.actif = true AND NOT ( UPPER(sl.code) LIKE 'DEPOT%'
  OR UPPER(sl.nom) LIKE '%DÉPÔT%' OR UPPER(sl.nom) LIKE '%DEPOT%' )
```

Le commentaire (`:18`) prévoyait le type « si une colonne est ajoutée » ; elle existe. Le code `DEP-1` ne correspond pas : seul le nom protège. « Entrepôt Vridi » : FAC-206 vend une souris du dépôt (80 → 79) ; MAG-2 « près du dépôt » : 422. Les demandes lisent le type (`DemandeService.ts:285-289`) : deux règles.

**4. Fiche 14 D1 et fiche 13 D5 : une cause.** Pas d'état « en route » : le stock change des deux côtés au même clic. Clic au départ : la boutique vend ce qui n'est pas arrivé (14). Clic à l'arrivée : un inventaire du dépôt retire deux fois (13). Le code existe en deux copies (`StockTransferService.complete`, `DemandeService.execute:602-855`). **Propriétaire : 13-E.** Son étape 1 fait passer la demande par « Expédier » et change la clôture en « Réceptionner » avec quantités : c'est l'étape 1 de 14-B, absorbée. 14-B dépend de 13-E.

**5. Fiche 14 D2 : bloquée tant que le dépôt n'a pas tout.** DEM-2, riz 90 approuvés pour 70 : exécuter 422 ; annuler 400 (vendeur, admin) ; redécider 409 (dépôt, admin) ; modifier, renvoyer, clôturer 409 ; supprimer : pas de route. Après 20 sacs ramenés de MAG-1 (TRF-39) : exécutée. « À vie » est faux, sauf pour un article qui ne reviendra pas. La seule sortie est absurde ; l'admin n'en a aucune.

**6. Fiche 06 D1 : décision mal traduite.** `CLAUDE.md` : le caissier crée un client « sans plafond de crédit » ; le serveur répond « fixés par le gérant » (`TiersController.ts:70-78`). L'intention : le gérant décide. Mais 0 = illimité (`CreditService.ts:43-46`) : crédit sans fin, le contraire. Pour un grossiste ou une boutique, le patron donne le crédit à un client connu : « aucun crédit sans plafond fixé par le gérant » convient. 06-A est juste ; `CLAUDE.md` doit dire « sans crédit ».

**7. Fiche 06 D2 : « Nouvelle facture ».** Client comptoir présélectionné pour le caissier (`NouvelleFacture.tsx:229-236`), facture créée **avant** le paiement, fenêtre ouverte sur la fiche (`FactureDetail.tsx:205`) : « Annuler » laisse FAC-207 impayée. La vente comptoir refuse un paiement partiel (422). Propriétaire : **06-A** (serveur, tous chemins) ; 07-H retire l'écran.

**8. Fiche 06 D3 : 04-A, élargi.** « V6 Dette F » : 185 500 facturés, une facture annulée, 65 000 payés, acompte 20 000 imputé, avoir 15 500 non imputé. Vrai : **85 000**. Relances, relevé, plafond : **100 500** (avoir ignoré). Fiche : **65 000** (acompte compté deux fois). 04-A a la bonne formule, mais ses fichiers oublient `ReportingService.ts:65-160` (Relances, Rapports, accueil) et `Tiers.tsx` (oubli 2). Un seul propriétaire : 04-A ; 18-D reste fournisseur ; 06-E règle qui voit.

## 4. Verdicts

- **13 « Améliorer » : maintenu.** Contre-argument : la plupart ont une boutique, simplifier. Il tient en partie, déjà dans le plan : un écran d'affectation supprimé (13-C), module caché à un site (13-F), demandes fusionnées.
- **14 « Fusionner » : maintenu, réduit.** Contre-argument : supprimer, un WhatsApp suffit. Il ne tient pas : la boutique doit laisser une trace que le dépôt traite ; après 13-E, c'est un état de plus. Deux copies du mouvement coûtent plus.
- **06 « Améliorer » : maintenu.** Contre-argument : le filtre « En retard » des factures (03-F) suffit. Non : on relance un client, pas une facture. Le calcul du retard appartient à 06-D ; 03-F l'utilise.

## 5. Lots

- **Trop gros** : 13-D → **13-D1** vendre et encaisser chez soi (M, reprend le contrôle d'`ouvrirSession` et `est_defaut`) et **13-D2** réception, transfert, inventaire chez soi (S). 06-C → **06-C1** voir l'encours, message en FCFA (S) et **06-C2** accord du gérant (après le PIN, fiche 24).
- **Réduits** : 14-A = annuler une demande approuvée, statut « Annulée » (S) ; envoi partiel dans 13-E étape 2. 14-B perd son étape 1. 13-H = téléphone, numéros Wave et Orange (S) ; identifiants FNE dans 03-L. 13-A sans `NumberingService`.
- **Dépendances** : 13-E dépend de 13-A et 13-C, pas de tout 13-D ; 14-B reprend `sync_demande_on_transfer_change` ; 06-A dépend des seeds (fiche 28) ; 06-E de la matrice de la fiche 24.
- **Invérifiables** : 06-A et 06-G citent des pièces du banc 3 → scénarios écrits ; « facture certifiée FNE » → « marquée certifiée ».
- **Pas au premier mois** : 13-I, 14-D, 14-E, 14-F, 06-G, plafond en jours.

## 6. Propriétaires

| Sujet | Propriétaire | Cité par |
|---|---|---|
| Anti-doublon des transferts | **13-A** (verrou d'état) | 07-A |
| « Expédié », réception, manquant | **13-E** | 14-B, question 37 ; 17-F reste fournisseur |
| Boutique de l'utilisateur, bon tiroir | **13-D1** | 08-E (session reçue, bornes), 07-G, 03-F |
| Une seule affectation | **13-C** | fiche 24 |
| Magasin unique, menus cachés | **13-F** | fiches 14, 25 |
| Créer / gérer un site | **08-G** / **13-G** | fiche 28 |
| Demande impossible, « à acheter » | **14-A** ; envoi partiel 13-E2 ; non servi dans **16-C** | 14-E plus tard |
| Crédit accordé, défaut | **06-A** | question 6, `CLAUDE.md` |
| Bloquer ou avertir | **06-C1/C2** (bloquer, accord du gérant) | 02-C (encours) |
| Une seule dette client | **04-A** élargi | 06-E, 18-D |
| Échéance / promesse | **06-D** / **06-F** | 03-F |
| Perte sur créance | **06-G** | 03-D, fiche 22 |
| WhatsApp | **03-L étape 1** | 06-H, 01-F, 13-H ; 14-F plus tard |
| FNE par boutique | **03-L** | 13-H |
| Wave par boutique | **13-H** | 08-D, 07-F, 06-H |

## 7. Ordre d'exécution (nouveaux en gras)

1. 08-G
2. 10-E
3. **13-B type, pas nom**
4. 08-A
5. 04-B
6. 07-A
7. **13-A exécuter une fois**
8. 09-A
9. 10-A reprise
10. 10-A verrou
11. 07-C
12. 10-B
13. 12-A
14. 15-A
15. 12-B
16. 15-C
17. 12-C
18. 12-D étape 1
19. **13-C une affectation**
20. **13-D1 vendre chez soi**
21. **13-E étape 1 expédier, réceptionner**
22. 03-B
23. 03-A
24. 02-B
25. 02-A
26. 15-B
27. **06-A crédit accordé**
28. 02-C
29. 01-A
30. 05-A étape 1
31. 05-A étape 2
32. 04-A
33. 05-B
34. 05-D
35. 15-D
36. 12-F
37. 05-C
38. 16-A
39. 16-B
40. 17-A
41. 17-B
42. 04-J
43. 08-D
44. 07-F
45. 04-E
46. 08-B
47. 18-B
48. 08-C étape 1
49. 08-K
50. 18-C
51. 17-E
52. 17-C
53. 04-D
54. 09-C
55. 03-D
56. 02-D
57. 10-C
58. 03-E
59. 15-G
60. 15-F
61. **06-B Crédit clients**
62. **14-A annuler**
63. **13-E étape 2**
64. **14-B fusion**
65. **14-C ma boutique**
66. 08-E
67. **13-D2 stock chez soi**
68. **13-G gérer un site**
69. **13-F un seul site**
70. **06-C1 voir l'encours**
71. 09-B
72. 07-D
73. 09-D
74. 01-E
75. 04-C étape 1
76. 04-C étapes 2-3
77. 18-E
78. 18-D
79. 18-F
80. 16-C
81. 08-F
82. 10-D
83. 07-H étape 1
84. 07-H étape 2
85. 02-E
86. 05-E étapes 1-2
87. 05-E étape 3
88. 05-F
89. 09-E
90. 09-F
91. 17-D
92. 09-H
93. 07-B
94. 01-B
95. 08-H
96. 08-I étape 1
97. 10-F
98. 12-E
99. 11-B
100. 11-A
101. 11-E
102. 11-D
103. 11-F étape 1
104. 03-F
105. **06-D échéance**
106. **06-E qui voit**
107. **06-C2 accord du gérant**
108. 11-C
109. 12-D étape 2
110. 03-G
111. 01-C
112. 02-F
113. 02-G
114. 16-D
115. 17-F
116. 18-I
117. 09-I
118. 10-H
119. 16-F
120. 15-H
121. 17-H1
122. 04-F
123. 04-G
124. 04-I
125. **06-F promesse**
126. 07-J
127. 07-I
128. 10-G
129. 10-I
130. 11-G
131. 10-J
132. 11-F étape 2
133. 10-K
134. 03-I
135. 18-H1
136. 18-H2
137. 02-H
138. 03-J
139. 15-E
140. 03-C
141. **06-G perte**
142. 17-H2
143. 03-K
144. 03-L
145. **13-H fiche boutique**
146. 16-G
147. 01-F
148. **06-H WhatsApp**
149. 04-H
150. 08-J
151. 08-L
152. 08-C étape 2
153. 07-L
154. 08-I étape 2
155. 16-H
156. 17-J
157. **13-I autre boutique**
158. 11-H
159. 17-G
160. 17-I
161. 01-G
162. **14-D cloche**
163. 09-J

Plus tard : 14-E, 14-F, plafond en jours.

## 8. Oublis

1. **Le contrôle existe à la caisse, pas à la vente.** `v6yop` reçoit 403 en ouvrant la caisse de MAG-1, mais y vend et y encaisse ; sans `location_id`, le serveur prend le site principal malgré `est_defaut` sur MAG-2 (FAC-202). 13-D1 doit corriger le serveur, pas seulement l'écran.
2. **La liste des contacts trie sur un autre chiffre que celui affiché** : tri sur `solde_client_actuel` (100 500), affichage `solde_client_live` (65 000) (`Tiers.tsx:44, 91`). Pour 04-A.

## 9. Erreurs dans les fiches

- **13** : D3 « `location_type` ignorée » (lue par les demandes) ; B2 « `est_defaut` reste faux » (écrit par la fiche utilisateur) ; D2 prouvé avec un vendeur qui gardait MAG-1 (refait, tient).
- **14** : D2 « à vie » ; 14-B ignore que son étape 1 est 13-E.
- **06** : D3 n'élargit 04-A qu'à Relances et accueil (oublie la liste des contacts) ; D10 omet que la remise en stock est voulue.
- **CLAUDE.md** : « sans plafond de crédit » donne un crédit illimité.

## Questions nouvelles

47. Nouveau client : aucun crédit tant que le gérant n'a pas fixé de plafond (proposé) ?
48. Plafond dépassé : bloquer sauf accord du gérant (proposé), ou avertir ?
49. Demande que le dépôt ne peut pas servir : annulée avec motif, ou envoyée en partie, le reste « à acheter » (proposé) ?
50. Un vendeur encaisse la facture d'une autre boutique : dans son tiroir (proposé), ou refus ?
51. Manquant à l'arrivée d'un transfert : perte tout de suite (proposé), ou litige tranché par le gérant ?
52. Dette passée en perte : l'admin seul, ou le gérant sous un montant ?

## Non vérifié

Deux vrais postes ; réseau lent ; captures de 14 et 06 ; plus de 200 relances ; base neuve à deux sites.
