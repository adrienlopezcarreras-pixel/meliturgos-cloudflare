# MEL consolidation state

Branch of record: `candidate/mel-clean-autonomy`
Last fully green checkpoint: `38d2bebc442a41f436d09e14617d23f39333c83c` (`full-candidate-ci` success, 2026-09-10).

## Integrated / already contained

- `candidate/mel-ui-selfaware-integration` — ALREADY_CONTAINED. No whole-branch recovery.
- `candidate/augmentio-core` — ALREADY_CONTAINED.
- `candidate/dev-bridge-fetch-fix` / PR #5 — ALREADY_CONTAINED. Local bridge transport/capability-registration fixes are in clean lineage.
- `candidate/device-control-core` / PR #4 — INTEGRATED_BY_COMPARISON. Fail-closed device-control policy/tests are present; do not cherry-pick divergent branch wholesale.
- `candidate/mel-work-02-state-final2` — ALREADY_CONTAINED.
- Mentor core — INTEGRATED: `src/learning/mentor-engine.js`, `src/learning/mentor-memory.js`, schema v6/additive `mentor_lessons`, Mentor capabilities/tests.
- Autonomy handoff — INTEGRATED: natural chat/evolution enqueue -> durable job -> Council -> Teacher correlation -> MEL implementation proposal -> structured Dev Bridge package -> apply/test/diff -> repair evidence -> CI completion gate -> Mentor learning.
- Capability truth audit — INTEGRATED and tested for bounded LOW-risk smoke execution without pretending untested capabilities are healthy.
- `.github/workflows/full-candidate-ci.yml` covers `candidate/mel-clean-autonomy`.

## Interface / avatars — current contract

The served interface is normalized by `src/pages/theme-avatar-enhancer.js` visual contract v3. It removes the `Compétences` control/panel at runtime, keeps the composer at 100000 characters, removes decorative pseudo-elements from the text window, preserves file drop / avatar / send / full mode, persists the selected theme and sends `ui_theme` + `intent_context` to chat.

Seven visual themes are now registered:

- `classic` — existing modern MEL portrait.
- `crusade` — parchment / Medieval Idle Prayer.
- `religious` — Andalusian Marian cave/baroque ambience.
- `granada` — cathedral / monumental gilded retable; currently intentionally reuses the approved religious portrait until a dedicated Granada portrait is approved.
- `aviation` — dedicated owner-approved 1940s pilot portrait embedded in `src/pages/avatar-data-aviation.js`, stable route `/assets/avatars/mel-aviation-1940s.webp`.
- `paladin` — dedicated owner-approved Paladin Light Full Plate portrait embedded in `src/pages/avatar-data-paladin.js`, stable route `/assets/avatars/mel-paladin-light-full-plate.webp`.
- `amazon` — dedicated owner-approved Amazon / Griffon Diadem portrait embedded in `src/pages/avatar-data-amazon.js`, stable route `/assets/avatars/mel-amazon-griffon.webp`.

`src/pages/mel-avatar-assets.js` is the stable avatar route registry. Aviation, Paladin and Amazon are no longer fallbacks. Tests verify RIFF/WEBP payloads and the seven-theme UI contract.

## Remaining interface debt

- `src/pages/mvp-interface.js` still contains legacy source markup/JS for the historical `Compétences` button even though the served enhancer removes it. This should be cleaned at source in a dedicated, tested refactor rather than by weakening runtime tests.
- Native chat currently accepts only a subset of `ui_theme` values in its backend persona switch. Extend the backend contract so `granada`, `aviation`, `paladin` and `amazon` remain distinct instead of silently falling back to `classic`, while keeping factual behavior unchanged.
- Update any legacy tests whose names still imply that the visible `Compétences` button is part of the desired product contract. Capability inspection remains available through chat/runtime APIs, not a visible bottom button.

## Selective references only

- `feature/mel-autonomy-mentor` / PR #6/#7 — REFERENCE_ONLY. Highly divergent; Mentor functionality already integrated on clean. Recover only a specifically missing behavior proven by a failing test.
- `hotfix/prompt-limit-100k` — REFERENCE_ONLY. Current composer/runtime supports the 100000-character contract; do not import stale package changes without evidence.
- `release/mel-2026-09-10-r3-3` — REFERENCE_ONLY. Never replace candidate with release; recover only a specific release-only behavior backed by a test.

## Abandoned / superseded

- `Dark Full Plate` — ABANDONED, superseded by exact UI theme `Paladin Light Full Plate`.
- Temporary classic/crusade avatar fallbacks for Aviation/Paladin — ABANDONED after dedicated approved portraits were embedded.
- Blind cherry-picks / whole-branch merges from divergent branches — ABANDONED METHOD.
- Re-implementing MentorEngine/Memory/schema v6 from scratch — ABANDONED DUPLICATION.

## Safety / verification rules

- Production/release/DNS/secrets/bindings/auth/billing remain untouched.
- Unknown added cost is fail-closed.
- D1 migrations are additive only.
- Before each write: refetch `candidate/mel-clean-autonomy`; never overwrite an advanced HEAD.
- Recovery unit is the smallest missing file/function/test, followed by targeted tests and exact-SHA `full-candidate-ci` verification.
- A capability is not `EXISTANT_ET_TESTE` merely because it is registered; require execution/test evidence.

## Next concrete blocks

1. Clean the legacy `Compétences` markup/JS out of `mvp-interface.js` at source while retaining chat, keyboard, file-drop, voice and full mode.
2. Centralize the seven-theme contract and extend native chat theme handling for Granada/Aviation/Paladin/Amazon with tests.
3. Continue the P0 autonomy proof on the real Dev Bridge: generated files -> local candidate mutation -> exact tests -> repair -> READY_FOR_REVIEW -> correlated CI -> Mentor lesson.
4. Run the truth audit against every registered capability and fix bounded LOW-risk failures before moving to higher-risk connectors/device execution.
