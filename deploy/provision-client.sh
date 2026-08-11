#!/usr/bin/env bash
# Provisionne une nouvelle instance client complète sur le VPS.
#
# Usage :
#   ./deploy/provision-client.sh <slug> <domaine> <port_api> [--demo]
#
#   slug      identifiant court du client, [a-z0-9-] (ex: hitek, pbd, demo)
#   domaine   nom de domaine public (ex: client.nolyxci.com)
#   port_api  port local du backend, unique par client (ex: 6200)
#   --demo    instance de démonstration : admin "demo" / mot de passe fixe,
#             pas de changement forcé au 1er login (voir reset-demo.sh)
#
# Ce que fait le script :
#   1. Crée l'utilisateur + la base PostgreSQL (mot de passe aléatoire)
#   2. Clone le dépôt dans ~/clients/<slug>/magasin
#   3. Écrit backend/.env (JWT_SECRET aléatoire, DB_*, FRONTEND_URL)
#   4. npm ci + build (backend et frontend)
#   5. Bootstrap DB vierge : scripts/ci-db-setup.mjs (baseline + ref-data +
#      admin + schema_migrations) — la chaîne de migrations n'est PAS
#      rejouable sur une DB vierge, le baseline est la voie officielle
#   6. Démarre l'API sous pm2 (<slug>-api) + pm2 save + health check
#   7. Génère le vhost nginx et la page "suspendu.html", affiche les
#      commandes sudo restantes (lien nginx + certbot)
#   8. Installe le cron de sauvegarde quotidienne s'il n'existe pas déjà
#
# Prérequis VPS : node (nvm), pm2, nginx, certbot, postgres avec droits
# CREATE ROLE/DATABASE pour l'utilisateur courant (socket).
set -euo pipefail

# --- nvm (zsh/cron n'ont pas node dans le PATH par défaut) ------------------
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

REPO_URL="${REPO_URL:-https://github.com/lahafmohamed/magasin.git}"

usage() { grep '^#' "$0" | head -30; exit 1; }

SLUG="${1:-}"; DOMAIN="${2:-}"; API_PORT="${3:-}"; DEMO_FLAG="${4:-}"
if [ -z "$SLUG" ] || [ -z "$DOMAIN" ] || [ -z "$API_PORT" ]; then usage; fi
[[ "$SLUG" =~ ^[a-z0-9-]+$ ]] || { echo "ERREUR: slug invalide (a-z 0-9 - uniquement)"; exit 1; }
[[ "$API_PORT" =~ ^[0-9]+$ ]] || { echo "ERREUR: port invalide"; exit 1; }

BASE="$HOME/clients/$SLUG"
APP="$BASE/magasin"
DB_NAME_C="${SLUG}_db"
DB_USER_C="${SLUG}_user"

# --- Garde-fous -------------------------------------------------------------
if [ -d "$APP" ]; then
  echo "ERREUR: $APP existe déjà. Client déjà provisionné ?"; exit 1
fi
if ss -ltn 2>/dev/null | grep -q ":$API_PORT "; then
  echo "ERREUR: le port $API_PORT est déjà utilisé."; exit 1
fi
if psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME_C'" | grep -q 1; then
  echo "ERREUR: la base $DB_NAME_C existe déjà."; exit 1
fi

echo "=== Provisioning client '$SLUG' ($DOMAIN, API :$API_PORT) ==="

# --- 1. PostgreSQL ----------------------------------------------------------
DB_PASS="$(openssl rand -hex 24)"
echo "[1/8] Création DB $DB_NAME_C + utilisateur $DB_USER_C ..."
# SQL via stdin : le mot de passe n'apparaît jamais dans la ligne de commande (ps)
psql -d postgres -v ON_ERROR_STOP=1 <<SQL
CREATE USER $DB_USER_C WITH PASSWORD '$DB_PASS';
CREATE DATABASE $DB_NAME_C OWNER $DB_USER_C;
SQL

# --- 2. Clone ---------------------------------------------------------------
echo "[2/8] Clone du dépôt ..."
mkdir -p "$BASE"
git clone --depth 1 "$REPO_URL" "$APP"

# --- 3. backend/.env --------------------------------------------------------
echo "[3/8] Écriture backend/.env ..."
JWT_SECRET="$(openssl rand -hex 48)"
cat > "$APP/backend/.env" <<EOF
NODE_ENV=production
PORT=$API_PORT
DB_HOST=localhost
DB_PORT=5432
DB_USER=$DB_USER_C
DB_PASSWORD=$DB_PASS
DB_NAME=$DB_NAME_C
JWT_SECRET=$JWT_SECRET
JWT_EXPIRATION=7d
FRONTEND_URL=https://$DOMAIN
BACKUP_RETENTION_DAYS=14
EOF
chmod 600 "$APP/backend/.env"

# --- 4. Build ---------------------------------------------------------------
echo "[4/8] Build backend ..."
(cd "$APP/backend" && npm ci && npm run build)
echo "[4/8] Build frontend ..."
(cd "$APP/frontend" && npm ci && npm run build)

