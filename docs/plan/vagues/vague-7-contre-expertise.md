# Vague 7 · Contre-expertise (fiches 19, 24, 25)

27/11/2026, `nolyx_audit_4`, scripts `%TEMP%\nolyx-agents\vague7-4\`. Créés par l'API : TI-00014 à 20, FAC-2026-00202 à 210, comptes `t7*`. Caisse du banc clôturée **à 0 compté (écart −60 000, erreur de mon script)**, sans effet sur les constats ; session 3 ouverte. **Plus de Client comptoir en base 4.** Paramètres remis.

## 1. Résultat

23 défauts rejoués (dépôt et lecteur comptés une fois) : **21 confirmés, 2 nuancés, 0 faux, 0 non rejoué**. « Lu » = vu dans le code. Gênes rejouées, toutes vraies : 19-D13, D14 ; 24-D11 à D14.

## 2. Défauts rejoués

| N° | Statut | Preuve | Atteint |
|---|---|---|---|
| 19-D1 dette effacée | Confirmé | Point 1 | Écran |
| 19-D2 Client comptoir | **Nuancé** | Point 2 : seule la vente anonyme meurt | Écran (admin) |
| 19-D3 doublons | Confirmé | Caissier : même nom, « 07 08 09 10 12 » et « 0708091012 » : 201 ×3, plafond 0 | Écran |
| 19-D4 nommer | Confirmé | Point 3 | Écran |
| 19-D5 recherche | Confirmé | « 0708091012 » : 1 fiche sur 3 ; « +225… », « Jean-Marc », « KOUASI » : 0 ; « % », « _ » : 17 (tous) | Écran |
| 19-D6 numéro en nom | Confirmé (lu) | `NouveauClientDialog.tsx:90` | Écran |
| 19-D7 20 caractères | Confirmé | 400 « Too big: expected string… » | Écran |
| 19-D8 dette au comptoir | Confirmé (lu) | `routeAccess.ts:156-157` : gérant, admin | Écran |
| 19-D9 import | Confirmé (lu) | Aucune route | — |
| 19-D10 = 24-D1 argent lu | Confirmé | Point 4 | API |
| 24-D2 lecteur | Confirmé, élargi | Menu vide ; pièce jointe sur la facture 3 : lecteur **et dépôt** 201 | API |
| 24-D3 acomptes | **Nuancé** | Point 5 | API |
| 24-D4 flux | Confirmé | Désactivé (`/auth/me` 401) ou rétrogradé : reçoit « FAC-2026-00207 — V7 Notif : 1 400 FCFA » | Écran (onglet ouvert) |
| 24-D5 comptes publiés | Confirmé (lu) | Point 6 | API |
| 24-D6 autre boutique | Confirmé | Vendeur MAG-2 seul : FAC-204 (MAG-1) 201 ; sans site : FAC-205 à MAG-1 | Écran |
| 24-D7 sans e-mail | Confirmé | 201 puis 409 ; écran 390 : « Ce nom d'utilisateur existe déjà » (capture `v7-creation-sans-email`) | Écran |
| 24-D8 gérant | Confirmé | Créer 403, désactiver 403 | Écran |
| 24-D9 mot de passe oublié | Confirmé (lu) | `Login.tsx:146` | Écran |
| 24-D10 admin | Confirmé | `t7adm` se passe lecteur : 200 ; aucune garde du dernier admin (`AdminUserService.ts`) | Écran |
| 25-D1 logo | Confirmé | Point 7 | Écran |
| 25-D2 grossiste | Confirmé | `alimentaire` : 400 ; « libre-service » cache devis et BL (`profilsActivite.ts:51`) | Écran |
| 25-D3 caisse cachée | Confirmé | Caissier : « Module désactivé » ; `/caisse/magasins` 200 (masquage visuel) | Écran |
| 25-D7 journal caché | Confirmé | Point 8 | Écran |

## 3. Points précis

**1. 19-D1 : suppression logique.** `softDelete` pose `deleted_at` (`TiersController.ts:131-141`) : les clés en RESTRICT (089) ne jouent jamais. A (7 000) supprimé, B (14 000) décoché par le gérant. Chiffre d'affaires inchangé (61 480 100), facture listée au nom de A. Mais **deux dettes** : accueil 20 718 785, Relances 20 697 785 (−21 000, `ReportingService.ts:108-109`). Fiche, compte et relevé de A : 404 ; B : 200.

**2. 19-D2 : la vente anonyme meurt, pas la vente.** Gérant : plafond 500 000 sur le Client comptoir, 200. Admin le supprime : 200 ; `/tiers/comptoir` 404 ; vente sans client 422 « …ou choisissez un client » ; vente nommée **201** (FAC-210). 5 171 654 F sortent des relances. Recréé avec `code: 'PASS'` : code ignoré (TI-00020), toujours 404. La 104 ne tourne qu'une fois (baselinée sur base neuve) ; rien d'autre ne protège.

**3. 19-D4 : rejoué à 390 et 1440.** « Nommer le client », puis × deux fois : toujours « Client comptoir PASS », aucun champ (capture `v7-comptoir-390-b`).

**4. 24-D1/D2 et 19-D10 : qui lit l'argent.**

| Route | Dépôt | Lecteur |
|---|---|---|
| `/factures`, `/:id`, `/export`, `/stats` (61 459 100), `/revenue-trends`, `/top-clients` | montants | montants |
| `/paiements`, `/stats` ; `/devis` | montants | montants |
| `/factures-fournisseur`, `/stats` | montants | montants |
| `/tiers`, `/:id`, `/compte`, `/releve-detaille`, relevé PDF | soldes, plafonds | idem |
| `/commandes`, `/produits` | **masqués** | montants, prix d'achat |
| `/reports`, `/general-ledger`, `/comptabilite`, `/employes`, `/payroll`, `/admin` | 403 | 403 |
| `POST /attachments` | **201** | 201 |

`roleRedaction.ts:8` ne vise que `depot_staff`, dans cinq contrôleurs de stock et d'achat : son commentaire borne la décision d'octobre aux « écrans de réception, de stock et de transfert » ; `CLAUDE.md` dit « le dépôt ne voit que des quantités ». Traduction trop étroite. Le lecteur n'est masqué nulle part.

**5. 24-D3 : porte ouverte, effet rare.** Caissier et vendeur sont listés (`acomptes.ts:18`), mais l'acompte fournisseur s'impute seul à la création (094) : 3 000 créés, aussitôt `utilise` ; caissier : 422 « restant 0 », pas 403. L'acompte client au comptoir (`tiers.ts:35`) est voulu.

**6. 24-D5 : base neuve sûre, démonstration non.** `nolyx_audit_neuve` : seul `admin` ; `ci-ref-data.sql` : aucun compte. `ci-db-setup.mjs:92` : `admin123` seulement en CI. `provision-client.sh:106-108` : mot de passe tiré au hasard, changement imposé. Sur base héritée, le changement imposé ne demande que l'ancien mot de passe (`auth.ts:83-92`, `AuthController`) : qui connaît `manager123` prend le compte (lu). **Mais** l'instance `--demo` crée l'admin `demo` / `Demo2026!`, publié, sans changement imposé (`provision-client.sh:101-104`) : un visiteur change le mot de passe et garde la démo ; le reset de nuit ne touche pas `utilisateurs` (et échoue).

**7. 25-D1.** `logo.png` réel, 463 Ko (617 Ko en JSON) : 500 « Erreur interne du serveur ». `server.ts:114` : `express.json()` à 100 Ko ; `/api/attachments` a 15 Mo (`:113`).

**8. 25-D7.** Gérant cache `journal-audit` et `parametres-finance` : 200. Admin : « Module désactivé » sur les deux. `audit_log` 185 : `user_id` vide. Innocent : l'admin peut tout rouvrir ; il ne sait pas qui.

**9. 25-D9, D10.** Gérant : devise `USD`, 200. FAC-2026-00003 réimprimée : « USD » dans le PDF (absent avant), écran 10 000. Libellés NIF et AI : `CompanySettings.tsx:270-272`.

## 4. Verdicts

- **19 « Simplifier » : maintenu.** Contre : grossiste et informatique suivent des entreprises (Sage vend l'analyse). Ne tient pas : une note datée couvre « rappeler vendredi » ; 19-D garde le classement dans la liste.
- **24 « Améliorer » : maintenu, réduit.** Contre : trois rôles suffisent à une boutique. Tient en partie : six rôles, « dépôt » caché sans dépôt ; appareils et table à l'écran plus tard ; comptable après la fiche 22.
- **25 « Simplifier » : maintenu.** Contre : l'installateur règle déjà chaque client. Tient en partie : 25-C en fin de bloc, critère mesurable.
- **Tableau des profils (fiche 25, section 6) : deux écarts.** « À racheter » est rangé sous Commandes, cachées en boutique, alors que la fiche 16 veut cette liste en alimentation boutique : la séparer, visible partout. Étiquettes cachées chez le grossiste, alors que 11-G (rayonnage) lui manque dès le premier mois : l'assistant doit le proposer. Reste conforme (13-F, 14, 15-F, 16, 17-D, question 40).

## 5. Lots

- **Trop gros** : 24-A → **24-A1** fermer les lectures et écritures (table, `authorize`, test rôle × route ; S-M) et **24-A2** table servie à l'écran (M, confort). 24-F : verrou par compte et échecs journalisés seulement ; `reset-password.sh` à la fiche 28.
- **Dépendance oubliée (vague 6)** : 10-C (plancher), 08-B, 08-E, 12-D supposent l'accord du gérant, placés avant tout PIN. Tranché : 24-I passe avant 10-C ; d'ici là, « réservé au gérant ». 19-A ne dépend pas de 04-A : il refuse dès qu'une pièce existe. 25-C dépend de 25-H.
- **Invérifiables** : 25-C « 10 minutes sans aide » → assistant rempli par script, vente en espèces 201 ; 19-G « 200 clients en une heure » → 200 lignes importées, 0 erreur ; 24-I « 06-C2 l'emploie » → un accord écrit pour une remise test.
- **Pas au premier mois** : anonymisation (question 63), troisième numéro de 19-E.

## 6. Propriétaires

| Sujet | Propriétaire | Cité par |
|---|---|---|
| Droits tenus par le serveur, qui lit quoi | **24-A1** (table, test) | 19-I absorbé ; 03-E, 06-E, 08-E appliquent leur ligne |
| Code PIN, accords | **24-I** | 06-C2, 08-E, 10-C, 08-B, 12-D, 05-F, 07-E, 09-B |
| Caisse partagée, changer de vendeur | **24-J** (qui vend) | 08 garde le tiroir (question 5) |
| Création des comptes / affectation | **24-D** / **13-C** | 24-C retire les portes en double |
| Gérant : équipe / réglages | **24-E** / **25-F** | lignes de 24-A1 |
| Notifications après coupure | **24-B** | fiche 26 |
| Archiver au lieu de supprimer / chiffre de la dette | **19-A** / **04-A** | 06-A garde le plafond du Client comptoir |
| Nommer le client au comptoir | **19-B** | 07-H le reprend ; 06-A |
| Recherche / téléphone / doublons | **10-F** / **19-E** / **19-F** | NCC du client : 03-L |
| Import, dette de départ | **19-G** | fiche 28 l'emploie, fiche 22 écrit |
| Analyse clients | **19-D** | fiche 23 ne la recrée pas |
| Caché partout, serveur compris | **25-E** | 13-F y branche la taille |
| Profils / tailles | **25-B** / **13-F** | question 40 tranchée dans 25-B |
| Assistant de démarrage | **25-C** | 08-G, 13-G créent ; fiche 28 préremplit |
| Identité légale / logo / impression | **25-H** / **25-D** / **fiche 27** | 03-L (FNE) |
| Écran de vente par défaut | **07-H** | 25-I absorbé |

## 7. Ordre d'exécution (nouveaux en gras)

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
18. 12-D étape 1
19. 13-C
20. 13-D1
21. 13-E étape 1
22. 03-B
23. 03-A
24. 02-B
25. 02-A
26. 15-B
27. 06-A
28. 02-C
29. 01-A
30. 05-A étape 1
31. 05-A étape 2
32. **19-A archiver**
33. 04-A
34. 05-B
35. 05-D
36. 15-D
37. 12-F
38. 05-C
39. 16-A
40. 16-B
41. 17-A
42. 17-B
43. 04-J
44. 08-D
45. 07-F
46. 04-E
47. 08-B
48. 18-B
49. 08-C étape 1
50. 08-K
51. 18-C
52. 17-E
53. 17-C
54. 04-D
55. 09-C
56. 03-D
57. 02-D
58. **24-A1 droits serveur**
59. **24-B coupure**
60. **25-F réglages au patron**
61. **24-I PIN**
62. 10-C
63. 03-E
64. 15-G
65. 15-F
66. 06-B
67. 14-A
68. 13-E étape 2
69. 14-B
70. 14-C
71. 08-E
72. 13-D2
73. 13-G
74. **25-B métier, options**
75. **25-E caché partout**
76. 13-F
77. 06-C1
78. 09-B
79. 07-D
80. **19-B nommer**
81. **24-D sans e-mail**
82. **24-C une porte**
83. **25-D logo**
84. **25-A une page**
85. **19-C notes**
86. **19-D analyse**
87. 09-D
88. 01-E
89. 04-C étape 1
90. 04-C étapes 2-3
91. 18-E
92. 18-D
93. 18-F
94. 16-C
95. 08-F
96. 10-D
97. 07-H étape 1 (absorbe 25-I)
98. 07-H étape 2
99. 02-E
100. 05-E étapes 1-2
101. 05-E étape 3
102. 05-F
103. 09-E
104. 09-F
105. 17-D
106. 09-H
107. 07-B
108. 01-B
109. 08-H
110. 08-I étape 1
111. 10-F
112. **19-E téléphone**
113. **19-F étape 1**
114. **19-G étape 1**
115. **19-G étape 2**
116. **24-E équipe**
117. **24-G comptes publiés**
118. **25-G changer de métier**
119. **25-H identité**
120. **25-C assistant**
121. 12-E
122. 11-B
123. 11-A
124. 11-E
125. 11-D
126. 11-F étape 1
127. 03-F
128. 06-D
129. 06-E
130. 06-C2
131. **19-H fiche**
132. **24-J vendeur par code**
133. 11-C
134. 12-D étape 2
135. 03-G
136. 01-C
137. 02-F
138. 02-G
139. 16-D
140. 17-F
141. 18-I
142. 09-I
143. 10-H
144. 16-F
145. 15-H
146. 17-H1
147. 04-F
148. 04-G
149. 04-I
150. 06-F
151. **19-F étape 2**
152. **24-H rôles**
153. 07-J
154. 07-I
155. 10-G
156. 10-I
157. 11-G
158. 10-J
159. 11-F étape 2
160. 10-K
161. 03-I
162. 18-H1
163. 18-H2
164. 02-H
165. 03-J
166. 15-E
167. 03-C
168. 06-G
169. 17-H2
170. 03-K
171. 03-L
172. 13-H
173. 16-G
174. 01-F
175. 06-H
176. 04-H
177. 08-J
178. 08-L
179. 08-C étape 2
180. 07-L
181. 08-I étape 2
182. 16-H
183. 17-J
184. 13-I
185. 11-H
186. 17-G
187. 17-I
188. 01-G
189. 14-D
190. **24-F verrou**
191. **24-A2 table à l’écran**
192. 09-J
Plus tard : 14-E, 14-F, plafond en jours, appareils, anonymisation.

## 8. Oublis

1. **Une facture réimprimée change d'émetteur.** Le gérant renomme l'entreprise et le RCCM : FAC-2026-00003 réimprimée porte « QZX Boutique » et « CI-QZX-2026 ». Les paramètres sont relus à l'impression (`PDFService.ts:113-118`). 25-A ne fige que la devise. Pour la fiche 27 et 03-L.
2. **La démonstration se vole** (point 6). Pour la fiche 28 et 24-G.
3. **Deux dettes après une suppression** : accueil et Relances diffèrent de 21 000 (point 1). Pour 04-A.

## 9. Erreurs dans les fiches

- **19** : D2 « la vente comptoir meurt » (la vente nommée passe) ; D1 omet l'accueil, qui garde la dette.
- **24** : D2 oublie le dépôt, qui écrit aussi des pièces jointes ; D3 ignore l'imputation automatique (094) et compte l'acompte client, voulu ; D5 oublie la démonstration.
- **25** : tableau de la section 6 (deux écarts, section 4) ; D9 limité à la devise.

## Questions nouvelles

57. Le gérant change-t-il écrans, métier, devise, identité légale ? Proposé : non ; il règle le ticket et sa boutique.
58. Le gérant embauche-t-il et renvoie-t-il le personnel de sa boutique (24-E) ?
59. En attendant le PIN, les lots qui demandent l'accord du gérant refusent-ils simplement (proposé) ?
60. Caisse partagée : un compte par personne avec changement par code (24-J), ou un compte par caisse ?
61. Démonstration : un compte par prospect, ou un compte commun remis chaque nuit, mot de passe compris ?
62. Une facture réimprimée garde-t-elle le nom, le NCC et le logo de son jour (proposé) ?
63. Anonymiser un client à sa demande : premier mois ou plus tard ?
64. Caissier et vendeur : un seul rôle ? Le comptable lit-il coût et marge ?

## Non vérifié

Changement imposé sur base héritée (aucune route ne pose l'état) ; limite de 10 échecs par IP ; vendeur au comptoir à l'écran ; texte complet des PDF.
