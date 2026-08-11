#!/usr/bin/env bash
# Sauvegarde quotidienne de TOUTES les instances clients.
#
# Parcourt ~/clients/*/magasin/backend/.env, et pour chaque client appelle
# backend/scripts/backup-db.sh (pg_dump format custom + rétention) vers
# ~/backups/<slug>/.
#
# Cron (installé par provision-client.sh) :
#   0 2 * * * /chemin/deploy/backup-all-clients.sh >> ~/backups/backup.log 2>&1
#
# Vérifier la restauration régulièrement : deploy/test-restore.sh <slug>
# Pas de -e volontairement : un client en échec ne doit pas empêcher la
# sauvegarde des suivants (le compteur FAILURES fait foi en fin de run).
set -uo pipefail

CLIENTS_DIR="$HOME/clients"
BACKUP_ROOT="$HOME/backups"
FAILURES=0

echo "=== Sauvegardes $(date -Is) ==="

for envfile in "$CLIENTS_DIR"/*/magasin/backend/.env; do
  [ -f "$envfile" ] || continue
  APP_BACKEND="$(dirname "$envfile")"
  SLUG="$(basename "$(dirname "$(dirname "$APP_BACKEND")")")"
  OUT_DIR="$BACKUP_ROOT/$SLUG"

  echo "--- $SLUG ---"
  # Sous-shell : le .env d'un client ne fuit pas vers le suivant
  if ! (
    set -a; . "$envfile"; set +a
    export PGPASSWORD="${DB_PASSWORD:-}"
    cd "$APP_BACKEND"
    ./scripts/backup-db.sh "$OUT_DIR"
  ); then
    echo "ERREUR: sauvegarde de '$SLUG' en échec."
    FAILURES=$((FAILURES + 1))
  fi
done

if [ "$FAILURES" -gt 0 ]; then
  echo "=== TERMINÉ AVEC $FAILURES ÉCHEC(S) ==="
  exit 1
fi
echo "=== Terminé sans erreur ==="
