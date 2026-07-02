#!/bin/bash
echo "======================================================================"
echo "          Demarrage de Hitek ERP (Frontend + Backend)"
echo "======================================================================"
echo ""

# Verifier si node_modules existe pour le backend
if [ ! -d "backend/node_modules" ]; then
    echo "[Backend] Dossier node_modules introuvable. Installation des dependances..."
    (cd backend && npm install)
else
    echo "[Backend] Dependances deja installees."
fi

# Verifier si node_modules existe pour le frontend
if [ ! -d "frontend/node_modules" ]; then
    echo "[Frontend] Dossier node_modules introuvable. Installation des dependances..."
    (cd frontend && npm install)
else
    echo "[Frontend] Dependances deja installees."
fi

echo ""
echo "======================================================================"
echo "Lancement des serveurs de developpement..."
echo "======================================================================"
echo ""

# Lancement du Backend en arriere-plan
echo "[Backend] Demarrage en cours sur http://localhost:6000 ..."
cd backend && npm run dev &
BACKEND_PID=$!
cd ..

# Lancement du Frontend en arriere-plan
echo "[Frontend] Demarrage en cours sur http://localhost:6001 ..."
cd frontend && npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "----------------------------------------------------------------------"
echo "[SUCCES] Les deux serveurs sont lances."
echo "- URL Frontend : http://localhost:6001"
echo "- URL Backend  : http://localhost:6000"
echo ""
echo "Appuyez sur [Ctrl + C] pour arreter proprement les deux serveurs."
echo "----------------------------------------------------------------------"
echo ""

# Fonction pour arreter proprement les processus en arriere-plan
cleanup() {
    echo ""
    echo "Arrêt des serveurs (PIDs: $BACKEND_PID, $FRONTEND_PID)..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "Serveurs arretes avec succes."
    exit 0
}

# Intercepter le signal d'arret (Ctrl+C)
trap cleanup SIGINT SIGTERM

# Attendre la fin des serveurs
wait
