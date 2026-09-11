# MEL consolidation state

Branch of record: `candidate/mel-clean-autonomy`
Last fully green checkpoint: `4c3b7989dd63a5f82579b3a104f3afae8604060e` (`full-candidate-ci` run `34547940894`, success, 2026-09-11).

## Integrated / already contained

- `candidate/mel-ui-selfaware-integration` — ALREADY_CONTAINED by selected functionality. Fresh comparison remains divergent; no whole-branch recovery.
- `candidate/augmentio-core` — ALREADY_CONTAINED by selected functionality. Fresh comparison remains divergent; no whole-branch recovery.
- `candidate/dev-bridge-fetch-fix` / PR #5 — ALREADY_CONTAINED. The local transport/capability-registration fix is present in clean lineage; no recovery needed.
- `candidate/device-control-core` — INTEGRATED_BY_COMPARISON. Fail-closed device-control policy/tests are present; do not cherry-pick divergent branch wholesale.
- `candidate/mel-work-02-state-final2` — ALREADY_CONTAINED by selected functionality; fresh comparison remains divergent.
- Mentor core — INTEGRATED: `src/learning/mentor-engine.js`, `src/learning/mentor-memory.js`, schema v6/additive `mentor_lessons`, Mentor capabilities/tests.
- Autonomy handoff — INTEGRATED: natural chat/evolution enqueue -> durable job -> Council -> Teacher correlation -> MEL implementation proposal -> structured Dev Bridge package -> apply/test/diff -> repair evidence -> CI completion gate -> Mentor learning.
- Capability truth audit — INTEGRATED and tested for bounded LOW-risk smoke execution without pretending untested capabilities are healthy.
- `.github/workflows/full-candidate-ci.yml` covers `candidate/mel-clean-autonomy`.

## Interface / avatars — current contract

The served interface is normalized by `src/pages/theme-avatar-enhancer.js` visual contract v3. It keeps the composer at 100000 characters, removes decorative pseudo-elements from the text window, preserves file drop / avatar / send / full mode, persists the selected theme and sends `ui_theme` + `intent_context` to chat.

The source `src/pages/mvp-interface.js` itself now contains no visible historical `Compétences` control/panel: the composer controls are Send + Full mode only. This closes the old source-cleanup debt rather than relying only on runtime removal.

Seven visual themes are registered end-to-end:

- `classic` — existing modern MEL portrait.
- `crusade` — parchment / Medieval Idle Prayer.
- `religious` — Andalusian Marian cave/baroque ambience.
- `granada` — cathedral / monumental gilded retable; currently intentionally reuses the approved religious portrait until a dedicated Granada portrait is approved.
- `aviation` — dedicated owner-approved 1940s pilot portrait embedded in `src/pages/avatar-data-aviation.js`, stable route `/assets/avatars/mel-aviation-1940s.webp`.
- `paladin` — dedicated owner-approved Paladin Light Full Plate portrait embedded in `src/pages/avatar-data-paladin.js`, stable route `/assets/avatars/mel-paladin-light-full-plate.webp`.
- `amazon` — dedicated owner-approved Amazon / Griffon Diadem portrait embedded in `src/pages/avatar-data-amazon.js`, stable route `/assets/avatars/mel-amazon-griffon.webp`.

`src/pages/mel-avatar-assets.js` is the stable avatar route registry. Aviation, Paladin and Amazon are no longer fallbacks. `src/identity/mel-theme-persona.js` is the centralized backend theme contract and `src/api/native-chat.js` consumes it through `getMelThemeContract(body.ui_theme)`, so Granada/Aviation/Paladin/Amazon are not silently downgraded to Classic. `tests/native-chat-theme-persona.test.mjs` explicitly exercises those four themes plus fail-safe fallback for unknown values. Tests also verify RIFF/WEBP payloads and the seven-theme UI contract.

## Remaining interface debt

- No known P0 interface debt remains for the removed `Compétences` control or the seven-theme backend contract. Do not reimplement either without a failing regression test.
- Update any stale legacy test names/comments only when they actively misstate the desired product contract; do not delete useful behavioral coverage.
- A dedicated Granada portrait remains optional and blocked on owner validation; current religious portrait reuse is intentional.

## Selective references only

- `feature/mel-autonomy-mentor` / PR #6/#7 — REFERENCE_ONLY. Highly divergent; Mentor functionality already integrated on clean. Recover only a specifically missing behavior proven by a failing test.
- `hotfix/prompt-limit-100k` — REFERENCE_ONLY. Current composer/runtime supports the 100000-character contract; do not import stale package changes without evidence.
- `release/mel-2026-09-10-r3-3` — REFERENCE_ONLY. Never replace candidate with release; recover only a specific release-only behavior backed by a test.
- PR #4/#5/#6 remain references/open work history where applicable; PR #7 is closed/unmerged and its useful equivalent functionality is already present. No PR or divergent branch was merged blindly in this run.

## Abandoned / superseded

- `Dark Full Plate` — ABANDONED, superseded by exact UI theme `Paladin Light Full Plate`.
- Temporary classic/crusade avatar fallbacks for Aviation/Paladin — ABANDONED after dedicated approved portraits were embedded.
- Blind cherry-picks / whole-branch merges from divergent branches — ABANDONED METHOD.
- Re-implementing MentorEngine/Memory/schema v6 from scratch — ABANDONED DUPLICATION.
- Re-cleaning a source-level `Compétences` control that is already absent — ABANDONED DUPLICATION.
- Re-extending a seven-theme backend contract that is already centralized and tested — ABANDONED DUPLICATION.

