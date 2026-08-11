#!/usr/bin/env bash
# Met à jour une instance client vers le dernier commit du dépôt.
#
# Usage :
#   ./deploy/update-client.sh <slug>          # un client
#   ./deploy/update-client.sh --all           # tous les clients
#
# Étapes par client : sauvegarde DB → git pull --ff-only → build backend +
# frontend → migrations → pm2 restart → health check.
# Le frontend est servi depuis dist/ par nginx : pas de restart nécessaire.
set -euo pipefail

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

update_one() {
  local SLUG="$1"
  local APP="$HOME/clients/$SLUG/magasin"
  [ -d "$APP" ] || { echo "ERREUR: client '$SLUG' introuvable."; return 1; }

  echo "=== Mise à jour '$SLUG' ==="

  # Sauvegarde avant migration — indispensable
  (
    set -a; . "$APP/backend/.env"; set +a
    export PGPASSWORD="${DB_PASSWORD:-}"
    cd "$APP/backend"
    ./scripts/backup-db.sh "$HOME/backups/$SLUG"
  )

  # Refus si modifications locales : un hotfix appliqué sur le VPS ne doit
  # jamais être écrasé silencieusement. (npm ci ne touche pas package-lock,
  # donc un arbre sale signale un vrai changement, pas du bruit de build.)
  local DIRTY
  DIRTY="$(cd "$APP" && git status --porcelain)"
  if [ -n "$DIRTY" ]; then
    echo "ERREUR: modifications locales dans $APP — commit/stash avant mise à jour :"
    echo "$DIRTY"
    return 1
  fi
  (cd "$APP" && git pull --ff-only)

  (cd "$APP/backend" && npm ci && npm run build)
  (cd "$APP/frontend" && npm ci && npm run build)
  (cd "$APP/backend" && node migrate.mjs)

  pm2 restart "${SLUG}-api" --update-env
  sleep 2

  local PORT
  PORT="$(grep '^PORT=' "$APP/backend/.env" | cut -d= -f2)"
  if curl -fsS "http://localhost:$PORT/api/health" > /dev/null; then
    echo "=== '$SLUG' à jour, health check OK ==="
  else
    echo "ATTENTION: health check '$SLUG' en échec — voir 'pm2 logs ${SLUG}-api'."
    return 1
  fi
}

if [ "${1:-}" = "--all" ]; then
  FAILURES=0
  for dir in "$HOME/clients"/*/magasin; do
    [ -d "$dir" ] || continue
    SLUG="$(basename "$(dirname "$dir")")"
    update_one "$SLUG" || FAILURES=$((FAILURES + 1))
  done
  if [ "$FAILURES" -gt 0 ]; then echo "$FAILURES client(s) en échec."; exit 1; fi
elif [ -n "${1:-}" ]; then
  update_one "$1"
else
  echo "Usage: $0 <slug> | --all"; exit 1
fi
