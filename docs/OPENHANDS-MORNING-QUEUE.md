# OpenHands morning queue — integration follow-up

M001
STATUS: READY
PRIORITY: P0
DEPENDENCIES: none
GOAL: preserve the canonical entrypoint and make all architecture files part of the tracked deliverable
FILES: `src/index.js`, `src/router.js`, `src/core/contracts.js`, `tests/gen2/route-integration.test.mjs`
IMPLEMENT: inspect `git status`; stage only the Gen2 files required by the active architecture and run the gates
DO_NOT: reset, clean, restore legacy UI, or stage `.dev.vars`/Wrangler state
ACCEPTANCE_TEST: route integration and contract tests pass
COMMAND: `npm run test:routes && npm run test:openhands`
EXPECTED: exit 0
NEXT: M002

M002
STATUS: READY
PRIORITY: P0
DEPENDENCIES: M001
GOAL: make the MVP history route owner-scoped and test create/add/list/archive/sync in one local flow
FILES: `src/api/routes/conversations.js`, `src/conversations/conversation-service.js`, `tests/gen2/route-integration.test.mjs`
IMPLEMENT: add focused assertions using disposable SQLite D1
DO_NOT: use client-supplied owner or touch production D1
ACCEPTANCE_TEST: second owner cannot read the first owner’s conversation
COMMAND: `npm run test:routes`
EXPECTED: pass
NEXT: M003

M003
STATUS: READY
PRIORITY: P1
DEPENDENCIES: M002
GOAL: prove memory candidate, memory retrieval, RAG retrieval and archive all occur in the chat flow
FILES: `worker.js`, `src/core/orchestrator/conversation-context.js`, `src/search/rag-service.js`, `tests/gen2`
IMPLEMENT: add one mock-AI assertion for retrieved provenance and one candidate assertion
DO_NOT: call external embeddings or promote unconfirmed memory
ACCEPTANCE_TEST: context is scoped by authenticated owner and conversation
COMMAND: `npm run test:mvp`
EXPECTED: pass
NEXT: M004

M004
STATUS: READY
PRIORITY: P1
DEPENDENCIES: M003
GOAL: pin ModelRouter compatibility while keeping canonical capability categories and bounded fallback
FILES: `src/models/ModelRouter.js`, `src/models/ModelRegistry.js`, `tests/phase5-model-router.test.mjs`
IMPLEMENT: keep both legacy classification aliases and Gen2 categories; add direct chat call-site assertion
DO_NOT: add models or provider credentials
ACCEPTANCE_TEST: chat invokes router once in mock success and falls back once on retryable failure
COMMAND: `node tests/phase5-model-router.test.mjs && npm run test:mvp`
EXPECTED: pass
NEXT: M005

M005
STATUS: READY
PRIORITY: P1
DEPENDENCIES: M004
GOAL: compose one server-owned CapabilityBus and route one safe mock capability through it
FILES: `src/capabilities/capability-bus.js`, `src/router.js`, `src/modules/module-runner.js`, `tests/gen2`
IMPLEMENT: inject the bus from the composition root; use schema and permission checks
DO_NOT: accept client executors, URLs or secrets
ACCEPTANCE_TEST: disabled/unauthorized calls fail and authorized mock call is audited
COMMAND: `npm run test:openhands`
EXPECTED: pass
NEXT: M006

M006
STATUS: READY
PRIORITY: P1
DEPENDENCIES: M005
GOAL: make ModuleRunner register/run/test/health/disable/rollback a bus-backed mock module
FILES: `src/modules/`, `tests/gen2`
IMPLEMENT: persist pinned version and idempotency key in disposable D1
DO_NOT: restore simulated remote fetch or arbitrary code evaluation
ACCEPTANCE_TEST: module lifecycle reaches ACTIVE only with exact proofs
COMMAND: `npm run test:openhands`
EXPECTED: pass
NEXT: M007

M007
STATUS: READY
PRIORITY: P1
DEPENDENCIES: M005
GOAL: implement one mock plugin register→validate→load→execute→health→disable→rollback flow
FILES: `src/plugins/`, `tests/gen2`
IMPLEMENT: reuse manifest validator and lifecycle transitions
DO_NOT: load unpinned or traversing entrypoints
ACCEPTANCE_TEST: invalid manifest and disabled execution fail closed
COMMAND: `npm run test:openhands`
EXPECTED: pass
NEXT: M008

