# MEL consolidation state

Branch of record: `candidate/mel-clean-autonomy`.
Current reviewed HEAD before this checkpoint: `aa63471ed55d2ac5f4dc460274d3e288218b9943`.
Latest verified full-candidate CI for the consolidation HEAD: run `34651025764`, `completed/success` on 2026-09-11.

## Consolidation truth — fresh comparison 2026-09-11

Comparisons were re-run from clean HEAD `71607d927c03815525849d6b020cdb3970491606`. No branch was cherry-picked or merged wholesale.

- `release/mel-2026-09-10-r3-3` — `REFERENCE_ONLY / DIVERGED`: ahead by 10, behind by 369. Its unique files remain older autonomy/GitHub/Teacher changes; recover only a specific behavior demonstrated missing by a failing regression.
- `candidate/mel-ui-selfaware-integration` — `ALREADY_CONTAINED`: ahead by 0, behind by 28.
- `candidate/augmentio-core` — `REFERENCE_ONLY / DIVERGED`: ahead by 42, behind by 28. The diff still contains broad stale removals/reversions (including generated `.wrangler` state, checkpoints/backups and workflow changes), so it must not replace clean. Inspect only a specific missing behavior if evidence requires it.
- `candidate/dev-bridge-fetch-fix` — `ALREADY_CONTAINED` from the prior verified comparison; do not recover wholesale.
- `candidate/device-control-core` — `ALREADY_CONTAINED`; re-compared during the 2026-09-11 autonomy run and no specific missing fail-closed behavior justified recovery. The fail-closed device permission policy is preserved on clean.
- `candidate/mel-work-02-state-final2` — `ALREADY_CONTAINED` from the prior verified comparison.
- `feature/mel-autonomy-mentor` — `ALREADY_CONTAINED` from the prior verified comparison; Mentor/runtime equivalents are preserved on clean.
- `hotfix/prompt-limit-100k` — `ALREADY_CONTAINED` from the prior verified comparison; the 100000-character composer/runtime contract remains on clean.

PR truth retained from the verified 2026-09-11 consolidation pass:

- PR #4 `Device control: permissioned action policy core` — CLOSED + MERGED on 2026-09-11; source branch contained by clean.
- PR #5 `Fix local dev bridge fetch loop on WSL/Windows` — CLOSED + MERGED on 2026-09-11; source branch contained by clean.
- PR #6 `WIP: MEL autonomous mentor development loop` — CLOSED, NOT MERGED, superseded; source head contained by clean.
- PR #7 `Integrate new MEL themed UI and self-awareness into current autonomy candidate` — CLOSED, NOT MERGED, superseded/conflicting; source head contained by clean.

## Integrated product contract

### Interface / themes / avatars

- historical `Compétences` button/panel removed;
- composer limit `100000`;
- no decorative pseudo-elements on messages or input;
- persisted themes and avatar selection;
- uniform square portrait geometry with centered face, `object-fit: cover`, consistent crop and theme-appropriate frame;
- seven themes end-to-end: `classic`, `crusade`, `religious`, `granada`, `aviation`, `paladin`, `amazon`;
- Granada may reuse the religious portrait until a dedicated owner-approved Granada portrait exists;
- approved dedicated assets remain authoritative for Aviation, Paladin Light Full Plate and Amazon Griffon and must not be replaced by fallbacks;
- backend `ui_theme` contract preserves Granada/Aviation/Paladin/Amazon instead of silently collapsing them to Classic.

### Mentor / learning

- `src/learning/mentor-engine.js` and `src/learning/mentor-memory.js` integrated;
- DB schema version 6 with additive-only `mentor_lessons` migration preserved;
- Mentor tests and runtime capabilities integrated;
- Dev Bridge evidence is additive to Teacher/Mentor evidence rather than replacing it;
- verified completion lessons retain a bounded Teacher + Dev Bridge provenance snapshot in persistent Mentor evidence while the full existing `result_json` evidence remains intact.

### Real autonomy

Verified architecture on clean preserves the bounded chain:

natural chat -> development intent -> durable job -> inspection -> Mentor/Council evidence -> candidate -> apply_change -> tests -> repair/retest -> `READY_FOR_REVIEW` -> memory/checkpoint.

Production promotion remains human-gated. No automatic production deployment is authorized.

