#!/usr/bin/env bash
# Teste la restauration du dernier dump d'un client dans une base jetable.
# Une sauvegarde non testée n'est pas une sauvegarde.
#
# Usage :
#   ./deploy/test-restore.sh <slug>
#
# Restaure ~/backups/<slug>/<dernier>.dump dans restore_test_<slug>,
# vérifie quelques comptages de tables clés, puis supprime la base jetable.
# À lancer chaque semaine (cron) ou avant toute opération risquée :
#   0 5 * * 1 /chemin/deploy/test-restore.sh hitek >> ~/backups/restore-test.log 2>&1
set -euo pipefail

SLUG="${1:-}"
if [ -z "$SLUG" ]; then echo "Usage: $0 <slug>"; exit 1; fi

BACKUP_DIR="$HOME/backups/$SLUG"
TEST_DB="restore_test_$SLUG"

LATEST="$(ls -1t "$BACKUP_DIR"/*.dump 2>/dev/null | head -1 || true)"
if [ -z "$LATEST" ]; then echo "ERREUR: aucun dump dans $BACKUP_DIR"; exit 1; fi

echo "=== Test de restauration '$SLUG' — $(basename "$LATEST") ==="

# Base jetable (droits du user système via socket)
dropdb --if-exists "$TEST_DB"
createdb "$TEST_DB"
trap 'dropdb --if-exists "$TEST_DB"' EXIT

# --no-owner/--no-acl : le dump appartient au user du client, on restaure en local
pg_restore --no-owner --no-acl -d "$TEST_DB" "$LATEST"

echo "--- Vérifications ---"
psql -d "$TEST_DB" -v ON_ERROR_STOP=1 -tA <<'SQL'
SELECT 'utilisateurs          : ' || COUNT(*) FROM utilisateurs;
SELECT 'tiers                 : ' || COUNT(*) FROM tiers;
SELECT 'produits              : ' || COUNT(*) FROM produits;
SELECT 'factures              : ' || COUNT(*) FROM factures;
SELECT 'ecritures_comptables  : ' || COUNT(*) FROM ecritures_comptables;
SELECT 'migrations appliquées : ' || COUNT(*) FROM schema_migrations;
SQL

# Équilibre du grand livre : somme débits = somme crédits
BALANCE="$(psql -d "$TEST_DB" -tAc "SELECT COALESCE(SUM(debit),0) - COALESCE(SUM(credit),0) FROM ecritures_comptables")"
if [ "$BALANCE" != "0" ] && [ "$BALANCE" != "0.00" ]; then
  echo "ATTENTION: grand livre déséquilibré dans le dump (écart: $BALANCE)"
fi

echo "=== Restauration OK — base jetable supprimée ==="
