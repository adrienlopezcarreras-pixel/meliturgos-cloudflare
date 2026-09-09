# OpenHands endgame queue

Every ticket is bounded to 10–45 minutes. Use canonical files from `ARCHITECTURE-ACTIVE.md`; never invent a parallel service. `READY` tickets may proceed around `BLOCKED_EXTERNAL` tickets.

## P0–P1 MVP

OH-001
STATUS: READY
PHASE: P0
PRIORITY: P0
DEPENDENCIES: none
GOAL: make the contract harness the first regression gate
FILES: package.json,tests/gen2/contracts.test.mjs
IMPLEMENT: run and wire `npm run test:openhands`
DO_NOT: change architecture or secrets
ACCEPTANCE_TEST: 51 contract tests pass
COMMAND: npm run test:openhands
EXPECTED: exit 0
NEXT: OH-002

OH-002
STATUS: READY
PHASE: P0
PRIORITY: P0
DEPENDENCIES: OH-001
GOAL: verify authenticated `/` and `/mvp` HTML
FILES: tests/routes,src/router.js,src/pages/mvp-interface.js
IMPLEMENT: add deterministic route assertions
DO_NOT: restore legacy UI
ACCEPTANCE_TEST: 401/401/200/200
COMMAND: npm run test:routes
EXPECTED: route report passes
NEXT: OH-003

OH-003
STATUS: READY
PHASE: P0
PRIORITY: P0
DEPENDENCIES: OH-002
GOAL: complete text chat and visible error contract
FILES: worker.js,src/router.js,tests/mvp-product.test.mjs
IMPLEMENT: preserve response `{text,code}` and archive only successful turns
DO_NOT: call paid AI in tests
ACCEPTANCE_TEST: mock user→assistant→archive
COMMAND: npm run test:mvp
EXPECTED: MVP suite passes
NEXT: OH-004

OH-004
STATUS: READY
PHASE: P0
PRIORITY: P0
DEPENDENCIES: OH-003
GOAL: history, archive and conversation switching
FILES: src/conversations,src/pages/mvp-interface.js
IMPLEMENT: finish list/get/messages behavior against existing schema
DO_NOT: delete D1 rows
ACCEPTANCE_TEST: persisted messages reload
COMMAND: npm run test:mvp
EXPECTED: history test passes
NEXT: OH-005

OH-005
STATUS: READY
PHASE: P0
PRIORITY: P1
DEPENDENCIES: OH-004
GOAL: mock file upload and voice unavailable states are explicit
FILES: src/media/media-service.js,src/pages/mvp-interface.js
IMPLEMENT: show deterministic `NOT_CONFIGURED` UI
DO_NOT: claim multimodal support
ACCEPTANCE_TEST: no false success
COMMAND: npm run test:mvp
EXPECTED: explicit status
NEXT: OH-006

OH-006
STATUS: READY
PHASE: P1
PRIORITY: P1
DEPENDENCIES: OH-004
GOAL: device id and sync cursor persistence
FILES: src/devices/device-service.js,src/conversations/conversation-service.js
IMPLEMENT: finish heartbeat and cursor tests
DO_NOT: change IDs on retry
ACCEPTANCE_TEST: idempotent sync
COMMAND: npm run test:openhands
EXPECTED: pass
NEXT: OH-007

OH-007
STATUS: READY
PHASE: P1
PRIORITY: P1
DEPENDENCIES: OH-001
GOAL: route and binding test reports
FILES: scripts/test-routes.mjs,scripts/test-bindings.mjs
IMPLEMENT: print method/auth/status/content-type/error fields
DO_NOT: contact providers
ACCEPTANCE_TEST: deterministic local report
COMMAND: npm run test:routes && npm run test:bindings
EXPECTED: report exits 0 or documented PARTIAL
NEXT: OH-008

## P2 Memory, knowledge and RAG

OH-008..OH-014
STATUS: READY
PHASE: P2
PRIORITY: P1
DEPENDENCIES: OH-004
GOAL: implement memory create/confirm/update/supersede, conflicts, consolidation, provenance, knowledge graph, timeline and lexical RAG persistence
FILES: `src/memory/`, `src/search/`, `migrations/0004_gen2_foundations.sql`, tests/gen2
IMPLEMENT: one small method/test per ticket, using ADD-ONLY tables and owner scoping
DO_NOT: invent vector columns or promote candidates automatically
ACCEPTANCE_TEST: focused contract test per method
COMMAND: npm run test:openhands
EXPECTED: pass; each ticket updates its own status
NEXT: OH-015

## P3 Capability bus

OH-015..OH-019
STATUS: READY
PHASE: P3
PRIORITY: P1
DEPENDENCIES: OH-001
GOAL: finish registry, executor, schemas, permissions and health reporting through `CapabilityBus`
FILES: `src/capabilities/`, `src/security/`, tests/gen2/contracts.test.mjs
IMPLEMENT: add one bounded adapter and negative test per ticket
DO_NOT: permit client URLs, secrets or disabled capabilities
ACCEPTANCE_TEST: deny-by-default and audit events
COMMAND: npm run test:openhands
EXPECTED: pass
NEXT: OH-020