### Natural comprehension

Regression coverage exists for contextual/elliptical French including `fais-le`, `continue`, `reprends`, `enlève ça`, `plus doré`, `corrige tout`, `développe-toi`, `où en es-tu ?`, `peux-tu faire ça ?`. Regex remains only a fast path; semantic/context fallback remains required.

The exact chat preflight path is now also verified end-to-end for all nine formulations above with a mocked zero-cost semantic provider: every formulation retains `conversation_id` + request key, resolves to a concrete self-contained development goal, and reaches `evolution.enqueue` through `intent_routing.mode = semantic` rather than falling back to generic chat.

Semantic routing is additionally proven fail-closed: ordinary unrelated chat is rejected by the semantic gate without invoking the provider; low-confidence classification (<0.72), malformed output and provider errors return no semantic intent instead of fabricating a development action.

### Capability truth audit

Truth statuses remain explicit: `EXISTANT_ET_TESTE`, `EXISTANT_NON_TESTE`, `PARTIEL`, `STUB`, `NOT_IMPLEMENTED`, plus blocked/runtime-failure states.

Automatic audit execution is restricted to bounded LOW-risk non-mutating samples. Unknown, provider-sensitive, or metered-runtime added cost fails closed unless zero-added-cost is explicitly proven for the exact capability in the current run. This also gates dynamic health probes.

Current local zero-cost execution proof covers real CapabilityBus execution for:

- `echo`
- `roadmap.read`
- `system.bindings`
- `chatgpt.archive.preview`
- `capability.audit`
- `device.policy.preview`
- `evolution.module.propose`
- `evolution.gap.detect`

Provider-sensitive paths remain unexecuted by that proof. `code.read`, `code.search` and `code.integrity` require explicit exact-capability zero-added-cost proof before automatic deep execution or health probing. D1-backed reads `conversation.list`, `rag.search`, `autonomy.status` and `mentor.recent` follow the same fail-closed rule because runtime metering is a potential added cost unless explicitly proven zero for that exact run. `evolution.enqueue` remains blocked from automatic deep audit by its MEDIUM risk classification.

`work.status` and `work.artifacts` now have an explicit zero-external-call negative-path proof: in a Gen2 runtime without a D1 binding they remain registered as enabled LOW-risk/no-permission read capabilities, advertise `DEGRADED`, and fail closed with `WORK_DAG_DB_REQUIRED`. This proves the safe no-binding boundary only; it does not promote live D1-backed execution to zero-added-cost or `EXISTANT_ET_TESTE` for a metered runtime.

## Safety invariants

- no production deployment;
- no DNS/auth/billing/secrets changes;
- no destructive D1 migration;
- unknown added cost = refuse/fail closed;
- no `npm audit fix --force`;
- do not weaken/remove useful tests to obtain green CI;
- before every write, refetch clean HEAD and never overwrite an advanced HEAD;
- smallest missing behavior/test/file is the recovery unit; never cherry-pick a divergent branch wholesale.

## Verified checkpoints retained

- Provider cost guard: `50c22256dc4175a6fd391cbda4f09518cd9b0149`, CI `34595848059` success.
- Repair-before-review: `279b9bcb8cdc291494c6b2200bec79cf85aca2b8`, CI `34596085590` success.
- Durable completion provenance: `a82ad840cdc28b1659ea85d153bd436a1620008c`, CI `34600739542` success.
- Metered runtime audit guard: `6c6ec8fe3108a9022f4a25008b458587b3888f64`, CI `34606034934` success.
- Local gap detector zero-cost proof: `1a155497350a75818ae8b47cff7ec54eed3f5491`, CI `34612051542` success.

## Checkpoint 2026-09-11 — consolidation refresh verified

- Branch: `candidate/mel-clean-autonomy`.
- Consolidation commit: `71607d927c03815525849d6b020cdb3970491606`.
- Full-candidate CI: run `34618126971`, exact SHA `71607d927c03815525849d6b020cdb3970491606`, `completed/success`.
- Fresh source comparisons on this exact baseline: release remains a 10-commit divergent reference; `candidate/mel-ui-selfaware-integration` has zero unique commits and is behind by 28; `candidate/augmentio-core` remains 42 commits ahead / 28 behind with broad stale removals and is unsafe for wholesale recovery.
- Result: no missing behavior was demonstrated by these comparisons, therefore no cherry-pick/merge was justified.
- Safety: documentation/consolidation only; no production deploy, provider call, secret, DNS/auth/billing change, destructive migration or paid action.

