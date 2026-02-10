#!/bin/sh
# Cron workers: periodic/low-frequency background tasks
# If any worker exits, the container exits (restart policy handles recovery)

set -e

echo "Starting cron workers..."

node dist/workers/reconciliation-worker.js &
PID1=$!

node dist/workers/retention-cleanup-worker.js &
PID2=$!

node dist/workers/subscription-renewal-worker.js &
PID3=$!

node dist/workers/api-key-cleanup-worker.js &
PID4=$!

node dist/workers/api-key-expiry-worker.js &
PID5=$!

node dist/workers/result-expiry-notify-worker.js &
PID6=$!

echo "Cron workers started: reconciliation=$PID1 cleanup=$PID2 renewal=$PID3 key-cleanup=$PID4 key-expiry=$PID5 result-notify=$PID6"

# Wait for any child to exit
wait -n
EXIT_CODE=$?
echo "A cron worker exited with code $EXIT_CODE, shutting down..."
kill $PID1 $PID2 $PID3 $PID4 $PID5 $PID6 2>/dev/null || true
exit $EXIT_CODE
