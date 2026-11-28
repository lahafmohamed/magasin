# 11 Étiquettes

> **Contre-expertise du 2026-11-27** ([détail](../vagues/vague-5-contre-expertise.md)) : Verdict maintenu, réduit. D1 : le code se lit sur image propre à 203 ppp, mais plus dès 0,25 point d'encre ; seuls les codes longs saisis à la main sont touchés, les EAN-13 internes passent partout. Seuil sûr : 2 points. D5 est bien un défaut des étiquettes (`produits.stock`, total des sites), pas du stock fantôme : 11-C. 11-A réduit (module entier de 0,125 mm), 11-D commence par le calage, 11-F en deux étapes ; 11-H et l'éditeur de 11-D plus tard. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-27, base jetable `nolyx_audit_2` (API 6142, interface 6152), interface et API réelles (gérant, admin, vendeur, caissier, dépôt, lecteur ; 1440 et 390 px). Aucun produit du banc n'avait de code-barres : tous les codes ont été créés ou saisis par l'ERP. Vérification des codes **indépendante de l'ERP** : motifs comparés à JsBarcode 3.11.6, planches imprimées rendues par Chromium à 203, 300 et 600 points par pouce (ppp), passées en noir et blanc, puis décodées par ZXing (`zxing-wasm` 1.3.4). Scripts : `%TEMP%\nolyx-agents\vague5-2\`. Captures : `%TEMP%\nolyx-captures\2\`.

## 1. Verdict

**Améliorer.** Le cœur est juste : codes internes uniques même à deux gérants, motifs exacts, case de départ, rôles tenus. Mais un code annoncé « lisible » ne se lit pas sur une imprimante thermique ordinaire, le papier est imposé, la quantité proposée compte le stock des autres sites, la taille d'un vêtement peut disparaître de l'étiquette, et rien ne se fait depuis une réception.

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire boutique / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Besoin | 3 | 2 | 5 | 3 / 2 | 3 | 3 |
| Réponse actuelle | 3 | 3 | 2 | 2 / 1 | 3 | 2 |

- **Habillement (5)** : chaque pièce porte prix et taille ; les vêtements importés n'ont souvent pas de code (supposé). Réponse 2 : taille coupée sur petit format, pas de quantité depuis la réception, pas de rouleau 40 × 30.
- **Alimentaire boutique (3)** : presque tout est déjà codé par le fabricant ; il faut des codes pour le vrac reconditionné (sachets de riz) et des **étiquettes de rayon**. Réponse 2 : le vrac oui, le rayon non.
- **Grossiste (2)** : cartons déjà codés ; étiquettes de rayonnage et de carton. Réponse 1.
- **Informatique (2)** : boîtes codées ; accessoires en vrac (câbles, souris). Réponse 3 pour ce petit besoin.
- **Plusieurs sites** : le dépôt reçoit, mais n'a pas accès à la page (choix voulu : il ne voit pas les prix). Quantité proposée = stock de tous les sites.

Utile dès le premier mois pour l'habillement et le vrac ; secondaire ailleurs.

## 3. Parcours réel

| Rôle | À l'écran | Ce qui surprend |
|---|---|---|
| Gérant, admin (1440) | Inventaire → chercher « Chemise » → tout cocher → « Imprimer les étiquettes » → « Créer les codes-barres » → format → « Imprimer » → boîte du navigateur (marges « Aucune », échelle 100 %) → Imprimer : **8 gestes**. Double clic sur « Créer » : **1 seul envoi** | Aperçu de la **première** étiquette seulement. Aucune indication de l'imprimante attendue |
| Vendeur (1440, 390) | Menu de ligne « Imprimer l'étiquette », un produit à la fois (aucune case à cocher). Produit sans code : « Demandez à un gérant de les créer ». Téléphone : page lisible, une colonne | Pas de sélection multiple : la barre est réservée à admin, gérant, dépôt (`Inventaire.tsx:76`), et le dépôt n'a pas la page |
| Caissier, dépôt, lecteur | « Accès réservé ». API `POST /produits/codes-barres` : **403** pour les quatre | Conforme à `routeAccess.ts:81-85` |

