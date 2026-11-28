# Vague 9 · Contre-expertise (fiches 22, 20, 26)

27/11/2026, `nolyx_audit_4`, scripts `%TEMP%\nolyx-agents\vague9-4\`. Tout est créé par l'API. Caisse du banc **clôturée à l'attendu (60 000, écart 0)** ; mes sessions 3 (manquant 2 000) et 4 (à l'attendu) closes. Remis : prix, rôle, salaire ; taux de Koffi laissé à 3 %.

## 1. Résultat

32 défauts : **28 confirmés, 2 nuancés, 0 faux, 2 non rejoués** (20-B3 bulletin, 26-B2 recherche). « Lu » = vu dans le code. Tous à l'écran sauf 20-D4 et `POST /devis/:id/convert`.

## 2. Défauts

| N° | Statut | Preuve |
|---|---|---|
| 22-D1 | Confirmé | Capture `v9-balance-1440` : 411 créditeur 87 300, ni 701 ni 601 |
| 22-D2 | Confirmé | Point 1 |
| 22-D3 | Confirmé, élargi | Avoir, acompte imputé, fournisseur, dépense Wave, manquant, paie : rien ; oublis 1, 3 |
| 22-D4 | Confirmé | Carte, chèque, virement au 53 ; patron 65, apport 75, loyer 604 |
| 22-D5, D6 | Confirmés (lu) | `CaisseMagasinService.ts:614` ; point 3 |
| 22-D7 | Confirmé | Devis 42 000 → FAC-208 à 47 000 ; trigger : 411 = `total`, 701 = `sous_total` |
| 22-D8 | Confirmé | Point 2 |
| 22-D9 | Confirmé (lu) | `GeneralLedger.tsx:578` |
| 20-D1 | Confirmé | 544 531,77 « espèces » : mouvements, écritures, dépenses, attendu (62 000) inchangés |
| 20-D2 | **Nuancé** | Point 4 |
| 20-D3 | Confirmé (annulation) | FAC-210 annulée après paie : 160 payés, gardés ; décembre 0. Retour non rejoué |
| 20-D4 | Confirmé (API) | Retenue 200 000 sur 100 000 : net −109 292 |
| 20-D5, D6 | Confirmés | Embauchée le 15/12 payée en novembre ; net 132 391,76 |
| 20-D7 | Confirmé | Gérant, sa fiche : 300 000 → 900 000 ; journal sans l'ancien |
| 20-B1, B2, B4 | Confirmés | `utilisateur_id` ignoré (200) ; 7 « en_attente » après paie ; un mode (lu) |
| 26-D1 | Confirmé | Sortie 10 000, apport 5 000 : aucune ligne |
| 26-D2 | Confirmé | Plafond 3 → 9 M, modification, suppression : aucune ligne |
| 26-D3 | Confirmé, élargi | Acompte, imputation, acompte fournisseur : rien |
| 26-D4 à D6 | Confirmés | Point 6 ; rôle changé : `password_changed: [REDACTED]` |
| 26-B1 | Confirmé | `date_from` → 500 |
| 26-B3 | **Nuancé** | Point 6 |
| 26-B4 | Confirmé | Ni `notifications` ni `alertes` en base |
| 26-B5 | Confirmé (lu) | Quatre émetteurs |
| 26-B6 | Confirmé | Chemise M : MAG-1 1 → 0, ailleurs 96 ; admin : « Nouvelle facture » seule |

## 3. Points précis

**1. Ma journée, 17 opérations.** Comptoir (espèces 15 000, Wave 7 000, carte 2 800, chèque 15 500), crédit 30 000 et 58 500, devis 47 000 remisé de 5 000, avoir 15 000, acompte 25 000 imputé d'office, Wave 15 000 et virement 10 000 reçus, loyer 25 000 espèces, électricité 4 000 Wave, achat 50 000 payé 30 000 espèces, 10 000 au patron, 5 000 d'apport, 2 000 manquants.

| Compte | Attendu | Écran | 03-C seul |
|---|---|---|---|
| 411 Clients | D 76 000 | C 65 300 | D 121 000 |
| 701 Ventes | C 166 300 | absent | C 186 300 |
| 419 Avances | 0 | C 25 000 | idem |
| Caisse | −22 000 | +38 300 | idem |
| Wave | +18 000 | +22 000 | idem |
| Banque, carte, chèque | +28 300 | absent | idem |
| 601 Achats | D 50 000 | absent | **juste** |
| 401 Fournisseurs | C 20 000 | absent | C 50 000 |
| Loyer | D 25 000 | 0 (604) | idem |
| Électricité | D 4 000 | 0 | idem |
| Exploitant | D 5 000 | 0 (65, 75) | idem |
| Écart | D 2 000 | 0 | idem |

**0 sur 12 ; 03-C seul en rend 1 (601).** 411, 701, 401 deviennent visibles mais faux : +45 000 (avoir, acompte imputé, remise), +20 000, +30 000. Avec 03-A, pièce déséquilibrée (D7). Les huit autres viennent de l'écrivain de caisse : reste 22-C, 22-D, 22-E. L'attendu ignore l'achat : faux manquant.

**2. Mois clos.** Rien n'écrit `periodes_comptables` (lectures seules, `PeriodService.ts:13` ; 0 ligne, banc et client neuf). Saisies du 15/01/2020 et du 30/06/2031 : 201, numérotées « PC-2026 » (API) ; écran aussi (lu, `GeneralLedger.tsx:1232`).

**3. `CAISSE_GL_POSTING`.** Absent de `provision-client.sh:78-90` et `update-client.sh`, faux dans `.env.example:13`. Un client neuf n'écrit aucun mouvement de caisse : encaissements, acomptes, dépenses, sorties, versements (`CaisseMagasinService.ts:562`). Restent triggers cachés, annulation, compensation. Le verdict 22 la retire (22-F).

**4. Commission** (Awa vendeuse 2 %, Koffi caissier 1 %, gérant 1 %).

| Chemin | Facture | Commission |
|---|---|---|
| Facture directe du vendeur | FAC-210 | Awa 160 |
| Comptoir, vendeur / caissier | FAC-211 / 212 | Awa 100 / Koffi 70 |
| Devis accepté par le vendeur, facturé par le gérant | FAC-216 | **Gérant** 110 |
| Devis accepté et facturé par le gérant | FAC-213 | **Gérant** 140 |
| `POST /devis/:id/convert` (gérant) | FAC-214 | **Gérant** 220 |
| Devis accepté par le gérant, facturé par le vendeur | FAC-215 | Awa 2 700 |

Awa : 2 960 au lieu de 3 900. Nuance : le bon automatique porte celui qui **accepte** le devis (`cree_par = 2`) ; même vivant, le repli de la migration 100 paierait le gérant. Seul `devis.cree_par` désigne le vendeur.

**5. Même cause ?** Oui, seul `CaisseMagasinService.createMouvement` bouge le tiroir et écrit. La paie ne l'appelle pas (`PayrollService.ts:313-330`), le fournisseur non plus, la dépense seulement en espèces (`DepenseServiceV2.ts:99, 127`). Remède : 09-F, tous modes (08-D).

**6. Traces.**

| Geste | Ligne | Avant / après |
|---|---|---|
| Vente, paiement, avoir, achat, clôture | Oui | Après seul |
| Acompte, imputation, acompte fournisseur | **Non** | — |
| Sortie, apport | **Non** | — |
| Dépense créée, supprimée / modifiée | Oui / **Non** | Vides |
| Annulation de facture | Oui | **Seule avec un avant** |
| Suppression de facture | Oui | `null / null` |
| Plafond, contact modifié ou supprimé | **Non** | — |
| Prix, ajustement, perte | Oui | Ni avant ni motif |
| Rôle, désactivation | Oui | `role_id` brut |
| Paie, salaire, taux | Oui | Ni montant ni avant |

**Effaçable : nuancé.** Aucun trigger sur `audit_log`, mais au banc elle appartient à `postgres` ; chez un client, à l'application (`provision-client.sh:66-67`, `ci-db-setup.mjs:51`). Modèle : `trg_mouvement_append_only`. Vraie garde : application non propriétaire (fiche 28).

**`?token=` : la fiche a raison, CLAUDE.md est périmé.** `?token=` → 401 ; cookie → 200 `text/event-stream`, direct et par Vite ; `Bearer` → 200.

## 4. Verdicts

- **22 « Simplifier » : maintenu.** Contre : le grossiste au réel veut balance et grand livre ; l'export exige le calcul complet. Tient en partie : le calcul reste, les écrans faux partent (22-A). Cachés, 22-B à 22-H quittent la tête : avant le premier mois clos d'un client.
- **20 « Simplifier » : maintenu, réduit.** Contre : supprimer la paie, une sortie « salaire » suffit. Tient pour CNPS, ITS, bulletin : 20-E étapes 2-3, 20-H, 20-I « plus tard ».
- **26 « Améliorer » : maintenu.** Contre : l'historique sur la pièce suffit. Faux : sortie et plafond n'ont pas de pièce.

**Effet du verdict 22.**

| Lot | Effet |
|---|---|
| 03-C, 09-J | Disparaissent (22-C, 22-D, 22-E) |
| 04-E, 05-D, 06-G, 18-D | Perdent l'écriture ; 05-D garde le chiffre net, 06-G le geste |
| 09-E | Garde les natures ; comptes par 22-B |
| 23-A | Rétrécit : routes comptables retirées ; plus « avant 03-C » |
| 03-K | Lignes 44 à 22-I |
| 03-D, 08-K | Plus de contre-passation |
| 08-J, 15-E, 21-C, 23-H, 23-J | Inchangés ; 22-B démarre sans 08-J |

## 5. Lots

- **Découpés** : 26-A → A1 (fonction dans la transaction ; sorties, acomptes, plafond, contacts) / A2 (avant/après stock, prix, droits, remise). 26-C → C1 (préfixe `al.`) / C2. 26-D → D1 (annulation, paiement supprimé, écart) / D2 (caisse ouverte, rupture par boutique). 20-B → B1 (compte lié, `vendeur_id` dès le devis) / B2 (reprises, « payée »).
- **Dépendances fausses** : 09-G (absorbé par 08-D) dans 20-A ; 24-J inutile à 20-B ; 08-J pour 22-B.
- **Doublons** : `paiements_salaire` → sortie 09-F « salaire » ; étape 4 de 20-A = 09-H ; échues de 26-D = 23-F.
- **Invérifiables** : « un cabinet signe » (22-B, 22-H), « un comptable vérifie » (20-E) → tests, question 82.
- **Reportés** : écran « Comptes du cabinet », tâche des 15 minutes, 20-H, 20-I.

## 6. Propriétaires

| Sujet | Propriétaire | Cité par |
|---|---|---|
| Payer les salaires | **20-A** par 09-F | 08-B, 09-H, 22-E |
| Caisse au journal, écarts, patron | **22-E** | 09-E, 08-K |
| Ventes, avoirs, acomptes au journal | **22-C** | 05-D |
| Achats, paiements fournisseur | 18-B / **22-D** | — |
| Clôture, verrou | **22-G** | 03-D, 08-K |
| Export cabinet | **22-H** | 27-H |
| TVA au journal | **22-I** | 03-K, 23-J |
| Ancien moteur, variable | **22-F** | fiche 28 |
| Vrai vendeur | **20-B1** | 03-A, 07-H |
| Avance / retenue | 09-E / **20-C** | 08-B |
| Personnel / comptes | **20-F** / 24-D | 24-C |
| Qui fixe les salaires | **20-G** | 24-A1 |
| Traces | **26-A1, 26-A2** | 25-F, 09-C, 15-C, chaque lot |
| Ajout seul | **26-B** | fiche 28 |
| Historique sur la pièce | **26-F** | 26-C2 |
| Alertes | **26-D1, 26-D2** | 23-F, 08-L |
| Pièces jointes | **26-E** | 24-A1, 09-I |

## 7. Ordre d'exécution (nouveaux en gras ; 03-C, 09-J retirés)

1. 08-G
2. 10-E
3. 13-B
4. 08-A
5. 04-B
6. 07-A
7. 13-A
8. 09-A
9. **22-A**
10. **26-C1**
11. **26-B**
12. **26-A1**
13. 10-A/1
14. 10-A/2
15. 07-C
16. 10-B
17. 12-A
18. 15-A
19. 12-B
20. 15-C
21. 12-C
22. 12-D/1
23. 13-C
24. 13-D1
25. 13-E/1
26. **26-A2**
27. **26-C2**
28. 23-B
29. 03-B
30. 03-A
31. 23-A
32. 27-A
33. 02-B
34. 02-A
35. 15-B
36. 06-A
37. 02-C
38. 01-A
39. 05-A/1
40. 05-A/2
41. 19-A
42. 04-A
43. 05-B
44. 27-B1
45. 05-D
46. 15-D
47. 12-F
48. 05-C
49. 16-A
50. 21-A
51. 16-B
52. 17-A
53. 17-B
54. 04-J
55. 08-D
56. 07-F
57. 04-E
58. 23-C
59. 08-B
60. 18-B
61. 08-C/1
62. 08-K
63. 18-C
64. 17-E
65. 17-C
66. 04-D
67. 09-C
68. 03-D
69. 02-D
70. 23-D
71. 21-B1
72. 27-C
73. 24-A1
74. 24-B
75. 25-F
76. 24-I
77. 10-C
78. 03-E
79. 15-G
80. 15-F
81. 06-B
82. 14-A
83. 13-E/2
84. 14-B
85. 14-C
86. 08-E
87. 13-D2
88. 13-G
89. 25-B
90. 25-E
91. 13-F
92. 23-E
93. 21-B2
94. **26-D1**
95. 06-C1
96. 09-B
97. 07-D
98. 27-F1
99. 19-B
100. 24-D
101. 24-C
102. 25-D
103. 25-A
104. 19-C
105. 19-D
106. 27-H
107. 01-E
108. 04-C/1
109. 04-C/2-3
110. 18-E
111. 18-D
112. 27-B2
113. 18-F
114. 16-C
115. 08-F
116. 10-D
117. 07-H/1
118. 07-H/2
119. 02-E
120. 05-E/1-2
121. 05-E/3
122. 05-F
123. 09-E
124. 09-F
125. **20-D**
126. **20-A**
127. **20-C**
128. **20-B1**
129. **20-B2**
130. **20-E1**
131. **20-G**
132. **20-F**
133. 17-D
134. 09-H
135. 23-G1
136. 23-H
137. 07-B
138. 01-B
139. 08-H
140. 08-I/1
141. 10-F
142. 19-E
143. 19-F/1
144. 19-G/1
145. 19-G/2
146. 24-E
147. 24-G
148. 25-G
149. 25-H
150. 27-D1
151. 27-D2
152. 27-G
153. 27-E1
154. 27-F2
155. 25-C
156. 12-E
157. 11-B
158. 11-A
159. 11-E
160. 11-D
161. 11-F/1
162. 03-F
163. 06-D
164. 23-F
165. **26-D2**
166. 06-E
167. 06-C2
168. 19-H
169. 24-J
170. 11-C
171. 12-D/2
172. 03-G
173. 27-E2
174. 01-C
175. 02-F
176. 02-G
177. 16-D
178. 17-F
179. 18-I
180. 09-I
181. **26-E**
182. 10-H
183. 16-F
184. 15-H
185. 17-H1
186. 04-F
187. 04-G
188. 04-I
189. 06-F
190. 19-F/2
191. 24-H
192. 07-J
193. 07-I
194. 10-G
195. 10-I
196. 11-G
197. 10-J
198. 11-F/2
199. 10-K
200. 03-I
201. 18-H1
202. 18-H2
203. 02-H
204. 03-J
205. 15-E
206. 06-G (déplacé)
207. **22-B**
208. **22-C**
209. **22-D**
210. **22-E**
211. **22-G**
212. **22-H**
213. **22-F**
214. 17-H2
215. 03-K
216. **22-I**
217. 23-J
218. 03-L
219. 13-H
220. 16-G
221. 01-F
222. 06-H
223. 04-H
224. 08-J
225. 21-C
226. 08-L
227. 08-C/2
228. 07-L
229. 08-I/2
230. 16-H
231. 17-J
232. 13-I
233. 11-H
234. 17-G
235. 17-I
236. 01-G
237. 14-D
238. 23-I
239. 27-I
240. **26-F**
241. 24-F
242. 24-A2

Plus tard : 14-E, 14-F, plafond en jours, appareils, anonymisation, 23-G étape 2, 20-E étapes 2-3, 20-H, 20-I.

## 8. Oublis

1. **Facture supprimée gardée au journal.** `DELETE /factures/209` (gérant) : écritures 437-438 (10 500) intactes ; l'annulation de FAC-210, elle, se contre-passe (469-470). Pour 22-C, question 86.
2. **Avoir imputé compté en « virement ».** Paiement 166 (15 000, `acompte_application`, `CreditNoteService.ts:587-592`) ; `GET /paiements/stats` groupe tout par mode (`PaiementController.ts:181-186`). Pour 22-C, 23-C.
3. **Acompte fournisseur sans rien** : 5 000 par virement, ni écriture, ni trace. Pour 22-D, 26-A1.

## 9. Erreurs dans les fiches

22 : « poche du gérant » n'est pas un compte. 20 : cause de D2 double ; 09-G absorbé. 26 : B3 vaut chez un client, pas au banc ; 26-D refait 23-F.

## Questions nouvelles

81. Journal calculé depuis les pièces, figé à la clôture (proposé) ?
82. Un cabinet relit-il les comptes et donne-t-il son format d'import ?
83. Fichier mensuel au cabinet, clôture par l'admin avant le 10 (proposé) ?
84. Argent du patron : compte de l'exploitant ou d'associé ?
85. Journal « recettes et dépenses » pour les plus petits ?
86. Supprimer une facture : interdit, annulation seule (proposé) ?
87. CNPS, ITS, bulletin plus tard (proposé) ? Qui valide les taux ?
88. Commission à la vente ou à l'encaissement ? Reprise au retour (proposé) ?
89. Salaires fixés par l'admin seul (proposé) ? Prorata calendaire ?
90. Le gérant voit l'historique sur la pièce, pas la page Journal (proposé) ?
91. Supprimer les bulles de vente et de paiement (proposé) ?
92. Pièce d'identité du client à crédit ? Journal gardé sans limite (proposé) ?

## Non vérifié

Bulletin PDF, recherche, retour sur commission, saisie de 2020 à l'écran, pièces jointes, numéros SYSCOHADA.
