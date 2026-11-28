#!/usr/bin/env bash
# usage: start-backend.sh <dbname> <port> <viteport>
case "$1" in nolyx_audit_[0-9]*|nolyx_audit_base) ;; *) echo "base refusée: $1"; exit 1;; esac
cd /c/Users/Mohamed/Desktop/projet/magasinProgramme/backend
export DB_HOST=localhost DB_NAME="$1" PORT="$2" FRONTEND_URL="http://localhost:$3" RATE_LIMIT_MAX=100000 AUTH_RATE_LIMIT_MAX=100000 NODE_ENV=development CAISSE_GL_POSTING=true
exec npx tsx src/server.ts
