# 24 Utilisateurs, rôles, connexion

> **Contre-expertise du 2026-11-27** ([détail](../vagues/vague-7-contre-expertise.md)) : Verdict maintenu, réduit. D1 et D2 sont un seul défaut avec 19-D10 ; le dépôt écrit aussi des pièces jointes. Le masquage `roleRedaction.ts` traduit trop étroitement la décision d'octobre. D3 : la porte est ouverte, mais l'acompte fournisseur s'impute seul dès sa création (094) et l'acompte client au comptoir est voulu. D5 : une base neuve est sûre ; l'instance de démonstration ne l'est pas (`demo` / mot de passe publié, sans changement imposé). 24-A est découpé en 24-A1 (fermer l'API) et 24-A2 (table à l'écran, plus tard) ; 24-F réduit ; 24-I (PIN) passe avant 10-C. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-27, base `nolyx_audit_2`, API et interface réelles (six rôles, 1440 et 390 px). Montants en FCFA. Créés pendant l'audit : comptes `t24*` et `awa*`, factures FAC-2026-00203 et 00204, et la ligne de paramètres par défaut (un `PUT /company-settings {}` de test). Limite de débit relevée sur le banc : jugée sur le code.

## 1. Verdict

**Améliorer.** La base est saine : jeton dans un cookie que les scripts ne lisent pas, session vérifiée en base à chaque appel, employé désactivé coupé en 32 ms. Mais les droits n'existent qu'à l'écran : par l'API, le magasinier lit le chiffre d'affaires, le « lecteur » lit tout et écrit, le caissier impute un acompte fournisseur. Le deuxième employé sans e-mail est refusé. Ni PIN, ni gérant qui gère son équipe, ni comptable. On garde six rôles fixes, renommés, et une matrice tenue par le serveur.

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire boutique / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Besoin | 5 | 5 | 5 | 4 / 5 | 4 | 5 |
| Réponse actuelle | 2 | 2 | 2 | 2 / 2 | 2 | 2 |

- **Grossiste, informatique** : vendeur qui prépare, caissier qui encaisse, magasinier, comptable externe : les six rôles servent.
- **Habillement, alimentaire boutique** : deux ou trois personnes sur une caisse ; changer vite de vendeur compte plus que les rôles.
- **Un magasin** : comptes séparés et accord du gérant, pas d'affectations.

## 3. Parcours réel

**« J'embauche une vendeuse, elle travaille dans 5 minutes sur son téléphone »** (admin, 390, capture `24-creation-sans-email`) : Utilisateurs → « Nouvel utilisateur » → nom, identifiant, mot de passe, rôle (2 gestes), boutique → « Créer » : **8 gestes**. Réponse : **« Ce nom d'utilisateur existe déjà »** pour un identifiant neuf (D7) ; avec une adresse inventée, « Utilisateur créé ». La vendeuse se connecte en 3 gestes et garde le mot de passe choisi par le patron. Le gérant ne peut pas embaucher (403).

**« Je renvoie un caissier ce soir »** : Utilisateurs → Modifier → décocher « Compte actif » → Enregistrer : 3 gestes. Rejoué, gérant connecté, flux de notifications ouvert :

| Après la désactivation | Résultat |
|---|---|
| Appel avec le cookie déjà émis | 401 « Session révoquée », 32 ms après |
| Clic dans l'onglet ouvert | 401, renvoi à la connexion (`api.ts:96`) |
| Flux de notifications ouvert | **reste ouvert**, reçoit « FAC-2026-00203 — Alimentation Chez Tantie : 22 000 FCFA » |
| Reconnexion, faux mot de passe | 403 « Compte désactivé » : le compte existe |

Le gérant ne peut pas désactiver (403) : patron absent, le renvoyé garde son accès.

**Rôle par rôle : l'écran comparé à l'API**

