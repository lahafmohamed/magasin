# Vague 10 · Contre-expertise (fiches 28, 29, 30)

27/11/2026, `nolyx_audit_4`, scripts `%TEMP%\nolyx-agents\vague10-4\`. Front de **production** construit dans `%TEMP%`, servi sur 6164 par un relais qui coupe à la demande (avant le serveur, après sa réponse, pendant son travail), service worker actif. Bases `nolyx_audit_4x_r` et `nolyx_audit_4x_neuf`, serveur 6174, relais, conteneur nginx 1.27.5 : supprimés. Laissé : caisse 2 clôturée à l'attendu (60 000), session 3 ouverte (caissier, 20 000), FAC-2026-00204 à 00208, INV-2026-00001 annulé, une note CRM.

## 1. Résultat

38 défauts ou absences : **33 confirmés, 3 nuancés, 1 faux, 1 non rejoué**. Fiche 29 : tout à l'écran. Fiche 28 : côté serveur, sauf D2 et G1. Explications innocentes cherchées (« erreur JSON polie » voulue, `sw.js:59` ; renvoi normal de Chrome ; séquence gardée par `pg_dump` ; pare-feu possible) : aucune ne retire un défaut.

## 2. Défauts

| N° | Statut | Preuve |
|---|---|---|
| 28-D1 | Confirmé | Cron `0 2 * * *`, dumps sur le même serveur ; dump 442 ms |
| 28-D2 | Confirmé, élargi | Point 2, oubli 2 |
| 28-D3 | **Nuancé, pire** | `TRUNCATE … CASCADE` : **42 tables**, dont `ecritures_comptables`, `retours`, `inventaire_lignes`, `commissions_ventes` ; `.env` du dossier courant, aucune garde (lu) |
| 28-D4 | Confirmé, élargi | Point 3 |
| 28-B2 | Confirmé (lu) | `provision-client.sh:101-105` |
| 28-B4 | Confirmé | Point 4 |
| 28-B5, B6 | Confirmés (lu) | `test-restore.sh:44-47` sort 0 ; `migrate.mjs:105-128` |
| 28-G1 | Confirmé | Conteneur : `/`, `/api/health`, défi ACME → page anglaise ; drapeau retiré → 200 |
| 28-G2 | Confirmé | `0.0.0.0:6144`, `[::]:6144` ; `X-Forwarded-For: 198.51.100.23` → journal 198.51.100.23 |
| 28-G3, G4 | Confirmés (lu) | Application propriétaire ; dumps en clair, sans `umask`, et `www-data` traverse `$HOME` (`provision-client.sh:148-152`) |
| 28-G5 | Confirmé | `Server: nginx/1.27.5`, aucune CSP |
| 28-G6 | Confirmé | Point 5 |
| 28-G7 | **Nuancé** | Trois fichiers suivis (point 5) ; contenu non jugé, visibilité du dépôt inconnue |
| 28-G9, G11 | Confirmés (lu) | `ci.yml:77-81` ; `.env` sans `CAISSE_GL_POSTING` |
| 29-D1 | Confirmé | Coupé avant le serveur : factures 201 → 201, huile 431 → 431 ; « Vente enregistrée · Ticket — · Montant indisponible » |
| 29-D2 | Confirmé | « Paiement de 5 000 FCFA enregistré. Facture soldée. » ; FAC-200 : 84 480 payés avant et après |
| 29-D3 | Confirmé | « Caisse clôturée » ; session 3 `ouverte` |
| 29-D4 | Confirmé (lu) | `POST` coupé → 200 `{"success":false,"error":"Hors ligne"}` ; `CaisseV2.tsx:738-743` |
| 29-D5 | Confirmé | FAC-206 créée, stock −1, même écran ; 2 envois, 1 facture |
| 29-D6 | **Nuancé** | Pas de faux succès : la page plante ; le passage est perdu (3 → 3) |
| 29, « la clé a tenu » | **Faux** | Oubli 1 |
| 29-D8 | Confirmé | Rechargement coupé : page d'erreur du navigateur |
| 29-D10 | Confirmé (poids) | `logo.png` JPEG de 473 850 octets ; `vendor` 1 079 Ko (341 compressé), `xlsx` dedans ; temps 3G non mesurés |
| 29-D12, D15 | Confirmés | 0 `navigator.onLine`, `BarcodeDetector`, `getUserMedia` |
| 30, dix absences | Confirmées | Ni couleur ni variante en base ; riz 0,5 → 400 ; 0 fidélité, promotion, table SAV, route d'import, `wa.me`, « abonnement » ; menu : « Raccourcis clavier » ; note client : vendeur 403, caissier 403, gérant 201 ; suspension 503 partout |
| 30, livreur, kit, devises, budget | Non rejoués | — |

## 3. Points précis

**1. Hors ligne.** Rejoué (tableau). La clé protège un renvoi qui arrive **après** l'enregistrement (FAC-206), pas pendant le travail du serveur (oubli 1) : elle est cherchée avant la transaction (`VenteComptoirService.ts:72`). **29-A puis 07-A, sans fusion** : 29-A rend l'erreur visible, seul 07-A empêche la double vente. « Après une erreur réseau, interroger la clé » passe de 07-A à 29-B ; 07-A garde la route.

**2. Numéros.** `NumberingService.ts:38` : `nextval('facture_numero_seq')`. Le dump fige la séquence (201) ; restaurée, elle redonne 202, 203, puis **FAC-2026-00204**, déjà remis (huile, 15:11:58). Un saut (`setval` + 1 000) ne réutilise rien et laisse un trou, comme chaque vente refusée (oubli 2). Il doit toucher **toutes** les séquences de `NumberingService`, être écrit au journal et montré à l'admin (28-B).

**3. `update-client.sh`.** L.11 `set -e` ; l.67 `update_one … ||` : bash ignore alors `-e` dans la fonction **et ses sous-shells**. Sauvegarde ratée (26-31) : on continue sans ; `git pull` (43), compilations (45-46), migration (47) ratés : on continue ; l.49 redémarre le nouveau code sur une base à moitié migrée ; l.54-55 « à jour, health check OK » ; code 0. Rejoué sur une copie : deux clients « à jour », code 0. Un seul client (l.71) : arrêt, code 1, après les compilations. **Le remède de 28-D (`( set -euo pipefail … )`) ne marche pas** (rejoué) : il faut un processus enfant (`bash "$0" "$SLUG" ||`) ou `|| return 1` à chaque étape.

**4. Baseline.** Copie du bootstrap dans `%TEMP%` plus `114_essai_oubli_v10.sql` (une colonne) : « Baselined 119 », ✓ sur 114, « up to date », colonne absente. Cause : `ci-db-setup.mjs:126-131` lance `--baseline`, qui marque tout fichier présent (`migrate.mjs:79-84`). **Contrôle minimal** : `ci-baseline.sql` porte en tête son dernier numéro ; `ci-db-setup` marque jusque-là et **joue** la suite ; la CI échoue si un fichier le dépasse sans baseline régénéré. Une empreinte comparée au baseline ne voit rien : la mienne (1 930 objets, moins de 0,1 s) est identique sur la base neuve, la fautive, le banc et la restauration. Elle sert ensuite chez chaque client, contre celle publiée par la CI (28-E).

**5. Sécurité.** Secret JWT en clair dans `ecosystem.config.js` au commit `dd971e0`, retiré par `2af4127` ; absent de l'arbre et du `.env` local, pas refusé au démarrage (`auth.ts:17-20`) ; production non vérifiée. Suivis par git : `seed-clients-excel.mjs` (depuis `f980ac0`), `seed-fournisseurs-excel.mjs`, `prospects-2026-11-11.csv` (976 lignes, 660 avec un numéro), clonés chez chaque client. API sur toutes les interfaces, premier `X-Forwarded-For` cru. Suspension : l'`if` du niveau `server` se rejoue sur la redirection vers `/suspendu.html`, d'où la page anglaise de nginx ; le défi de certbot reçoit 503.

**6. Rangs de la fiche 30.** Exacts : 19-G 144-145, 25-C 155, 11-F/1 161, 03-G 172, 10-H 182, 07-J 192, 10-G 194, 10-I 195, 10-J 197, 10-K 199, 03-I 200, 03-J 204, 07-L 228. Son verdict dit « 182 à 228 » : c'est **144 à 228**.

## 4. Verdicts

- **28 « Améliorer » : maintenu, réduit.** Contre : aucun client, onze lots, louer un hébergement géré. Tient pour l'ampleur (28-K absorbé, 28-D et 28-G découpés), pas pour l'urgence : les cinq lots S de tête font moins de trois jours et arrêtent des pertes prouvées.
- **29 « Améliorer », 29-A d'abord : maintenu.** Contre : supprimer service worker et manifeste. Tient pour 29-A : un `sw.js` qui se désinscrit, toujours servi, plus l'intercepteur. Ne suffit pas : la double vente reste (07-A).
- **30 : maintenu, borné.** Contre : le cadrage met le métier (priorité 4) après 1 à 3. Tient en partie : un bloc ne passe ni avant les erreurs d'argent ni avant ses dépendances (24-I, 10-C, 13-G, 10-F) ; je le place après le socle (rang 104), avec l'installation. 30-A : contact seul ; 30-B : préavis et page, lecture seule selon sa question 3 ; 30-C selon sa question 5.

## 5. Propriétaires

| Sujet | Propriétaire |
|---|---|
| Faux succès hors ligne / double vente par renvoi | **29-A** / **07-A** |
| Dire si c'est passé | **29-B** (route de 07-A) |
| Logo de l'application, icônes | **29-D** étape 1 ; 25-D garde le logo du commerçant |
| Caméra / vente hors ligne | **29-E** après 10-F / **29-G** plus tard |
| Sauvegarde / restauration et saut | **28-A** / **28-B** |
| Mise à jour / schéma | **28-D1**, **28-D2** / **28-E** |
| Installation serveur / écran / reprise | **28-F** / **25-C** / **10-G**, **19-G** (un classeur) ; 28-K absorbé ; 08-G inchangé |
| Dette fournisseur de départ | Facture à ligne libre (fiche 30), gardée par 18-F |
| Démo / comptes de démo chez un client | **28-G1**, **28-G2** / **24-G** |
| Suspension / abonnement | **28-H** (page, défi) / **30-B** (préavis, état) |
| Journal en ajout seul / droits PostgreSQL | **26-B** / **28-I** |
| Secrets, en-têtes, port, `trust proxy` | **28-J** |
| Aide et support / dépôt SAV | **30-A** / **30-C** (après 10-K) |

28-G1 (S) : seed refusé hors base marquée démo, réparé ; 28-G2 (M) : démos par métier, remise complète. 28-D1 (S) : échec = arrêt, code 1 ; 28-D2 (M) : version testée, retour arrière.

## 6. Blocs de métier

| Bloc | Lots (rang vague 9 → nouveau) |
|---|---|
| Tous | 10-F (141 → 105), 10-G (194 → 108), 19-E (142 → 109), 19-G (144-145 → 110-111), 25-C (155 → 112), 28-F (114) |
| Informatique | 10-K (199 → 117), 03-G (172 → 118), 03-I (200 → 119), 30-C (120) |
| Habillement | 10-J (197 → 121), 11-F/1 (161 → 122), 07-J (192 → 123) |
| Alimentaire boutique | 10-H (182 → 124), 10-I (195 → 125), 07-L (228 → 155, après 07-H) |
| Grossiste | 10-H, 03-J (204 → 126), 19-G |

Le bloc du métier choisi passe en tête des rangs 117 à 126.

## 7. Ordre complet (265 lots ; nouveaux en gras, déplacés en italique)

1. **29-A**
2. **28-A**
3. **28-G1**
4. **28-D1**
5. **28-C**
6. **28-E**
7. 08-G
8. 10-E
9. 13-B
10. 08-A
11. 04-B
12. 07-A
13. 13-A
14. 09-A
15. **28-B**
16. **28-J**
17. **29-C**
18. 22-A
19. 26-C1
20. 26-B
21. 26-A1
22. **28-I**
23. 10-A/1
24. 10-A/2
25. 07-C
26. **29-B**
27. 10-B
28. 12-A
29. 15-A
30. 12-B
31. 15-C
32. 12-C
33. 12-D/1
34. 13-C
35. 13-D1
36. 13-E/1
37. 26-A2
38. 26-C2
39. 23-B
40. 03-B
41. 03-A
42. 23-A
43. 27-A
44. 02-B
45. 02-A
46. 15-B
47. 06-A
48. 02-C
49. 01-A
50. 05-A/1
51. 05-A/2
52. 19-A
53. 04-A
54. 05-B
55. 27-B1
56. 05-D
57. 15-D
58. 12-F
59. 05-C
60. 16-A
61. 21-A
62. 16-B
63. 17-A
64. 17-B
65. 04-J
66. 08-D
67. 07-F
68. 04-E
69. 23-C
70. 08-B
71. 18-B
72. 08-C/1
73. 08-K
74. 18-C
75. 17-E
76. 17-C
77. 04-D
78. 09-C
79. 03-D
80. 02-D
81. 23-D
82. 21-B1
83. 27-C
84. 24-A1
85. 24-B
86. 25-F
87. 24-I
88. 10-C
89. 03-E
90. 15-G
91. 15-F
92. 06-B
93. 14-A
94. 13-E/2
95. 14-B
96. 14-C
97. 08-E
98. 13-D2
99. 13-G
100. 25-B
101. 25-E
102. 13-F
103. 23-E
104. 21-B2
105. *10-F*
106. **29-D**
107. **29-E**
108. *10-G*
109. *19-E*
110. *19-G/1*
111. *19-G/2*
112. *25-C*
113. **28-D2**
114. **28-F**
115. **28-H**
116. **30-A**
117. *10-K*
118. *03-G*
119. *03-I*
120. **30-C**
121. *10-J*
122. *11-F/1*
123. *07-J*
124. *10-H*
125. *10-I*
126. *03-J*
127. *24-G*
128. **28-G2**
129. 26-D1
130. 06-C1
131. 09-B
132. 07-D
133. 27-F1
134. 19-B
135. 24-D
136. 24-C
137. 25-D
138. 25-A
139. **30-B**
140. 19-C
141. 19-D
142. 27-H
143. 01-E
144. 04-C/1
145. 04-C/2-3
146. 18-E
147. 18-D
148. 27-B2
149. 18-F
150. 16-C
151. 08-F
152. 10-D
153. 07-H/1
154. 07-H/2
155. *07-L*
156. 02-E
157. 05-E/1-2
158. 05-E/3
159. 05-F
160. 09-E
161. 09-F
162. 20-D
163. 20-A
164. 20-C
165. 20-B1
166. 20-B2
167. 20-E1
168. 20-G
169. 20-F
170. 17-D
171. 09-H
172. 23-G1
173. 23-H
174. 07-B
175. 01-B
176. 08-H
177. 08-I/1
178. 19-F/1
179. 24-E
180. 25-G
181. 25-H
182. 27-D1
183. 27-D2
184. 27-G
185. 27-E1
186. 27-F2
187. 12-E
188. 11-B
189. 11-A
190. 11-E
191. 11-D
192. 03-F
193. 06-D
194. 23-F
195. 26-D2
196. 06-E
197. 06-C2
198. 19-H
199. 24-J
200. 11-C
201. 12-D/2
202. 27-E2
203. 01-C
204. 02-F
205. 02-G
206. 16-D
207. 17-F
208. 18-I
209. 09-I
210. 26-E
211. **29-F**
212. 16-F
213. 15-H
214. 17-H1
215. 04-F
216. 04-G
217. 04-I
218. 06-F
219. 19-F/2
220. 24-H
221. **29-H**
222. **29-I**
223. 07-I
224. 11-G
225. 11-F/2
226. 18-H1
227. 18-H2
228. 02-H
229. 15-E
230. 06-G
231. 22-B
232. 22-C
233. 22-D
234. 22-E
235. 22-G
236. 22-H
237. 22-F
238. 17-H2
239. 03-K
240. 22-I
241. 23-J
242. 03-L
243. 13-H
244. 16-G
245. 01-F
246. 06-H
247. 04-H
248. 08-J
249. 21-C
250. 08-L
251. 08-C/2
252. 08-I/2
253. 16-H
254. 17-J
255. 13-I
256. 11-H
257. 17-G
258. 17-I
259. 01-G
260. 14-D
261. 23-I
262. 27-I
263. 26-F
264. 24-F
265. 24-A2

Plus tard : 29-G, guides de 30-A, lecture seule de 30-B si refusée, 14-E, 14-F, plafond en jours, appareils, anonymisation, 23-G étape 2, 20-E étapes 2-3, 20-H, 20-I.

## 8. Oublis

1. **Chrome vend deux fois tout seul.** Connexion coupée pendant le travail du serveur : Chrome renvoie 7 ms plus tard. FAC-2026-00207 payée et **FAC-2026-00208 « en attente », 0 paiement** ; huile 430 → 428 pour une vente ; 1 400 dus inventés au client comptoir ; écran « Vente enregistrée ». Pour 07-A : clé écrite sur la facture dans la transaction, test « renvoi pendant le travail ».
2. **Une vente refusée brûle un numéro.** Espèces insuffisantes (422) : FAC-2026-00202 et 00203 n'existent pas ; la base restaurée les a émises. Pour 28-B, question 93.
3. **La mise à jour de tous saute aussi une sauvegarde ratée**, et le remède de 28-D ne marche pas (point 3).

## 9. Erreurs dans les fiches

- 28 : « 32 tables » (42) ; 28-E compare au baseline et ne voit pas B4 ; remède de 28-D faux ; 28-H mêle page et port ; dette fournisseur de départ déjà possible.
- 29 : « la clé a tenu à chaque essai » ; D6 plante, sans faux succès ; icônes dans 29-D et 29-I.
- 30 : « 182 à 228 » ; « 10-H/1 » non découpé dans l'ordre ; 07-L ne peut précéder 07-D et 07-H (132, 154) ; l'étape 2 de 30-C attend 03-L (242).

## Questions nouvelles

93. Accepte-t-on des trous de numérotation (un par vente refusée), ou un numéro donné seulement à l'enregistrement réussi ?
94. Retire-t-on tout de suite le service worker (proposé) ?
95. Le pare-feu ferme-t-il les ports des API ? (à vérifier par le propriétaire)
96. Mise à jour : démo, puis un client pilote, puis les autres (proposé) ?
97. Prospects et clients suivis par git : supprimés du dépôt et de l'historique (proposé) ?

## Non vérifié

Production, pare-feu, visibilité du dépôt, vrais téléphones, temps en 3G, 29 D7 et D9, renvoi de Chrome sur réseau mobile, rotation pm2, livreur, kit, devises, budget.
