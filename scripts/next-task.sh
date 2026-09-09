#!/usr/bin/env bash
set -euo pipefail
priority=docs/CURRENT-PRIORITY.md
queue=docs/OPENHANDS-ENDGAME-QUEUE.md
echo "CURRENT TASK"; sed -n 's/^CURRENT_TASK=//p' "$priority"
echo "FILES"; sed -n 's/^FILES=//p' "$priority"
echo "COMMAND"; sed -n 's/^COMMAND=//p' "$priority"
echo "EXPECTED"; sed -n 's/^EXPECTED=//p' "$priority"
echo "NEXT TASK"; sed -n 's/^NEXT_TASK=//p' "$priority"
echo "QUEUE CONTEXT"; grep -A12 -m1 "^$(sed -n 's/^CURRENT_TASK=//p' "$priority")$" "$queue" || true
