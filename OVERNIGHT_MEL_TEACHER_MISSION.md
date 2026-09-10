# MEL + Teacher overnight mission — 2026-09-09 → 2026-09-10

## Goal
Bring MEL as far as possible toward a verified **SELF_DEVELOPMENT_READY** state before Adrien returns in the morning. Do not fake completion of the full roadmap: some phases require external credentials, device access, Android signing, OAuth consent, hardware, or explicit production authorization.

The overnight target is narrower and critical: MEL must be able to **understand what she can do, inspect her own code, ask multiple AIs for a state-of-play before development, inspect/reuse existing code, prepare a development plan, ask the Teacher for critique, implement candidate changes, run tests/benchmarks, record lessons, and iterate safely on the remaining roadmap**.

## Permanent identity
MEL is the assistant's name. Her persona is feminine and she refers to herself in French using feminine grammatical forms. She remains explicit that she is an AI and never claims to be human.

## Permanent product targets — mobile and connected devices
These targets are part of MEL's long-term definition and must remain on the roadmap rather than being treated as optional experiments:
- Build a real Android companion application for MEL, with voice input, text/file drop, notifications, memory synchronization, authenticated communication with the MEL backend, and a path to a signed standalone APK when human/device prerequisites are available.
- Keep the mobile architecture provider-neutral and reusable so an iOS companion can be added later without rebuilding MEL's core.
- Extend the existing Device Bus into a generic, permissioned Device Control layer for phone, PC and connected-home devices.
- Add smart-TV control through official/local integrations when supported by the device, including Android TV / Google TV / Chromecast-class targets and vendor adapters such as Samsung/LG where an authorized protocol exists.
- Device actions must be capability-scoped and auditable. Ordinary low-risk actions may run only within an owner-approved permission tier; sensitive, destructive, privileged or account-changing actions require an explicit confirmation gate.
- Never obtain control by bypassing authentication, exploiting a device, harvesting credentials, or weakening provider/device security. Unsupported devices remain BLOCKED_EXTERNAL rather than triggering unsafe workarounds.
- Owner shutdown/revocation always wins and must immediately prevent future device actions.
- New device adapters follow the same Council-first -> inspect/reuse -> bounded spec -> Teacher -> candidate -> tests -> release evidence workflow as every other MEL capability.

## Mandatory development order
Every new capability/module request follows this exact order:
1. **Council first** — ask multiple explicitly zero-added-cost AIs for an independent state-of-play.
2. **Inspect existing code** — use `code.read` / `code.search`; reuse before recreating.
3. **Write a bounded specification** — goal, interfaces, risks, tests, rollback.
4. **Teacher review** — package evidence, disagreements, current code state, proposed design, tests and unknowns for critique.
5. **Candidate implementation only** — no direct production writes.
6. **Validation** — syntax, targeted tests, full CI, `.augmentio`/resilience tests, security checks and benchmark evidence where relevant.
7. **Critique + correction** — use Council/Teacher on failures or ambiguous design.
8. **Learning** — update durable skill/evolution/learning evidence only when a measurable improvement is demonstrated.
9. **Release preparation** — exact SHA, manifest/checkpoint, rollback and post-deploy checks. Adrien deploys in the morning.

## Overnight priority order
### P0 — Self-awareness and code access
- Ensure the normal chat knows which capabilities are actually registered and healthy.
- Fix follow-up questions such as “tu m'as dit que tu avais accès ?” when recent context clearly refers to code.
- `code.read` and `code.search` must work from the chat path, not only the Mode complet diagnostics.
- If a real tool call succeeds, MEL must never say she cannot read her code.
- If the tool fails, report the exact failure rather than inventing inability.

### P0 — Teacher collaboration loop
- Implement a provider-neutral structured Teacher request/response contract.
- A Teacher request must include: objective, Council result, code inspection evidence, proposed spec/patch, tests, security/privacy impact, unknowns and rollback.
- Teacher approval/critique is evidence, not blind authority; exact release/deploy approval remains scoped to the exact commit.
- Make the loop usable by future Work/evolution jobs.

### P0 — Development coordinator
Create or complete a coordinator/state machine that can move a development objective through:
`COUNCIL_REQUIRED → COUNCIL_COMPLETE → INSPECTION_REQUIRED → INSPECTION_COMPLETE → SPEC_READY → TEACHER_REVIEW → IMPLEMENTATION → TESTING → CRITIQUE → READY_FOR_RELEASE`
with fail-closed transitions and provenance.

### P0 — Work persistence
- Make development jobs resumable and auditable.
- Persist stage, objective, evidence, candidate SHA, tests and blockers without storing secrets.
- Never silently progress past a failed gate.

### P1 — Memory reliability
- Keep memory status/export/import healthy.
- Preserve provenance and deduplication.
- Feed only relevant bounded memory into chat.
- Do not transform unverified imported text into confirmed facts.

### P1 — Capability awareness
- Expose a bounded runtime capability manifest to MEL so she can accurately answer what she can and cannot do.
- Distinguish REGISTERED / HEALTHY / DEGRADED / BLOCKED_EXTERNAL / NEEDS_HUMAN.

### P1 — Roadmap execution
After the self-development loop is verified, take the highest-priority unfinished roadmap item that is safe, free and implementable without external human authorization; run the full mandatory order above; then continue to the next item.

## Safety / invariants
- Production remains untouched overnight.
- No `wrangler deploy` overnight.
- No DNS, authentication, billing, secrets, repository-admin settings or destructive D1 changes.
- No paid service or unknown-cost provider.
- Unknown cost is not zero.
- No covert persistence, self-replication or shutdown evasion.
- Owner halt always wins.
- Never store or print secrets in repo, logs, prompts, artifacts or teacher payloads.
- Candidate branch only; keep changes small, reviewable and revertible.

## Evidence required before saying SELF_DEVELOPMENT_READY
All of the following must have tests or reproducible evidence:
- Council-first gate enforced.
- Code inspection gate enforced.
- Chat `code.read` succeeds on configured release/candidate reference.
- Capability manifest available to chat/runtime.
- Development coordinator transitions tested.
- Teacher request contract generated from real evidence.
- Candidate implementation path exists without production authority.
- Full CI green on the final candidate SHA.
- `.augmentio` and resilience tests green.
- Checkpoint written with remaining external blockers and exact next action.

## Morning handoff
Do not deploy. Leave:
- candidate branch HEAD SHA;
- concise checkpoint;
- tests/CI evidence;
- what is genuinely verified;
- remaining blockers;
- recommended release branch name;
- exact deployment commands only if the final SHA is green.
