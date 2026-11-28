# 19 · Contacts, CRM, analyse clients

> **Contre-expertise du 2026-11-27** ([détail](../vagues/vague-7-contre-expertise.md)) : Verdict maintenu. D1 : la suppression est logique (`deleted_at`), donc les clés en RESTRICT ne jouent jamais ; le chiffre d'affaires reste juste, mais l'accueil et les Relances donnent alors deux dettes différentes (−21 000 F). D2 : sans Client comptoir, seule la vente anonyme meurt (422), la vente à un client nommé passe ; le recréer ne répare rien, le code `PASS` est ignoré. 19-I est absorbé par 24-A1 ; 19-A ne dépend pas de 04-A (il refuse dès qu'une pièce existe). Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Agent vague 7, N = 1, 2026-11-27. Banc `nolyx_audit_1`, API 6141, écran 6151. Scripts : `%TEMP%\nolyx-agents\vague7-1\`. Caisse du banc non touchée (aucun encaissement en espèces). **La base 1 reste sans « Client comptoir »** après le test D2.

## 1. Verdict

**Simplifier.** La fiche contact unique (client et fournisseur) est une bonne base, mais l'essentiel du commerçant manque : retrouver un client par son numéro, éviter les doublons, reprendre le cahier de crédit, voir ce qu'il a acheté. Le CRM (tâches, priorités, réunions) et la page « Analyse clients » coûtent sans servir : on les réduit à des **notes** sur la fiche et à deux colonnes de la liste.

## 2. Utilité (0 à 5)

| | Général | Informatique | Habillement | Alimentaire / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Contacts (liste, fiche) | 4 | 5 | 3 | 5 | 4 | 4 |
| CRM tel quel | 1 | 2 | 1 | 1 | 1 | 1 |
| Analyse clients telle quelle | 1 | 1 | 1 | 1 | 1 | 1 |

Habillement : surtout des clients de passage. Grossiste et informatique : des revendeurs et des entreprises à crédit, connus par leur nom et leur numéro.

## 3. Parcours réel

| Rôle, largeur | Parcours | Résultat |
|---|---|---|
| Gérant, 1440 | Menu → Contacts → recherche | « 0710012 » trouve KONE (enregistré `+2250710012345`) ; « 07 10 01 » : rien ; « Jean » ne trouve pas KOUASSI **Jean-Marc** (prénom) ; « Kouasi » : rien |
| Gérant, 1440 | « Nouveau contact », deux numéros | Message anglais à l'écran : « Too big: expected string to have <=20 characters » |
| Gérant, 390 | Retrouver un client et ce qu'il a acheté | Menu, Contacts, numéro, carte : **4 gestes** pour la dette. Les achats : relevé du plus ancien au plus récent, 25 lignes par page, page 2 pour les derniers, puis une facture par geste. Fiche de **4 988 px** de haut, notes et rappels tout en bas (capture `19-fiche-390`) |
| Gérant | Modifier un contact | Seulement depuis la liste : la fiche n'a pas de bouton « Modifier » |
| Caissier, 390, Nouvelle facture | Retrouver un client | « Changer de client », taper : **2 gestes**. Le choix affiche nom, code, téléphone ; **ni dette ni achats**. La fiche lui est fermée (`routeAccess.ts:157-159`) |
| Caissier, 390 | Numéro inconnu « 0505050505 » | « Créer le client « 0505050505 » » : le numéro va dans **Nom**, le champ Téléphone reste vide (capture `19-caissier-creer-numero`) |
| Caissier, 390 et 1440, Vente comptoir | « Nommer le client » | Le × remet « Client comptoir », deux fois : **impossible de nommer le client** (capture `19-nommer-2`) |
| Admin, 1440 | Menu de ligne → « Supprimer le contact » | Accepté pour un débiteur et pour le Client comptoir (D1, D2) |
| Dépôt, lecteur | Écran | Aucun accès. API : tout est lisible (D10) |

Le vendeur a les mêmes écrans de vente que le caissier (`R.sales`) : non rejoué.

## 4. Défauts prouvés

### Argent

| # | Défaut | Preuve | Où |
|---|---|---|---|
| D1 | **Supprimer un débiteur efface sa dette des relances.** La facture reste due, mais le client sort de la liste ; idem si le gérant décoche « Client » | TI-00015 doit 7 000 F (FAC-2026-00203) : `DELETE` 200, fiche 404, facture « reste 7 000 ». TI-00014 doit 10 000 F : `PUT est_client=false` 200. `GET /reports/receivables` : 12 lignes → 10 (`ReportingService.ts:108-109` filtre `est_client` et `deleted_at`) | Écran (admin ; gérant pour la case) |
| D2 | **Le Client comptoir se supprime d'un clic**, et la vente comptoir meurt | `DELETE /tiers/1` 200 ; `GET /tiers/comptoir` 404 ; `POST /factures/comptoir` 422. Le message dit « Créez un client « Client comptoir » » : recréé, il reçoit le code TI-00018, toujours 404 (le code `PASS` ne se saisit nulle part). 5 171 654 F de dette anonyme (8 factures) sortent des relances. Le gérant peut aussi lui donner un plafond (`PUT` 200, 500 000 F ; voir 06-A) | Écran (admin) |
| D3 | **Doublons acceptés sans un mot**, dette éclatée | Le caissier crée 4 fois KOUASSI Jean-Marc (TI-00014 à 17 : « 07 08 09 10 11 », « 0708091011 », « +225 07 08 09 10 11 », puis à l'identique) : 4 × 201. Ventes à crédit : 14 000 F sur l'une, 7 000 F sur l'autre ; chaque fiche a son propre plafond | Écran |

### Blocage

| # | Défaut | Preuve | Où |
|---|---|---|---|
| D4 | Vente comptoir : client impossible à nommer | `VenteComptoir.tsx:425` `setClient(t ?? comptoir)` ; le × appelle `onChange(null)` (`TiersPicker.tsx:265`) | Écran |
| D5 | Recherche mal adaptée au téléphone | « 0708091011 » ne trouve que la fiche saisie sans espaces ; « +2250708 » et « 2250708091011 » : 0 ; le prénom n'est jamais cherché (`TiersService.ts:82, 625`) ; « Kouasi » : 0 ; « _ » et « % » renvoient tous les clients (14) | Écran |
| D6 | Numéro tapé → nom du client | `NouveauClientDialog.tsx:90` met le texte cherché dans `raison_sociale` | Écran |
| D7 | Un seul numéro, 20 caractères, erreur en anglais | Zod `max(20)` (`schemas.ts:93`) ; toast anglais (le formulaire Contacts ne contrôle pas la longueur) | Écran |
| D8 | Au comptoir, personne ne voit la dette ni les achats d'un client | Page réservée admin, gérant ; le sélecteur n'affiche que le téléphone. Dette : lot 06-E | Écran |
| D9 | Ni import, ni dette de départ | Aucune route d'import ; aucune notion de solde d'ouverture (recherche vide). Un script de développement insère des factures en SQL | Lecture |

### Gêne et données

| # | Défaut | Preuve | Où |
|---|---|---|---|
| D10 | Dépôt et lecteur lisent tout, contre la décision « le dépôt ne voit que des quantités » | `GET /tiers` (téléphones, soldes, plafonds), `/tiers/2/compte`, relevé PDF, `/factures/top-clients` (chiffre d'affaires par client), `/crm/*` : 200 pour caissier, vendeur, dépôt, lecteur (`routes/tiers.ts:12-32` sans `authorize`) | API |
| D11 | « Analyse clients » trompe | En tête : Client comptoir, 14 %. « Moyenne par client » 6 145 910 F = 61 459 100 / 10 : moyenne des 10 premiers seulement ; vrai total 61 480 100 F (SQL). Aucun nom ne mène à la fiche : `getTopClients` ne renvoie pas `t.id` (`FactureService.ts:1260`), 0 lien. Toutes années, avoirs non déduits (05-D) | Écran |
| D12 | Liste : tri sur le cache, affichage du calcul | `Tiers.tsx:44, 91`. Le cache suit l'ERP (14 000 puis 10 000 après un paiement de 4 000, égal au calcul) mais reste à 0 pour des données reprises (5 171 654 F au calcul) : tri faux après un import. Formule : 04-A. `statut_solde=crediteur` renvoie 13 contacts sur 13 (paramètre ignoré, `TiersService.ts:62-89`) | Écran (tri), API (filtre) |
| D13 | Modifier ou supprimer un contact n'est pas journalisé | `audit_log` : 16 lignes `tiers`, toutes `create`, après 3 `PUT` et 1 `DELETE` (`TiersController.ts:120-141`) | Lecture |
| D14 | Erreurs serveur | `PUT` sans aucun rôle : 500 (contrainte `tiers_at_least_one_role`) ; note sur un contact inexistant : 500 | API |
| D15 | CRM inerte | 0 interaction, 0 tâche sur le banc. `/crm/rappels` jamais appelé (rappel d'hier visible seulement en bas de fiche). Total des tâches faux (2 pour 1, `CrmService.ts:182`). Type libre (`whatsapp` accepté). Caissier et vendeur : 403 pour une simple note | Écran |
| D16 | Fiche | Libellé « NIF » (en Côte d'Ivoire : NCC) ; relevé ancien d'abord ; pas d'articles | Écran |

Revérifié : « Client comptoir en tête des relances sans téléphone » (vrai, fiche 06, D2) ; « crédit illimité du client créé par le caissier » (vrai, 06-A) ; « Contacts réservé gérant et admin » (vrai).

## 5. Comparaison

Source : [faits/concurrents.md](../faits/concurrents.md).

- **Odoo** : client créé depuis la caisse, historique ; import avec modèle, essai avant import et identifiant externe contre les doublons (O17). CRM à part (non vérifié).
- **Sage** : prospects, analyse d'activité et de risque (G1).
- **Loyverse** : import et export CSV (10 000 lignes), historique, points de fidélité (L9, L10).
- **Minimum attendu** (étude) : téléphone comme clé, anti-doublon, solde, catégorie de prix, WhatsApp ; pas de pipeline commercial.
- **Mieux chez nous** : une seule fiche client et fournisseur avec solde net ; relevé PDF ligne par ligne, rare chez les outils locaux.
- **Moins bien** : aucun import, aucun anti-doublon, recherche par téléphone fragile, pas d'historique d'achats lisible.

## 6. Manques

| Profil | Manque du premier mois | Plus tard (une ligne) |
|---|---|---|
| Tous | Retrouver par numéro, anti-doublon, fusion, import, dette de départ, derniers achats | Anniversaire, SMS groupés |
| Alimentaire / grossiste | Plusieurs numéros (gérant, livreur) ; niveau de prix du revendeur (10-H, question 12) | Tournées de livraison |
| Informatique | NCC du client entreprise (03-L) ; garanties par client (10-K) | Contrats de maintenance |
| Habillement | Nommer vite un habitué au comptoir (D4) | Fidélité par points |

Segments « grossiste / détaillant / revendeur » : c'est le niveau de prix de 10-H, pas une catégorie de plus.

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA optionnelle** (03-K) : rien à cacher ici. Le NCC n'est pas lié à la TVA : il sert aux factures entre entreprises.
- **FNE** : 03-L ajoute `tiers.ncc` et `tiers.type_fne`. La FNE exige un NCC de 7 chiffres et une lettre et un téléphone de **10 chiffres** (01, 05, 07, 21, 25, 27), e-mail et téléphone en B2B ([faits/fne.md](../faits/fne.md)). Ici : renommer « NIF » en NCC et normaliser le téléphone (19-E).
- **Mobile money** : le client scanne le QR du magasin ; garder son numéro Wave ou Orange n'apporte rien. La référence de l'opération se saisit au paiement (07-F).
- **WhatsApp** : marquer quel numéro est sur WhatsApp (19-E) ; bouton « WhatsApp » sur la fiche (19-H) ; documents : 03-L ; relances : 06-H.

## 8. Lots

Cités, non réécrits : 04-A (chiffre de la dette, liste comprise), 06-A et 06-C (plafond), 06-E (qui lit compte et relevé), 06-F (« à rappeler aujourd'hui »), 06-H, 03-L, 03-K, 10-H, 10-F, 07-H, fiche 18 (compensation).

### 19-A · Une dette ne disparaît pas avec son contact (S, priorité 1)
- **Problème** : D1, D2, D13, D14.
- **Résultat** : un contact qui a des pièces ne se supprime pas, il s'**archive** : absent des recherches, présent dans « Crédit clients » tant qu'il doit. Le Client comptoir ne se supprime, ne se renomme et ne perd son rôle jamais.
- **Écrans** : Contacts, menu de ligne « Archiver » ; rien pour le Client comptoir.
- **API** : `DELETE /tiers/:id` → 409 si pièces ou solde ≠ 0, sinon archive ; refus de `est_client=false` avec une dette ouverte ; `PASS` protégé (suppression, code, rôle, plafond) ; 422 en français sans rôle ; `logAudit` sur modification, archivage, changement de rôle.
- **Base** : `tiers.archive_le` ; `ReportingService.getReceivablesAging` lit les archivés.
- **Fichiers** : `TiersController.ts`, `TiersService.ts`, `ReportingService.ts`, `Tiers.tsx`.
- **Tests** : TI-00015 (7 000 F) → 409 ; Client comptoir → 409 ; audit écrit.
- **Fini quand** : D1 et D2 rejoués sans perte. **Dépend** : 04-A pour le montant. **Risque** : fiches déjà supprimées : les compter à l'installation.

### 19-B · Nommer le client à la vente comptoir (S, priorité 3)
- **Problème** : D4.
- **Résultat** : « Nommer le client » ouvre le champ ; le × le vide ; le Client comptoir revient seulement après la vente ou par « Annuler ».
- **Fichiers** : `VenteComptoir.tsx:415-440`, test `VenteComptoir.test.tsx`.
- **Tests** : nommer, effacer, renommer ; vendre ; client par défaut après la vente.
- **Fini quand** : rejoué à 390 et 1440. **Dépend** : rien ; repris tel quel par 07-H. **Risque** : nul.

### 19-C · CRM réduit à des notes (S, priorité 2)
- **Problème** : D15 ; tâches, priorités et réunions sans usage pour une boutique.
- **Résultat** : une seule rubrique « Notes » en haut de fiche : texte, canal (appel, WhatsApp, passage), date de rappel facultative.
- **Base** : migration : tâches ouvertes copiées en notes, puis `DROP TABLE crm_taches` ; `ci-baseline.sql`.
- **API** : supprimer `/crm/taches*` ; type contrôlé par Zod ; tiers inconnu → 404 ; rappels selon 06-F ; écriture selon question 4.
- **Fichiers** : `routes/crm.ts`, `CrmService.ts`, `schemas.ts`, `TiersDetail.tsx`, `api.ts`.
- **Tests** : note avec rappel ; tiers inconnu ; caissier selon la réponse.
- **Fini quand** : plus aucune référence à `taches`. **Risque** : relances de 06-B, qui lisent `crm_interactions` : à garder vertes.

### 19-D · « Analyse clients » fondue dans la liste (M, priorité 2)
- **Problème** : D11.
- **Résultat** : page supprimée. La liste gagne « Achats sur 12 mois » et « Dernier achat », triables, et le filtre « Ne revient plus » (aucun achat depuis 60 jours). Client comptoir à part.
- **API** : `GET /tiers` : colonnes calculées en SQL, tri côté serveur, nettes des avoirs (05-D) ; supprimer `/factures/top-clients` et la route `/clients/analytics` (redirection vers `/tiers`).
- **Fichiers** : `ClientAnalytics.tsx` (supprimé), `App.tsx`, `routeAccess.ts`, `navConfig.tsx`, `TiersService.ts`, `FactureService.ts`, `Tiers.tsx`.
- **Tests** : total = SQL des factures vivantes moins avoirs ; tri ; filtre 60 jours.
- **Fini quand** : aucun lien mort ; chiffres prouvés contre les factures. **Dépend** : 05-D, 03-E (qui voit le chiffre d'affaires). **Risque** : lenteur à 5 000 contacts : index sur `factures(tiers_id, date_facture)`.

### 19-E · Le téléphone comme clé (M, priorité 3)
- **Problème** : D5, D6, D7.
- **Résultat** : trois numéros (principal, second, « sur WhatsApp ») ; « 07 08 09 10 11 », « 0708091011 » et « +225 07… » désignent le même numéro ; on trouve par 4 chiffres, par prénom ou surnom, malgré une faute.
- **Base** : `tiers.telephone2`, `telephone_whatsapp` ; colonnes normalisées (10 chiffres) indexées ; reprise des numéros existants ; libellé « Prénom ou surnom » cherché ; index trigramme (même mécanisme que 10-F).
- **API** : recherche sur chiffres seuls + nom, prénom, code, NCC ; échappement de `%` et `_` ; messages Zod en français.
- **Écrans** : un texte de chiffres tapé va dans « Téléphone » ; « NIF » devient « NCC ».
- **Fichiers** : `TiersService.ts`, `schemas.ts`, `NouveauClientDialog.tsx`, `TiersPicker.tsx`, `Tiers.tsx`.
- **Tests** : les recherches de D5 ; numéro à 9 ou 11 chiffres refusé.
- **Fini quand** : D5 à D7 rejoués. **Risque** : numéros étrangers : accepter et signaler.

### 19-F · Doublons : prévenir, puis fusionner (M, priorité 3, deux étapes)
- **Problème** : D3.
- **Étape 1** : à la création, « Ce numéro est celui de KOUASSI Jean-Marc » avec « Choisir ce client » (avertir, question 2).
- **Étape 2** : « Fusionner avec… » (gérant, question 3) : factures, paiements, acomptes, avoirs, devis, bons, retours, notes, compensations, pièces fournisseur passent sur la fiche gardée, en une transaction ; l'autre est archivée (19-A) ; journal d'audit.
- **API** : `POST /tiers/:id/fusionner` ; liste « Doublons probables » (même numéro normalisé).
- **Fichiers** : `TiersService.ts`, `TiersController.ts`, `routes/tiers.ts`, `TiersDetail.tsx`, `NouveauClientDialog.tsx`.
- **Tests** : fusion de TI-00014 à 17 : dette 21 000 F sur une fiche ; plafond recalculé ; période close.
- **Dépend** : 19-E, 19-A, 04-A. **Risque** : oublier une table : liste tirée des clés étrangères vers `tiers`.

### 19-G · Importer ses clients et leur dette de départ (L, priorité 3, deux étapes)
- **Problème** : D9 ; le cahier de crédit ne se reprend pas.
- **Étape 1** : import Excel ou CSV : nom, prénom, numéros, NCC ; aperçu, doublons signalés (19-E), rien d'écrit avant validation.
- **Étape 2** : « Dette de départ » : pièce numérotée `REP-` (montant, date, note), comptée par 04-A, visible dans « Crédit clients » et le relevé, payable comme une facture ; écriture selon la fiche 22.
- **API** : `POST /tiers/import` (simulation puis application), `POST /tiers/:id/reprise`.
- **Fichiers** : nouveau service d'import, `routes/tiers.ts`, `Tiers.tsx`, `NumberingService.ts`.
- **Tests** : 500 lignes ; doublons ; numéro invalide ; reprise payée en partie.
- **Fini quand** : un cahier de 200 clients repris en moins d'une heure. **Dépend** : 04-A, 19-E, fiche 22. **Risque** : double reprise : une seule pièce `REP` par client.

### 19-H · Une fiche qui répond au comptoir (M, priorité 4)
- **Problème** : D8, D16, parcours de 4 gestes puis une facture par geste.
- **Résultat** : en haut de fiche : dette (04-A), dernier passage, **10 derniers articles achetés** ; boutons « Appeler », « WhatsApp » (`wa.me`, numéro seul), « Modifier » ; relevé récent d'abord. Depuis le sélecteur de vente, « Voir le client » ouvre une fiche réduite (sans chiffre d'affaires) au caissier et au vendeur.
- **API** : `GET /tiers/:id/derniers-achats`.
- **Fichiers** : `TiersDetail.tsx`, `TiersPicker.tsx`, `TiersService.ts`, `routeAccess.ts`.
- **Tests** : caissier ouvre la fiche réduite ; dépôt refusé ; 390.
- **Fini quand** : « client fidèle revient » en 3 gestes au comptoir. **Dépend** : 06-E, question 1, 13-D1 (boutique). **Risque** : relevé : ne pas dupliquer le PDF.

### 19-I · Qui lit les contacts (S, priorité 3)
- **Problème** : D10.
- **Résultat** : dépôt et lecteur ne lisent ni solde, ni plafond, ni chiffre d'affaires (dépôt : nom et téléphone pour livrer) ; notes lisibles par ceux qui les écrivent ; à la demande d'un client, ses coordonnées sont effacées (anonymisées), ses factures gardées.
- **API** : `authorize` sur `GET /tiers`, `/tiers/:id`, `/crm/*` ; champs filtrés par rôle ; `POST /tiers/:id/anonymiser` (admin).
- **Fichiers** : `routes/tiers.ts`, `routes/crm.ts`, `TiersController.ts`.
- **Tests** : chaque rôle × chaque route (matrice de la fiche 24).
- **Dépend** : 06-E, fiche 24. **Risque** : casser le sélecteur de vente (il garde `/tiers/search`).

## 9. Questions au propriétaire

1. Au comptoir, caissier et vendeur voient-ils la dette et les derniers achats d'un client ? Proposé : oui, sans le chiffre d'affaires. Si non, 19-H se limite au gérant.
2. Deux fiches avec le même numéro (famille, boutique partagée) : avertir (proposé) ou interdire ?
3. Fusionner deux fiches : gérant (proposé) ou admin seul ?
4. Le caissier écrit-il une note (« passe vendredi », « paie par Wave ») ? Proposé : oui, sans suppression.
5. Reprise du cahier de crédit : faite par le commerçant (import) ou par l'installateur (fiche 28) ?
6. Données personnelles (loi ivoirienne de 2013 et ARTCI, supposé, non recherché) : qui fait la déclaration, l'éditeur ou le commerçant ? Combien de temps garde-t-on un client sans achat ?

**À transmettre** : fiche 07 et 07-H (D4, même composant) ; fiche 24 (lectures ouvertes à tous, D10) ; fiche 28 (le script de développement `seed-clients-excel.mjs` contient en dur des noms et des soldes tirés d'un fichier client réel : à retirer du dépôt) ; fiche 22 (écriture d'une dette de départ) ; fiche 23 (le classement client part des Rapports s'il y est repris).

**Non vérifié** : vendeur à l'écran ; fiche d'un contact mixte à 390 ; PDF du relevé (contenu, 04-A) ; lenteur de la liste à plusieurs milliers de contacts.