## P4 Plugins and P5 Modules

OH-020..OH-027
STATUS: READY
PHASE: P4-P5
PRIORITY: P1
DEPENDENCIES: OH-015
GOAL: implement plugin/module registry, loader, validator, runner, sandbox and rollback using pinned manifests
FILES: `src/plugins/`, `src/modules/`, `src/core/lifecycle/extension.js`
IMPLEMENT: one lifecycle transition or persistence operation per ticket
DO_NOT: eval arbitrary code or activate without proofs
ACCEPTANCE_TEST: exact-version test/sandbox/security evidence
COMMAND: npm run test:openhands
EXPECTED: pass
NEXT: OH-028

## P6 Module Lab

OH-028..OH-029
STATUS: READY
PHASE: P6
PRIORITY: P1
DEPENDENCIES: OH-020
GOAL: persist resumable NEED→SPEC→MANIFEST→GENERATE→VALIDATE→TEST→SANDBOX→SECURITY_REVIEW→CANDIDATE→ACTIVATE→MONITOR→ROLLBACK stages
FILES: `src/modules/module-lab.js`,`src/persistence/gen2-schema.js`,tests/gen2
IMPLEMENT: idempotent stage records and failure resume
DO_NOT: silently repair production
ACCEPTANCE_TEST: interrupted run resumes at last successful stage
COMMAND: npm run test:openhands
EXPECTED: pass
NEXT: OH-030

## P7 Autonomy

OH-030..OH-036
STATUS: READY
PHASE: P7
PRIORITY: P1
DEPENDENCIES: OH-015,OH-027
GOAL: implement planner, agent registry/executor/supervisor, DevAgent evidence and self-healing proposal flow
FILES: `src/agents/`, `src/dev/`, `src/core/lifecycle/self-healing.js`
IMPLEMENT: each operation stores cursor, idempotency key and evidence
DO_NOT: write production or auto-activate fixes
ACCEPTANCE_TEST: pause/resume/cancel and rollback tests
COMMAND: npm run test:openhands
EXPECTED: pass
NEXT: OH-037

## P8 Connectors (OAuth is external)

OH-037..OH-047
STATUS: READY except real auth
PHASE: P8
PRIORITY: P2
DEPENDENCIES: OH-015
GOAL: finish SDK probes and one safe adapter each for Gmail, Calendar, Contacts, Drive, Outlook, OneDrive, SharePoint, GitHub, Cloudflare and Vercel
FILES: `src/connectors/`, `scripts/test-connections.mjs`, `docs/CONNECTIVITY-MATRIX.md`
IMPLEMENT: MOCK first; REAL read-only probe only after credentials exist
DO_NOT: print secrets or claim CONNECTED
ACCEPTANCE_TEST: presence/network/API/auth fields
COMMAND: npm run test:connections
EXPECTED: MOCK exits 0; REAL reports AUTH_REQUIRED when absent
NEXT: OH-048

## P9 Media and P10 Professor/Teachers

OH-048..OH-056
STATUS: READY
PHASE: P9-P10
PRIORITY: P2
DEPENDENCIES: OH-004,OH-015
GOAL: complete R2 binary/D1 metadata transaction, media adapters, professor sessions, corrections, lessons, scores and teacher provenance
FILES: `src/media/`, `src/professor/`, `src/teachers/`
IMPLEMENT: mock providers and explicit capability checks
DO_NOT: claim vision/audio without an enabled model
ACCEPTANCE_TEST: focused media/professor tests
COMMAND: npm run test:mvp
EXPECTED: pass or explicit BLOCKED_EXTERNAL
NEXT: OH-057

## P11 Automations and Devices

OH-057..OH-061
STATUS: READY
PHASE: P11
PRIORITY: P2
DEPENDENCIES: OH-006,OH-015
GOAL: implement scheduled/condition/event jobs, resumable runs and multi-device sync
FILES: `src/automations/`, `src/devices/`
IMPLEMENT: pin capability versions and idempotency keys
DO_NOT: run jobs without owner permissions
ACCEPTANCE_TEST: run/history/resume tests
COMMAND: npm run test:openhands
EXPECTED: pass
NEXT: OH-062

## P12 PWA and P13 release

OH-062..OH-070
STATUS: READY
PHASE: P12-P13
PRIORITY: P3
DEPENDENCIES: OH-002,OH-003
GOAL: manifest, service worker, offline shell, responsive checks, regression, health, backup/restore and release candidate
FILES: `src/pages/`, `src/evaluation/`, `src/backup/`, `docs/FEATURE-MATRIX.md`
IMPLEMENT: add one deterministic check per ticket and require a release candidate with matching commit test evidence
DO_NOT: deploy or mutate production without human authorization
ACCEPTANCE_TEST: `npm run test:smoke`, routes, MVP, bindings, connections, full test
COMMAND: npm run test:smoke
EXPECTED: all applicable gates documented
NEXT: DONE

OAuth, provider secrets, DNS, account permissions, payments and deployment remain `BLOCKED_EXTERNAL`; all tickets above that do not depend on them stay READY.
