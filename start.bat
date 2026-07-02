@echo off
title Hitek ERP Launcher
echo ======================================================================
echo           Demarrage de Hitek ERP (Frontend + Backend)
echo ======================================================================
echo.

:: Verifier si node_modules existe pour le backend
if not exist "backend\node_modules\" (
    echo [Backend] Dossier node_modules introuvable. Installation des dependances...
    cd backend && call npm install && cd ..
) else (
    echo [Backend] Dependances de deja installees.
)

:: Verifier si node_modules existe pour le frontend
if not exist "frontend\node_modules\" (
    echo [Frontend] Dossier node_modules introuvable. Installation des dependances...
    cd frontend && call npm install && cd ..
) else (
    echo [Frontend] Dependances de deja installees.
)

echo.
echo ======================================================================
echo Lancement des serveurs de developpement...
echo ======================================================================
echo.

:: Lancer le backend
echo [Backend] Demarrage en cours sur http://localhost:6000 ...
start "Hitek Backend (API)" cmd /k "cd backend && npm run dev"

:: Lancer le frontend
echo [Frontend] Demarrage en cours sur http://localhost:6001 ...
start "Hitek Frontend (UI)" cmd /k "cd frontend && npm run dev"

echo.
echo ----------------------------------------------------------------------
echo [SUCCES] Les serveurs sont lances dans des fenetres de commande separees.
echo.
echo - URL Frontend : http://localhost:6001
echo - URL Backend  : http://localhost:6000
echo.
echo Fermez simplement les fenetres de commande ouvertes pour arreter les serveurs.
echo ----------------------------------------------------------------------
echo.
pause
