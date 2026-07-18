#!/usr/bin/env bash
# Sauvegarde PostgreSQL (pg_dump custom format) avec rétention.
#
# Usage:
#   ./scripts/backup-db.sh [dossier_sortie]
#
# Variables (mêmes noms que backend/.env — exporter ou sourcer le .env avant) :
#   DB_HOST DB_PORT DB_USER DB_NAME (PGPASSWORD pour le mot de passe)
#   BACKUP_RETENTION_DAYS (défaut : 14)
#
# Cron quotidien (2h du matin) :
#   0 2 * * * cd /path/to/backend && set -a && . ./.env && set +a && PGPASSWORD="$DB_PASSWORD" ./scripts/backup-db.sh /var/backups/hitek
#
# Restauration :
#   pg_restore -h $DB_HOST -U $DB_USER -d $DB_NAME --clean --if-exists fichier.dump
set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-magasin_db}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
OUT_DIR="${1:-./backups}"

mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="$OUT_DIR/${DB_NAME}_${STAMP}.dump"

echo "Sauvegarde de $DB_NAME vers $OUT_FILE ..."
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F c -f "$OUT_FILE"
echo "OK ($(du -h "$OUT_FILE" | cut -f1))"

# Rétention : supprime les dumps plus vieux que N jours
find "$OUT_DIR" -name "${DB_NAME}_*.dump" -mtime "+${RETENTION_DAYS}" -delete
echo "Rétention appliquée (${RETENTION_DAYS} jours)."