| Rôle (nom à l'écran) | L'écran montre | L'API accepte en plus |
|---|---|---|
| Administrateur | tout | — |
| Gérant | tout sauf Utilisateurs, journal, réglages de paie | — |
| Caissier | vendre, caisse, dépenses, factures | lire les achats ; imputer un acompte fournisseur ; prendre un acompte hors vente |
| Personnel magasin | idem, plus devis, bons, étiquettes, comptage | idem caissier |
| Personnel dépôt | stock, réceptions, transferts, en quantités | factures, chiffre d'affaires, paiements, achats, relevés clients, **avec montants** |
| Consultation | accueil vide et Inventaire (capture `24-lecteur-accueil`) | toutes les lectures d'argent sauf rapports, comptabilité, paie (403) ; joindre un fichier à une facture (201) |

**Poste partagé** : changer de vendeur, c'est se déconnecter et retaper identifiant et mot de passe devant le client. Pas de mise en veille (`AuthContext.tsx`, aucun minuteur) ; session de 7 jours (`auth.ts:31`) ; sessions sans limite par compte (4 rejouées). La caisse tournera sur un compte partagé : personne ne répond d'un écart.

## 4. Défauts prouvés

### Argent (droits et confidentialité)

- **D1. Le magasinier lit l'argent.** Compte `depot`, API 200 avec montants : `/factures/stats` (199 factures, 61 459 100 F), `/factures/3` (total, payé, client), `/factures/export`, `/paiements`, `/factures-fournisseur` et stats, `/tiers/:id/compte`, `/releve-detaille`. Le masquage (`roleRedaction.ts:8`) ne sert que dans cinq contrôleurs de stock et d’achat. Décision d'octobre non tenue. API seulement.
- **D2. « Consultation » : rien à l'écran, tout par l'API.** Le rôle n'est dans aucun groupe (`routeAccess.ts:58-93`) : menu « Tableau de bord, Inventaire ». L'API lui ouvre factures, paiements, achats, relevés ; elle lui refuse rapports et comptabilité, ce qu'un comptable lirait. Il **écrit** : pièce jointe sur la facture 3, 201 (`attachments.ts:11`, aucun contrôle de rôle). API seulement.
- **D3. Caissier et vendeur passent le contrôle de rôle** sur `POST /acomptes/fournisseur/:id/apply` (`acomptes.ts:18` : 400 sur corps invalide, pas 403) et `POST /tiers/:id/acomptes-client` (`tiers.ts:35`, 404) ; l'écran réserve achats et fiches contacts au gérant. Ils lisent les achats (fiche 18). API seulement.
- **D4. Renvoyé ou rétrogradé, il reçoit encore les montants.** Rejoué : un gérant désactivé et un gérant passé en « Consultation » reçoivent la notification de la facture de 22 000 F. Le rôle est figé à l'ouverture du flux (`notifications.ts:63`) ; la révocation ne ferme rien (`auth.ts:232-249`). À l'écran, onglet laissé ouvert.
- **D5. La migration 097 ne ferme pas les comptes de démonstration.** Elle impose un changement de mot de passe, qui ne demande que l'ancien, publié (`auth.ts:83-92`, `AuthController.ts:338-352`) : qui connaît `manager123` choisit le nouveau et entre. Prouvé par lecture. Seules les bases ayant rejoué les anciennes migrations ont ces comptes ; un client neuf n'a qu'`admin`, mot de passe tiré au hasard (`provision-client.sh:107`).
- **D6. Vendeur de MAG-2 facture à MAG-1** : 201 (FAC-2026-00204). Confirmé ; propriétaire 13-D1.

### Blocage

- **D7. Deuxième employé sans e-mail impossible.** L'écran envoie `email: ''` (`UserManagement.tsx:216-221`), la base le garde (`AdminUserService.ts:50-53`), l'e-mail est unique (`ci-baseline.sql:5780`) et l'erreur est traduite « Ce nom d'utilisateur existe déjà » (`AdminUserController.ts:52-54`). Rejoué à l'écran et par l'API (409).
- **D8. Le gérant ne peut ni créer, ni désactiver, ni débloquer un employé** (`admin-users.ts:10`, 403 rejoué).
- **D9. Patron qui oublie son mot de passe : aucune issue.** La page dit « demandez à votre administrateur » (`Login.tsx:146`) : c'est lui.
- **D10. Un admin se retire lui-même ses droits**, même le dernier : rejoué (passé en « Consultation », 200) ; aucune garde (`AdminUserService.ts:97-179`).

### Gêne

- **D11. Corriger le nom d'un employé le déconnecte** : l'écran renvoie toujours le rôle (`UserManagement.tsx:221`), le service coupe les sessions dès que `role_id` est présent (`AdminUserService.ts:162`). Rejoué : 401.
- **D12. Mot de passe remis par l'admin : rien n'oblige à le changer** (rejoué : `must_change_password = false`). Le patron connaît le mot de passe de chacun.
- **D13. Échecs de connexion ni tracés ni bloqués par compte.** Trois échecs rejoués : aucune ligne au journal. Seule limite : 10 échecs par IP en 15 min (`server.ts:99-106`) ; la boutique partage une IP, dix fautes de frappe bloquent tout le monde ; un attaquant change d'IP.
- **D14. « Compte désactivé » répondu avant le mot de passe** (`AuthController.ts:47-55`) : révèle l'existence du compte.
- **D15. Trois portes pour les comptes** : `/admin/users` (l'écran), `/auth/register` (rôle inconnu → caissier : « patron » rejoué, 201), `/auth/users` et `/auth/users/:id`.
- **D16. Noms de rôles flous** : « Gérant — Manager magasin », « Personnel magasin — Personnel de magasin », « Consultation — Lecteur seul ». Ni dernière connexion ni appareils dans la liste.

## 5. Comparaison

- **Odoo** : caisse en trois niveaux de droits, badge ou PIN pour changer de caissier [O15] ; ≈ 5 900 F par utilisateur par mois.
- **Sage 100** : utilisateurs par dépôt dès Standard [G1].
- **Loyverse** : rôles libres (« voir le coût », « 5 derniers reçus ») et PIN d'un responsable pour un accord ponctuel [L5][L6] ; 5 $ par employé.
- **eBoutik** : « chaque vendeur a son accès et ne voit que l'utile » [P7].
- **Nous, mieux** : comptes sans surcoût, coupure immédiate. **Moins bien** : pas de PIN, droits non tenus par le serveur.

## 6. Manques

- **Tous** : PIN du gérant, création sans e-mail, mot de passe provisoire, gérant qui gère son équipe, dernière connexion.
- **Habillement, alimentaire boutique** : changer de vendeur par code, veille de la caisse.
- **Grossiste, informatique** : comptable qui lit sans écrire. **Plusieurs sites** : droits par boutique (13-C, 13-D1).
- **Plus tard** : droits case par case, double authentification, SMS, heures d'accès.

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA** : activer l'assujettissement (03-K) : patron seul.
- **FNE** : la facture se certifie à la vente, par qui vend, quand le patron l'a choisi (03-L). Un avoir certifié ou une annulation : gérant, ou caissier avec PIN. La clé FNE : patron seul, jamais renvoyée par l'API.
- **Mobile money** : le vendeur saisit l'encaissement Wave et sa référence (07-F) ; le gérant rapproche le relevé (04-H) ; plus tard, la confirmation automatique remplace la saisie.
- **WhatsApp** : envoyer un document demande le droit de le lire.

## 8. Lots proposés

Migration : numéro libre (dernière `113`), `ci-baseline.sql` régénéré. Déjà ailleurs : boutique de l'utilisateur **13-D1**, une seule affectation **13-C**, prix d'achat et chiffre d'affaires **03-E**, journal **fiche 26**.

**Matrice des droits proposée** (pour 24-A, 06-E, 08-E). B = dans sa boutique ; PIN = avec l'accord du gérant sur place ; « – » = non ; Q = question du suivi.

| Action | Patron | Gérant | Caissier | Vendeur | Magasinier | Comptable |
|---|---|---|---|---|---|---|
| Vendre au prix catalogue, encaisser | oui | oui | B | B | – | – |
| Remise hors plafond, sous le plancher | oui | oui | PIN | PIN | – | – |
| Crédit dans le plafond (Q6) / au-delà | oui | oui | B / PIN | B / PIN | – | – |
| Devis, bon de livraison | oui | oui | – | B | – | – |
| Annuler une vente, rembourser | oui | oui | PIN | PIN | – | – |
| Sortie d'argent sous le seuil / au-dessus | oui | oui | B / PIN | B / PIN | – | – |
| Ouvrir, fermer la caisse | oui | oui | B | B | – | – |
| Corriger une journée fermée | oui | oui | – | – | – | – |
| Payer un fournisseur (Q30) | oui | oui | PIN | – | – | – |
| Commande, facture fournisseur | oui | oui | – | – | – | lire |
| Recevoir, transférer | oui | oui | – | – | B | – |
| Compter (Q43) / ajuster, perte (Q11) | oui | oui | Q43 / – | B / – | B / PIN | – |
| Coût, marge, chiffre d'affaires, rapports | oui | oui | – | – | – | lire |
| Dette d'un client | oui | oui | oui | oui | – | lire |
| Comptes, PIN, mots de passe | oui | son équipe | – | – | – | – |
| Paramètres, TVA, FNE, modules | oui | – | – | – | – | – |
| Encaissement Wave : saisir / rapprocher | oui | oui | B / – | B / – | – | lire |

### 24-A · Une matrice des droits, tenue par le serveur (M, priorité 1)
**Problème** : D1, D2, D3 ; tableau « l'écran comparé à l'API ». **Résultat** : ce que l'écran cache, l'API le refuse ; le magasinier ne reçoit aucun montant.
**API** : `config/droits.ts` (action → rôles), lu par `authorize(droit('facture.lire'))` dans chaque routeur et servi au front, d'où `routeAccess.ts` tire ses groupes. Lectures d'argent fermées au dépôt et aux rôles sans droit : `factures*`, `paiements*`, `devis`, `avoirs`, `retours`, `factures-fournisseur*`, `tiers/:id/compte|releve*`, `depenses`, `caisse/historique`. `acomptes/fournisseur/*/apply` : gérant, patron. `POST /attachments` : droit d'écriture de la pièce. Ce lot porte la table et le test ; 03-E, 18-J, 06-E, 08-E, 09-B, 13-D1 appliquent leur ligne.
**Fichiers** : `config/droits.ts`, routeurs, `roleRedaction.ts`, `routeAccess.ts`, `role-smoke.test.ts` → `droits.test.ts`.
**Tests** : boucle rôle × route de `server.ts` contre la table ; aucune clé `montant|total|prix|solde|valeur|marge` répondue au dépôt.
**Fini quand** : matrices de l'audit rejouées : 0 écart. **Dépend** : rien. **Risque** : un écran appelle une route fermée ; le test par rôle le voit.

### 24-B · Renvoyer, c'est tout couper (S, priorité 1)
**Problème** : D4, D10, D14. **Résultat** : un renvoyé ou un rétrogradé ne reçoit plus rien ; il reste toujours un patron.
**API** : `revokeAllUserSessions` appelle `NotificationService.disconnectUser(id)` ; le battement revérifie la session. `updateUser` : 409 « Il doit rester au moins un administrateur actif » ; un admin ne se désactive ni ne se rétrograde. Connexion : mot de passe vérifié avant `actif`.
**Fichiers** : `middleware/auth.ts`, `NotificationService.ts`, `notifications.ts`, `AdminUserService.ts`, `AuthController.ts`.
**Tests** : désactivation ou rétrogradation → flux fermé, plus aucune notification ; dernier admin → 409 ; désactivé et faux mot de passe → 401.
**Fini quand** : D4, D10, D14 rejoués refusés. **Dépend** : rien. **Risque** : faible.

### 24-C · Une seule porte pour les comptes (S, priorité 2)
**Problème** : D15. **Étapes** : supprimer `POST /auth/register`, `GET /auth/users`, `PUT /auth/users/:id`, leurs méthodes dans `AuthController.ts` et `authService.ts`, ce qui reste sans appelant dans `UserModel.ts` ; `role-smoke.test.ts` lit `/admin/users`.
**Tests** : 404 sur les trois routes ; écran inchangé. **Fini quand** : aucune référence hors tests. **Dépend** : rien. **Risque** : aucun client externe connu.

### 24-D · Embaucher sans e-mail, mot de passe provisoire (S, priorité 3)
**Problème** : D7, D11, D12. **Résultat** : un nom et un identifiant suffisent ; l'employé choisit son mot de passe à la première connexion.
**Base** : `UPDATE utilisateurs SET email = NULL WHERE email = ''` ; `CHECK (email <> '')`.
**API** : Zod : `''` → `NULL` ; 23505 traduit selon la contrainte ; création et réinitialisation posent `must_change_password = true` ; sessions coupées seulement si rôle, statut, mot de passe ou boutiques **changent**.
**Écran** : « Mot de passe provisoire », bouton « Générer », puis « À donner à Awa : … » et « Copier ».
**Fichiers** : migration, `schemas.ts:542-558`, `AdminUserService.ts`, `AdminUserController.ts`, `UserManagement.tsx`.
**Tests** : deux créations sans e-mail → 201, 201 ; e-mail en double → 409 juste ; corriger le nom → session gardée ; réinitialiser → changement imposé.
**Fini quand** : l'embauche rejouée sans erreur. **Dépend** : rien. **Risque** : faible.

### 24-E · Le gérant gère son équipe (S, priorité 3)
**Problème** : D8. **Résultat** : le gérant embauche, renvoie, débloque caissiers, vendeurs et magasiniers de ses boutiques ; jamais le patron ni un gérant.
**API** : `/admin/users` ouvert au gérant, limité à `caissier`, `magasin_staff`, `depot_staff` (403 sinon, s'élever compris) et à ses boutiques (après 13-C). **Écran** : « Utilisateurs » au menu du gérant, rôles filtrés.
**Fichiers** : `admin-users.ts`, `AdminUserService.ts`, `routeAccess.ts`, `UserManagement.tsx`.
**Tests** : gérant crée un vendeur 201, un gérant 403, se promeut 403, désactive un caissier 200.
**Fini quand** : D8 rejoué, 201. **Dépend** : question 2, 13-C. **Risque** : compte fantôme ; le journal (fiche 26) le montre.

### 24-F · Connexion : verrou par compte, journal, appareils (M, priorité 3)
**Problème** : D9, D13, D16. **Résultat** : on ne devine pas un mot de passe ; le patron voit qui s'est connecté et coupe un appareil.
**Base** : `utilisateurs.echecs_connexion`, `bloque_jusqu_a`.
**API** : 5 échecs d'un compte → bloqué 15 min (« votre gérant peut le débloquer ») ; journal `login_echec` (identifiant, IP, appareil) et `logout` ; limite par IP portée à 50 ; `GET /admin/users/:id/sessions`, `DELETE …/sessions/:sid`, `POST …/debloquer`. Patron sans mot de passe : `deploy/reset-password.sh` (provisoire, changement imposé ; fiche 28).
**Écran** : « Dernière connexion » dans la liste ; « Appareils connectés » sur la fiche.
**Tests** : 6e essai bloqué même juste ; débloquer → 200 ; un compte bloqué n'empêche pas les autres de la même IP.
**Fini quand** : D13 rejoué, bloqué et tracé. **Dépend** : 24-D. **Risque** : un collègue bloque un compte ; le gérant débloque.

### 24-G · Comptes de démonstration fermés pour de bon (S, priorité 3)
**Problème** : D5. **Résultat** : un mot de passe publié n'ouvre jamais un compte.
**API** : au démarrage, chaque couple publié dans 004 et 040 dont le hash correspond (`bcrypt.compare`) → `actif = false`, journal, alerte. `changePassword` refuse l'ancien mot de passe et ceux de la liste.
**Fichiers** : `SecurityBootCheck.ts`, `server.ts`, `AuthController.ts`. **Tests** : `manager/manager123` désactivé au démarrage ; nouveau mot de passe `admin123` → 400.
**Fini quand** : aucun mot de passe publié n'ouvre de session. **Dépend** : rien. **Risque** : instance `demo` exclue (fiche 28).

### 24-H · Six rôles aux noms du commerce, un vrai comptable (M, priorité 3)
**Problème** : D2, D16. **Résultat** : Patron, Gérant, Caissier, Vendeur, Magasinier, Comptable, chacun décrit en une phrase ; le comptable lit factures, dépenses, achats, rapports et comptabilité, n'écrit rien.
**Base** : `roles.description` réécrites, `nom` inchangé. **API** : `viewer` en lecture sur `reports`, `general-ledger`, `comptabilite` ; 403 sur toute écriture. **Écran** : `utils/roles.ts`, menu du comptable.
**Fini quand** : D2 rejoué : lectures 200, écritures 403. **Dépend** : 24-A, question 10 du suivi.

### 24-I · Code PIN du gérant : l'accord sur place (M, priorité 3)
**Problème** : aucun PIN dans le code ; attendu par 06-C2, 03-E, 05-F, 07-E, 08-B, 09-B, 10-C, 12-D.
**Résultat** : le gérant tape son code et un motif sur la tablette du vendeur, la vente passe ; le soir, le patron voit qui a accordé quoi.
**Base** : `utilisateurs.pin_hash` (bcrypt), `pin_echecs`, `pin_bloque_jusqu_a` ; table `accords` (action, objet_type, objet_id, montant, demandeur_id, accordeur_id, motif, ip, date).
**API** : `PUT /auth/pin` (mot de passe exigé, 4 à 6 chiffres, unique parmi les gérants actifs : il désigne la personne). L'accord voyage dans l'appel métier, `accord: { pin, motif }` ; `AccordService.verifier(action, objet, montant, accord, client)`, dans la transaction : PIN d'un patron ou d'un gérant de la boutique, motif obligatoire, ligne `accords` écrite ; 5 erreurs → bloqué 15 min, patron prévenu ; PIN jamais journalisé. Actions : les « PIN » de la matrice.
**Écran** : fenêtre « Accord du gérant » ; « Mon code d’accord » dans Mon profil ; « Accords du jour » (08-L).
**Fichiers** : migration, `AccordService.ts`, `routes/auth.ts`, `Profil.tsx`, `AccordGerant.tsx`.
**Tests** : bon PIN → 201 et ligne ; PIN de vendeur → 403 ; 5 erreurs → bloqué ; gérant d'une autre boutique → 403.
**Fini quand** : 06-C2 l'emploie. **Dépend** : 24-A, 13-C. **Risque** : PIN prêté ; le rapport du soir le montre.

### 24-J · Poste partagé : changer de vendeur par code (M, priorité 4)
**Problème** : section 3, poste partagé. **Résultat** : sur la caisse commune, chacun touche son prénom et tape son code ; la vente est à son nom ; veille après 5 minutes sans geste.
**Base** : table `postes` (nom, location_id, jeton_hash, actif) ; `pin_hash` de 24-I pour tous.
**API** : le patron déclare « ce navigateur est un poste de caisse » (cookie `poste`) ; `POST /auth/poste/changer { utilisateur_id, pin }` seulement avec ce cookie, pour un employé de la boutique ; session de 12 h, la précédente fermée ; 5 erreurs → verrou.
**Fichiers** : migration, `AuthController.ts`, `middleware/auth.ts`, `AuthContext.tsx`.
**Tests** : sans cookie de poste → 403 ; autre boutique → 403 ; vente suivante au bon nom.
**Fini quand** : deux vendeurs alternent sans mot de passe. **Dépend** : 24-I, 13-C, question 3. **Risque** : code court, borné au poste.

## 9. Questions pour le propriétaire

1. Six rôles fixes (proposé), ou des droits case par case comme Loyverse ? Sinon, la matrice devient le modèle par défaut.
2. Le gérant gère-t-il son équipe (proposé), ou le patron seul ?
3. Caisse partagée : changement de vendeur par code dès le premier client, ou un compte par caisse ?
4. Caissier et vendeur : deux rôles, ou un seul « Vendeur » avec l'option devis et bons ? Ils ne diffèrent que par devis, bons, étiquettes et comptage.
5. Le comptable externe lit-il le coût et la marge ? (proposé : oui)
6. PIN de 4 chiffres (rapide) ou 6 (plus sûr) ? Accord à distance, par téléphone ?
7. Patron qui oublie son mot de passe : remis par nous (proposé), ou numéro de téléphone de secours ?
8. Paramètres, TVA, FNE, modules : au patron seul (proposé) ou aussi au gérant, comme aujourd'hui ?

## Non vérifié

- Limite de débit réelle : jugée sur `server.ts` et `rate-limit.test.ts`. D5 : lu, non rejoué (aucune API ne pose `must_change_password`).
- Faux `X-Forwarded-For` si le port de l'API est joignable sans nginx (`server.ts:51`, `app.listen` sans adresse) : non testé.
