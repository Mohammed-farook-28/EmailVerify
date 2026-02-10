#!/bin/sh
# Core workers: high-throughput, always running
# If any worker exits, the container exits (restart policy handles recovery)

set -e

echo "Starting core workers..."

node dist/workers/verification-worker.js &
PID1=$!

node dist/workers/bulk-worker.js &
PID2=$!

node dist/workers/dlq-handler.js &
PID3=$!

echo "Core workers started: verification=$PID1 bulk=$PID2 dlq=$PID3"

# Wait for any child to exit — then exit container so orchestrator can restart
wait -n
EXIT_CODE=$?
echo "A core worker exited with code $EXIT_CODE, shutting down..."
kill $PID1 $PID2 $PID3 2>/dev/null || true
exit $EXIT_CODE
