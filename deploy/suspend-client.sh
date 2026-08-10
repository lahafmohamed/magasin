#!/usr/bin/env bash
# Suspend / réactive l'accès d'un client (impayé) — sans sudo, sans reload.
#
# Usage :
#   ./deploy/suspend-client.sh <slug> on    # suspend (503 + page "suspendu")
#   ./deploy/suspend-client.sh <slug> off   # réactive
#
# Mécanisme : le vhost nginx teste à chaque requête l'existence du fichier
# drapeau ~/clients/<slug>/SUSPENDED (voir nginx-client.conf.template).
# L'API reste démarrée (données intactes) mais n'est plus joignable via le
# domaine. Effet immédiat.
set -euo pipefail

SLUG="${1:-}"; ACTION="${2:-}"
if [ -z "$SLUG" ] || [ -z "$ACTION" ]; then echo "Usage: $0 <slug> on|off"; exit 1; fi

FLAG="$HOME/clients/$SLUG/SUSPENDED"
[ -d "$HOME/clients/$SLUG" ] || { echo "ERREUR: client '$SLUG' introuvable dans ~/clients/"; exit 1; }

case "$ACTION" in
  on)
    date -Is > "$FLAG"
    echo "Client '$SLUG' SUSPENDU (503). Réactivation : $0 $SLUG off"
    ;;
  off)
    rm -f "$FLAG"
    echo "Client '$SLUG' réactivé."
    ;;
  *)
    echo "Usage: $0 <slug> on|off"; exit 1
    ;;
esac
