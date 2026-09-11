# MEL consolidation state

Branch of record: `candidate/mel-clean-autonomy`
Last fully green checkpoint: `4c585e37dad396415b7d74b1e493d5705faed9c8` (`full-candidate-ci` run `34555909849`, completed/success, 2026-09-11).

## Consolidation truth — fresh comparison 2026-09-11

- `release/mel-2026-09-10-r3-3` — REFERENCE_ONLY / DIVERGED (`ahead_by=10`, `behind_by=161`). Never replace candidate with release; recover only a specific release-only behavior backed by a failing regression test.
- `candidate/mel-ui-selfaware-integration` — ALREADY_CONTAINED; branch is now strictly behind clean (`behind_by=120`, no unique commits).
- `candidate/augmentio-core` — ALREADY_CONTAINED; strictly behind clean (`behind_by=140`, no unique commits).
- `candidate/dev-bridge-fetch-fix` / PR #5 — ALREADY_CONTAINED; strictly behind clean (`behind_by=138`, no unique commits). Transport/capability-registration fix remains in clean lineage.
- `candidate/device-control-core` / PR #4 — INTEGRATED_BY_COMPARISON. Source branch is divergent (`ahead_by=2`, `behind_by=141`), but its fail-closed policy exists on clean in `src/devices/device-control-policy.js` with tests; do not cherry-pick the divergent branch wholesale.
- `candidate/mel-work-02-state-final2` — ALREADY_CONTAINED; strictly behind clean (`behind_by=144`, no unique commits).
- `feature/mel-autonomy-mentor` / PR #6/#7 — REFERENCE_ONLY / highly divergent (`ahead_by=53`, `behind_by=354`). Mentor/runtime/UI equivalents already integrated on clean; recover only a specifically missing behavior proven by evidence. PR #6 and PR #7 are currently open drafts, not merge authorities.
- `hotfix/prompt-limit-100k` — REFERENCE_ONLY / DIVERGED (`ahead_by=2`, `behind_by=354`). Current composer/runtime already enforces the 100000-character contract; do not import stale package/script changes without evidence.
- PR #4 and PR #5 remain open historical candidate PRs. No PR or divergent branch was merged blindly.

## Integrated product contract

### Interface / avatars

The served interface is normalized by `src/pages/theme-avatar-enhancer.js` visual contract v3. It keeps the composer at 100000 characters, removes the historical `Compétences` control/panel and decorative pseudo-elements from messages/input, preserves file drop/avatar/send/full mode, persists the selected theme, and sends `ui_theme` + `intent_context` to chat.

Seven themes are registered end-to-end:

- `classic` — existing modern MEL portrait.
- `crusade` — parchment / Medieval Idle Prayer.
- `religious` — Andalusian Marian cave/baroque ambience.
- `granada` — cathedral / monumental gilded retable; intentionally reuses religious portrait until a dedicated Granada portrait is owner-approved.
- `aviation` — approved 1940s pilot portrait in `src/pages/avatar-data-aviation.js`, route `/assets/avatars/mel-aviation-1940s.webp`.
- `paladin` — approved Light Full Plate portrait in `src/pages/avatar-data-paladin.js`, route `/assets/avatars/mel-paladin-light-full-plate.webp`.
- `amazon` — approved Griffon Diadem portrait in `src/pages/avatar-data-amazon.js`, route `/assets/avatars/mel-amazon-griffon.webp`.

`src/pages/mel-avatar-assets.js` is the stable avatar route registry. Aviation/Paladin/Amazon are dedicated assets, not fallbacks. `src/identity/mel-theme-persona.js` centralizes the backend theme contract and `src/api/native-chat.js` consumes it, so Granada/Aviation/Paladin/Amazon are not silently downgraded to Classic. Regression tests cover the seven-theme UI/backend contract and WEBP payloads.

### Mentor / autonomy

