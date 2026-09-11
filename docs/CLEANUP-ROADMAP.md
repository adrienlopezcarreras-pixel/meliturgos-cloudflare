# MELITURGOS — Cleanup Roadmap

## Current checkpoint — 2026-09-11

The active MEL path and the repository hygiene pass are clean enough to continue development without rewriting release history or removing compatibility behavior that is still live.

## Completed repository cleanup

- Removed obsolete `/professor-v1` routing and the retired V1 full interface.
- Kept `/professor` on Full Mode V2.
- Removed dead legacy `/api/chat` routing from `src/router.js`; native chat owns the active chat path.
- Slimmed the theme/avatar enhancer while preserving all current themes, avatars and themed cursors.
- Rewired UI/code capability tests to the current architecture.
- Removed tracked `.wrangler/state/` runtime data and added ignore rules preventing it from returning.
- Consolidated autonomous-development wiring on `candidate/augmentio-core`; stale `candidate/mel-clean-autonomy` references are rejected by tests.
- Removed obsolete root checkpoints, ad-hoc debug scripts, full Worker backup copies and the old `/backups/` snapshot tree. Historical versions remain recoverable from Git history and release branches.
- Removed obsolete session-only handoff documents after verifying no active reference used them.
- Removed the unused direct dependency `tsx`.
- Upgraded Wrangler to `^4.131.0` and refreshed the lockfile.
- Replaced the evaluation benchmark dependency on a deleted Worker snapshot with the verified baseline.
- Removed the obsolete `dependency-fix` workflow because it could reintroduce Wrangler `4.130.0` after the security upgrade.
- Simplified audit-test clutter: the executable `audit-persistence.test.mjs` remains in the real test suite; the manual/debug duplicates are removed.
- Modernized CI triggers for `main`, candidate, cleanup and feature branches plus pull requests to `main`.
- Production deployment is manual and refuses any ref outside `release/*`; install, dependency audit, syntax and the full test suite run before deployment.
- Live Teacher Bridge smoke tests run after a successful production deployment or by explicit manual dispatch, not on every development push.

## Production checkpoint retained

R4 remains the currently documented production release checkpoint:

- release branch: `release/mel-2026-09-11-r4`;
- source main SHA at that release: `0907caaabfa3cea7c48105963cf8bf86ac695768`;
- successful deployment workflow run: `34583104252` (attempt 2);
- Worker version: `ef0fc34d-9bde-4d07-abfe-d0ffc60cfa48`.

The deep-cleanup branch is **not** a production deployment. Production continues to require an explicit human-approved release action.

## Intentionally retained compatibility runtime

### `worker.js`

`worker.js` is still active compatibility code and must not be deleted yet.

A deep inspection confirmed that the legacy fallback still owns reachable behavior not fully migrated to the Gen2/native modules, including parts of:

- status, diagnostic and export compatibility APIs;
- voice transcription/speech;
- feedback and explicit memory writes;
- Professor session/correction/lesson/retest APIs;
- knowledge and learning APIs;
- monitoring;
- file/media compatibility APIs;
- task, governance and tool-registry endpoints.

`/professor-legacy` and the unmatched compatibility fallback therefore remain deliberate until those endpoints have equivalent Gen2/native coverage and regression tests. A cleanup attempt that would have removed this runtime was rejected and rolled back before merge after blob-level inspection exposed these active routes.

### Release branches

Existing release branches remain immutable rollback/history points. Cleanup must not rewrite them.

### Operational documentation

Keep restore/setup instructions, deployment policy, current capability/state documents, migrations and runbooks that still describe supported recovery or runtime behavior.

## Legacy retirement plan

Legacy retirement is now a migration project, not a deletion task. For each compatibility endpoint:

1. map the route and its persistent side effects;
2. identify or implement its Gen2/native equivalent;
3. add route-level regression coverage;
4. switch the route to the modern implementation;
5. remove only the now-unreferenced legacy function;
6. repeat until the compatibility fallback has zero unique behavior;
7. only then remove `/professor-legacy` and `worker.js`.

This prevents a cosmetic cleanup from silently deleting voice, memory, learning, Professor or tool behavior.

## Next product phase

Development after this cleanup should proceed in this order:

1. **MEL interface vNext** — one coherent mobile-first UI, preserving the current visual themes and avatars, Enter-to-send, no visible interaction counter, and a clear Full Mode entry.
2. **Voice + files + mobile** — clickable MEL face for microphone activation, reliable transcription, one text/drop zone for supported files, clear local/remote processing states and graceful fallbacks.
3. **Memory + context** — consolidate native memory/context retrieval, provenance and export/import so the UI does not depend on duplicate legacy implementations.
4. **Evolution + modules** — move autonomous-development capabilities behind the canonical capability bus, with explicit authorization boundaries, exact-SHA work packages, tests and rollback.
5. **Android APK** — package the stabilized mobile interface as the real Android client once the web/runtime contracts are stable.

## Definition of clean for this checkpoint

The cleanup branch is mergeable only when:

- no production release branch was rewritten;
- the retained compatibility runtime remains functional;
- temporary/debug-only repository clutter is gone;
- CI no longer references obsolete candidate branches;
- dependency security checks cannot silently downgrade the verified toolchain;
- syntax and the complete test suite pass on the exact cleanup HEAD;
- production deployment remains a separate explicit release action.

Deep legacy retirement is intentionally excluded from this checkpoint until migration coverage exists.
