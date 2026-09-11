# MEL consolidation state

Updated: 2026-09-11

## Canonical development line

- Branch of record: `candidate/augmentio-core`.
- Current verified candidate SHA: `69be3c77f473c7d6c403daa28e7ddb80a178d30f`.
- `full-candidate-ci` run `34576746483`: completed / success.
- `augmentio-ci` run `34576746585`: completed / success.
- `runtime-teacher-smoke` run `34576746564`: completed / success.
- Production `main` and every `release/*` snapshot remain intentionally untouched.

All non-release development aliases currently point to the exact same verified SHA, including `candidate/mel-clean-autonomy`, `candidate/mel-ui-selfaware-integration`, `candidate/teacher-bridge`, `feature/mel-autonomy-mentor`, `mel-current`, the old `mel-work-02*` aliases, chat/runtime/device/dev-bridge candidates and the historical 100k hotfix. These names are compatibility references only; they are not independent development lines.

## UI contract — preserve in ongoing work

The consolidated candidate contains the current MEL UI/self-awareness work. Do not replace it with an older release or recreate it from a stale branch.

The served UI contract keeps:

- the current MEL themed interface and avatar/self-awareness integration;
- the 100000-character composer contract;
- file drop, avatar interaction, send and full-mode controls;
- persisted theme selection and `ui_theme` / `intent_context` chat propagation;
- the seven registered themes (`classic`, `crusade`, `religious`, `granada`, `aviation`, `paladin`, `amazon`) and their approved avatar routing.

Cosmetic/interface work may continue from `candidate/augmentio-core`, but no previous UI branch should be used as a source of truth unless a specific regression is first demonstrated.

## Teacher / autonomy contract

The candidate still contains the complete safe development chain:

`natural chat/evolution request -> durable job -> Council/Mentor evidence -> Teacher correlation -> structured Dev Bridge package -> candidate apply/test/diff -> repair/retest -> READY_FOR_REVIEW -> exact-SHA CI gate -> Mentor learning`.

The runtime remains candidate-only and fail-closed for production, secrets, destructive D1 work and unknown added cost. Teacher approval is correlated evidence, not production deployment authority.

Some internal defaults still name the compatibility alias `candidate/mel-clean-autonomy`. That alias currently resolves to the exact same verified SHA as `candidate/augmentio-core`, so the runtime is coherent. A future cleanup should migrate those string defaults atomically with their branch-wiring tests rather than editing large runtime files piecemeal.

## Latest hardening — truthful capability self-audit

At SHA `69be3c77f473c7d6c403daa28e7ddb80a178d30f`, deep capability auditing now explains *why* a capability was not automatically smoke-tested instead of reporting only a generic untested state.

Explicit block reasons now include:

- `DECLARED_NON_EXECUTABLE` for `STUB` / `NOT_IMPLEMENTED` declarations;
- `DISABLED`;
- `RISK_NOT_LOW`;
- `NO_BOUNDED_SAMPLE`;
- `UNKNOWN_OR_EXTERNAL_COST`.

A capability that is actually executed still becomes `EXISTANT_ET_TESTE` only on successful execution evidence; runtime failure remains `EXISTANT_MAIS_ECHEC_RUNTIME`. Cost-sensitive capabilities remain blocked unless exact zero-added-cost proof is supplied for that capability. The full candidate CI, `.augmentio` CI and runtime Teacher smoke all pass on this exact SHA.

## Repository consolidation truth

- PR #4 and PR #5 were already integrated into canonical history.
- PR #6 and PR #7 were closed as superseded after verifying that their useful Mentor/UI/Teacher work was contained in the canonical candidate.
- No stale feature branch needs to be merged to recover functionality.
- `main` is not automatically advanced from candidate.
- `release/*` branches remain historical snapshots and are not candidates for wholesale re-import.

## Current safe next work

1. Continue from `candidate/augmentio-core` only.
2. Preserve the current UI while functional autonomy/Teacher work advances.
3. Select the next genuinely local `PARTIEL` / `EXISTANT_NON_TESTE` capability and add one bounded execution proof at a time without provider cost or persistent mutation.
4. Keep validating the chat -> Council/Mentor -> Teacher -> Dev Bridge -> repair/retest -> CI -> memory chain with exact-SHA evidence.
5. Migrate legacy internal branch-name defaults only as one coordinated, tested change; until then keep the compatibility alias synchronized with canonical.
6. Do not deploy production automatically. Adrien can perform an Ubuntu/Cloudflare deployment when a green release candidate genuinely needs a human deployment step.
