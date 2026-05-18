#!/usr/bin/env bash
# Upload all done distilled chunks to Cerebrium /persistent-storage/distilled_selfplay/
set -e
COUNT=0
for f in data/datasets/nn/distilled_selfplay/chunk_*.bin; do
  name=$(basename "$f")
  cerebrium cp "$f" "distilled_selfplay/$name" > /dev/null 2>&1
  COUNT=$((COUNT+1))
  if [ $((COUNT % 25)) -eq 0 ]; then
    echo "Uploaded $COUNT chunks"
  fi
done
echo "Total uploaded: $COUNT chunks"
