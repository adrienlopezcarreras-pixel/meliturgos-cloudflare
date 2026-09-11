# MEL consolidation state

Branch of record: `candidate/mel-clean-autonomy`.
Current reviewed HEAD before this checkpoint: `3e7fe7d20b13335d76b944f7858e95e71fe517f3`.
Latest verified full-candidate CI for the consolidation HEAD: run `34659085349`, `completed/success` on 2026-09-11.

## Consolidation truth — fresh comparison 2026-09-11/12

No branch was cherry-picked or merged wholesale. Fresh comparison from clean HEAD `3e7fe7d20b13335d76b944f7858e95e71fe517f3` confirms:

- `release/mel-2026-09-10-r3-3` — `REFERENCE_ONLY / DIVERGED`: ahead by 10, behind by 381. Its unique changes remain older autonomy/GitHub/Teacher work; recover only a specific behavior demonstrated missing by a failing regression.
- `candidate/mel-ui-selfaware-integration` — `ALREADY_CONTAINED`: ahead by 0, behind by 40.
- `candidate/augmentio-core` — `REFERENCE_ONLY / DIVERGED`: ahead by 42, behind by 40. Its diff still contains broad stale removals/reversions including generated `.wrangler` state, historical checkpoints/backups and workflow changes, so it must not replace clean.
- `candidate/dev-bridge-fetch-fix` — `ALREADY_CONTAINED`: ahead by 0, behind by 40.
- `candidate/device-control-core` — `ALREADY_CONTAINED`: ahead by 0, behind by 40; fail-closed device policy remains preserved on clean.
- `candidate/mel-work-02-state-final2` — `ALREADY_CONTAINED`: ahead by 0, behind by 40.
- `feature/mel-autonomy-mentor` — `ALREADY_CONTAINED`: ahead by 0, behind by 40.
- `hotfix/prompt-limit-100k` — `ALREADY_CONTAINED`: ahead by 0, behind by 40.

PR truth retained from the verified consolidation pass:

- PR #4 `Device control: permissioned action policy core` — CLOSED + MERGED; source branch contained by clean.
- PR #5 `Fix local dev bridge fetch loop on WSL/Windows` — CLOSED + MERGED; source branch contained by clean.
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

The exact chat preflight path is verified end-to-end for all nine formulations above with a mocked zero-cost semantic provider: every formulation retains `conversation_id` + request key, resolves to a concrete self-contained development goal, and reaches `evolution.enqueue` through `intent_routing.mode = semantic` rather than falling back to generic chat.

Semantic routing is proven fail-closed: ordinary unrelated chat is rejected by the semantic gate without invoking the provider; low-confidence classification (<0.72), malformed output and provider errors return no semantic intent instead of fabricating a development action.

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

Provider-sensitive paths remain unexecuted by that proof. `code.read`, `code.search` and `code.integrity` require explicit exact-capability zero-added-cost proof before automatic deep execution or health probing. Live D1-backed reads remain metered/ambiguous and are not promoted to zero-added-cost execution without proof for that exact run.

`work.status` and `work.artifacts` have an explicit zero-external-call negative-path proof: without D1 they remain registered as enabled LOW-risk/no-permission read capabilities, advertise `DEGRADED`, and fail closed with `WORK_DAG_DB_REQUIRED`. This proves the safe no-binding boundary only.

Provider-bound LOW-risk capabilities `augmentio.fanout`, `council.state-of-play` and `evolution.preflight` have an explicit no-AI-binding negative-path proof: without `AI` they remain enabled, advertise `DEGRADED`, and fail closed with `AI_BINDING_MISSING` without making an external/provider call. `evolution.enqueue` remains MEDIUM risk and is deliberately not deep-executed by this proof.

`rag.search` and `conversation.list` now have an explicit local no-D1 negative-path proof: without `DB` they remain enabled LOW-risk/no-permission reads, advertise `DEGRADED`, and fail closed with `DB_BINDING_MISSING`. This proves only the safe missing-binding boundary; it does not classify live D1-backed execution as zero-added-cost or promote the live path to `EXISTANT_ET_TESTE`.

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
- Consolidation refresh: `71607d927c03815525849d6b020cdb3970491606`, CI `34618126971` success.
- Natural development comprehension: `35823111173db0372ff0a692ded30680a5959046`, CI `34640666163` success.
- Semantic fail-closed guard: `0ebba451bee449d928f894109da0faefc35a3e30`, CI `34640861612` success.
- Work read missing-D1 boundary: `aa63471ed55d2ac5f4dc460274d3e288218b9943`, CI `34651025764` success.
- Provider missing-AI boundary: `d07f813f0f694c3c3b3116a9e41dc0e7c0ab9ff3`, CI `34655145464` success.
- RAG/conversation missing-D1 boundary: `3e7fe7d20b13335d76b944f7858e95e71fe517f3`, CI `34659085349` success.

## Checkpoint 2026-09-12 — D1 read fail-closed + consolidation refresh

- Branch: `candidate/mel-clean-autonomy`.
- Functional commit: `3e7fe7d20b13335d76b944f7858e95e71fe517f3`.
- Full-candidate CI: run `34659085349`, exact SHA `3e7fe7d20b13335d76b944f7858e95e71fe517f3`, `completed/success`.
- Real change: added `tests/d1-read-capabilities-fail-closed.test.mjs`.
- Verified behavior: `rag.search` and `conversation.list` are enabled LOW-risk/no-permission reads, advertise `DEGRADED` without `DB`, and reject locally with `DB_BINDING_MISSING`; no D1/provider/network execution is performed by the proof.
- Consolidation refresh on the same functional SHA: UI/device/dev-bridge/work/Mentor/100k branches have no unique commits versus clean; release remains divergent (10 ahead / 381 behind); Augmentio remains divergent (42 ahead / 40 behind) with broad stale removals, so no wholesale recovery is justified.
- Safety: no provider call, no D1 access, no mutation outside candidate Git history, no production deployment, no secret, DNS/auth/billing change, destructive migration or paid action.
- Blockers: none in this block. Live D1-backed execution remains intentionally unproved while added cost is unknown.
- Next action: inspect only genuinely unverified local LOW-risk non-mutating boundaries; do not duplicate already-closed interface/theme, Mentor, natural-routing, device-policy, Work, provider-negative-path, evidence-merging or consolidation audits.
