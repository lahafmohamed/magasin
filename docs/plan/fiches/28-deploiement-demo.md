# 28 Déploiement, démo, sauvegardes

> **Contre-expertise du 2026-11-27** ([détail](../vagues/vague-10-contre-expertise.md)) : Verdict maintenu, réduit : 28-K est absorbé (reprise par 10-G et 19-G, un seul classeur), 28-D et 28-G sont découpés (28-D1 : un échec arrête tout avec le code 1 ; 28-G1 : seed refusé hors d'une base marquée démo). Les cinq lots S de tête font moins de trois jours et arrêtent des pertes prouvées. Erreurs : le seed vide 42 tables par CASCADE, pas 32 ; le remède `( set -e … )` de 28-D ne marche pas (rejoué) ; 28-E compare au baseline et ne voit pas une migration oubliée ; la dette fournisseur de départ se reprend déjà. Oublis : une vente refusée consomme un numéro, et la mise à jour de tous continue aussi après une sauvegarde ratée. Les propriétaires de lots sont tranchés dans [01-SUIVI.md](../01-SUIVI.md).

Audit du 2026-11-27, **sans accès à la production**. Rejoué en local : bases `nolyx_audit_28_*` (supprimées ensuite), backend sur 6148 (arrêté), gabarit nginx dans un conteneur nginx 1.27, `update-client.sh` sur deux faux clients à commandes simulées. Sur `nolyx_audit_1` : caisse de la veille clôturée (écart 0), session 3 ouverte, 3 ventes et 4 pièces jointes de test. Scripts : `%TEMP%\nolyx-agents\vague10-1\`.

## 1. Verdict

**Améliorer.** Le principe se garde : une installation par client, une base neuve tirée du baseline, une sauvegarde par nuit, un test de restauration, une suspension par simple fichier. Mais il n'a jamais installé un vrai client et échouerait le premier jour : pas de caisse, démo vide, sauvegardes sur le disque de la base, mise à jour qui dit « OK » après un échec. Manquent la restauration, la reprise des données, le contrôle du schéma. Quatre seeds morts ou porteurs de données réelles : à supprimer.

## 2. Utilité

| | Général | Informatique | Habillement | Alimentaire boutique / grossiste | Un magasin | Plusieurs sites |
|---|---|---|---|---|---|---|
| Besoin | 5 | 5 | 5 | 5 / 5 | 5 | 5 |
| Réponse actuelle | 1 | 1 | 1 | 1 / 1 | 1 | 1 |

Sans installation rien ne sert ; on installe, mais on ne vend pas sans SQL écrit à la main. Grossiste et informatique : gros cahier de crédit à reprendre et à sauvegarder souvent.

## 3. Parcours réel

**Installer un client, de la commande au premier ticket** (base sortie de `ci-db-setup.mjs` avec les réglages de `provision-client.sh`) :

| Étape | Qui | Durée | Résultat |
|---|---|---|---|
| `provision-client.sh` | Installateur | Base 1,3 s ; compilation 5 s + 33 s ici ; `npm ci` non mesuré | Rejoué sans pm2 ni nginx |
| Domaine, `sudo` nginx, certbot | Installateur root | 10 min + propagation (estimé) | Non rejoué |
| 1re connexion | Patron | 1 min | 403 jusqu'au nouveau mot de passe, puis 200 |
| Ouvrir la caisse | Caissier | — | **Bloqué** : `GET /caisse/magasins` → `[]`, ouvrir → 500 |
| 2e boutique | Admin | — | **Bloqué** : 500 |
| Articles, stock de départ | Gérant | 40 s la fiche (fiche 10) | Un par un ; vente → 422 « 0 disponible » |
| Dettes de départ | — | — | Impossible (19-G) |

Aujourd'hui **aucun premier ticket sans SQL de l'installateur**. Après 08-G, 10-G, 19-G, 25-C et 28-F (estimé) : 15 minutes de machine, 1 à 2 heures de reprise avec le patron, une heure de formation.

**Le serveur tombe un samedi** (sauvegarde puis restauration rejouées) :

| Mesure | Résultat |
|---|---|
| `backup-db.sh`, base de 16 Mo, 200 factures | 0,8 s, 452 Ko ; restauration 1,3 s |
| Stock 2 891 (89 393 677,59 F), dettes clients 20 697 785, fournisseurs 583 786, caisse 15 000, journal 68 824 144 = 68 824 144, pièce jointe (même empreinte), 135 lignes d'audit, comptes | **Identiques** à l'heure de la sauvegarde |
| Après la sauvegarde : FAC-2026-00204 et 00205 en espèces, 3 pièces jointes | **Perdues** |
| Première vente sur la base restaurée | **FAC-2026-00204**, numéro déjà remis au client du samedi |
| Caisse restaurée | Ouverte, sans les 10 000 F de l'après-midi : écart à la clôture |

Disque intact : le client perd tout depuis 2 h du matin, crédits compris. Serveur perdu : il perd **tout**, les sauvegardes y étaient. Reparti en 3 à 6 heures (estimé), à la main, si le propriétaire est joignable et a une copie ailleurs : aucun script ne restaure un client.

**Mise à jour, migration en échec** (114 bonne, 115 en erreur, 116 ensuite, copie remplie) :

| Cas | Résultat |
|---|---|
| `migrate.mjs` | 114 gardée, 115 annulée, 116 jamais jouée, code 1 : base entre deux versions |
| `update-client.sh a` | S'arrête, serveur et écran déjà recompilés : l'écran neuf parle à l'ancien serveur |
| `update-client.sh --all` | Même échec, puis `pm2 restart`, « à jour, health check OK », code **0** |

**Démo** : `demo` / `Demo2026!`, sans changement imposé ; seed : « relation "categories" does not exist », 0 produit. Trois corrections dans une copie donnent 36 produits et 8 factures, mais ni caisse, ni second compte : impossible d'encaisser.

**Suspension** (conteneur nginx) : page **anglaise** « 503 Service Temporarily Unavailable » au lieu de la page française ; API 503 ; drapeau retiré → 200 aussitôt, données intactes. Réversible, pas propre.

## 4. Défauts prouvés

Commerçant : il le subit. Exploitant : le propriétaire.

### Argent et stock

| N° | Défaut | Preuve |
|---|---|---|
| D1 | Une sauvegarde par nuit, sur le même serveur : serveur perdu, tout perdu ; panne, journée perdue. Commerçant | Cron `0 2 * * *` (`provision-client.sh:157`), dumps dans `~/backups` (`backup-all-clients.sh:16-34`), copie ailleurs « recommandée » (`deploy/README.md:82-83`). Rejoué |
| D2 | Après restauration, les numéros déjà remis reviennent. Commerçant | FAC-2026-00204 émise pour deux ventes |
| D3 | `seed-hitek-demo.mjs` vide 32 tables de la base de `.env`, sans garde : lancé dans le dossier d'un client, il l'efface (sauvé aujourd'hui car il échoue plus loin et annule). Exploitant | `seed-hitek-demo.mjs:19-30, 99-103`, « 32 tables videes » rejoué |
| D4 | `update-client.sh --all` redémarre un client à moitié migré et le dit à jour | `set -e` ignoré dans une fonction appelée avec `\|\|` (`update-client.sh:67`) ; rejoué, code 0 |

### Blocage

| N° | Défaut | Preuve |
|---|---|---|
| B1 | Client neuf sans caisse, deuxième site impossible | Rejoué. Lots 08-G, 13-G |
| B2 | Démo vide ; admin au mot de passe publié ; le reset ne touche ni comptes, ni mots de passe, ni paramètres | `provision-client.sh:101-105`, `reset-demo.sh:20-22`, `WIPE` sans `utilisateurs` ni `company_settings`. Lot 24-G |
| B3 | Aucun import : articles, stock, contacts, dettes | Aucune route ni écran. Lots 10-G, 19-G ; dette fournisseur de départ sans lot |
| B4 | Migration absente du baseline : marquée faite chez tout client neuf, jamais jouée ; `--status` affiche ✓ | Rejoué dans une copie : `114_essai_oubli.sql` enregistrée, colonne absente (`ci-db-setup.mjs:161-166`). Mécanisme de l'incident 101/102. Aucun contrôle de schéma en script ni en CI |
| B5 | Pas de restauration réelle ; le test compte des lignes, sort 0 même déséquilibré, n'est pas planifié | `test-restore.sh:34-49` ; absent du provisionnement |
| B6 | Échec de mise à jour sans retour arrière | `migrate.mjs:105-128` (une transaction par fichier), `update-client.sh:43-49` |

### Gêne et sécurité

- G1 : page de suspension anglaise : le `if` du niveau `server` refait le 503 sur la page d'erreur (`nginx-client.conf.template:19-26`) ; le contrôle de certbot reçoit aussi 503 (HTTPS menacé après un mois de suspension, supposé).
- G2 : l'API écoute toutes les interfaces (`server.ts:185`) et croit `X-Forwarded-For` (`server.ts:51`) : en direct, l'appelant choisit son adresse (rejoué : `ip: 203.0.113.77` au journal). Limite des connexions ratées et suspension ne tiennent que par le pare-feu.
- G3 : l'application est propriétaire de sa base (`provision-client.sh:66-67`) : journal effaçable (26-B), tables supprimables. Tous les clients sous un seul utilisateur système : un serveur compromis lit les `.env` des autres (lu).
- G4 : sauvegardes en clair, sans `umask` (`backup-db.sh:25-30`) ; un échec n'écrit qu'une ligne de journal.
- G5 : aucune Content-Security-Policy sur l'application (`nginx-client.conf.template:47-53`) ; version affichée (rejoué `Server: nginx/1.27.5`) ; journaux pm2 sans rotation.
- G6 : un secret JWT en clair dans l'historique git (`dd971e0`, 2026-06-08 ; retiré `2af4127`), absent de la liste refusée (`auth.ts:17-20`). Valeur en production non vérifiée.
- G7 : données réelles suivies par git depuis `f980ac0` (2026-05-26) : `seed-clients-excel.mjs` (clients et soldes d'un vrai tableur), `seed-fournisseurs-excel.mjs`, `docs/prospects/prospects-2026-11-11.csv` (976 commerces avec téléphone). Chaque installation en reçoit une copie (`provision-client.sh:73`). Visibilité du dépôt non vérifiée.
- G8 : `seed-data.mjs` mort (« relation "clients" does not exist ») ; `seed-test-data.mjs` ne crée que 5 articles à stock 0.
- G9 : la CI vérifie l'admin et l'emplacement après provisionnement, pas la caisse (`ci.yml:77-81`) ; ni restauration, ni mise à jour d'une base remplie.
- G10 : `update-client.sh` déploie la tête de `main`, pas une version testée ; `ecosystem.config.js` est propre à l'instance de test (lignes 18-20) et ignoré du provisionnement (`provision-client.sh:121`).
- G11 : `CAISSE_GL_POSTING` absent du `.env` écrit (`provision-client.sh:78-90`), faux dans `.env.example:13` ; sans objet après 22-F.

**CLAUDE.md périmé** (28-C corrige) : dernière migration « 111 » et « 105 fichiers » (113, 118) ; `creer_avoir_depuis_retour()` écrit dans `facture_avoir_lignes` (fonction absente) ; `?token=` repli du SSE (401) ; `Reporting.tsx` sur l'axios d'`authService` (faux) ; ouverts (3) et (4) (supprimé par 113, remplacé par 15-B) ; ouvert (6) (plus deux colonnes, aucune caisse) ; « Caisse→GL posting enabled » (faux chez un client neuf) ; trois lecteurs du stock identiques (faux pour les Rapports) ; client créé « sans plafond » (crédit illimité, `CreditService.ts:43-46`) ; service worker « unregistered » (enregistré, `main.tsx:17-19`) ; proxy « not configured » et `pm2 start ecosystem.config.js` (gabarit nginx présent, provisionnement sans ce fichier) ; `deploy/README.md:5` « modèle éprouvé avec hitek et pbd » (aucun client installé ainsi ; notes d'exploitation, non vérifié).

## 5. Comparaison

| | Ils font mieux | Nous faisons mieux |
|---|---|---|
| Odoo Online | Sauvegardes et mises à jour comprises [O1] | Une base par client, installée avec lui ; prix par magasin, pas par utilisateur |
| Sage 100 | Serveur local ou cloud au choix [G1] | Rien à installer chez le client |
| Kweeli, Karnet | Démarrer seul en « 2 minutes », ou sans compte | Reprise accompagnée (à construire) |

Attendu minimum (`concurrents.md`, fiche 28) : essai sans rendez-vous, démo par métier, import accompagné, sauvegarde que le client voit, un humain joignable le samedi. Aucun des cinq aujourd'hui.

## 6. Manques

| Profil | Manque | Lot |
|---|---|---|
| Tous | Reprise des articles, du stock, des contacts et des dettes | 10-G, 19-G, 28-K |
| Tous | Démo par métier, encaissement compris ; sauvegarde visible du patron | 28-G, 28-A |
| Grossiste, informatique | Dette fournisseur de départ | 28-K |
| Plus tard | Export complet en Excel ; un utilisateur système par client ; serveur de secours | — |

## 7. TVA, FNE, mobile money, WhatsApp

- **TVA optionnelle** : « assujetti » demandé à l'installation (réglage de 03-K), prérempli dans 25-C ; la démo montre un client non assujetti.
- **FNE** : un numéro ne doit jamais revenir après une restauration (D2) ; la règle de 28-B doit lui convenir. Les clés FNE iront dans les sauvegardes : chiffrées (28-A).
- **Mobile money** : avis automatiques reçus plus tard en HTTPS ; port de l'API fermé d'abord (28-H).
- **WhatsApp** : lien `wa.me` vers l'installateur sur la page de suspension et le bandeau de préavis (28-H).

## 8. Lots proposés

Prochaine migration : le numéro libre (dernière `113`) ; tout changement de schéma régénère `ci-baseline.sql`, toute donnée de départ va dans `ci-ref-data.sql`. Déjà ailleurs : caisse du client neuf **08-G** ; gérer un site **13-G** ; assistant **25-C** ; import des articles **10-G** ; contacts et dette de départ **19-G** ; `CAISSE_GL_POSTING` **22-F** ; comptes de démonstration **24-G** ; journal en ajout seul **26-B**.

### 28-A · Sauvegarde toutes les heures, copiée hors du serveur (S, priorité 1)
- **Problème** : D1, G4. **Résultat** : jamais plus d'une heure de ventes perdue, même si le serveur brûle.
- **Serveur** : `backup-db.sh` : `umask 077`, dump relu (`pg_restore --list`), copie chiffrée (`age`) vers un stockage objet (`rclone`) ; garde 48 horaires, 30 quotidiennes, 12 mensuelles ; cron horaire de 7 h à 22 h, plus 2 h ; échec : appel de `BACKUP_ALERT_URL`. Fichiers : `backup-db.sh`, `backup-all-clients.sh`, `provision-client.sh`, `deploy/README.md`.
- **Écran** : Paramètres (admin) : « Dernière sauvegarde : … · copie hors serveur : oui » (`GET /api/health/sauvegarde`).
- **Tests** : copie locale effacée, restaurée depuis le stockage ; échec simulé → alerte.
- **Fini quand** : perte mesurée ≤ 1 h. **Dépend** : rien. **Risque** : clé perdue, copies illisibles : la garder hors du serveur.

### 28-B · Restaurer un client en une commande, chiffres vérifiés (M, priorité 1)
- **Problème** : D2, B5. **Résultat** : le samedi, le client repart en moins de 2 heures, sait quoi ressaisir, aucun numéro ne revient.
- **Serveur** : `deploy/restore-client.sh <slug> [fichier]` : base, `pg_restore`, `.env`, pm2, vhost ; numérotation avancée de 1 000, au journal d'audit ; `scripts/verifier-base.mjs` : stock, dettes, caisses ouvertes, journal équilibré, pièces jointes, dernière facture et son heure. `test-restore.sh` l'appelle, sort 1 sur écart, tourne chaque semaine.
- **Écran** : bandeau admin « Données restaurées jusqu'au 29/11 à 13:00 : ressaisissez les ventes faites depuis ».
- **Tests** : section 3 rejouée : chiffres identiques, vente suivante ≠ FAC-…00204.
- **Fini quand** : restauration chronométrée sur un serveur vierge par un autre que l'auteur. **Dépend** : 28-A. **Risque** : saut de numéros à expliquer (question 3).

### 28-C · Dépôt propre : données réelles, seeds morts, notes périmées (S, priorité 2)
- **Problème** : G7, G8, G10, CLAUDE.md périmé. **Résultat** : aucune donnée d'un vrai commerce livrée aux clients ; les notes disent vrai.
- **Étapes** : supprimer `seed-clients-excel.mjs`, `seed-fournisseurs-excel.mjs`, `seed-data.mjs`, `seed-test-data.mjs` ; sortir `docs/prospects/` du dépôt ; si le dépôt a été public : `git filter-repo`, recloner partout, tenir ces données pour publiées ; `ecosystem.config.js` rendu générique ou retiré ; corriger chaque point listé en section 4 dans `CLAUDE.md` et `deploy/README.md`.
- **Tests** : `git grep` des fichiers supprimés = 0.
- **Fini quand** : un clone neuf ne contient aucune donnée d'un commerce réel. **Dépend** : question 1. **Risque** : réécrire l'historique casse les clones.

### 28-D · Mise à jour tout ou rien (M, priorité 3)
- **Problème** : D4, B6, G10. **Résultat** : une mise à jour réussit entière ou ne change rien.
- **Base** : `migrate.mjs` joue les migrations en attente dans **une** transaction (`CONCURRENTLY` refusé sans option), verrou consultatif.
- **Serveur** : `update-client.sh <slug|--all> <version>` : étiquette verte en CI, jamais `main` ; `update_one` en sous-shell `( set -euo pipefail … )` ; compilation dans `releases/<version>/`, puis migration, contrôle (28-E), bascule du lien `current`, redémarrage, santé ; échec après la bascule : lien et sauvegarde d'avant remis.
- **Tests** : 114/115/116 rejouées : 114 absente après l'échec ; `--all` avec un client en échec → code 1, l'autre à jour, le premier intact.
- **Fini quand** : aucun client sur un code plus récent que sa base. **Dépend** : 28-E. **Risque** : migration longue : la nuit.

### 28-E · Contrôle du schéma, en CI et à chaque mise à jour (S, priorité 3)
- **Problème** : B4. **Résultat** : en une seconde, on sait si la base d'un client diffère de la version attendue.
- **Serveur** : `scripts/schema-check.mjs` : empreinte des colonnes, triggers, fonctions, contraintes et index (1 899 objets au banc, moins d'une seconde) comparée à une base chargée de `ci-baseline.sql` ; écarts listés, code 1.
- **CI** : `ci-baseline.sql` nomme en tête sa dernière migration ; `ci-db-setup.mjs` ne marque faites que celles-là et **joue** les suivantes ; un job charge le baseline précédent, joue les nouvelles, compare.
- **Tests** : `114_essai_oubli` → CI rouge ; bancs actuels : 0 écart (vérifié).
- **Fini quand** : contrôle passé chez chaque client après chaque mise à jour. **Dépend** : rien. **Risque** : bruit ; courte liste d'exclusions.

### 28-F · Installer et dépanner un client en une heure (M, priorité 3)
- **Problème** : section 3, G9. **Résultat** : premier ticket en moins d'une heure, dont 15 minutes de machine.
- **Serveur** : `provision-client.sh` demande nom, métier, boutiques, dépôt, TVA, crée sites et caisses (08-G) ; vérifie le domaine et le port fermé avant certbot ; écrit une fiche d'installation ; efface les identifiants après la première connexion. Nouveau `deploy/reset-password.sh <slug> <identifiant>` : mot de passe provisoire, changement imposé, sessions coupées, journal.
- **CI** : après provisionnement, caisse ouverte et vente en espèces (201) sans SQL. Fichiers : `provision-client.sh`, `ci-db-setup.mjs`, `ci.yml`.
- **Fini quand** : un tiers installe un client avec la seule fiche. **Dépend** : 08-G, 13-G, 25-C. **Risque** : `sudo` reste manuel.

### 28-G · Démo qui vend, remise à neuf chaque nuit (M, priorité 3)
- **Problème** : B2, D3. **Résultat** : un prospect voit sa boutique type, encaisse et imprime en 5 minutes.
- **Étape 1** : le seed refuse toute base sans `company_settings.mode_demo` ; corrections `categories`, `categorie`, `stock_min` ; caisse (08-G) ; un compte par rôle ; 30 jours d'activité par les services de l'ERP, pas en SQL.
- **Étape 2** : trois jeux (informatique, alimentaire grossiste, habillement, `seed-demo.mjs --profil`) ; le reset remet aussi comptes, mots de passe, paramètres et journal (trigger de 26-B suspendu là seulement) ; en mode démo, l'API refuse mot de passe, comptes et paramètres.
- **Tests** : base marquée → vente comptoir 201 ; non marquée → refus, rien vidé ; mot de passe changé le soir → remis le matin.
- **Fini quand** : la démo du matin égale celle de la veille. **Dépend** : 08-G, 24-G, question 2. **Risque** : visiteurs simultanés.

### 28-H · Suspension propre, port fermé (S, priorité 3)
- **Problème** : G1, G2. **Résultat** : le client en retard voit une page française avec le numéro à appeler ; personne ne contourne la coupure.
- **Serveur** : drapeau testé dans `location /` et `location /api/` ; `/.well-known/acme-challenge/` jamais coupé ; page avec téléphone et `wa.me` ; `suspend-client.sh <slug> preavis <date>` écrit `/statut-abonnement.json`, lu par l'écran → bandeau admin « Abonnement à régler avant le … » ; API sur `127.0.0.1` (réglage `HOST`).
- **Tests** : conteneur nginx : page française, challenge 200 pendant la suspension ; `http://IP:port` refusé.
- **Fini quand** : la section 3 rejouée donne la page française. **Dépend** : rien. **Risque** : vhosts à régénérer.

### 28-I · L'application n'est plus propriétaire de sa base (M, priorité 3)
- **Problème** : G3. **Résultat** : même compromis, le serveur n'efface ni le journal, ni une table.
- **Base** : `<slug>_owner` (migrations, seul propriétaire) et `<slug>_app` (lecture, écriture, `INSERT` seul sur `audit_log`) ; `ALTER DEFAULT PRIVILEGES` ; `REVOKE CONNECT … FROM PUBLIC`. Touche `provision-client.sh`, `migrate.mjs`, `update-client.sh` ; reprise des clients existants.
- **Tests** : rôle de l'application : `DELETE FROM audit_log` et `DROP TABLE` refusés, vente 201.
- **Fini quand** : contrôle passé chez chaque client. **Dépend** : 26-B. **Risque** : droits oubliés, couverts par les privilèges par défaut.

### 28-J · En-têtes, journaux et ancien secret (S, priorité 3)
- **Problème** : G5, G6. **Résultat** : l'hébergement ne trahit ni sa version, ni un ancien secret.
- **Serveur** : `server_tokens off` ; CSP de l'application (`default-src 'self'`, images `data:`), d'abord en mode rapport ; `pm2-logrotate` (30 jours) ; empreinte de l'ancien secret JWT refusée au démarrage (`middleware/auth.ts`) ; secret de l'instance de test changé s'il est le même.
- **Tests** : `Server` sans version ; aucune erreur CSP sur les 45 pages ; démarrage refusé avec l'ancien secret.
- **Fini quand** : les trois tests passent. **Dépend** : rien. **Risque** : CSP trop stricte.

### 28-K · Dossier de reprise d'un nouveau client (M, priorité 3)
- **Problème** : B3. **Résultat** : l'installateur reprend articles, stock, contacts et dettes en une demi-journée, depuis un seul classeur.
- **Étapes** : modèle Excel à quatre feuilles (articles et stock par site, clients et dette, fournisseurs et dette, fonds de caisse) pour 10-G et 19-G ; **dette fournisseur de départ** ajoutée à 19-G étape 2 (pièce `REP-F`, comptée par 18-D) ; totaux de stock et de dettes signés par le patron.
- **Tests** : 300 articles et 50 clients : totaux égaux au franc.
- **Fini quand** : une reprise réelle signée par un patron. **Dépend** : 10-G, 19-G, 18-D. **Risque** : cahier faux : reprise la veille de l'ouverture, inventaire (fiche 12) le premier mois.

## 9. Questions au propriétaire

1. Le dépôt GitHub a-t-il été public ? Le commerce d'où viennent clients et soldes de `seed-clients-excel.mjs` l'a-t-il accepté ?
2. Démo (question 61) : proposé : une démo partagée par métier, remise chaque nuit **avec** les comptes, verrouillée, montrée en personne, plus une vidéo de 2 minutes par métier pour WhatsApp. Pas d'instance par prospect.
3. Après restauration : sauter les numéros de 1 000 (proposé) ou nouvelle série ?
4. Au contrat : « au plus 1 heure de ventes perdues, reparti en 4 heures » ? Quel stockage hors serveur, à quel coût ?
5. Suspension : coupure totale (aujourd'hui), ou lecture seule et export 30 jours ? Préavis de combien de jours ?
6. Reprise (question 66) : par l'installateur, dans les frais d'installation (proposé) ?
7. Mises à jour : qui décide, à quelle heure ; un client peut-il refuser ?
8. Un serveur pour tous, ou un second ?
