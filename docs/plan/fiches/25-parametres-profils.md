# 25 Paramètres, modules, profils

> **Contre-expertise du 2026-11-27** ([détail](../vagues/vague-7-contre-expertise.md)) : Verdict maintenu. Deux écarts dans le tableau de la section 6 : la liste « à racheter » doit rester visible en boutique (fiche 16), et l'étiquette de rayonnage (11-G) doit être proposée au grossiste. D7 : innocent sur le fond (l'admin peut tout rouvrir), mais il ne sait pas qui a caché. Oubli : une facture réimprimée prend le nom, le RCCM et la devise du jour (fiche 27). 25-I est absorbé par 07-H ; 25-C passe en fin de bloc, après 25-H. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-27, base `nolyx_audit_3` (écritures par l'API et l'écran : nom « Boutique Audit V73 », modules masqués puis rétablis, profil remis à « général ») et `nolyx_audit_neuve` en lecture. Rôles : admin, gérant, caissier, vendeur, dépôt, lecteur ; 1440 et 390 px. Scripts et captures : `%TEMP%\nolyx-agents\vague7-3`, `%TEMP%\nolyx-captures\3\25-*`.

## 1. Verdict

**Simplifier.** Le commerçant doit répondre à trois questions (quel métier, combien de boutiques, avec ou sans dépôt) et ne plus voir ce qui ne le concerne pas. Aujourd'hui : deux pages de réglages, 28 cases à cocher, un choix de métier qui ne change pas le menu, aucune aide au premier jour, un logo qui ne s'enregistre pas. On fusionne les deux pages, on remplace les cases par métier + taille + 8 options, et on ajoute un assistant de démarrage.

## 2. Utilité

| | Général | Informatique | Habillement | Alim. / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Besoin | 5 | 5 | 5 | 5 | 5 | 5 |
| Réponse actuelle | 3 | 3 | 2 | 1 | 1 | 3 |

- **Informatique** : profil identique à « général » (`profilsActivite.ts:33-38`).
- **Habillement** : le préréglage cache « Relances », alors que la fiche 06 veut le crédit pour tous.
- **Alimentaire / grossiste (1)** : le profil proche, « Libre-service et supérette » (hors cible), cache devis et bons de livraison, quotidiens chez le grossiste (`profilsActivite.ts:51`).
- **Un magasin (1)** : rien ne se cache seul ; Emplacements, Transferts, Demandes et Affectations restent au menu.

## 3. Parcours réel

**Client neuf** (`nolyx_audit_neuve`, lecture) : 1 emplacement MAG-1, 0 produit, « Client comptoir » présent, table `magasins` vide, **aucune ligne** dans `company_settings` (créée au premier affichage avec le nom « Mon entreprise », `CompanySettingsService.ts:75-78`).

| Étape | Obligatoire ? | Deviné ? | État |
|---|---|---|---|
| 1. Connexion | oui | — | marche |
| 2. Trouver « Paramètres » (bas du menu, rubrique Administration) | rien ne l'indique | — | aucun guide |
| 3. Nom, adresse, téléphone, NCC, RCCM (5 champs) | seul le nom est exigé à l'enregistrement | nom « Mon entreprise » | NCC étiqueté « NIF » |
| 4. Logo | non | logo Hitek affiché comme celui du client | échoue au-delà de 75 Ko (D1) |
| 5. Métier, puis « Appliquer les modules du profil », puis enregistrer | non | « général » | 3 gestes, le 2e est facile à manquer (D4) |
| 6. Premier produit | oui | — | fiche 10 (10-E) |
| 7. Ouvrir la caisse | oui pour vendre en espèces | — | **impossible** (08-G) |
| 8. Créer un caissier | non | — | fiche 24 |
| 9. Première vente | — | — | bloquée par l'étape 7 |

Bilan : 7 écrans, une quinzaine de gestes avant le premier produit, aucun ordre indiqué, un mur à l'étape 7.

**Par rôle** (API, `s1.mjs`) :

| Rôle | Lire les paramètres | Modifier entreprise, métier, modules | Tolérances achats |
|---|---|---|---|
| Admin | 200 | 200 | 200 |
| Gérant | 200 | **200** (écran et API) | 403 (écran caché) |
| Caissier, vendeur, dépôt, lecteur | 200 | 403 | 403 |

