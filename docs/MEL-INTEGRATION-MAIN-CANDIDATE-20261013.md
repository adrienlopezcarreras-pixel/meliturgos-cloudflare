# MEL — isolated candidate/main integration plan (2026-10-13)

This file belongs only to the integration branch, not production. Do not merge/promote from this branch until an exact-SHA isolated preview and CI pass again.

## Verified starting state
- Candidate source commit: `ddd318fc3677dccbc8be10c8a032982ec4e18701`.
- Successful isolated preview: https://github.com/adrienlopezcarreras-pixel/meliturgos-cloudflare/actions/runs/38443151697
- The preview passed external ShardVault reconstruction, bounded three-loss recovery patterns, autonomy launch-readiness and UI/recovery stress.
- PR #1228 remained DRAFT and GitHub reported `mergeable_state=dirty` against main `53ad603457a1d9a4571e5878593702035a437aba`.
- Vercel failure was `Deployment rate limited — retry in 24 hours`; it is not evidence of a MEL test failure.
- MAX must remain OFF. No production, MINI, APK or Companion changes should be performed as part of this integration.

## Potential overlap requiring three-way merge review
Both compare directions list the following paths (overlap alone does not prove each path conflicts):
1. `.github/workflows/deploy-candidate-preview.yml`
2. `src/continuity/shardvault-runtime.js`
3. `tests/gen2/post-release-proof-suite.test.mjs`
4. `tests/release-predeploy-backup-reuse.test.mjs`
5. `tests/shardvault-github-code-mirror.test.mjs`

## Mandatory next actions
1. In an isolated checkout, fetch current `main` and integration branch; verify SHA snapshots. Merge `main` into this integration branch WITHOUT touching candidate or main; stop for conflicts.
2. Resolve conflicts manually, preserving candidate ShardVault authenticated fixed-origin readback, JSON envelope bound for line-wrapped GitHub Contents Base64, strict decoded byte limits, isolated D1/R2 and exact-SHA proof. Preserve main-side hardware/APK/Companion changes; do not regress release backup checks.
3. Run targeted tests on affected modules, then complete CI and exact-SHA isolated preview including live ShardVault 7/7, seven three-loss patterns and all recovery tests. Do not consider the old SHA's green CI to apply to the integration commit.
4. Keep any production promotion on hold until all mandatory checks, the mergeable state and the Vercel rate-limit issue are resolved. Explicitly verify release gates and MAX OFF.

Status: MERGE NOT PERFORMED. This is a reproducible integration handoff, not a claim of conflict resolution.
