# MEL consolidation state

Branch of record: `candidate/mel-clean-autonomy`
Last fully green code/test checkpoint: `0c5dc503b09a1ea998567b9d6d438b67c94a7a78` (`full-candidate-ci` run `34571486153`, completed/success, 2026-09-11).

## Consolidation truth — fresh comparison 2026-09-11

- `release/mel-2026-09-10-r3-3` — REFERENCE_ONLY / DIVERGED (`ahead_by=10`, `behind_by=171`). Never replace candidate with release; recover only a specific release-only behavior backed by a failing regression test.
- `candidate/mel-ui-selfaware-integration` — ALREADY_CONTAINED; strictly behind clean (`behind_by=130`, no unique commits).
- `candidate/augmentio-core` — ALREADY_CONTAINED; strictly behind clean (`behind_by=150`, no unique commits).
- `candidate/dev-bridge-fetch-fix` / PR #5 — ALREADY_CONTAINED; strictly behind clean (`behind_by=148`, no unique commits). PR #5 remains open historical context only.
- `candidate/device-control-core` / PR #4 — INTEGRATED_BY_COMPARISON. Source branch remains divergent (`ahead_by=2`, `behind_by=151`), but its fail-closed policy and tests exist on clean; do not cherry-pick the divergent branch wholesale. PR #4 remains open historical context only.
- `candidate/mel-work-02-state-final2` — ALREADY_CONTAINED; strictly behind clean (`behind_by=154`, no unique commits).
- `feature/mel-autonomy-mentor` / PR #6/#7 — REFERENCE_ONLY / highly divergent (`ahead_by=53`, `behind_by=364`). Mentor/runtime/UI equivalents are already integrated on clean; recover only a specifically missing behavior proven by evidence. PR #6 and PR #7 remain open drafts, with PR #7 currently non-mergeable.
- `hotfix/prompt-limit-100k` — REFERENCE_ONLY / DIVERGED (`ahead_by=2`, `behind_by=364`). Current composer/runtime already enforces the 100000-character contract; do not import stale package/script changes without evidence.
- No PR or divergent branch was merged blindly in this run.

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
- Capability truth audit — INTEGRATED: classifications distinguish `EXISTANT_ET_TESTE`, `EXISTANT_NON_TESTE`, `PARTIEL`, `STUB`, `NOT_IMPLEMENTED`, and blocked/runtime-failure states. Automatic deep execution remains restricted to bounded LOW-risk capabilities with explicit samples and fails closed for provider/external-cost-sensitive capabilities unless the exact capability is explicitly proven zero-added-cost for that run.
- `.github/workflows/full-candidate-ci.yml` covers `candidate/mel-clean-autonomy`.

## Latest concrete hardening — deterministic read-only intent proof

- `tests/autonomy-chat-intent.test.mjs` now proves the deterministic, zero-provider fast paths for `code.integrity`, `work.open`, and `evolution.module.propose`, including bounded work limits and negative cases that keep ambiguous bare follow-ups out of regex routing.
- Existing context-aware semantic-routing tests remain intact for elliptical commands such as `fais-le`, `continue`, `reprends`, `plus doré`, and `peux-tu faire ça ?`.
- The full suite exposed one stale assertion that still expected the historical `TRUNCATED` token. `tests/tool-context-grounding.test.mjs` now asserts the current bounded head/tail marker emitted by `context-builder.js` (`CONTEXTE PARTIEL — … caractères intermédiaires omis`) without weakening the prompt-size bound.
- Exact code/test SHA `0c5dc503b09a1ea998567b9d6d438b67c94a7a78` passed `full-candidate-ci` run `34571486153` (`completed`, `success`).
- No production/release deployment, persistent mutation, provider call, added-cost operation, secret change, DNS/auth/billing change, or destructive migration occurred.

## Earlier hardening — bounded self-audit proof

- `src/diagnostics/capability-truth-audit.js` gives `capability.audit` its own bounded sample `{ deep: false }`.
- The outer deep audit can therefore execute and classify the audit capability itself without recursive deep execution, mutation, provider calls or added cost.
- `tests/capability-truth-audit.test.mjs` constructs an isolated `CapabilityBus`, registers only `capability.audit`, executes the deep truth audit and proves that the capability becomes `EXISTANT_ET_TESTE` with a real successful execution result.
- Unknown/external-cost safeguards remain unchanged: provider-facing capabilities still require exact `zeroCostCapabilityIds` proof before automatic execution.
- Exact code/test SHA `5032631b5e829b868ef32b2468fb8445bfab33ca` passed `full-candidate-ci` run `34567055665` (`completed`, `success`).

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

1. Select the next genuinely local `PARTIEL` / `EXISTANT_NON_TESTE` capability that can be exercised without mutation, provider/network cost or persistent writes; add one bounded proof at a time.
2. Keep validating the durable chat -> Mentor/Council -> Teacher -> Dev Bridge -> repair/retest -> READY_FOR_REVIEW -> memory chain with small reproducible proofs, without any production deployment.
3. Preserve the seven approved themes/avatar geometry and 100k composer; no cosmetic rework without a failing regression.
