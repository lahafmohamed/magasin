# Déploiement multi-clients (modèle SaaS single-tenant)

Outillage pour vendre le programme en abonnement : **une instance par client**
(DB + backend pm2 + frontend statique + vhost nginx) sur un même VPS.
Modèle déjà éprouvé avec les instances `hitek` et `pbd`.

## Layout sur le VPS

```
~/clients/<slug>/
  magasin/            clone du dépôt (backend + frontend buildés)
  nginx-<slug>.conf   vhost généré (symlinké dans /etc/nginx/sites-enabled)
  suspendu.html       page affichée quand le client est suspendu
  SUSPENDED           fichier drapeau (présent = accès coupé, 503)
~/backups/<slug>/     dumps pg_dump quotidiens (rétention 14 j)
```

Un client = un slug (`[a-z0-9-]`), un domaine, un port API unique, une base
`<slug>_db` avec son utilisateur `<slug>_user`, un process pm2 `<slug>-api`.
Aucun secret dans pm2 : `backend/.env` (chmod 600) est chargé par dotenv.

## Provisionner un nouveau client

```bash
./deploy/provision-client.sh acme acme.nolyxci.com 6200
```

Le script crée la DB, clone, écrit `.env`, builde, **bootstrap la base vierge
via `backend/scripts/ci-db-setup.mjs`** (baseline + données de référence +
admin + `schema_migrations`) — la chaîne de migrations n'est pas rejouable sur
une DB vierge, le baseline est la seule voie supportée. Puis pm2 + vhost +
cron de sauvegarde. Il affiche à la fin :

- les identifiants admin générés (changement forcé au 1er login) ;
- les deux commandes `sudo` restantes (symlink nginx + certbot).

Ports : garder une convention, ex. 6100 hitek, 6000 pbd, 6200+ nouveaux
clients. Le script refuse un port déjà écouté.

## Instance de démonstration (outil de vente)

```bash
./deploy/provision-client.sh demo demo.nolyxci.com 6300 --demo
```

Connexion : `demo / Demo2026!` (pas de changement forcé). Reset nocturne des
données (les visiteurs peuvent tout toucher, la démo redevient propre) :

```cron
0 4 * * * /chemin/deploy/reset-demo.sh >> ~/clients/demo/reset.log 2>&1
```

## Suspension pour impayé

```bash
./deploy/suspend-client.sh acme on    # coupe l'accès (503 + page FR) — immédiat
./deploy/suspend-client.sh acme off   # réactive
```

Sans sudo, sans reload nginx : le vhost teste le fichier `SUSPENDED` à chaque
requête. Les données et l'API restent intactes — la réactivation est
instantanée après paiement.

> Limite connue : le backend écoute sur toutes les interfaces. Le pare-feu du
> VPS doit bloquer les ports API en entrée (seuls 80/443/SSH ouverts), sinon
> `http://IP:<port>` contournerait la suspension. Vérifier : `sudo ufw status`.

## Sauvegardes

- **Quotidien 2h** (cron installé par le provisioning) :
  `backup-all-clients.sh` parcourt `~/clients/*/` et dump chaque base vers
  `~/backups/<slug>/` (format custom, rétention `BACKUP_RETENTION_DAYS`).
- **Test de restauration** — une sauvegarde non testée n'existe pas :

  ```bash
  ./deploy/test-restore.sh acme
  ```

  Restaure le dernier dump dans une base jetable, vérifie les comptages et
  l'équilibre débit/crédit du grand livre, puis supprime la base. À mettre en
  cron hebdomadaire par client.
- Recommandé en plus : copie hors-VPS des dumps (rclone vers un stockage
  objet) — un VPS qui brûle emporte sinon les sauvegardes avec lui.

## Mettre à jour les clients (nouvelle version du logiciel)

```bash
./deploy/update-client.sh acme    # un client
./deploy/update-client.sh --all   # tout le parc
```

Par client : sauvegarde DB → `git pull --ff-only` → build backend/frontend →
`node migrate.mjs` → `pm2 restart` → health check. Le frontend étant servi
depuis `dist/` par nginx, seul l'API redémarre (~2 s de coupure).

## Prérequis VPS (une seule fois)

- node via nvm, `pm2` (+ `pm2 startup`), nginx, certbot, PostgreSQL ;
- l'utilisateur système doit pouvoir `CREATE ROLE` / `CREATE DATABASE` via le
  socket local ;
- pare-feu : n'ouvrir que 80, 443 et le port SSH ;
- `pm2 save` après tout ajout (fait par le provisioning).

## Facturation (manuel, suffisant < 20 clients)

Pas de module de facturation intégré à ce stade — process recommandé :
tableau de suivi (client, formule, échéance), relance à J+3, suspension à
J+10 (`suspend-client.sh`), réactivation dès paiement. Automatiser seulement
quand le parc dépasse ~20 clients.