M008
STATUS: READY
PRIORITY: P1
DEPENDENCIES: M005
GOAL: execute one mock agent plan/step/report with pause/resume/cancel
FILES: `src/agents/`, `tests/gen2`
IMPLEMENT: store cursor and idempotency key; delegate actions to CapabilityBus
DO_NOT: modify repository or production
ACCEPTANCE_TEST: interrupted run resumes deterministically
COMMAND: `npm run test:openhands`
EXPECTED: pass
NEXT: M009

M009
STATUS: READY
PRIORITY: P2
DEPENDENCIES: M005
GOAL: execute one mock scheduled/event automation with history
FILES: `src/automations/`, `tests/gen2`
IMPLEMENT: pin capability version and owner permissions
DO_NOT: run without an explicit enable state
ACCEPTANCE_TEST: disabled job has no side effect; enabled job is idempotent
COMMAND: `npm run test:openhands`
EXPECTED: pass
NEXT: M010

M010
STATUS: READY
PRIORITY: P2
DEPENDENCIES: M005
GOAL: connect professor service and teacher interface to a mock session with provenance
FILES: `src/professor/`, `src/teachers/`, `tests/gen2`
IMPLEMENT: session→turn→critique→correction→lesson proposal
DO_NOT: auto-confirm lessons or call external teachers
ACCEPTANCE_TEST: confidence and provenance survive the round trip
COMMAND: `npm run test:mvp`
EXPECTED: pass or explicit BLOCKED_EXTERNAL
NEXT: M011

M011
STATUS: READY
PRIORITY: P2
DEPENDENCIES: M005
GOAL: finish connector MOCK status reports and ensure all ten provider adapters remain AUTH_REQUIRED without credentials
FILES: `src/connectors/`, `scripts/test-connections.mjs`, `docs/CONNECTIVITY-MATRIX.md`
IMPLEMENT: assert no secret value appears in output
DO_NOT: claim REAL_CONNECTED
ACCEPTANCE_TEST: ten deterministic reports contain required fields
COMMAND: `npm run test:connections`
EXPECTED: pass; OAuth remains BLOCKED_EXTERNAL
NEXT: M012

M012
STATUS: READY
PRIORITY: P1
DEPENDENCIES: M001
GOAL: repair legacy `/tmp` test harnesses or explicitly quarantine stale tests so `npm test` reports truthfully
FILES: `scripts/run-tests.mjs`, affected `tests/*.mjs`
IMPLEMENT: make copied worker dependencies available or mark only incompatible historical tests as skipped with reasons
DO_NOT: weaken assertions or hide failures
ACCEPTANCE_TEST: full report separates active integration from legacy compatibility
COMMAND: `npm test`
EXPECTED: no unexplained `ERR_MODULE_NOT_FOUND`
NEXT: M013

M013
STATUS: BLOCKED_EXTERNAL
PRIORITY: P3
DEPENDENCIES: M011
GOAL: validate real provider connectivity after OAuth/tokens are authorized
FILES: `src/connectors/`, `docs/CONNECTIVITY-MATRIX.md`
IMPLEMENT: run fixed read-only probes and record presence/status only
DO_NOT: print secrets or change account permissions
ACCEPTANCE_TEST: AUTH_VALID=YES and STATUS=CONNECTED only after a real successful probe
COMMAND: `node scripts/test-connections.mjs --real`
EXPECTED: provider-specific result
NEXT: M014

M014
STATUS: READY
PRIORITY: P3
DEPENDENCIES: M001..M012
GOAL: update feature matrix and release candidate evidence from actual test outputs
FILES: `docs/FEATURE-MATRIX.md`, `docs/CODEX-MORNING-AUDIT.md`, `docs/gen2-resume.md`
IMPLEMENT: mark only code+call-site+test-proven behavior WORKING
DO_NOT: infer completion from file existence or contract imports
ACCEPTANCE_TEST: every claimed DONE row has evidence
COMMAND: `npm run test:smoke && npm run test:routes && npm run test:mvp`
EXPECTED: documented release state
NEXT: DONE
