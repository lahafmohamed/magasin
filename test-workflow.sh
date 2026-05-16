#!/bin/bash
# Test script for Role-Based Stock Management Workflow
# Usage: ./test-workflow.sh [BASE_URL]
# Default BASE_URL: http://localhost:3001

set -e

BASE_URL="${1:-http://localhost:3001}"
API="$BASE_URL/api"

echo "=========================================="
echo "RBC Stock Management Workflow Test"
echo "Base URL: $BASE_URL"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
request() {
  local method=$1
  local endpoint=$2
  local data=$3
  local token=$4
  
  local curl_cmd="curl -s -X $method \"$API$endpoint\""
  
  if [ -n "$token" ]; then
    curl_cmd="$curl_cmd -H \"Authorization: Bearer $token\""
  fi
  
  if [ -n "$data" ]; then
    curl_cmd="$curl_cmd -H \"Content-Type: application/json\" -d '$data'"
  fi
  
  eval $curl_cmd
}

print_result() {
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}: $2"
  else
    echo -e "${RED}✗ FAIL${NC}: $2"
  fi
}

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# ============================================
# TEST 1: Login as magasin staff
# ============================================
echo "--- Test 1: Magasin Staff Login ---"
MAGASIN_LOGIN=$(request "POST" "/auth/login" '{"username":"magasin1","password":"magasin123"}')
MAGASIN_TOKEN=$(echo $MAGASIN_LOGIN | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$MAGASIN_TOKEN" ]; then
  print_result 0 "Magasin staff logged in"
  ((TESTS_PASSED++))
else
  print_result 1 "Magasin staff login failed: $MAGASIN_LOGIN"
  ((TESTS_FAILED++))
  exit 1
fi
echo ""

# ============================================
# TEST 2: Create demande as magasin
# ============================================
echo "--- Test 2: Create Demande (Magasin) ---"
DEMANDE=$(request "POST" "/demandes" '{
  "magasin_id": 1,
  "depot_id": 2,
  "motif": "Test workflow",
  "lignes": [{"produit_id": 1, "quantite_demandee": 10}]
}' "$MAGASIN_TOKEN")

DEMANDE_ID=$(echo $DEMANDE | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
DEMANDE_NUMERO=$(echo $DEMANDE | grep -o '"numero":"[^"]*"' | head -1 | cut -d'"' -f4)
DEMANDE_STATUT=$(echo $DEMANDE | grep -o '"statut":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$DEMANDE_ID" ] && [ "$DEMANDE_STATUT" = "brouillon" ]; then
  print_result 0 "Demande created: $DEMANDE_NUMERO (ID: $DEMANDE_ID, Status: $DEMANDE_STATUT)"
  ((TESTS_PASSED++))
else
  print_result 1 "Demande creation failed: $DEMANDE"
  ((TESTS_FAILED++))
fi
echo ""

# ============================================
# TEST 3: Send demande
# ============================================
echo "--- Test 3: Send Demande to Depot ---"
SEND_RESULT=$(request "POST" "/demandes/$DEMANDE_ID/envoyer" "" "$MAGASIN_TOKEN")
SEND_STATUT=$(echo $SEND_RESULT | grep -o '"statut":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ "$SEND_STATUT" = "envoyee" ]; then
  print_result 0 "Demande sent, status: $SEND_STATUT"
  ((TESTS_PASSED++))
else
  print_result 1 "Send failed: $SEND_RESULT"
  ((TESTS_FAILED++))
fi
echo ""

# ============================================
# TEST 4: Login as depot staff
# ============================================
echo "--- Test 4: Depot Staff Login ---"
DEPOT_LOGIN=$(request "POST" "/auth/login" '{"username":"depot1","password":"depot123"}')
DEPOT_TOKEN=$(echo $DEPOT_LOGIN | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -n "$DEPOT_TOKEN" ]; then
  print_result 0 "Depot staff logged in"
  ((TESTS_PASSED++))
else
  print_result 1 "Depot staff login failed: $DEPOT_LOGIN"
  ((TESTS_FAILED++))
  exit 1
fi
echo ""

# ============================================
# TEST 5: List pending demandes (depot view)
# ============================================
echo "--- Test 5: List Pending Demandes (Depot View) ---"
PENDING=$(request "GET" "/demandes?statut=envoyee" "" "$DEPOT_TOKEN")
PENDING_COUNT=$(echo $PENDING | grep -o '"id":' | wc -l)

if [ "$PENDING_COUNT" -ge 1 ]; then
  print_result 0 "Found $PENDING_COUNT pending demande(s)"
  ((TESTS_PASSED++))
else
  print_result 1 "No pending demandes found: $PENDING"
  ((TESTS_FAILED++))
fi
echo ""

# ============================================
# TEST 6: Approve demande (depot)
# ============================================
echo "--- Test 6: Approve Demande (Depot) ---"
DECISION_RESULT=$(request "POST" "/demandes/$DEMANDE_ID/decider" '{
  "decision": "approuvee",
  "lignes_decision": [{"ligne_id": 1, "quantite_approuvee": 10}]
}' "$DEPOT_TOKEN")

DECISION_STATUT=$(echo $DECISION_RESULT | grep -o '"statut":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ "$DECISION_STATUT" = "approuvee" ]; then
  print_result 0 "Demande approved, status: $DECISION_STATUT"
  ((TESTS_PASSED++))
else
  print_result 1 "Approval failed: $DECISION_RESULT"
  ((TESTS_FAILED++))
fi
echo ""

# ============================================
# TEST 7: Execute demande (create transfer)
# ============================================
echo "--- Test 7: Execute Demande (Transfer) ---"
EXECUTE_RESULT=$(request "POST" "/demandes/$DEMANDE_ID/executer" "" "$DEPOT_TOKEN")

EXECUTE_STATUT=$(echo $EXECUTE_RESULT | grep -o '"statut":"[^"]*"' | head -1 | cut -d'"' -f4)
TRANSFER_NUM=$(echo $EXECUTE_RESULT | grep -o '"numero_transfer":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ "$EXECUTE_STATUT" = "livree" ] && [ -n "$TRANSFER_NUM" ]; then
  print_result 0 "Demande executed, status: $EXECUTE_STATUT, Transfer: $TRANSFER_NUM"
  ((TESTS_PASSED++))
else
  print_result 1 "Execution failed: $EXECUTE_RESULT"
  ((TESTS_FAILED++))
fi
echo ""

# ============================================
# TEST 8: Close demande (magasin confirms receipt)
# ============================================
echo "--- Test 8: Close Demande (Magasin Receipt) ---"
CLOSE_RESULT=$(request "POST" "/demandes/$DEMANDE_ID/cloturer" "" "$MAGASIN_TOKEN")

CLOSE_STATUT=$(echo $CLOSE_RESULT | grep -o '"statut":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ "$CLOSE_STATUT" = "cloturee" ]; then
  print_result 0 "Demande closed, status: $CLOSE_STATUT"
  ((TESTS_PASSED++))
else
  print_result 1 "Closure failed: $CLOSE_RESULT"
  ((TESTS_FAILED++))
fi
echo ""

# ============================================
# TEST 9: Verify transfer was created
# ============================================
echo "--- Test 9: Verify Transfer Created ---"
TRANSFERS=$(request "GET" "/stock-transfers" "" "$DEPOT_TOKEN")
TRANSFER_COUNT=$(echo $TRANSFERS | grep -o '"numero_transfer":"' | wc -l)

if [ "$TRANSFER_COUNT" -ge 1 ]; then
  print_result 0 "Transfer exists in system"
  ((TESTS_PASSED++))
else
  print_result 1 "No transfers found: $TRANSFERS"
  ((TESTS_FAILED++))
fi
echo ""

# ============================================
# TEST 10: Test permission denial
# ============================================
echo "--- Test 10: Permission Denial (Magasin tries to approve) ---"
# Try to create a new demande and have magasin approve it (should fail)
NEW_DEMANDE=$(request "POST" "/demandes" '{
  "magasin_id": 1,
  "depot_id": 2,
  "motif": "Test permission",
  "lignes": [{"produit_id": 1, "quantite_demandee": 5}]
}' "$MAGASIN_TOKEN")

NEW_ID=$(echo $NEW_DEMANDE | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)

# Send it
request "POST" "/demandes/$NEW_ID/envoyer" "" "$MAGASIN_TOKEN" > /dev/null

# Try to approve as magasin (should fail)
FORBIDDEN=$(request "POST" "/demandes/$NEW_ID/decider" '{
  "decision": "approuvee"
}' "$MAGASIN_TOKEN")

if echo "$FORBIDDEN" | grep -q "Permission refusée\|403\|Unauthorized"; then
  print_result 0 "Permission correctly denied for magasin approval"
  ((TESTS_PASSED++))
else
  print_result 1 "Permission check failed - got: $FORBIDDEN"
  ((TESTS_FAILED++))
fi
echo ""

# ============================================
# Summary
# ============================================
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed.${NC}"
  exit 1
fi
