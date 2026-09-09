#!/usr/bin/env bash
set -euo pipefail
git status --short
if npm run test:smoke; then echo "CHECKPOINT=SAFE"; else echo "CHECKPOINT=FAILED"; exit 1; fi
