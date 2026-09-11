# MELITURGOS — Cleanup Roadmap

## Current checkpoint — 2026-09-11

The active MEL path has completed its first structural cleanup and was validated before release.

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
- Post-release cleanup removed obsolete root checkpoints, ad-hoc debug scripts and three full `worker.js` backup copies. Historical versions remain recoverable from Git history and release branches.

## Intentionally retained

### `worker.js`

`worker.js` is **not dead code yet**. It remains required by the explicit `/professor-legacy` route and unmatched legacy fallback. Do not delete it until those fallback paths are formally retired and equivalent behavior is covered by the Gen2 path.

### Release branches

Existing release branches are retained as immutable rollback/history points. Cleanup must not rewrite old releases.

## Remaining cleanup

### P0 — Dependency/security hygiene

- Investigate the `3 high severity vulnerabilities` reported by `npm ci` during the R4 deployment.
- Confirm whether direct dependency `tsx` is still needed. No current code-search usage has been identified, but it must only be removed together with a coherent `package-lock.json` update and passing CI.
- Re-run the full suite after dependency changes.

### P1 — Repository organization

- Review `/backups/` and remove only artifacts that are duplicated by Git history/releases and are not used by restore tooling.
- Review remaining root handoff/resume documents and move or retire obsolete session-only material.
- Keep migrations, restore instructions and current capability/state documents until their consumers are verified.

### P2 — Legacy retirement

- Inventory the actual behavior still reachable through `/professor-legacy` and the unmatched legacy fallback.
- Migrate required behavior to Gen2/native modules.
- Add regression coverage for each migrated behavior.
- Only then remove the fallback routes and shrink or remove `worker.js`.

## Definition of “clean”

A cleanup checkpoint can be called complete only when:

- active routes contain no known obsolete interface path;
- temporary runtime state and ad-hoc backups are not tracked;
- package and lockfile are coherent;
- dependency audit has no unresolved high-severity finding that can be safely fixed in scope;
- all configured CI workflows pass on the exact candidate SHA;
- documentation/state files describe the actual deployed architecture;
- production deployment remains a separate human-approved release action.

## Current status

- Active application cleanup: **complete for R4**.
- Repository clutter cleanup: **in progress on `cleanup/post-r4`**.
- Dependency/security cleanup: **pending investigation**.
- Full legacy retirement: **not started; fallback intentionally retained**.