- Mentor core — INTEGRATED: `src/learning/mentor-engine.js`, `src/learning/mentor-memory.js`, DB schema v6 and additive-only `mentor_lessons`, Mentor capabilities/tests.
- Natural comprehension — INTEGRATED regression coverage for `fais-le`, `continue`, `reprends`, `enlève ça`, `plus doré`, `corrige tout`, `développe-toi`, `où en es-tu ?`, `peux-tu faire ça ?` with bounded context-aware semantic fallback; regex remains a fast path only.
- Autonomy handoff — INTEGRATED: natural chat/evolution enqueue -> durable job -> Council/Mentor evidence -> Teacher correlation -> structured Dev Bridge package -> candidate apply/test/diff -> repair/retest evidence -> READY_FOR_REVIEW -> CI completion gate -> Mentor learning.
- Repair continuity — INTEGRATED: a repair pass reuses a live isolated candidate when available, records `bridge_pass=repair` and `candidate_reused=true`, and safely falls back to fresh candidate creation only when no recoverable state exists.
- Capability truth audit — INTEGRATED: classifications distinguish `EXISTANT_ET_TESTE`, `EXISTANT_NON_TESTE`, `PARTIEL`, `STUB`, `NOT_IMPLEMENTED`, and blocked/runtime-failure states. Automatic deep execution remains restricted to bounded LOW-risk capabilities with explicit samples.
- `.github/workflows/full-candidate-ci.yml` covers `candidate/mel-clean-autonomy`.

## Latest concrete hardening — Dev Bridge restart continuity

- Prior green candidate-reuse hardening was verified by exact `full-candidate-ci` run `34551798055` on SHA `6e55b56cf857263ac0d70b2bffcd083ea327966c`.
- A reproducible remaining gap was then closed: `LocalDevBridge` previously kept isolated candidate ownership only in its in-memory `candidates` map, so a process restart lost the same candidate that a Mentor repair pass must preserve.
- `src/dev/dev-bridge.js` now writes a bounded local candidate state record under the configured candidate root, validates job id / exact expected branch / isolated-copy marker / non-symlink directory before recovery, restores the existing isolated candidate without recreating it, persists state changes, and removes the state record on rollback.
- Recovery does not trust arbitrary paths from persisted data; the candidate directory and branch are derived from the validated job id. Invalid or tampered state fails closed as `CANDIDATE_STATE_INVALID`.
- `tests/integration/dev-bridge.test.mjs` proves a second `LocalDevBridge` instance can reopen the modified candidate after a simulated process restart, preserve the diff, report `recovered=true`, and rollback cleanly without recreating the candidate.
- Code/test SHA `4c585e37dad396415b7d74b1e493d5705faed9c8` passed exact `full-candidate-ci` run `34555909849` (`completed`, `success`).

## Safety / verification rules

- Production/release/DNS/secrets/bindings/auth/billing remain untouched.
- Unknown added cost is fail-closed; no paid-provider assumption.
- D1 migrations are additive only; no automatic rollback.
- Before each write: refetch `candidate/mel-clean-autonomy`; never overwrite an advanced HEAD.
- Recovery unit is the smallest missing file/function/test, followed by exact-SHA CI verification.
- No useful test is removed or weakened to obtain green CI.
- A capability is not `EXISTANT_ET_TESTE` merely because it is registered; execution/test evidence is required.
- Runtime dependency audit remains clear at high severity; development-tool advisories are not force-fixed.

## Next concrete blocks

1. Run the real local Dev Bridge repair path through: failed candidate test -> Mentor `mode=repair` package -> process restart -> recovered same isolated candidate -> repair apply -> retest -> `READY_FOR_REVIEW`, proving `bridge_pass=repair` plus `candidate_reused=true` survives the restart boundary.
2. Inspect the truth-audit output for the next genuine `PARTIEL` / `EXISTANT_NON_TESTE` capability. Execute only a bounded LOW-risk non-mutating smoke where a safe sample exists; do not auto-execute Council/Augmentio merely because their declared risk is LOW when provider cost/availability is not explicitly proven zero for that run.
3. Preserve the seven approved themes/avatar geometry and 100k composer while autonomy remains the higher priority; no cosmetic rework without a failing regression.
