# MEL consolidation state

Branch of record: `candidate/mel-clean-autonomy`
Last fully green checkpoint: `35b051c9d39470ae12f8c90ef4adf92d8974e14a` (`full-candidate-ci` run `34563434857`, completed/success, 2026-09-11).

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
- Capability truth audit — INTEGRATED: classifications distinguish `EXISTANT_ET_TESTE`, `EXISTANT_NON_TESTE`, `PARTIEL`, `STUB`, `NOT_IMPLEMENTED`, and blocked/runtime-failure states. Automatic deep execution remains restricted to bounded LOW-risk capabilities with explicit samples and now fails closed for provider/external-cost-sensitive capabilities unless the exact capability is explicitly proven zero-added-cost for that run.
- `.github/workflows/full-candidate-ci.yml` covers `candidate/mel-clean-autonomy`.

## Latest concrete hardening — capability audit cost fail-closed

- `src/diagnostics/capability-truth-audit.js` no longer auto-executes cost-sensitive/provider-facing capabilities merely because they are declared LOW risk and have a sample.
- Council/Augmentio/evolution/web research related capabilities remain inventoried truthfully but automatic execution is blocked as `UNKNOWN_OR_EXTERNAL_COST` until that exact capability is passed in `zeroCostCapabilityIds` for the current run.
- Local bounded previews such as `device.policy.preview` remain eligible for deep LOW-risk smoke execution.
- `tests/capability-truth-audit.test.mjs` proves unknown-cost `web.research` is not called, while the local device preview is called; the same web capability executes only after explicit zero-cost proof.
- Exact code/test SHA `35b051c9d39470ae12f8c90ef4adf92d8974e14a` passed `full-candidate-ci` run `34563434857` (`completed`, `success`).

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

1. Use the truth audit to select the next genuinely `PARTIEL` / `EXISTANT_NON_TESTE` local capability and add a bounded non-mutating proof; do not mark provider-facing capabilities tested without explicit zero-cost evidence.
2. Preserve the seven approved themes/avatar geometry and 100k composer while autonomy remains the higher priority; no cosmetic rework without a failing regression.
3. Keep validating the durable chat -> Mentor/Council -> Teacher -> Dev Bridge -> repair/retest -> READY_FOR_REVIEW -> memory chain with small reproducible proofs, without any production deployment.