| Scénario | Gestes | Constat |
|---|---|---|
| « Je reçois 40 chemises » | Étiquettes → chercher → taper 40 → Imprimer → boîte : 5 par taille, ×3 tailles | Aucun lien depuis la réception (fiche 17, lot 17-G). Le bouton « Une étiquette par article en stock » propose **97** pour la chemise M de MAG-1, qui n'en a qu'**une** |
| « Le prix change, je réimprime » | Fiche produit → Étiquettes → chercher → quantité devinée → Imprimer | L'ERP ne garde **aucune trace** d'impression : impossible de savoir quels articles portent l'ancien prix |
| « Tout un rayon » | Inventaire filtré → 100 produits au plus par page (`pagination.tsx:88`) → imprimer → page suivante → **nouvelle liste vide** | Sur A4, chaque paquet repart sur une planche neuve, sauf calcul à la main de « Commencer à » |

## 4. Défauts prouvés

### Argent et stock

Aucun : l'étiquette ne touche ni l'argent ni le stock. Ce qui tient (prouvé) :

- **Unicité** : après 300 attributions, 306 codes en base, 306 distincts ; 4 envois simultanés (deux gérants, double clic) → codes 1 à 4, aucun doublon, aucun trou (`CodeBarreService.ts:32-38`, verrou `FOR UPDATE` trié).
- **Code saisi à la main dans la plage** : produit créé avec `2000000000053` (numéro suivant), l'attribution saute à `…060`.
- **Jamais d'écrasement** : un produit codé rend `cree: false` ; le code accentué `SSD-1To-Été` est gardé.
- **300 produits d'un coup** : 1,9 s ; 300 EAN-13 valides, préfixe 20 ; 305 lignes au journal d'audit. Écran : 200 produits au plus par lien (`Etiquettes.tsx:89`), 100 par page d'inventaire.
- **Motifs** : 10 codes (3 EAN-13, 2 Code 128 C, 5 Code 128 B) **identiques à JsBarcode**. **ZXing lit 46 étiquettes sur 46 à 300 et 600 ppp**, 45 sur 46 à 203 (D1) ; la clé EAN de chaque code interne est vérifiée par ZXing.
- **Mise en page** : PDF A4 209,9 × 297 mm ; rouleaux 50,1 × 30 et 39,9 × 25,1 mm, une page par étiquette ; « Commencer à 5 » sur 3 × 8 place la première étiquette colonne 2, ligne 2 (71,5 mm ; 43 mm). Zones blanches : 11 modules (EAN-13), 10 (Code 128), conformes.

### Blocage

| N° | Constat | Preuve | Où |
|---|---|---|---|
| D1 | **Code accepté, illisible sur thermique 203 ppp.** Le seuil de l'ERP (0,19 mm, `etiquettes.ts:115`) vaut 1,5 point à 203 ppp ; il faut au moins 2 points (0,25 mm) | `SN-LEN-E14-0042` (15 caractères) en rouleau 50 × 30 : module 0,214 mm = 1,72 point, **non décodé** à 203 ppp, lu à 300. `6001234500017` en 50 × 30 : 1,9 point, lu de justesse | Écran |
| D2 | **Barres arrondies au point.** Le code est étiré à la largeur de l'étiquette (`preserveAspectRatio="none"`, `barcode.ts:139`) : module de 2,55 points en 40 × 25 | Barres de 2 ou 3 points ; écart mesuré jusqu'à **0,36 module** (EAN-13 interne, 40 × 25) et 0,48 (Code 128, 50 × 30) à 203 ppp. ZXing lit sur image propre ; l'encre d'une vraie thermique s'y ajoute | Écran |
| D3 | **Code 128 deux fois trop large.** Un nombre de chiffres impair passe tout en jeu B (`barcode.ts:82`) | `6001234500017` : 178 modules contre 123 (JsBarcode « auto ») → « Code trop long pour ce format », **ignoré** en 40 × 25 (capture `04-format-3`). `1234567` : 112 contre 90 | Écran |
| D4 | **Papier imposé.** Quatre formats en dur (`etiquettes.ts:34-91`), planches **sans marge** seulement ; ni format libre, ni marges, ni écart, ni décalage, ni page d'essai | Les planches A4 de 65 (38,1 × 21,2, avec marges), de 21 et le rouleau 40 × 30, courants (supposé), sont inutilisables. Texte à 4,6 mm du bord en 4 × 10 : zone que beaucoup d'imprimantes laser n'impriment pas (supposé) | Écran |

