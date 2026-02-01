#!/bin/bash
echo "=== BACKEND FILES ==="
ls -1 backend/src/services/{dashboard,reconciliation,retention-cleanup}.ts 2>/dev/null | wc -l | xargs echo "Services:"
ls -1 backend/src/routes/dashboard.ts 2>/dev/null | wc -l | xargs echo "Routes:"
ls -1 backend/src/workers/{dlq-handler,reconciliation-worker,retention-cleanup-worker}.ts 2>/dev/null | wc -l | xargs echo "Workers:"

echo ""
echo "=== FRONTEND FILES ==="
ls -1 ../EmailVerify-Frontend/src/lib/api/dashboard.ts 2>/dev/null | wc -l | xargs echo "API:"
ls -1 ../EmailVerify-Frontend/src/hooks/useDashboard.ts 2>/dev/null | wc -l | xargs echo "Hooks:"
ls -1 ../EmailVerify-Frontend/src/components/dashboard/*.tsx 2>/dev/null | wc -l | xargs echo "Components:"

echo ""
echo "=== BUILD TEST ==="
cd backend && npm run build > /dev/null 2>&1 && echo "✓ Backend builds successfully" || echo "✗ Build failed"
