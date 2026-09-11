# MELITURGOS — Cleanup Roadmap

## Current checkpoint — 2026-09-11

The active MEL path and the post-R4 repository hygiene pass are complete for the current architecture.

### Completed

- Removed obsolete `/professor-v1` routing and the retired V1 full interface.
- Kept `/professor` on Full Mode V2.
- Kept `/professor-legacy` as an explicit rollback/fallback path.
- Removed dead legacy `/api/chat` routing from `src/router.js`; native chat owns the active path.
- Slimmed the theme/avatar enhancer while preserving all current themes, avatars and themed cursors.
- Rewired UI/code capability tests to the current architecture.
- Removed tracked `.wrangler/state/` runtime data and added ignore rules preventing it from returning.
- Consolidated autonomous development wiring on `candidate/augmentio-core`; stale `candidate/mel-clean-autonomy` references are rejected by tests.
- Final pre-release SHA `0907caaabfa3cea7c48105963cf8bf86ac695768` passed `augmentio-ci`, `runtime-teacher-smoke` and `full-candidate-ci`.
- Released R4 through `release/mel-2026-09-11-r4`; Cloudflare deployment completed successfully on workflow run `34583104252` (attempt 2).
- Production Worker version from that release: `ef0fc34d-9bde-4d07-abfe-d0ffc60cfa48`.
- Removed obsolete root checkpoints, ad-hoc debug scripts, three full `worker.js` backup copies and the old `/backups/` snapshot tree. Historical versions remain recoverable from Git history and release branches.
- Removed obsolete session-only morning/overnight handoff documents after verifying no active reference used them.
- Removed unused direct dependency `tsx`.
- Upgraded Wrangler beyond the vulnerable 4.129.x range to `^4.131.0` and refreshed the lockfile.
- Replaced the evaluation benchmark's dependency on a deleted historical Worker snapshot with the verified 14/14 baseline from full-candidate-ci run `34579376844`.
- Dependency cleanup verification: `npm audit --audit-level=high` reported 0 vulnerabilities, syntax checks passed and `npm test` passed 121/121 tests.

## Intentionally retained

### `worker.js`

`worker.js` is **not dead code yet**. It remains required by the explicit `/professor-legacy` route and unmatched legacy fallback. Do not delete it until those fallback paths are formally retired and equivalent behavior is covered by the Gen2 path.

### Release branches

Existing release branches are retained as immutable rollback/history points. Cleanup must not rewrite old releases.

### Operational documentation

Keep restore/setup instructions, deployment policy, current capability/state documents, migrations and runbooks that still describe supported recovery or runtime behavior.

## Future cleanup — separate architecture phase

### Legacy retirement

- Inventory the actual behavior still reachable through `/professor-legacy` and the unmatched legacy fallback.
- Migrate required behavior to Gen2/native modules.
- Add regression coverage for each migrated behavior.
- Only then remove the fallback routes and shrink or remove `worker.js`.

This is not ordinary repository hygiene: it changes runtime architecture and therefore requires its own candidate, tests and release cycle.

## Definition of “clean” for the current architecture

The current cleanup checkpoint is complete because:

- active routes contain no known obsolete interface path;
- temporary runtime state, ad-hoc backups and obsolete session checkpoints are not tracked;
- package and lockfile are coherent;
- dependency audit has no unresolved high-severity finding in the verified dependency set;
- the dependency-cleanup tree passed syntax checks and the complete 121-test suite;
- documentation/state files describe the deployed R4 architecture;
- production deployment remains a separate human-approved release action;
- the only major legacy runtime retained is explicit, documented and required for rollback/fallback behavior.

## Current status

- Active application cleanup: **complete for R4**.
- Repository clutter cleanup: **complete for the current architecture**.
- Dependency/security cleanup: **complete for the verified dependency set (0 audit findings; 121/121 tests)**.
- Full legacy retirement: **deferred intentionally; `/professor-legacy` and active `worker.js` remain as rollback/fallback architecture**.
