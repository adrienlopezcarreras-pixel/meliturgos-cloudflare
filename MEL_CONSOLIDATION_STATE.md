# MEL consolidation state

Branch of record: `candidate/mel-clean-autonomy`.
Current reviewed HEAD before this checkpoint: `373934923651eb7e450cc695bda756d8d9ed6aee`.
Latest verified full-candidate CI for the immediately preceding implementation HEAD: run `34612051542`, `completed/success` on 2026-09-11.

## Consolidation truth — fresh comparison 2026-09-11

Comparisons were re-run from clean HEAD `373934923651eb7e450cc695bda756d8d9ed6aee` before changing this file. No branch was cherry-picked or merged wholesale.

- `release/mel-2026-09-10-r3-3` — `REFERENCE_ONLY / DIVERGED`: ahead by 10, behind by 368. Its unique files remain older autonomy/GitHub/Teacher changes; recover only a specific behavior demonstrated missing by a failing regression.
- `candidate/mel-ui-selfaware-integration` — `ALREADY_CONTAINED`: ahead by 0, behind by 27.
- `candidate/augmentio-core` — `REFERENCE_ONLY / DIVERGED`: ahead by 42, behind by 27. The diff still contains broad stale removals/reversions (including generated `.wrangler` state, checkpoints/backups and workflow changes), so it must not replace clean. Inspect only a specific missing behavior if evidence requires it.
- `candidate/dev-bridge-fetch-fix` — `ALREADY_CONTAINED`: ahead by 0, behind by 27.
- `candidate/device-control-core` — `ALREADY_CONTAINED`: ahead by 0, behind by 27. The fail-closed device permission policy is already preserved on clean.
- `candidate/mel-work-02-state-final2` — `ALREADY_CONTAINED`: ahead by 0, behind by 27.
- `feature/mel-autonomy-mentor` — `ALREADY_CONTAINED`: ahead by 0, behind by 27. Mentor/runtime equivalents are preserved on clean.
- `hotfix/prompt-limit-100k` — `ALREADY_CONTAINED`: ahead by 0, behind by 27. The 100000-character composer/runtime contract remains on clean.

PR truth revalidated on 2026-09-11:

- PR #4 `Device control: permissioned action policy core` — CLOSED + MERGED on 2026-09-11. Its source branch is fully contained by clean.
- PR #5 `Fix local dev bridge fetch loop on WSL/Windows` — CLOSED + MERGED on 2026-09-11. Its source branch is fully contained by clean.
- PR #6 `WIP: MEL autonomous mentor development loop` — CLOSED, NOT MERGED, superseded; its head branch is fully contained by clean.
- PR #7 `Integrate new MEL themed UI and self-awareness into current autonomy candidate` — CLOSED, NOT MERGED, superseded/conflicting; its head branch is fully contained by clean.

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
- Dev Bridge evidence is additive to Teacher/Mentor evidence rather than replacing it;
- verified completion lessons now retain a bounded Teacher + Dev Bridge provenance snapshot in persistent Mentor evidence, while the full existing `result_json` evidence remains intact.

### Real autonomy

Verified architecture on clean preserves the bounded chain:

natural chat -> development intent -> durable job -> inspection -> Mentor/Council evidence -> candidate -> apply_change -> tests -> repair/retest -> `READY_FOR_REVIEW` -> memory/checkpoint.

Production promotion remains human-gated. No automatic production deployment is authorized.

### Natural comprehension

Regression coverage exists for contextual/elliptical French including `fais-le`, `continue`, `reprends`, `enlève ça`, `plus doré`, `corrige tout`, `développe-toi`, `où en es-tu ?`, `peux-tu faire ça ?`. Regex remains only a fast path; semantic/context fallback remains required.

### Capability truth audit

Truth statuses remain explicit: `EXISTANT_ET_TESTE`, `EXISTANT_NON_TESTE`, `PARTIEL`, `STUB`, `NOT_IMPLEMENTED`, plus blocked/runtime-failure states.