### Gêne

| N° | Constat | Preuve | Où |
|---|---|---|---|
| D5 | **« Une étiquette par article en stock » compte tous les sites** (`Etiquettes.tsx:74, 163`, stock global) | Chemise M : **97** (MAG-1 1, MAG-2 16, dépôt 80). 12 produits → **1 531 étiquettes** en un clic | Écran |
| D6 | **Une grosse impression sur rouleau fige** (une page par étiquette) | Rendu PDF Chromium : 500 → 0,7 s ; 1 000 → 2,8 s ; **1 531 → 45,6 s ; 2 000 → 122 s** (plafond de l'écran : 2 000, `Etiquettes.tsx:36`). A4, 2 000 : 1 s | Écran |
| D7 | **La taille disparaît.** Nom sur 2 lignes au plus (`etiquettes.ts:193`) | « Chemise homme manches longues coton blanc coupe ajustée taille XL » en 40 × 25 → « …coton blanc coupe… » ; **« taille XL » invisible** (capture `11-rouleau-40x25-nom-long`). L'aperçu ne montre que la première étiquette | Écran |
| D8 | **Piège du code fabricant.** Base neuve : la page propose « Créer les codes-barres » pour l'HP ProBook ou l'écran Dell, sans proposer de scanner la boîte. Un produit n'a qu'un code : après l'étiquette interne, la boîte ne se scanne plus (fiche 10) | Capture `03-etiquettes-apres-codes` ; `CodeBarreService` ne pose aucune question | Écran |
| D9 | **Code accentué : boucle.** Compté « n'a pas de code-barres », bouton « Créer » sans effet | `SSD-1To-Été` accepté par la fiche produit (lot 10-E) ; clic : `cree: false`, l'avertissement reste | Écran |
| D10 | **Aucune trace d'impression** | `imprimer()` n'appelle aucune API (`Etiquettes.tsx:215-225`) | Lecture |
| D11 | Messages anglais sur une requête mal formée (« Invalid input: expected number ») | `POST` avec `["abc"]` : 400 | API seulement |

**Revérifié (CLAUDE.md)** : croisement JsBarcode exact, confirmé ; « jamais d'écrasement » et « gérant et admin seulement », confirmés. Codes de démonstration `6001234500…` : aucun script du dépôt ne les crée (seul `barcode.test.ts:65` en cite un), donc non vérifiés ; un tel code (13 chiffres, clé fausse) sort en Code 128, mais il est **ignoré** en 40 × 25 (D3) et limite en 50 × 30 (D1).

## 5. Comparaison

- **Odoo** (° connaissance générale, non relue) : étiquettes depuis l'article ou la réception, quantité reçue reprise, formats A4 et Dymo, langage ZPL pour Zebra. Mieux que nous : la réception et l'impression directe.
- **Sage** : étiquettes de colisage en états libres [G1] : puissant, mais à paramétrer par un intégrateur.
- **Loyverse** : nom, référence, prix, code ; payant [L1].
- **Outils locaux** : à compléter (aucune source).
- **On fait mieux** : rien à installer, code interne unique en un clic, case de départ sur planche entamée, prix masquable, gratuit. **Pour battre Odoo** : étiquettes en un geste depuis la réception (11-C), réimpression des prix changés (11-H), page d'essai pour caler le papier (11-D).
- Minimum du fichier concurrents : code interne (fait), lot depuis une réception (absent), prix barré (absent), carton et pièce (absent, 10-H).

## 6. Manques par profil

- **Habillement** : taille et couleur sur une ligne à part (11-F, après 10-J) ; quantité reçue ; rouleau 40 × 30 ; étiquette volante à trou (format libre, 11-D).
- **Alimentaire boutique** : étiquette de rayon sans code (11-G) ; prix au kilo et étiquette de balance à poids ou prix intégré : **plus tard**, après 10-I.
- **Grossiste** : étiquette de rayonnage (11-G) ; étiquette de carton : plus tard, après 10-H.
- **Informatique** : scanner le code de la boîte au lieu d'en créer un (11-B) ; étiquette de numéro de série : plus tard, après 10-K.
- **Tous** : étiquette promo à prix barré : plus tard (aucun prix promotionnel dans l'ERP) ; impression directe sans boîte du navigateur (ZPL/TSPL) : plus tard ; impression depuis un téléphone Android : plus tard.

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** : l'étiquette doit montrer le prix que le client paie. Si les prix sont saisis hors taxe chez un client assujetti (question 4 du suivi), l'étiquette calcule le TTC ; sinon rien ne change. Dépend de 03-K.
- **FNE, mobile money, WhatsApp** : aucune incidence.

## 8. Lots proposés

Ordre du cadrage : aucun défaut d'argent ; d'abord ce qui empêche l'usage quotidien (11-A à 11-E), puis les manques de profil (11-F, 11-G), puis la concurrence (11-H). Déjà ailleurs : validation EAN et accents à la saisie **10-E**, recherche **10-F**, carton **10-H**, poids **10-I**, tailles **10-J**, séries **10-K**, scan de réception **17-G**, boutique de l'utilisateur **fiche 13**, TVA **03-K**. À transmettre à la fiche 10 : un produit devrait pouvoir porter **plusieurs codes** (boîte + interne).

### 11-A · Un code imprimé passe à la douchette (S)
- **Problème** : D1, D2, D3.
- **Résultat** : tout code que l'écran accepte se lit sur une thermique 203 ppp.
- **Écran** : à côté du format, « Imprimante : thermique 203 ppp · thermique 300 ppp · bureau » (par poste, défaut 203 pour un rouleau, bureau pour l'A4). Code trop long : message, choix d'un format plus large.
- **Base/API** : aucune.
- **Étapes** : (1) Code 128 optimal : jeu C pour toute suite de 4 chiffres et plus, jeu B ailleurs (comme JsBarcode « auto »). (2) Module = nombre entier de points de l'imprimante choisie (203 ppp : 2 points minimum, 3 préférés ; bureau : 0,26 mm minimum) ; largeur fixe en mm, barres centrées, plus d'étirement. (3) `MODULE_MIN_MM` remplacé par ce calcul. (4) Hauteur de barres au moins 15 % de la longueur du code, plancher 8 mm.
- **Fichiers** : `utils/barcode.ts`, `utils/etiquettes.ts`, `pages/Etiquettes.tsx`, tests.
- **Tests** : rendu des 4 formats à 203, 300 et 600 ppp, passage en noir et blanc, décodage ZXing (`zxing-wasm` en dépendance de test, script de cette fiche) ; écart de barre < 0,15 module ; `6001234500017` imprimable en 40 × 25 ; motifs toujours égaux à JsBarcode.
- **Fini quand** : 100 % des codes acceptés décodés à 203 ppp. **Dépend** : aucune. **Risque** : moins de codes longs acceptés sur petit format.

### 11-B · Le code du fabricant d'abord (S)
- **Problème** : D8, D9.
- **Résultat** : un code interne seulement pour l'article sans emballage codé.
- **Écran** : sur chaque produit sans code : « Scanner le code de l'emballage » (champ, la douchette remplit, enregistrement immédiat) ou « Créer un code interne ». Bouton global renommé « Créer un code interne pour N articles sans code d'emballage », avec rappel. Code non imprimable : « Code à corriger » et lien vers la fiche, jamais « sans code ».
- **API** : `PUT /produits/:id` existant (admin, gérant) ; doublon : message de 10-E.
- **Fichiers** : `Etiquettes.tsx`, `services/api.ts`.
- **Tests** : scan d'un EAN valide → enregistré, imprimé en EAN-13 ; doublon refusé ; code accentué → « Code à corriger », aucun bouton « Créer ».
- **Fini quand** : la boucle D9 a disparu. **Dépend** : 10-E. **Risque** : douchette qui envoie Entrée (l'intercepter).

### 11-C · Quoi et combien imprimer (M)
- **Problème** : D5, parcours « 40 chemises » et « tout un rayon ».
- **Résultat** : « 40 reçues, 40 étiquettes » et « rayon Habillement de ma boutique » en deux gestes.
- **Écran** : sélecteur « Boutique » (défaut : celle de l'utilisateur) ; « Une par article en stock ici » ; « Ajouter une catégorie » ; liens `?produits=17:40,18:12` (quantités) et `?reception=ID` (quantités reçues, bouton posé par 17-G) ; liste gardée en brouillon (`useDraft`) ; cases à cocher de l'inventaire ouvertes au vendeur pour cette seule action.
- **API** : `location_id` sur `getById` et `searchFuzzy` (déjà pris en charge par la recherche) ; liste par catégorie, 500 au plus.
- **Fichiers** : `Etiquettes.tsx`, `Inventaire.tsx`, `Receptions.tsx` (avec 17-G).
- **Tests** : chemise M à MAG-1 → 1 ; catégorie Habillement → 7 produits ; réception de 40 → 40 ; brouillon retrouvé après navigation.
- **Fini quand** : aucun chiffre du parcours ne compte un autre site. **Dépend** : fiche 13, 10-A, 17-G. **Risque** : stock faux tant que 10-A n'est pas livré.

### 11-D · Mon papier, bien calé (M)
- **Problème** : D4.
- **Résultat** : le commerçant imprime sur le papier qu'il a acheté, aligné.
- **Écran** : « Ajouter un format » : largeur, hauteur, colonnes, lignes, marges haut et gauche, écarts, étiquettes de front sur rouleau (1 ou 2). Décalage haut/gauche par poste. « Imprimer une page d'essai » (cadres et croix). Formats d'office en plus : rouleau 40 × 30, A4 21 et 65 (dimensions à vérifier sur un paquet acheté). Aperçu de la page entière.
- **Base** : `company_settings.formats_etiquettes JSONB` (le papier est celui de l'entreprise) ; calage du poste en `localStorage`. Migration suivante, `ci-baseline.sql` régénéré.
- **Fichiers** : `etiquettes.ts`, `Etiquettes.tsx`, schéma Zod des réglages, `CompanySettingsService`.
- **Tests** : grille dans la feuille, décalage appliqué, format refusé s'il dépasse l'A4.
- **Fini quand** : une planche de 65 sort alignée sur une laser réelle (essai terrain). **Dépend** : 11-A. **Risque** : pilote qui force « ajuster à la page » ; la page d'essai le révèle.

### 11-E · Grandes impressions par paquets (S)
- **Problème** : D6.
- **Résultat** : 1 500 étiquettes sans figer le poste.
- **Écran** : au-delà de 300 étiquettes en rouleau (ou 20 planches), « Imprimer le paquet 1 sur 6 », puis le suivant.
- **Fichiers** : `Etiquettes.tsx`, `etiquettes.ts`.
- **Tests** : 1 531 → 6 paquets ; chacun rendu en moins de 2 s (mesure headless).
- **Fini quand** : aucun paquet ne dépasse 2 s. **Dépend** : aucune. **Risque** : paquet oublié ; numéroter.

### 11-F · Taille, référence, nom court (M)
- **Problème** : D7 ; ni taille ni référence sur l'étiquette.
- **Résultat** : la taille se lit toujours ; le commerçant choisit les lignes.
- **Écran** : cases « Nom, Taille et couleur, Référence, Prix, Nom du magasin » ; nom réduit jusqu'à 6 pt puis coupé, jamais la taille ; « 3 noms coupés » avant l'impression.
- **Base** : facultatif `produits.libelle_etiquette VARCHAR(40)` en attendant 10-J ; ensuite `taille` et `couleur` de 10-J, en gras sur leur ligne.
- **Fichiers** : `etiquettes.ts`, `Etiquettes.tsx`, `ProduitService`, `schemas.ts`.
- **Tests** : nom de 70 caractères en 40 × 25 → taille visible.
- **Fini quand** : aucune taille coupée sur les 4 formats. **Dépend** : 10-J. **Risque** : texte trop petit ; plancher 6 pt.

### 11-G · Étiquette de rayon (M)
- **Problème** : la page refuse tout produit sans code (`Etiquettes.tsx:166-168, 283`) ; aucun prix de rayon.
- **Résultat** : « les prix du rayon riz » sur A4 : gros prix, nom, contenance.
- **Écran** : type « Étiquette article · Étiquette de rayon » ; rayon : code facultatif, prix en grand ; prix par carton et pièce après 10-H, au kilo après 10-I.
- **Fichiers** : `etiquettes.ts`, `Etiquettes.tsx`.
- **Tests** : produit sans code imprimé en rayon ; prix de 7 chiffres lisible.
- **Fini quand** : un rayon de 30 produits sort en une impression. **Dépend** : 11-D. **Risque** : aucun.

### 11-H · Réimprimer les prix changés (M)
- **Problème** : D10.
- **Résultat** : après une hausse, « 12 articles portent un ancien prix : les ajouter ».
- **Base** : table `etiquettes_impressions` (produit, prix, quantité, emplacement, utilisateur, date) ; index produit.
- **API** : `POST /etiquettes/impressions` (rôles de la page) ; `GET /etiquettes/a-reimprimer?location_id=` (dernier prix imprimé différent du prix de vente).
- **Écran** : bandeau sur Étiquettes ; après un changement de prix dans la fiche : « Imprimer la nouvelle étiquette ».
- **Fichiers** : migration, route, service, `Etiquettes.tsx`, fiche produit.
- **Tests** : 7 500 → 8 000 → listé ; imprimé → sorti de la liste.
- **Fini quand** : le parcours « le prix change » tient en 3 gestes. **Dépend** : 11-C. **Risque** : boîte annulée comptée imprimée ; demander « C'est imprimé ? ».

## 9. Questions pour le propriétaire

1. Le dépôt peut-il imprimer des étiquettes **sans prix** ? Il reçoit la marchandise ; aujourd'hui il n'a pas la page.
2. Recommande-t-on un modèle d'imprimante thermique et de papier au client (installation plus sûre), ou tout papier ?
3. Le vendeur peut-il créer un code interne, ou seulement le gérant ?
4. Étiquette de rayon et étiquette promo dès le premier mois pour l'alimentaire ?
5. Garde-t-on la trace des impressions (11-H) ?
6. Plage interne « 20 » : la garder si une balance de l'épicier écrit aussi des codes en 2 (poids ou prix) ? À trancher avec 10-I.

## Non vérifié, à tester avec du vrai matériel

- **Douchette réelle** (laser, CCD, lecteur 2D) : EAN-13 interne en 40 × 25 à 203 ppp ; Code 128 de 15 caractères en 50 × 30 ; planche 4 × 10 sur laser.
- **Thermique 203 ppp sous Windows** (Xprinter, TSC, Zebra, supposés courants) : Chrome prend-il le papier 50 × 30 du pilote ou faut-il le choisir ; détection de l'espace entre étiquettes ; noirceur et grossissement des barres ; texte tramé.
- **Planches A4 réelles** : alignement sur 8 et 10 rangées, marges non imprimables, mise à l'échelle par défaut de Firefox ou d'un pilote.
- **Boîte d'impression** de Chrome au-delà de 1 000 pages (mesuré en PDF headless seulement).
- Impression depuis Android ; formats vendus en Côte d'Ivoire ; attentes des commerçants (aucun interrogé).