## Safety / verification rules

- Production/release/DNS/secrets/bindings/auth/billing remain untouched.
- Unknown added cost is fail-closed.
- D1 migrations are additive only.
- Before each write: refetch `candidate/mel-clean-autonomy`; never overwrite an advanced HEAD.
- Recovery unit is the smallest missing file/function/test, followed by targeted tests and exact-SHA `full-candidate-ci` verification.
- A capability is not `EXISTANT_ET_TESTE` merely because it is registered; require execution/test evidence.
- Runtime dependency audit is currently clear at high severity; three high advisories remain confined to development tooling (`sharp`/`miniflare`/`wrangler`). No forced audit repair was attempted.

## Night checkpoint — 2026-09-11

- Fresh comparisons were performed before recovery against `release/mel-2026-09-10-r3-3`, `candidate/mel-ui-selfaware-integration`, `candidate/augmentio-core`, `candidate/dev-bridge-fetch-fix`, `candidate/device-control-core`, `candidate/mel-work-02-state-final2`, `feature/mel-autonomy-mentor`, and `hotfix/prompt-limit-100k`. All remain divergent references; no whole-branch recovery was justified.
- Comprehension regression coverage now explicitly exercises `fais-le`, `continue`, `reprends`, `enlève ça`, `plus doré`, `corrige tout`, `développe-toi`, `où en es-tu ?`, and `peux-tu faire ça ?` with recent MEL-development context. Context-only ellipses remain outside semantic self-routing when history is absent, while an explicit second-person ambiguous request is deliberately admitted to the semantic classifier so it can resolve to a safe intent or NONE.
- Two intermediate CI failures exposed incorrect test assumptions only; the behavioral implementation was not weakened and no useful test was deleted. Final code/test SHA `2ede70f34a84c7095e7714f127c3ab609f475c17` passed exact `full-candidate-ci` run `34543842348`.
- Production deployment, release, DNS, D1 destructive migration, secrets, bindings, authentication and billing were untouched.

### Repair-pass evidence checkpoint

- Refetched branch HEAD `cb2a21c3cbdf30ee2ce5f95980a5ea41b2701a04` before the next write; no concurrent advancement was overwritten.
- The existing runtime already reopens a `READY_FOR_REVIEW` job with failed Dev Bridge tests back to `TEACHER_APPROVED` and `prepareApprovedBridgePackage()` already asks MentorEngine for a bounded `mode=repair` package tied to the failed result timestamp. No duplicate repair engine was added.
- `src/dev/bridge-job-runner.js` preserves whether the package actually executed an `implement` or `repair` pass in both `result_json.bridge_pass` and `plan_json.bridge_pass`, so Teacher/Mentor/Dev Bridge evidence can prove the repair/retest stage rather than infer it from mutable state.
- `tests/bridge-job-runner.test.mjs` adds repair-package regression coverage proving repaired files are applied, requested tests are rerun, all tests can pass, and the repair-pass marker survives in both result and plan evidence.
- Checkpoint SHA `4c3b7989dd63a5f82579b3a104f3afae8604060e` passed exact `full-candidate-ci` run `34547940894`.

### Repair candidate-continuity checkpoint

- Refetched HEAD `4c3b7989dd63a5f82579b3a104f3afae8604060e` before changes and `ad92fdafff803148fa783407bcaa2843006be15e` before the test write; no concurrent HEAD advancement was overwritten.
- Concrete P0 gap found: every structured repair pass previously called `dev.create_candidate`, which can recreate the isolated candidate and discard the failed implementation state that Mentor is supposed to repair.
- `src/dev/bridge-job-runner.js` now probes `code.status` for a repair pass and reuses the live isolated candidate when available; if local state is unavailable it fails safely to the existing fresh-candidate path rather than inventing state.
- Evidence now records `candidate_reused` in both result and plan. `tests/bridge-job-runner.test.mjs` verifies live repair reuse performs no second `dev.create_candidate`, while unavailable state performs exactly one fresh candidate creation.
- Code/test SHA `4956ce2d17bd897018d0eb1d59be1c57d63bea9f`; exact `full-candidate-ci` run `34551741048` is `in_progress` at this checkpoint, so no green claim is made for this SHA yet.
- Production/release/DNS/secrets/bindings/auth/billing/D1 remain untouched; no cost added.

## Next concrete blocks

1. Verify exact-SHA `full-candidate-ci` for `4956ce2d17bd897018d0eb1d59be1c57d63bea9f`; if green, advance the last-green checkpoint, otherwise fix the concrete failing job without weakening tests.
2. Extend continuity across a Dev Bridge process restart only if a failing/reproducible test proves persisted isolated candidate state cannot be recovered; do not invent prior local state.
3. Continue the P0 real-bridge proof through a genuine failed test -> Mentor repair package -> same repaired local candidate -> retest -> READY_FOR_REVIEW with explicit `bridge_pass=repair` and `candidate_reused=true` evidence.
4. Use the existing truth-audit machinery to isolate the next genuine PARTIEL / EXISTANT_NON_TESTE capability; execute only bounded LOW-risk non-mutating smoke evidence and fix a concrete failure rather than writing another broad audit.
