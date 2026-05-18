#!/usr/bin/env bash
# Poll Cerebrium volume for trained weights.
set -e
START=$(date +%s)
EXPECTED_BYTES=397316
while true; do
  SIZE=$(cerebrium ls checkpoints_v4/ 2>/dev/null | awk '/damanet.weights.bin/ {print $2}' | head -1)
  ELAPSED=$(( $(date +%s) - START ))
  if [ -n "$SIZE" ]; then
    echo "[${ELAPSED}s] checkpoints_v4/damanet.weights.bin size=$SIZE"
    # we expect ~388 KB
    BYTES=$(cerebrium ls checkpoints_v4/ 2>/dev/null | awk '/damanet.weights.bin/ {print $2}' | head -1)
    if echo "$BYTES" | grep -q "KB"; then
      echo "Weights present (~$BYTES). Training likely complete."
      break
    fi
  fi
  echo "[${ELAPSED}s] still waiting..."
  sleep 30
done
echo "DONE."
