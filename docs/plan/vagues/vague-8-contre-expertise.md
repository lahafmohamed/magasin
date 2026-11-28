# Vague 8 · Contre-expertise (fiches 27, 23, 21)

27/11/2026, `nolyx_audit_4`, scripts `%TEMP%\nolyx-agents\vague8-4\` (PDF lus par pdfplumber). Créés par l'API : DEV-2026-00011, BL-2026-00001, FAC-2026-00202 à 206 et 101 tickets, AVOIR-2026-00001, trois acomptes, FF-2026-00005, CMD-2026-00007, DEP-2026-00013. Caisse du banc **clôturée à l'attendu (60 000, écart 0)** ; session 3 ouverte (fonds 50 000), laissée ouverte. TI-00008 supprimé. Paramètres, client 9 et produit 7 remis.

## 1. Résultat

30 défauts rejoués : **28 confirmés, 2 nuancés, 0 faux, 0 non rejoué**. Tous atteints à l'écran, sauf 27-D6 (API). « Lu » = vu dans le code. Fuseau horaire hors de cause : PostgreSQL et Node en UTC, comme Abidjan. Données du banc hors de cause : tout est recréé par l'ERP ; seuls les montants de 21-D1 viennent de l'activité semée, et la règle tient sur mes factures.

## 2. Défauts rejoués

| N° | Statut | Preuve |
|---|---|---|
| 27-D1 remises | **Nuancé** | Point 1 : devis et bon seulement |
| 27-D2 payé, reste | Confirmé | FAC-203 payée 100 000 : « Total : 605 500 », rien d'autre |
| 27-D3 ticket | Confirmé (lu) | `ticket.ts:114-118` : aucun reste |
| 27-D4 relevé fournisseur | Confirmé | Point 3 |
| 27-D5 relevé client | Confirmé, élargi | Avoir 3 500 : relevé 1 979 010, solde 1 975 510. Acompte 5 000 (TI-4) : relevé 1 914 906, solde 1 909 906 |
| 27-D6 reçu, D9 identité | Confirmé | Point 4 |
| 27-D7 annulée | Confirmé | FAC-205 : « Total : 1 400 », aucune mention |
| 27-D8 incomplète | Confirmé | Ni date ni échéance : « Généré le » seul |
| 27-D10 deux gabarits | Confirmé | Point 2 |
| 27-D11 80 mm | Confirmé (lu) | `ticket.ts:130-133` |
| 23-D1 dernier jour | Confirmé | Point 5 |
| 23-D2 caissier | Confirmé | 101 tickets : « 140 000, au moins 100 factures » pour 2 009 400 ; « Reste 0 » pour 1 710 000 dus (capture `v8-caissier-390`) |
| 23-D3 encaissé | Confirmé | Point 6 |
| 23-D4 meilleurs produits | **Nuancé** | Ni statut ni date (`FactureService.ts:1236-1252`), mais classement net = brut sur la base : effet faible |
| 23-D5 deux dettes | Confirmé | TI-8 supprimé : accueil 18 536 365, tuile Rapports 22 387 785 (04-A) |
| 23-D6 stock | Confirmé | Tuile 87 882 808 = Σ prix d'achat × quantité ; sites 87 888 347 (15-A) |
| 23-D7 avoirs | Confirmé | Avoir validé : CA du jour 2 009 400 brut (05-D) |
| 23-B1 boutique | Confirmé | `pnl` avec `location_id` 1 ou 4 : 25 916 600 |
| 23-B2 bénéfice | Confirmé | `pnl` sans dépenses : les 15 000 absents |
| 23-B3 par mode | Confirmé (lu) | `PaiementController.ts:180-186`, sans date |
| 23-B4 prévision | Confirmé | Octobre 35 542 500 + novembre partiel 27 784 600 → 31 663 550 |
| 21-D1 retard | Confirmé | Dû 22 387 785 − en retard 10 289 240 = prévision 12 098 545, au franc ; échéance = jour de la facture |
| 21-D2 fournisseurs | Confirmé | FF-005 (400 000, 4/12) : sorties 596 975 avant et après |
| 21-D3 commandes | Confirmé | CMD-7 « en attente » +150 000 ; CMD-5 validée, prévue le 10/11 : absente |
| 21-D4 dépense | Confirmé | DEP-013 : −15 000 au tiroir **et** +15 000 « prévus » ; une dépense est toujours payée |
| 21-D5 sans départ | Confirmé (lu) | `Tresorerie.tsx:170` |
| 21-D6 salaires | Confirmé (lu) | Paie jamais lue (`ComptabiliteService.ts`) |
| 21-D7 quatre chiffres | Confirmé (virement) | Virement 50 000 au compte 53 (espèces) ; fournisseur en espèces : vague 4 |
| 21-B1 sans réponse | Confirmé | Suit D1 à D6 |

## 3. Points précis

**1. 27-D1.** DEV-2026-00011 (−10 % sur une ligne, −2 000 sur l'autre, remise globale 5 000) : enregistré 1 114 000, PDF **1 119 000**. BL-2026-00001 : enregistré 1 114 000, imprimé 1 119 000. Remise de **ligne** comptée dans `total_ligne`, mais colonne « - » (`PDFService.ts:813` lit `ligne.remise`, absent) ; remise **globale** perdue (`:830-834`). Facture et avoir : aucune remise possible (`createFactureSchema`), PDF = total. L'écart de la facture vient de la conversion : FAC-202 à **1 240 000** pour ce devis (+126 000, 03-A).

**2. Deux gabarits, FAC-203** (capture `v8-apercu-fac203`). Aperçu « Imprimer » : dates, échéance, déjà payé 150 000, reste 455 500, références ; pas d'adresse ni de téléphone du client. PDF : adresse et téléphone du client, RCCM et adresse de l'entreprise ; ni date, ni payé, ni reste. Ordre des lignes inversé. Aux deux manquent : NCC du client, mode et référence du paiement, vendeur, montant en lettres, n° de page, cachet.

**3. 27-D4.** HP Distribution : `/tiers/11/compte` dû **369 540** ; relevé PDF « Client : … Solde dû : 0 FCFA », aucune ligne. `getReleveDetaille` ne lit que `factures` et `paiements` (`TiersService.ts:316-347`) : un contact client et fournisseur n'imprime que sa part client.

**4. Réimpression.** FAC-203 après renommages : « Société Rachetée SA », RCCM CI-ABJ-2027-B-99999, « NOUVEAU NOM CLIENT SARL », « Câble HDMI (renommé) » ; `document_lignes.description` vide. Reçu n° 161 : payé 5 000, reste 10 500 ; après un 2e paiement, **8 000 / 7 500** sous le même numéro.

**5. 23-D1.** Tuile du mois (`EXTRACT`, aujourd'hui compris) 27 777 600 ; compte de résultat 25 916 600 ; du 27 au 27 : 0 pour 3 factures. Touchées, toutes sur la page Rapports : `ReportingService.ts:55` (`getPnL`, compte de résultat), `:180` (catégories), `:214` (10 produits), `:332, 354, 376, 400` (`getMarginsReport`). Plus `GeneralLedgerService.ts:161, 188` (balance, résultat comptable), masqué aujourd'hui (oubli 2).

**6. 23-D3 : la définition des tiroirs est juste.** Accueil **319 400** ; caisse : espèces 171 400 + virement 50 000 + Wave 108 000 = **329 400**. Écart : l'acompte de 10 000 non imputé. Celui de 20 000 (KONE) s'impute à la création de sa facture suivante, sur deux factures d'octobre (paiements 163, 164, `source = 'acompte_application'`, datés du jour d'imputation). Juste : paiements directs + acomptes reçus à leur date, imputations exclues (23-C).

**7. 21-D1, D2 et 16-A.** CMD-2026-00007 crée FF-2026-00006 : liée, total 150 000, **reste 0**, sans échéance. La règle de 21-A (« commandes validées sans facture liée » + « factures à reste > 0 ») ferait **disparaître toute commande créée par l'API**. 21-A dépend de 16-A.

**8. `POST /devis/:id/convert`.** 500 seulement sur un refus (devis brouillon, ou accepté sans bon livré) : ces messages manquent à la liste du contrôleur (`DevisController.ts:153-157`) et n'ont pas de `statusCode`. Bon livré : **200**. Sans lien avec 113 : le service passe par `convertBlToFactureInTx` (`DevisService.ts:722-725`) ; « ouvert (3) » de CLAUDE.md est périmé. Aucun écran ne l'appelle. **Propriétaire 03-A** : supprimer la route.

## 4. Verdicts

- **27 « Fusionner » : maintenu.** Contre : l'aperçu s'imprime d'un geste, le PDF se télécharge sur Android. Tient en partie : « Imprimer » ouvre le PDF dans l'onglet ; WhatsApp exige un fichier du serveur, donc une seule source.
- **23 « Simplifier » : maintenu, réduit.** Contre : graphiques et prévision font vendre. Ne tient pas : prévision fausse, questions du soir sans réponse. 23-G étape 2 passe « plus tard ».
- **21 « Fusionner » : maintenu, autre forme.** Contre : le grossiste veut « à payer cette semaine ». Tient : 18-I la donne, la carte y renvoie. « Argent » devient un bloc de 23-E (une requête `/reports/accueil`), sans `ArgentService`.

## 5. Lots

- **Dépendances oubliées** : 21-A après 16-A et 04-A ; sans 06-D, tout crédit est en retard le lendemain. 23-A couvre la comptabilité, avant 03-C. 27-A ne touche pas `print-layout.tsx` (supprimé par 27-C).
- **Découpés** : 27-B → B1 client (après 05-B), B2 fournisseur (après 18-D). 27-D (L) → D1 pièce figée, D2 duplicata et reçu numéroté figé. 27-E (L) → E1 en-tête, pages, dates, reste, NCC ; E2 lettres, conditions, cachet (après 03-G). 27-F → F1 58/80 mm, reste dû, noms longs (tôt) ; F2 duplicata, code-barres. 21-B → B1 module masqué, B2 page retirée après 23-E.
- **Absorbés** : 09-D par 21-A ; 21-B étape 2 par 23-E ; 21-D par 13-H et 21-C ; 21-E par 23-J.
- **Invérifiables** : 27-F « vraie imprimante » → rendu 58 et 80 mm sans prix coupé, essai réel noté ; 21-B « payer vendredi » → espèces + à encaisser − à payer, au franc.

## 6. Propriétaires

| Sujet | Propriétaire | Cité par |
|---|---|---|
| Montant enregistré / converti / imprimé | 03-B / 03-A / **27-A** | 07-E |
| Document figé, duplicata | **27-D1, 27-D2** | 25-A (ne fige plus la devise), 25-H, question 62 |
| Relevés | **27-B1, 27-B2** | 04-A, 18-D (formules) |
| Exports | **27-H** | 12-F (aide CSV) ; fiche 22 |
| Ticket 58 et 80 mm | **27-F1, 27-F2** | 07-K, 13-H |
| Reçus de paiement et d'acompte | **27-G** | 04-C |
| Bornes de dates | **23-A** (rapports et comptabilité) | 21-A, fiche 22 |
| Une définition par chiffre | **23-C** | 04-A, 05-D, 15-A, 15-G fournissent |
| Accueil du patron, « Argent » | **23-E** | 21-B2, 25-E, 13-F |
| Rapport du soir, WhatsApp | **08-L** | 23-C, 03-L ; question 71 |
| Résultat du mois | **23-H** | 15-D, 09-E ; fiche 22 |
| TVA collectée, à reverser | **23-J** | 03-K calcule |
| Prévisions | **21-A** | 18-I, 06-D |
| Soldes banque, Wave, Orange | **08-J**, puis **21-C** | 08-D, 13-H |
| Ventes du vendeur | **23-I** | 24-A1 (droit) |
| `POST /devis/:id/convert` | **03-A** | — |

## 7. Ordre d'exécution (nouveaux en gras, 09-D retiré ; « /2 » = étape 2)

1. 08-G
2. 10-E
3. 13-B
4. 08-A
5. 04-B
6. 07-A
7. 13-A
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
18. 12-D/1
19. 13-C
20. 13-D1
21. 13-E/1
22. **23-B**
23. 03-B
24. 03-A
25. **23-A**
26. **27-A**
27. 02-B
28. 02-A
29. 15-B
30. 06-A
31. 02-C
32. 01-A
33. 05-A/1
34. 05-A/2
35. 19-A archiver
36. 04-A
37. 05-B
38. **27-B1**
39. 05-D
40. 15-D
41. 12-F
42. 05-C
43. 16-A
44. **21-A**
45. 16-B
46. 17-A
47. 17-B
48. 04-J
49. 08-D
50. 07-F
51. 04-E
52. **23-C**
53. 08-B
54. 18-B
55. 08-C/1
56. 08-K
57. 18-C
58. 17-E
59. 17-C
60. 04-D
61. 09-C
62. 03-D
63. 02-D
64. **23-D**
65. **21-B1**
66. **27-C**
67. 24-A1 droits serveur
68. 24-B coupure
69. 25-F réglages au patron
70. 24-I PIN
71. 10-C
72. 03-E
73. 15-G
74. 15-F
75. 06-B
76. 14-A
77. 13-E/2
78. 14-B
79. 14-C
80. 08-E
81. 13-D2
82. 13-G
83. 25-B métier, options
84. 25-E caché partout
85. 13-F
86. **23-E**
87. **21-B2**
88. 06-C1
89. 09-B
90. 07-D
91. **27-F1**
92. 19-B nommer
93. 24-D sans e-mail
94. 24-C une porte
95. 25-D logo
96. 25-A une page
97. 19-C notes
98. 19-D analyse
99. **27-H**
100. 01-E
101. 04-C/1
102. 04-C/2-3
103. 18-E
104. 18-D
105. **27-B2**
106. 18-F
107. 16-C
108. 08-F
109. 10-D
110. 07-H/1
111. 07-H/2
112. 02-E
113. 05-E/1-2
114. 05-E/3
115. 05-F
116. 09-E
117. 09-F
118. 17-D
119. 09-H
120. **23-G1**
121. **23-H**
122. 07-B
123. 01-B
124. 08-H
125. 08-I/1
126. 10-F
127. 19-E téléphone
128. 19-F/1
129. 19-G/1
130. 19-G/2
131. 24-E équipe
132. 24-G comptes publiés
133. 25-G changer de métier
134. 25-H identité
135. **27-D1**
136. **27-D2**
137. **27-G**
138. **27-E1**
139. **27-F2**
140. 25-C assistant
141. 12-E
142. 11-B
143. 11-A
144. 11-E
145. 11-D
146. 11-F/1
147. 03-F
148. 06-D
149. **23-F**
150. 06-E
151. 06-C2
152. 19-H fiche
153. 24-J vendeur par code
154. 11-C
155. 12-D/2
156. 03-G
157. **27-E2**
158. 01-C
159. 02-F
160. 02-G
161. 16-D
162. 17-F
163. 18-I
164. 09-I
165. 10-H
166. 16-F
167. 15-H
168. 17-H1
169. 04-F
170. 04-G
171. 04-I
172. 06-F
173. 19-F/2
174. 24-H rôles
175. 07-J
176. 07-I
177. 10-G
178. 10-I
179. 11-G
180. 10-J
181. 11-F/2
182. 10-K
183. 03-I
184. 18-H1
185. 18-H2
186. 02-H
187. 03-J
188. 15-E
189. 03-C
190. 06-G
191. 17-H2
192. 03-K
193. **23-J**
194. 03-L
195. 13-H
196. 16-G
197. 01-F
198. 06-H
199. 04-H
200. 08-J
201. **21-C**
202. 08-L
203. 08-C/2
204. 07-L
205. 08-I/2
206. 16-H
207. 17-J
208. 13-I
209. 11-H
210. 17-G
211. 17-I
212. 01-G
213. 14-D
214. **23-I**
215. **27-I**
216. 24-F verrou
217. 24-A2 table à l’écran
218. 09-J

Plus tard : 14-E, 14-F, plafond en jours, appareils, anonymisation, 23-G étape 2.

## 8. Oublis

1. **Aucun reçu d'acompte, un faux reçu à l'imputation.** `PDFService.ts` n'a aucun gabarit d'acompte : 20 000 remis, aucun papier. Le reçu n° 163 de l'imputation dit « MONTANT REÇU 14 960 FCFA · Espèces · Encaissé par : - ». Pour 27-G.
2. **La comptabilité perdra son dernier jour après 03-C.** Écritures de paiement datées à minuit, donc balance du jour juste ; celles des factures portent l'heure (`13:27:22`) sans `compte_numero`. Visibles après 03-C, `BETWEEN '…-27'::timestamp` les exclura. Pour 23-A.
3. **La conversion perd aussi les remises de ligne** (+126 000 sur 1 114 000). La fiche 27 ne cite que la globale ; 03-A teste les deux.

## 9. Erreurs dans les fiches

- **27** : D1 vise facture et avoir, sans remise globale ; D5 oublie les acomptes.
- **23** : D1 oublie la comptabilité ; D4 surestimé ; le 500 de conversion ne vient pas de la 113.
- **21** : 21-A « dépend de rien » (16-A) ; G1 non reproductible : l'échéance est le jour de la facture.

## Questions nouvelles

71. Rapport du soir par WhatsApp (08-L) au premier mois, juste après 23-E ?
72. « Imprimer » ouvre le PDF du serveur : un geste de plus, acceptable ?
73. Un reçu numéroté à chaque acompte (proposé) ?
74. Acompte imputé à la facture suivante sur les plus anciennes (aujourd'hui), ou au choix du vendeur ?
75. Supprimer `POST /devis/:id/convert` (proposé) ?
76. La dette d'un client supprimé reste-t-elle dans la prévision et l'accueil (proposé : oui) ?

## Non vérifié

Vraies imprimantes, rendu du ticket ; acompte imputé un autre jour (date non réglable par l'API) ; vitesse ; gênes.
