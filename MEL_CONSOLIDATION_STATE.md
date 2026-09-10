# MEL consolidation state

Branch of record: `candidate/mel-clean-autonomy`
Baseline HEAD inspected: `a4d698f3e8ccac33d5585229a0ea3b7718ac51a2`

## Integrated / already contained

- `candidate/mel-ui-selfaware-integration` — ALREADY_CONTAINED. Git compare reports the clean branch is 8 commits ahead with no head-only files.
- `candidate/augmentio-core` — ALREADY_CONTAINED. Clean branch is 28 commits ahead with no head-only files.
- `candidate/dev-bridge-fetch-fix` / PR #5 — ALREADY_CONTAINED. Clean branch is 26 commits ahead; merge base is the dev-bridge fix commit `d93658ccc993c0db765649b604427541b7372ecb`.
- `candidate/device-control-core` / PR #4 — INTEGRATED_BY_COMPARISON, not by blind branch merge. `src/devices/device-control-policy.js` exists on clean; focused permission-policy tests are present at HEAD `a4d698f3e8ccac33d5585229a0ea3b7718ac51a2`. Remaining head-only comparison from the old device branch is limited to the same policy/test pair and must not be cherry-picked wholesale.
- `.github/workflows/full-candidate-ci.yml` already includes `candidate/mel-clean-autonomy`.

## To recover selectively

- `feature/mel-autonomy-mentor` / PR #6 — TO_RECOVER_SELECTIVELY. Highly divergent (53 head-only commits vs 242 clean-only). Candidate items requiring file-by-file comparison: `src/learning/mentor-engine.js`, `src/learning/mentor-memory.js`, additive mentor migration/tests, runtime/Dev Bridge mentor wiring only after tests, and any missing natural-language development-intent coverage. Never merge the branch wholesale.
- `hotfix/prompt-limit-100k` — TO_COMPARE_SELECTIVELY. Divergent historical branch with only `package.json` + `scripts/raise-prompt-limit.mjs` head-only. Preserve the 100000 composer behavior through the current UI implementation/tests rather than importing a stale package script unless a concrete gap is found.
- `release/mel-2026-09-10-r3-3` — REFERENCE_ONLY / TO_COMPARE_SELECTIVELY. Diverged from clean (10 head-only, 49 clean-only). Head-only surface includes autonomy/Teacher Bridge/GitHub-code fallback/Work DAG files; only missing behavior with reproducible tests may be recovered. Never replace candidate with release.
- `candidate/mel-work-02-state-final2` — TO_COMPARE on next consolidation pass before any recovery.
- PR #7 — TO_COMPARE against the current clean UI/theme state before closing remaining UI gaps; do not merge blindly.

## Abandoned / superseded

- Any historical `Dark Full Plate` theme instruction — ABANDONED and superseded by exact UI theme name `Paladin Light Full Plate`.
- Blind cherry-picks or whole-branch merges from divergent mentor/device/release branches — ABANDONED METHOD.

## Conflict / verification rules

- Production/release/DNS/secrets/bindings/auth/billing remain untouched.
- Unknown added cost is fail-closed.
- D1 changes must be additive only; no automatic rollback.
- Before each write: refetch `candidate/mel-clean-autonomy` and never overwrite an advanced HEAD.
- Recovery unit is the smallest missing file/function/test, followed by targeted tests and exact-SHA `full-candidate-ci` verification.

## Next concrete block

Compare the two mentor source files and current persistence schema on `candidate/mel-clean-autonomy` against `feature/mel-autonomy-mentor`; if mentor core is already present, add only the missing additive schema v6 / `mentor_lessons` migration and focused MentorEngine/MentorMemory tests. If those are already complete, move to the two requested themes (`Aviation 1940s`, `Paladin Light Full Plate`) with avatar fallbacks and regression tests.
