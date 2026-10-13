#!/usr/bin/env bash
# Owner-authorized replay only. Never run on main or candidate.
set -euo pipefail
branch="integration/mel-main-candidate-20261013"
test "$(git branch --show-current)" = "$branch" || { echo "Wrong branch; refusing"; exit 10; }
test -z "$(git status --porcelain)" || { echo "Dirty checkout; refusing"; exit 11; }
git fetch --no-tags origin main "$branch"
test "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$branch")" || { echo "Integration branch moved; refusing"; exit 12; }
git config user.name "MEL isolated integration"
git config user.email "mel-integration@users.noreply.github.com"
# Preserve already-proven candidate hunks for overlapping edits, incorporate other main changes.
git merge --no-commit --no-ff -X ours origin/main
test -z "$(git ls-files -u)" || { echo "Unresolved merge conflicts"; exit 13; }
python3 - <<'PY'
from pathlib import Path
p=Path("tests/release-predeploy-backup-reuse.test.mjs")
s=p.read_text()
block="  const d1Export = delegatedD1\n    ? await readFile(new URL('../release-tools/predeploy-backup-refresh/d1-export.mjs', import.meta.url), 'utf8')\n    : runner;\n"
if s.count(block)!=1:
    raise SystemExit("Expected backup conflict pattern missing; review manually")
p.write_text(s.replace(block,"  // Reuse the already declared canonical d1Export reader.\n"))
PY
git add tests/release-predeploy-backup-reuse.test.mjs
git diff --cached --check
node --check src/continuity/shardvault-runtime.js
node --check scripts/fulfill-preview-code-mirror.mjs
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/shardvault-github-code-mirror.test.mjs tests/shardvault-github-authoritative-readback.test.mjs tests/release-predeploy-backup-reuse.test.mjs tests/preview-resource-isolation.test.mjs
echo "All targeted gates passed. This is not full CI nor live preview proof."
git status --short
if [ "${MEL_INTEGRATION_PUBLISH:-NO}" != "YES" ]; then
  echo "SAFE DEFAULT: no commit or push. Set MEL_INTEGRATION_PUBLISH=YES only after conflict and security review."
  exit 0
fi
git commit -m "merge(integration): main into candidate on isolated branch"
git push origin "HEAD:refs/heads/$branch"
echo "Published isolated integration only; run exact-SHA full CI and live preview before any promotion."