## Checkpoint 2026-09-11 — natural development comprehension verified

- Branch: `candidate/mel-clean-autonomy`.
- Functional commit: `35823111173db0372ff0a692ded30680a5959046`.
- Full-candidate CI: run `34640666163`, exact SHA `35823111173db0372ff0a692ded30680a5959046`, `completed/success`.
- Real change: expanded `tests/chat-intent-development.test.mjs` to drive all owner-requested contextual formulations through the actual `/api/chat` preflight injector with a mocked FAST semantic provider.
- Verified formulations: `fais-le`, `continue`, `reprends`, `enlève ça`, `plus doré`, `corrige tout`, `développe-toi`, `où en es-tu ?`, `peux-tu faire ça ?`.
- Verified behavior: each reaches `evolution.enqueue` in semantic mode, preserves conversation/request identity, and uses the resolved self-contained development goal.
- Cost/safety: provider execution is mocked; no external inference spend, mutation, production deploy, secret, DNS/auth/billing change or destructive migration.
- Consolidation follow-up: `candidate/device-control-core` was compared again and remains already contained; no blind cherry-pick was performed.

## Checkpoint 2026-09-11 — semantic fail-closed guard verified

- Branch: `candidate/mel-clean-autonomy`.
- Functional commit: `0ebba451bee449d928f894109da0faefc35a3e30`.
- Full-candidate CI: run `34640861612`, exact SHA `0ebba451bee449d928f894109da0faefc35a3e30`, `completed/success`.
- Real change: added `tests/semantic-intent-guard.test.mjs`.
- Verified behavior: unrelated ordinary chat does not invoke semantic inference; low-confidence classification, malformed output and provider exceptions all return `null` and therefore fail closed.
- Cost/safety: all provider behavior is mocked; no external inference call, deployment, mutation, secret, DNS/auth/billing change, destructive migration or paid action.
- Blockers: none discovered in this block. No production promotion was attempted.
- Next action: only pursue another transition when evidence shows a genuine unverified gap; preserve the already-green natural routing, evidence merge, mentor memory, theme/avatar and fail-closed guards.

## Checkpoint 2026-09-11 — Work read capability fail-closed verified

- Branch: `candidate/mel-clean-autonomy`.
- Functional commit: `aa63471ed55d2ac5f4dc460274d3e288218b9943`.
- Full-candidate CI: run `34651025764`, exact SHA `aa63471ed55d2ac5f4dc460274d3e288218b9943`, `completed/success` with `127 passed, 0 failed`.
- Real change: added `tests/work-capabilities-truth.test.mjs` for the exact `work.status` and `work.artifacts` runtime registrations and no-D1 execution boundary.
- Verified behavior: both are enabled LOW-risk/no-permission reads, report `DEGRADED` without D1, and fail closed with `WORK_DAG_DB_REQUIRED` instead of manufacturing state.
- Truth boundary: this is a local negative-path proof only. Live D1-backed reads remain `PARTIEL`/unexecuted for deep audit until exact zero-added-cost execution is proven for that run.
- Cost/safety: no provider call, no D1 access, no mutation, deployment, secret, DNS/auth/billing change, destructive migration or paid action. Runtime dependency audit also remained clean; dev-only Wrangler/Miniflare/Sharp advisories were recorded without forcing an update.
- Blockers: none discovered in this block.
- Next action: inspect for a genuinely unverified local LOW-risk non-mutating transition; do not duplicate already-closed Work DAG, truth-audit, Mentor, natural-routing, device-policy, theme/avatar or evidence-merging coverage.

## Next concrete blocks

1. Continue truthful bounded proofs only for genuinely local LOW-risk capabilities that neither mutate state nor cross provider/network/persistent-runtime metering; require exact zero-cost proof for anything ambiguous.
2. Re-check the end-to-end autonomy chain only where new evidence reveals a missing transition; do not duplicate the now-verified repair/retest, completion-memory, evidence-preservation, natural-routing or semantic fail-closed proofs.
3. Preserve the approved seven-theme/avatar/composer contract; no cosmetic rework without a failing regression.
