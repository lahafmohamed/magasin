#!/usr/bin/env bash
# Réinitialise l'instance de démonstration (données réalistes Hitek).
# À lancer chaque nuit pour que la démo reste propre malgré les visiteurs.
#
# Prérequis : instance provisionnée avec
#   ./deploy/provision-client.sh demo demo.mondomaine.com <port> --demo
#   (connexion démo : demo / Demo2026!, jamais expirée)
#
# Cron (4h du matin, après les sauvegardes de 2h) :
#   0 4 * * * /chemin/deploy/reset-demo.sh >> ~/clients/demo/reset.log 2>&1
set -euo pipefail

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

DEMO_BACKEND="${DEMO_BACKEND:-$HOME/clients/demo/magasin/backend}"
[ -d "$DEMO_BACKEND" ] || { echo "ERREUR: $DEMO_BACKEND introuvable (instance demo non provisionnée ?)"; exit 1; }

echo "=== Reset démo $(date -Is) ==="
# seed-hitek-demo.mjs vide les tables métier (WIPE) puis re-seed produits,
# tiers, devis, factures, paiements, achats... Les utilisateurs sont conservés.
(cd "$DEMO_BACKEND" && node seed-hitek-demo.mjs)
echo "=== Démo réinitialisée ==="
