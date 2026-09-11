# MEL consolidation state

Branch of record: `candidate/mel-clean-autonomy`.
Current reviewed HEAD before this checkpoint: `2df90934077cde0b812835c445fd98647714d69d`.
Latest verified full-candidate CI for that HEAD: run `34580703412`, `completed/success` on 2026-09-11.

## Consolidation truth — fresh comparison 2026-09-11

Comparisons were re-run from the current clean HEAD before changing this file. No branch was cherry-picked or merged wholesale.

- `release/mel-2026-09-10-r3-3` — `REFERENCE_ONLY / DIVERGED`: ahead by 10, behind by 346. Its unique files include older autonomy/GitHub/Teacher changes; recover only a specific behavior demonstrated missing by a failing regression.
- `candidate/mel-ui-selfaware-integration` — `ALREADY_CONTAINED`: ahead by 0, behind by 5.
- `candidate/augmentio-core` — `REFERENCE_ONLY / DIVERGED`: ahead by 12, behind by 5. The diff contains stale reversions/removals (including generated `.wrangler` state and current UI/router/consolidation changes), so it must not replace clean. Inspect only a specific missing behavior if evidence requires it.
- `candidate/dev-bridge-fetch-fix` — `ALREADY_CONTAINED`: ahead by 0, behind by 5.
- `candidate/device-control-core` — `ALREADY_CONTAINED`: ahead by 0, behind by 5. The fail-closed device permission policy is already preserved on clean.
- `candidate/mel-work-02-state-final2` — `ALREADY_CONTAINED`: ahead by 0, behind by 5.
- `feature/mel-autonomy-mentor` — `ALREADY_CONTAINED`: ahead by 0, behind by 5. Mentor/runtime equivalents are preserved on clean.
- `hotfix/prompt-limit-100k` — `ALREADY_CONTAINED`: ahead by 0, behind by 5. The 100000-character composer/runtime contract remains on clean.

PR truth:

- PR #4 `Device control: permissioned action policy core` — CLOSED + MERGED on 2026-09-11. Its source branch is now fully contained by clean.
- PR #5 `Fix local dev bridge fetch loop on WSL/Windows` — CLOSED + MERGED on 2026-09-11. Its source branch is now fully contained by clean.
- PR #6 `WIP: MEL autonomous mentor development loop` — CLOSED, NOT MERGED, superseded; its head branch is now fully contained by clean.
- PR #7 `Integrate new MEL themed UI and self-awareness into current autonomy candidate` — CLOSED, NOT MERGED, superseded/conflicting; its head branch is now fully contained by clean.

## Integrated product contract

### Interface / themes / avatars

The final visual contract remains authoritative:

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
- Dev Bridge evidence is additive to Teacher/Mentor evidence rather than replacing it.

### Real autonomy

Verified architecture on clean preserves the bounded chain:

natural chat -> development intent -> durable job -> inspection -> Mentor/Council evidence -> candidate -> apply_change -> tests -> repair/retest -> `READY_FOR_REVIEW` -> memory/checkpoint.

Production promotion remains human-gated. No automatic production deployment is authorized.

### Natural comprehension

Regression coverage exists for contextual/elliptical French including `fais-le`, `continue`, `reprends`, `enlève ça`, `plus doré`, `corrige tout`, `développe-toi`, `où en es-tu ?`, `peux-tu faire ça ?`. Regex remains only a fast path; semantic/context fallback remains required.

### Capability truth audit

Truth statuses remain explicit: `EXISTANT_ET_TESTE`, `EXISTANT_NON_TESTE`, `PARTIEL`, `STUB`, `NOT_IMPLEMENTED`, plus blocked/runtime-failure states.

Automatic audit execution is restricted to bounded LOW-risk non-mutating samples. Unknown or provider-sensitive added cost fails closed unless zero-added-cost is explicitly proven for the exact capability in the current run.

Current local zero-cost execution proof covers real CapabilityBus execution for:

- `echo`
- `roadmap.read`
- `system.bindings`
- `chatgpt.archive.preview`
- `capability.audit`
- `device.policy.preview`
- `evolution.module.propose`

Provider-sensitive paths remain unexecuted by that proof. `evolution.enqueue` remains blocked from automatic deep audit by its MEDIUM risk classification.

## Safety invariants

- no production deployment;
- no DNS/auth/billing/secrets changes;
- no destructive D1 migration;
- unknown added cost = refuse/fail closed;
- no `npm audit fix --force`;
- do not weaken/remove useful tests to obtain green CI;
- before every write, refetch clean HEAD and never overwrite an advanced HEAD;
- smallest missing behavior/test/file is the recovery unit; never cherry-pick a divergent branch wholesale.

## Next concrete blocks

1. Continue truthful bounded proofs for genuinely local LOW-risk capabilities that do not mutate state, require provider/network cost, or need persistent writes.
2. Add small reproducible proofs around the durable chat -> Mentor/Council -> Teacher -> Dev Bridge -> repair/retest -> `READY_FOR_REVIEW` -> memory chain where a gap is still observable.
3. Preserve the approved seven-theme/avatar/composer contract; no cosmetic rework without a failing regression.