Automatic audit execution is restricted to bounded LOW-risk non-mutating samples. Unknown, provider-sensitive, or metered-runtime added cost fails closed unless zero-added-cost is explicitly proven for the exact capability in the current run. This also gates dynamic health probes, so unapproved provider or metered-resource paths are inventoried from registered state without being contacted merely for the audit.

Current local zero-cost execution proof covers real CapabilityBus execution for:

- `echo`
- `roadmap.read`
- `system.bindings`
- `chatgpt.archive.preview`
- `capability.audit`
- `device.policy.preview`
- `evolution.module.propose`
- `evolution.gap.detect`

Provider-sensitive paths remain unexecuted by that proof. `code.read`, `code.search` and `code.integrity` require explicit exact-capability zero-added-cost proof before automatic deep execution or health probing. D1-backed reads `conversation.list`, `rag.search`, `autonomy.status` and `mentor.recent` now follow the same fail-closed rule because runtime metering is a potential added cost unless explicitly proven zero for that exact run. `evolution.enqueue` remains blocked from automatic deep audit by its MEDIUM risk classification.

## Safety invariants

- no production deployment;
- no DNS/auth/billing/secrets changes;
- no destructive D1 migration;
- unknown added cost = refuse/fail closed;
- no `npm audit fix --force`;
- do not weaken/remove useful tests to obtain green CI;
- before every write, refetch clean HEAD and never overwrite an advanced HEAD;
- smallest missing behavior/test/file is the recovery unit; never cherry-pick a divergent branch wholesale.

## Checkpoint 2026-09-11 — provider cost guard

- Branch: `candidate/mel-clean-autonomy`.
- Reviewed implementation SHA: `50c22256dc4175a6fd391cbda4f09518cd9b0149`.
- Real changes: `code.read`, `code.search` and `code.integrity` added to the provider/cost-sensitive audit gate; unapproved cost-sensitive capabilities no longer receive dynamic health probes from the truth audit; dedicated regression test added in `tests/capability-provider-cost-guard.test.mjs`.
- Tests/CI: `full-candidate-ci` run `34595848059` completed successfully on the exact implementation SHA; syntax, runtime dependency security gate and full test suite all green.
- Verified capability: truth audit remains fail-closed for provider-backed code operations until exact zero-added-cost proof is supplied, including health probing.
- Blockers: none introduced by this block. No production deployment or persistent mutation performed.

## Checkpoint 2026-09-11 — repair before review

- Branch: `candidate/mel-clean-autonomy`.
- Reviewed implementation SHA: `279b9bcb8cdc291494c6b2200bec79cf85aca2b8`.
- Real changes: Dev Bridge results that request `READY_FOR_REVIEW` while any submitted test is failing are now persisted as `REPAIR_REQUIRED`; failed-test evidence remains under `result_json.dev_bridge`; only a later passing retest can restore `READY_FOR_REVIEW`.
- Tests: merge-level regression proves failed tests cannot masquerade as ready; integration regression proves approval is rejected while `REPAIR_REQUIRED`, then succeeds only after a passing retest.
- CI: `full-candidate-ci` run `34596085590` completed successfully on the exact implementation SHA; syntax, dependency security gate and full suite all green.
- Verified autonomy transition: candidate -> failing tests -> durable repair evidence -> passing retest -> `READY_FOR_REVIEW` -> explicit human approval.
- Blockers: none introduced. No production deployment, secret, DNS, auth, billing or destructive migration touched.

## Checkpoint 2026-09-11 — durable completion provenance

- Branch: `candidate/mel-clean-autonomy`.
- Reviewed implementation/test SHA: `a82ad840cdc28b1659ea85d153bd436a1620008c`.
- Real changes: `src/teachers/github-completion-reconciler.js` now persists a bounded provenance snapshot with every verified Mentor completion lesson: Teacher request/status/verdict/development authorization plus Dev Bridge review status/candidate/diff/tests. Existing `job.result_json` remains additive and is not overwritten.
- Regression: `tests/autonomy-completion-mentor-learning.test.mjs` now proves persistent `mentor_lessons.evidence_json` retains Teacher + Dev Bridge provenance and that final job state still retains both original evidence branches after completion.
- CI: `full-candidate-ci` run `34600739542` completed successfully on the exact SHA; runtime dependency security gate, syntax and full suite all green.
- Verified autonomy transition: `READY_FOR_REVIEW`/Teacher-approved evidence -> verified full-candidate CI -> persistent Mentor development memory, with traceable provenance across all evidence layers.
- Safety: only bounded identifiers/statuses/test summaries are copied into Mentor memory; no secrets, production deploy, DNS/auth/billing changes or destructive migration introduced.
- Blockers: none introduced.

