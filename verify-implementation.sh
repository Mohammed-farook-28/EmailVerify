#!/bin/bash

# Verification Script for Epic 2 Post-MVP Implementation
# Tests Phases 5-9 implementation

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Epic 2 Post-MVP Implementation Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASS=0
FAIL=0

# Test function
test_file() {
  local file=$1
  local desc=$2

  if [ -f "$file" ]; then
    echo -e "${GREEN}✓${NC} $desc"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} $desc (MISSING: $file)"
    ((FAIL++))
  fi
}

# Test command
test_command() {
  local cmd=$1
  local desc=$2

  if eval "$cmd" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} $desc"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} $desc"
    ((FAIL++))
  fi
}

# Test grep
test_grep() {
  local file=$1
  local pattern=$2
  local desc=$3

  if grep -q "$pattern" "$file" 2>/dev/null; then
    echo -e "${GREEN}✓${NC} $desc"
    ((PASS++))
  else
    echo -e "${RED}✗${NC} $desc"
    ((FAIL++))
  fi
}

echo "📦 Phase 1: Backend Files"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_file "backend/src/services/dashboard.ts" "Dashboard service"
test_file "backend/src/services/reconciliation.ts" "Reconciliation service"
test_file "backend/src/services/retention-cleanup.ts" "Retention cleanup service"
test_file "backend/src/routes/dashboard.ts" "Dashboard routes"
test_file "backend/src/workers/dlq-handler.ts" "DLQ worker"
test_file "backend/src/workers/reconciliation-worker.ts" "Reconciliation worker"
test_file "backend/src/workers/retention-cleanup-worker.ts" "Cleanup worker"
echo ""

echo "📦 Phase 2: Frontend Files"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_file "EmailVerify-Frontend/src/lib/api/dashboard.ts" "Dashboard API client"
test_file "EmailVerify-Frontend/src/hooks/useDashboard.ts" "Dashboard hooks"
test_file "EmailVerify-Frontend/src/components/dashboard/stats-card.tsx" "Stats card component"
test_file "EmailVerify-Frontend/src/components/dashboard/validity-distribution-chart.tsx" "Distribution chart"
test_file "EmailVerify-Frontend/src/components/dashboard/verification-trend-chart.tsx" "Trend chart"
test_file "EmailVerify-Frontend/src/components/cookie-consent-provider.tsx" "Cookie consent provider"
echo ""

echo "📦 Phase 3: npm Scripts"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_grep "backend/package.json" '"workers:dlq"' "DLQ worker script"
test_grep "backend/package.json" '"workers:reconcile"' "Reconciliation worker script"
test_grep "backend/package.json" '"workers:cleanup"' "Cleanup worker script"
echo ""

echo "📦 Phase 4: Route Registration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_grep "backend/src/app.ts" "dashboardRoutes" "Dashboard routes imported"
test_grep "backend/src/app.ts" "/api/dashboard" "Dashboard routes registered"
echo ""

echo "📦 Phase 5: Service Functions"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_grep "backend/src/services/credit.ts" "refundCredits" "Credit refund function"
test_grep "backend/src/services/dashboard.ts" "getDashboardStats" "Dashboard stats function"
test_grep "backend/src/services/dashboard.ts" "getStatusDistribution" "Status distribution function"
test_grep "backend/src/services/reconciliation.ts" "reconcileUser" "User reconciliation function"
test_grep "backend/src/services/retention-cleanup.ts" "cleanupForUser" "User cleanup function"
echo ""

echo "📦 Phase 6: Metrics"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_grep "backend/src/lib/metrics.ts" "dlqDepthGauge" "DLQ depth metric"
test_grep "backend/src/lib/metrics.ts" "creditRefundCounter" "Credit refund metric"
test_grep "backend/src/lib/metrics.ts" "reconciliationDriftGauge" "Reconciliation drift metric"
test_grep "backend/src/lib/metrics.ts" "loadSheddingCounter" "Load shedding metric"
echo ""

echo "📦 Phase 7: Frontend Integration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_grep "EmailVerify-Frontend/src/app/layout.tsx" "CookieConsentProvider" "Cookie consent in layout"
test_grep "EmailVerify-Frontend/src/app/(dashboard)/home/page.tsx" "useDashboardStats" "Dashboard hooks used"
test_grep "EmailVerify-Frontend/src/app/(dashboard)/home/page.tsx" "ValidityDistributionChart" "Distribution chart used"
test_grep "EmailVerify-Frontend/src/app/(dashboard)/home/page.tsx" "VerificationTrendChart" "Trend chart used"
echo ""

echo "📦 Phase 8: Build Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -n "Testing backend build... "
if (cd backend && npm run build > /dev/null 2>&1); then
  echo -e "${GREEN}✓${NC} Backend builds successfully"
  ((PASS++))
else
  echo -e "${RED}✗${NC} Backend build failed"
  ((FAIL++))
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Verification Results"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "  Passed: ${GREEN}$PASS${NC}"
echo -e "  Failed: ${RED}$FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}✓ All verification checks passed!${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Start PostgreSQL and Redis"
  echo "  2. Run: cd backend && npm run dev"
  echo "  3. Run: cd backend && npm run workers"
  echo "  4. Run: cd EmailVerify-Frontend && npm run dev"
  echo "  5. Visit: http://localhost:3001/home"
  echo ""
  exit 0
else
  echo -e "${RED}✗ Some verification checks failed${NC}"
  echo ""
  exit 1
fi