**Changer de profil** (gérant, `u3.mjs`) : « Habillement » enregistré sans « Appliquer » : Devis, BL et Relances restent au menu, l'accueil garde « Nouvelle facture ». Avec « Appliquer » : menus cachés, données gardées, mais 6 devis en cours (4 envoyés, 2 acceptés) deviennent inaccessibles sans avertissement.

**Module masqué** (gérant masque Journal d'audit, Commandes, Demandes, Transferts, Emplacements ; `u2.mjs`) :

| Surface | Résultat |
|---|---|
| Menu | caché ✔ |
| Adresse tapée (`/commandes/1`, `/demandes`, `/admin/audit`) | page « Module désactivé » ✔ |
| Recherche globale, raccourcis | filtrés (`GlobalSearch.tsx:155-158`, `useKeyboardShortcuts.ts:168`) ✔ |
| Accueil admin / gérant | **fuite** : carte « Commandes fournisseur », carte « Demandes » avec « Nouvelle demande », alerte « 1 commande fournisseur en retard » (capture `25-accueil-modules-masques`) |
| Réceptions | les 2 commandes « validées » restent réceptionnables ; aucune nouvelle possible |
| API | `GET /commandes`, `/demandes`, `/stock-transfers` : 200. Voulu (`ModuleGuard.tsx:19-20`) |

## 4. Défauts prouvés

### Argent et stock

Aucun. La devise (D9) change l'étiquette, pas le montant.

### Blocage

| N° | Défaut | Preuve | Où |
|---|---|---|---|
| D1 | **Un logo de plus de 75 Ko ne s'enregistre pas** : 500 « Erreur interne », écran « Impossible d'enregistrer les paramètres. Réessayez. » L'écran annonce 2 Mo | 60 et 99 Ko : 200 ; 150 Ko et 1,9 Mo : 500 ; `logo.png` de 473 Ko par l'écran : même toast. Cause : `express.json()` à 100 Ko (`server.ts:114`) contre 2 Mo (`schemas.ts:416`, `CompanySettings.tsx:25`) | Écran |
| D2 | **Le profil du grossiste n'existe pas** : « alimentaire » refusé (400), le profil proche cache devis et BL | `type_activite: 'alimentaire'` → 400 ; contrainte de la migration 109 | Écran |
| D3 | **Masquer « Caisse » en gardant la vente comptoir** : le caissier ne peut plus ouvrir ni clôturer sa caisse, sans avertissement au réglage | `/caisse` caissier → « Module désactivé » ; `VenteComptoir.tsx:268` retire alors le lien | Écran |

### Gêne

| N° | Défaut | Preuve | Où |
|---|---|---|---|
| D4 | Choisir un métier ne change pas le menu ; il faut un second bouton puis enregistrer. Décision voulue (« jamais en silence », `profilsActivite.ts:9`), qui ne convient pas au premier réglage | `CompanySettings.tsx:401`, `415-424` ; `u3.mjs` | Écran |
| D5 | Le métier ne règle l'écran de vente que pour le caissier et la fiche facture ; l'accueil du gérant affiche toujours « Nouvelle facture », celui du vendeur « Nouveau devis » | `Dashboard.tsx:2135-2139`, `1184-1196` ; `u3.mjs` | Écran |
| D6 | Module masqué encore visible à l'accueil (commandes, demandes, alertes) | `Dashboard.tsx:2331-2350`, `2355` ; capture | Écran |
| D7 | **Le gérant peut masquer le Journal d'audit et les paramètres de l'admin**, et la trace ne dit pas qui | `journal-audit`, `parametres-finance` non verrouillés (`modules.ts:271-283`) ; 13 entrées `audit_log` du test, toutes `user_id` vide (`CompanySettingsService.ts:148`) | Écran |
| D8 | Chaque enregistrement copie le logo deux fois dans le journal (101 698 caractères pour un logo de 99 Ko) | `audit_log` 133 | Base |
| D9 | La devise est un texte libre modifiable par le gérant ; « USD » s'imprime aussitôt sur la réimpression de toutes les anciennes factures, les écrans restant en FCFA | PUT `devise: 'USD'` → 200 ; lu à l'impression (`PDFService.ts:115-119, 344`). Le FCFA est une décision fermée du cadrage | Écran |
| D10 | Identifiants algériens : « NIF » et « AI » au lieu de NCC, régime d'imposition, centre des impôts | `CompanySettings.tsx:270-273`, `PDFService.ts:73-75` ; `faits/fne.md:48, 61` | Écran |
| D11 | Le logo Hitek livré s'affiche comme logo du client neuf (« Remplacer le logo ») | `CompanySettings.tsx:210` ; `brand.ts:24` le traite pourtant comme absent ; capture `25-settings-gerant-1440` | Écran |
| D12 | Tolérance d'achat : « 5 » enregistré = 500 %, et aucune trace | PUT admin `prix_tolerance_pct: 5` → 200 ; `schemas.ts:735-739` ; `FactureFournisseurService.ts:267-277` sans journal | API (admin) |
| D13 | Clés de modules inconnues ou verrouillées acceptées | `['factures','zzz-inconnu','tiers']` → 200 (`schemas.ts:421-424`) | API |
| D14 | `taux_conversion` lu, jamais utilisé | `PDFService.ts:117` seule lecture | Base |

Nuance au suivi : masquer les commandes ne vide pas la page Réceptions tout de suite ; elle ne se remplit plus.

## 5. Comparaison

- **Odoo** : « type de commerce » préconfiguré au départ, puis réglages dispersés par application [O9]. Mieux que nous : le métier configure vraiment.
- **Loyverse** : interrupteurs de fonctions [L4]. **eBoutik** : « vous n'activez que les fonctions dont votre boutique a besoin » [P7]. **Sage** : non documenté dans l'étude.
- **Minimum attendu** (`faits/concurrents.md`) : un choix de métier suffit ; rien de caché ne réapparaît ; TVA invisible au non-assujetti.
- **On fera mieux** : taille déduite des sites (aucun concurrent cité ne cache seul le multi-sites), identité ivoirienne prête pour la FNE.

## 6. Manques par profil, et tableau final proposé

**Premier mois, tous profils** : assistant de démarrage (25-C) ; identité ivoirienne (25-H) ; en-tête et téléphone propres à chaque boutique, numéros Wave et Orange de la boutique (13-H, fiche 27) ; FCFA entiers (03-B, règle fixe, pas un réglage) ; message du ticket (existe). **Supposé** : imprimantes 58 mm courantes, ticket figé à 80 mm (`ticket.ts:130-133`) : choix de largeur à confier à la fiche 27.
**Plus tard** : numérotation à préfixe ou premier numéro choisi (`NumberingService.ts:15-41`, figée, ce qui est sain), documents en anglais, autre devise.

**Écrans par métier** (après les fusions décidées : « Vendre » question 1, retours et avoirs 05, Crédit clients 06, historique dans Caisse 08, Valorisation dans Rapports 15-F, suggestions dans Commandes 16, demandes dans Transferts 14). ● visible par défaut, ○ caché mais activable.

| Écran | Général | Informatique | Habillement | Alimentation boutique | Grossiste |
|---|---|---|---|---|---|
| Vendre, Factures, Produits, Contacts, Caisse, Retours et avoirs, Crédit clients, Inventaire physique, Réceptions / Achat (17-D), Factures fournisseur, Dépenses (gérant), Rapports | ● | ● | ● | ● | ● |
| Devis | ● | ● | ○ | ○ | ● |
| Bons de livraison | ○ | ● | ○ | ○ | ● |
| Commandes fournisseur (+ « à racheter ») | ○ | ● | ○ | ○ | ● |
| Étiquettes (question 40) | ● | ● | ● | ● | ○ |
| Employés et paie | ○ | ○ | ○ | ○ | ○ |
| Trésorerie, Comptabilité | ○ | ○ | ○ | ○ | ○ |

Hors catalogue : Audit caisse (supprimé, 08), Valorisation (Rapports, 15-F), Affectations (fiche utilisateur, 13-C), Emplacements (Paramètres). Paie, trésorerie, comptabilité : fiches 20 à 22 ; Analyse clients : fiche 19. Alimentation boutique et grossiste forment un seul profil du cadrage : l'assistant demande « Vous livrez et facturez en fin de mois ? » pour choisir la colonne.

**Écrans par taille** (déduite des sites actifs, jamais cochée, 13-F) :

| | 1 magasin | 1 magasin + dépôt | 2 à 5 magasins | 2 à 5 magasins + dépôt |
|---|---|---|---|---|
| Choix du site (vente, stock, caisse, rapports) | caché | caché en vente | visible | visible |
| Transferts | caché | ● | ● | ● |
| « Demander au dépôt » | caché | ● | caché (question 54) | ● |
| Rôle « dépôt » à la création d'un compte | caché | ● | caché | ● |
| Boutiques et dépôts (Paramètres, pour en ajouter) | ● | ● | ● | ● |

Un site créé « pour essayer » fait apparaître ces menus ; le fermer (13-G) les cache.

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** : Paramètres, rubrique « Taxes » (assujetti oui/non, taux, mention) ; le non-assujetti n'y voit qu'un interrupteur. Contenu : 03-K.
- **FNE** : NCC, régime, centre des impôts dès maintenant (25-H, utiles sans FNE) ; clé API et URL plus tard, cachées tant que la FNE est éteinte (03-L) ; établissement et point de vente sur chaque site et caisse (13-H).
- **Mobile money** : numéros Wave, Orange, MTN, Moov par boutique (13-H), saisis dans l'assistant pour un magasin unique.
- **WhatsApp** : le lien `wa.me` lit nom et téléphone de la boutique (03-L) ; rien à régler.

## 8. Lots proposés

Ordre du cadrage. Prochaine migration : le numéro libre (dernière : `113`) ; tout changement de schéma régénère `ci-baseline.sql`, toute donnée de départ va dans `ci-ref-data.sql`. Déjà ailleurs : caisse du client neuf **08-G** ; un magasin sans menus de sites **13-F** ; gérer un site **13-G** ; Wave et Orange par boutique **13-H** ; TVA **03-K** ; FNE **03-L** ; rapprochement à trois voies supprimé **18-F** ; module caché = aucun bon créé ailleurs **02-E** ; mentions imprimées et ticket **fiche 27** ; provisionnement **fiche 28**.

### 25-A · Une seule page « Paramètres », par sujet (M, priorité 2)
- **Problème** : deux pages, dont une de 3 588 px ; devise libre (D9) ; colonne morte (D14).
- **Résultat** : une page « Paramètres » à rubriques : Entreprise · Boutiques et dépôts (sites, 13-G) · Vente et caisse · Taxes · Métier et options.
- **Écrans** : `CompanySettings.tsx` en onglets ; « Paramètres paie et achats » disparaît : cotisations et barème dans la page Paie (fiche 20), tolérances supprimées (18-F) ; « FCFA » affiché en lecture.
- **Base / API** : migration : `devise` = `FCFA`, `taux_conversion` supprimée ; Zod sans ces deux champs.
- **Fichiers** : `CompanySettings.tsx`, `ParametresFinance.tsx` (supprimé), `routeAccess.ts`, `navConfig.tsx`, `modules.ts`, `App.tsx` (redirection vers `/paie`), `schemas.ts`, `CompanySettingsService.ts`, `PDFService.ts`.
- **Tests** : PUT `devise` → 400 ; ancienne adresse redirigée.
- **Fini quand** : un seul lien « Paramètres » au menu. **Dépend** : 18-F, fiche 20. **Risque** : favoris ; garder les redirections une version.

### 25-B · Métier + taille + 8 options au lieu de 33 cases (M, priorité 2)
- **Problème** : D2, D4, D13 ; un magasin voit tout ; 28 cases.
- **Résultat** : le menu suit le métier dès qu'il est choisi (section 6) ; ensuite 8 options : Devis, Bons de livraison, Commandes fournisseur, Étiquettes, Employés et paie, Trésorerie, Comptabilité, TVA (03-K).
- **Base** : migration : `type_activite` accepte `general`, `informatique`, `habillement`, `alimentaire`, `grossiste` (`libre_service` → `alimentaire`) ; `modules_desactives` remplacée par `options_actives` (liste d'inclusion, valeurs converties).
- **API** : options dans une liste fermée (400 sinon).
- **Écrans** : rubrique « Métier et options » : 5 choix, 8 interrupteurs, taille affichée (« 1 boutique, sans dépôt »).
- **Fichiers** : `modules.ts` (catalogue réduit), `profilsActivite.ts`, `ModulesContext.tsx`, `CompanySettings.tsx`, `CompanySettingsService.ts`, `schemas.ts`, migration.
- **Tests** : chaque métier → menu attendu ; base existante convertie sans perte.
- **Fini quand** : « Grossiste » affiche devis, BL et commandes sans autre geste. **Dépend** : 13-F. **Risque** : choix déjà faits par un client ; la migration les garde.

### 25-C · Assistant de démarrage (M, priorité 3)
- **Problème** : parcours de la section 3 : rien n'est guidé, nom « Mon entreprise », métier jamais demandé.
- **Résultat** : au premier login admin, quatre écrans : (1) commerce : nom, téléphone, ville, métier ; (2) sites : nombre de boutiques, dépôt oui/non, noms (crée sites et caisses par 08-G/13-G) ; (3) documents : logo, NCC, RCCM, message du ticket, numéro Wave ; (4) un caissier (facultatif). Puis, sur l'accueil, une liste « Ajouter vos produits · Ouvrir la caisse · Faire une vente d'essai » jusqu'à la première vente.
- **Base / API** : `company_settings.demarrage_termine` (booléen) ; `POST /company-settings/demarrage` en une transaction.
- **Fichiers** : nouvelle page `Demarrage.tsx`, `App.tsx`, `Dashboard.tsx`, `CompanySettingsService.ts`, route, migration, `ci-ref-data.sql`.
- **Tests** : base neuve → assistant ; abandon puis reprise ; fin → vente en espèces possible.
- **Fini quand** : sur une base neuve, première vente en moins de 10 minutes sans aide. **Dépend** : 08-G, 13-G, 10-E, fiche 24, fiche 28 (préremplissage). **Risque** : trop long ; tout sauf le nom est facultatif.

### 25-D · Le logo s'enregistre (S, priorité 3)
- **Problème** : D1, D8, D11.
- **Résultat** : n'importe quelle image de moins de 2 Mo devient le logo, réduite, et s'imprime.
- **Écrans** : l'image est réduite dans le navigateur (canvas, 400 px de large, PNG ou WebP) avant l'envoi ; le logo livré n'est plus montré comme celui du client (`buildBrand`).
- **API** : `express.json({ limit: '1mb' })` sur `/api/company-settings` ; 413 → message français ; le journal note « logo modifié » sans copier l'image.
- **Fichiers** : `server.ts`, `CompanySettings.tsx`, `CompanySettingsService.ts`, `brand.ts`.
- **Tests** : `logo.png` de 473 Ko → enregistré, visible sur la facture A4 et le ticket ; journal < 2 Ko.
- **Fini quand** : la capture de `u1.mjs` affiche « Paramètres de l'entreprise enregistrés ». **Dépend** : rien. **Risque** : aucun.

### 25-E · Un écran caché disparaît partout (M, priorité 3)
- **Problème** : D3, D6, D5 ; l'API accepte la création dans un module caché.
- **Résultat** : ce qui est caché n'apparaît nulle part : menu, adresse, accueil, alertes, liens entre pièces, recherche, raccourcis ; le serveur refuse d'en créer.
- **API** : middleware `requireOption('devis')` sur les routes de création des 8 options : 403 « Cette fonction est désactivée dans les paramètres » ; lecture permise (anciennes pièces).
- **Écrans** : `ManagerHub` et `MagasinHub` passent par `useRouteAccess` pour chaque carte ; `DocumentLifecycle` ne lie que si `canOpen` ; Caisse verrouillée.
- **Fichiers** : `Dashboard.tsx`, `DashboardDemandeWidgets.tsx`, `document-lifecycle.tsx`, `modules.ts`, nouveau `middleware/options.ts`, routes des options.
- **Tests** : matrice option × 7 surfaces ; devis confirmé avec BL caché → aucun BL (02-E).
- **Fini quand** : la capture `25-accueil-modules-masques` ne montre plus commandes ni demandes. **Dépend** : 25-B. **Risque** : ne pas mélanger rôle et option.

### 25-F · Qui change quoi, et qui l'a fait (S, priorité 3)
- **Problème** : D7, D12, journal sans auteur.
- **Résultat** : le patron sait qui a changé quoi ; le gérant ne cache pas ce qui contrôle son travail.
- **API** : `AuditService.log(..., req.user.id)` (paramètres, et tolérances tant que 18-F n'est pas fait) ; métier, options, identité légale, taxes : admin seul ; gérant : ticket et coordonnées de sa boutique (question 1).
- **Écrans** : rubriques en lecture seule pour le gérant (« Réservé à l'administrateur ») ; Journal d'audit verrouillé.
- **Fichiers** : `routes/company-settings.ts`, `CompanySettingsService.ts`, `FactureFournisseurController.ts`, `CompanySettings.tsx`, `modules.ts`.
- **Tests** : gérant PUT `options_actives` → 403 ; journal avec auteur.
- **Fini quand** : chaque entrée du journal a un auteur. **Dépend** : rien. **Risque** : question 1.

### 25-G · Changer de métier après coup, sans rien perdre de vue (S, priorité 3)
- **Problème** : masquer Devis laisse 6 devis en cours inaccessibles, sans avertissement.
- **Résultat** : avant d'enregistrer : « Vous cachez Devis : 4 envoyés, 2 acceptés en cours. Les terminer d'abord ? », avec liens ; rien n'est supprimé.
- **API** : `GET /company-settings/impact?options=` : pièces ouvertes par option (devis en cours, BL non facturés, commandes à recevoir).
- **Fichiers** : `CompanySettingsService.ts`, route, `CompanySettings.tsx`. **Tests** : pièces ouvertes → dialogue ; sinon aucun.
- **Fini quand** : aucun document en cours ne disparaît sans avoir été montré. **Dépend** : 25-B. **Risque** : aucun.

### 25-H · Identité ivoirienne (S, priorité 4)
- **Problème** : D10.
- **Résultat** : la page demande NCC, RCCM, régime d'imposition, centre des impôts, références bancaires ; « AI » disparaît.
- **Base** : migration : `nif` renommée `ncc`, `ai` supprimée (valeur reportée dans `regime` si remplie), `regime`, `centre_impots` ajoutées.
- **API** : NCC contrôlé (7 chiffres et une lettre, `faits/fne.md:42`) ; message français.
- **Fichiers** : migration, `schemas.ts`, `CompanySettingsService.ts`, `CompanySettings.tsx` ; impression : fiche 27.
- **Tests** : NCC mal formé → 400 ; ancien NIF repris en NCC.
- **Fini quand** : une facture porte NCC et RCCM. **Dépend** : fiche 27. **Risque** : un ancien NIF au mauvais format : avertir, ne pas bloquer.

### 25-I · L'écran de vente suit le métier partout (S, priorité 8)
- **Problème** : D5. **Résultat** : gérant et vendeur ont le même premier écran de vente que le caissier.
- **Écrans** : `Dashboard.tsx` (`ManagerHub`, `MagasinHub`) lit `useVenteParDefaut`. **Tests** : habillement → « Nouvelle vente » pour trois rôles.
- **Fini quand** : D5 ne se reproduit plus. **Dépend** : question 1 du suivi (un seul écran « Vendre », 07-H, absorbe ce lot). **Risque** : aucun.

## 9. Questions pour le propriétaire

1. Le gérant peut-il changer le métier, les options et l'identité légale, ou seulement le message du ticket et sa boutique (proposé) ?
2. Alimentation boutique et grossiste : un seul profil avec une question (proposé), ou deux profils dans la liste ?
3. Employés, paie, trésorerie et comptabilité cachés par défaut pour tous (proposé, en attendant les fiches 20 à 22) ?
4. Étiquettes cachées chez le grossiste (question 40, proposé oui) ?
5. Le serveur refuse-t-il de créer dans une option désactivée (proposé), ou le masquage reste-t-il seulement visuel ?
6. Le fournisseur de l'installation saisit-il le nom et le métier avant la remise au client (fiche 28), ou le client le fait-il dans l'assistant ?
7. Imprimantes 58 mm : faut-il les accepter dès le premier client (fiche 27) ?

## Non vérifié

Première vente sur une base neuve en écriture (lecture seule) ; part des imprimantes 58 mm ; texte du PDF après changement de devise (code lu, flux compressé) ; Sage.