# --- 5. Bootstrap DB vierge -------------------------------------------------
echo "[5/8] Bootstrap de la base (baseline + ref-data + admin) ..."
if [ "$DEMO_FLAG" = "--demo" ]; then
  ADMIN_USERNAME="demo"
  ADMIN_PASSWORD="Demo2026!"
  MUST_CHANGE="false"
else
  ADMIN_USERNAME="admin"
  ADMIN_PASSWORD="$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-12)!A1"
  MUST_CHANGE="true"
fi
(cd "$APP/backend" && \
  DB_HOST=localhost DB_PORT=5432 DB_USER="$DB_USER_C" DB_PASSWORD="$DB_PASS" DB_NAME="$DB_NAME_C" \
  ADMIN_USERNAME="$ADMIN_USERNAME" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  ADMIN_EMAIL="admin@$DOMAIN" ADMIN_FULLNAME="Administrateur" \
  ADMIN_MUST_CHANGE_PASSWORD="$MUST_CHANGE" \
  MAGASIN_CODE="MAG-01" MAGASIN_NAME="Magasin principal" \
  node scripts/ci-db-setup.mjs)

# --- 6. pm2 -----------------------------------------------------------------
echo "[6/8] Démarrage pm2 (${SLUG}-api) ..."
# dotenv charge backend/.env : cwd = backend, aucun secret dans pm2
(cd "$APP/backend" && pm2 start dist/server.js --name "${SLUG}-api" --time)
pm2 save
sleep 2
if curl -fsS "http://localhost:$API_PORT/api/health" > /dev/null; then
  echo "      Health check OK."
else
  echo "ATTENTION: health check en échec — voir 'pm2 logs ${SLUG}-api'."
fi

# --- 7. nginx ---------------------------------------------------------------
echo "[7/8] Génération du vhost nginx + page de suspension ..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
sed -e "s|{{DOMAIN}}|$DOMAIN|g" -e "s|{{SLUG}}|$SLUG|g" \
    -e "s|{{API_PORT}}|$API_PORT|g" -e "s|{{HOME}}|$HOME|g" \
    "$SCRIPT_DIR/nginx-client.conf.template" > "$BASE/nginx-$SLUG.conf"
cat > "$BASE/suspendu.html" <<'EOF'
<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Service suspendu</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a}div{text-align:center;padding:2rem}h1{font-size:1.5rem}p{color:#475569}</style>
</head><body><div><h1>Service temporairement suspendu</h1>
<p>L'accès à cette application est suspendu.<br>Veuillez contacter votre fournisseur pour régulariser votre abonnement.</p>
</div></body></html>
EOF
# nginx (www-data) doit pouvoir traverser jusqu'au dist. ACL execute-only
# pour www-data seul ; repli sur o+x (traverse pour tous les utilisateurs
# locaux) si les ACL sont indisponibles sur le système de fichiers.
if command -v setfacl >/dev/null 2>&1 && setfacl -m u:www-data:--x "$HOME" "$BASE" 2>/dev/null; then
  echo "      ACL www-data:--x posée sur \$HOME et $BASE."
else
  chmod o+x "$HOME" "$BASE" || true
  echo "      ATTENTION: ACL indisponibles — repli sur chmod o+x."
fi

# --- 8. Cron sauvegarde -----------------------------------------------------
echo "[8/8] Cron de sauvegarde quotidienne ..."
CRON_LINE="0 2 * * * $SCRIPT_DIR/backup-all-clients.sh >> $HOME/backups/backup.log 2>&1"
if ! crontab -l 2>/dev/null | grep -Fq "backup-all-clients.sh"; then
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  echo "      Cron installé : $CRON_LINE"
else
  echo "      Cron déjà présent."
fi

# --- Résumé -----------------------------------------------------------------
# Identifiants dans un fichier 600, jamais sur stdout : la sortie du script
# finit souvent dans un log ou le scrollback du terminal.
CRED_FILE="$BASE/admin-credentials.txt"
umask 077
cat > "$CRED_FILE" <<EOF
Client   : $SLUG
URL      : https://$DOMAIN
Login    : $ADMIN_USERNAME
Password : $ADMIN_PASSWORD
EOF
cat <<EOF

==========================================================
  CLIENT '$SLUG' PROVISIONNÉ
==========================================================
  URL           : https://$DOMAIN  (après nginx + certbot)
  API           : http://localhost:$API_PORT  (pm2: ${SLUG}-api)
  Base          : $DB_NAME_C (user $DB_USER_C — mot de passe dans backend/.env)
  Connexion app : voir $CRED_FILE (à supprimer après transmission au client)
EOF
if [ "$MUST_CHANGE" = "true" ]; then
  echo "                  (changement de mot de passe forcé au 1er login)"
fi
cat <<EOF

  Étapes restantes (sudo) :
    sudo ln -s $BASE/nginx-$SLUG.conf /etc/nginx/sites-enabled/$SLUG.conf
    sudo nginx -t && sudo systemctl reload nginx
    sudo certbot --nginx -d $DOMAIN

  Suspension impayé : $SCRIPT_DIR/suspend-client.sh $SLUG on|off
==========================================================
EOF