## Checkpoint 2026-09-11 — metered runtime audit guard

- Branch: `candidate/mel-clean-autonomy`.
- Reviewed implementation/test SHA: `6c6ec8fe3108a9022f4a25008b458587b3888f64`.
- Real changes: the truth-audit zero-cost gate now includes D1-backed LOW-risk reads `conversation.list`, `rag.search`, `autonomy.status` and `mentor.recent`; their execution and dynamic health probes remain blocked with `UNKNOWN_OR_EXTERNAL_COST` until exact-capability zero-added-cost proof is supplied for that run.
- Regression: `tests/capability-metered-runtime-cost-guard.test.mjs` proves no execution or health probe occurs by default and that explicit proof unlocks only the exact approved capability.
- CI: `full-candidate-ci` run `34606034934` completed successfully on the exact SHA; runtime dependency security gate, syntax and full test suite all green.
- Verified safety property: low risk/read-only is no longer treated as equivalent to free; unknown runtime metering fails closed.
- Blockers: none introduced. No production deployment, D1 mutation, provider call, secret, DNS/auth/billing change or destructive migration performed.

## Checkpoint 2026-09-11 — local gap detector zero-cost proof

- Branch: `candidate/mel-clean-autonomy`.
- Reviewed implementation/test SHA: `1a155497350a75818ae8b47cff7ec54eed3f5491`.
- Real changes: `evolution.gap.detect` removed from the cost-sensitive audit deny-by-default set after code inspection proved it only compares the supplied natural-language goal with the in-memory `CapabilityBus` registration list; no provider, network, D1, secret or mutation path is touched by the capability itself.
- Regression: `tests/capability-local-gap-audit.test.mjs` proves a deep truth audit dynamically health-checks and executes this exact LOW-risk bounded local capability without requiring a zero-cost override, and records `EXISTANT_ET_TESTE`.
- CI: `full-candidate-ci` run `34612051542` completed successfully on the exact SHA; runtime dependency security gate, syntax and full test suite all green.
- Verified capability: the audit can now truthfully exercise `evolution.gap.detect` automatically while preserving fail-closed treatment for provider-backed, metered, mutating or otherwise ambiguous capabilities.
- Blockers: none introduced. No production deployment, persistent mutation, provider call, secret, DNS/auth/billing change or destructive migration performed.

## Checkpoint 2026-09-11 — consolidation refresh

- Branch: `candidate/mel-clean-autonomy`.
- Reviewed pre-write HEAD: `373934923651eb7e450cc695bda756d8d9ed6aee`.
- Real changes: refreshed all explicitly requested source-branch comparisons and PR #4/#5/#6/#7 truth. No source branch was merged or cherry-picked.
- Consolidation result: UI, Dev Bridge fetch fix, Device Control, Work state, Mentor and 100k prompt branches are fully contained; release remains a small divergent reference; `candidate/augmentio-core` remains a large divergent reference with broad stale removals/reversions and is unsafe for wholesale recovery.
- Tests: documentation-only consolidation block; no product/runtime code changed. Full candidate CI must be checked on this checkpoint SHA before this checkpoint is considered verified.
- Safety: no production deploy, secret, DNS/auth/billing change, destructive migration or paid/provider action.

## Next concrete blocks

1. Continue truthful bounded proofs only for genuinely local LOW-risk capabilities that neither mutate state nor cross provider/network/persistent-runtime metering; require exact zero-cost proof for anything ambiguous.
2. Re-check the end-to-end autonomy chain only where new evidence reveals a missing transition; do not duplicate the now-verified repair/retest or completion-memory proofs.
3. Preserve the approved seven-theme/avatar/composer contract; no cosmetic rework without a failing regression.
