# MEL reconciliation — 2026-10-14

## Scope and immutable baselines
- Production main at branch creation: `015fa63f4f62e298124fd83b67954b4f65678037`.
- Fully validated isolated candidate: `2a8b3dd0ee7a8460b23ba3905e300b3451a570d4`.
- Candidate preview: https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/actions/runs/38515335142 (SUCCESS).
- PR #1228: draft / mergeable_state=dirty. **Do not force merge.**
- Dedicated branch: `reconcile/mel-candidate-20261014`. Production remains untouched.

## Overlapping changed paths requiring semantic reconciliation
1. `.github/workflows/deploy-candidate-preview.yml`
2. `src/continuity/shardvault-runtime.js`
3. `tests/gen2/post-release-proof-suite.test.mjs`
4. `tests/release-predeploy-backup-reuse.test.mjs`
5. `tests/shardvault-github-code-mirror.test.mjs`

These are **overlaps**, not yet a verified exhaustive list of textual merge conflicts. Compare with the common ancestor, preserving both sets of changes.

## Required protections
- Preserve strict authenticated GitHub authoritative mirror readback, wrapped Base64 JSON envelope accounting, unchanged decoded shard limits and byte-for-byte SHA/MAC checks.
- Preserve 408/425/429/5xx bounded read-only retries only; never retry integrity/auth/missing-content errors or fall back to an unverified local archive.
- Preserve all main production-only changes including MINI/APK/Companion; do not replace files wholesale.
- No force push of main, candidate, or release pointers. No production deploy or MAX activation as part of reconciliation.
- New reconciled SHA must pass full CI, LoRA, Teacher, hardware, unicity and **live isolated preview** proving ShardVault 7/7, three-loss reconstruction, stress, and paused state before any production approval.

## Next execution
Reconcile on this branch starting with the five overlapping files using a three-way comparison (merge-base, main, candidate); add candidate-only files and tests with dependency parity; run exact-SHA CI; keep PR #1228 draft until resolved and all gates green.
