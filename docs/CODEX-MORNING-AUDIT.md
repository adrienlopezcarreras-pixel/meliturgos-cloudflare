# Codex morning audit — 2026-09-09

Scope: changes after the Codex handoff, with the night commits `0221384` and `76320d8`. No concurrent tracked writer was detected. `76320d8` changed documentation only; no night code integration was committed.

| TICKET / CLAIM | CLAIMED_STATUS | VERIFIED_STATUS | EVIDENCE | FIX_NEEDED | NEXT_ACTION |
|---|---|---|---|---|---|
| GEN2 COMPLETE / OH-001..061 | DONE | FALSE_DONE | `76320d8` itself says contracts are written, not integrated | yes | morning queue M001+ |
| Core MVP auth/UI/chat/archive | WORKING | PARTIAL | real `tests/mvp-product.test.mjs`; local route integration passes | history/API hardening remains | M002 |
| Memory + RAG in chat | WORKING | PARTIAL | `worker.js` calls `retrieveContext`; test asserts scoped context; extraction still delegates legacy memory | add owner-scoped integration coverage | M003 |
| Model Router | DONE | PARTIAL | chat `askAI` calls router in workspace; compatibility test required old lowercase API | preserve compatibility, add direct call-site test | M004 |
| Capability Bus | DONE | SCAFFOLDED | `src/capabilities/capability-bus.js` only exercised by contract test; no product composition root | wire one server-owned bus | M005 |
| Plugins / Agents / Automations / Teachers | DONE | SCAFFOLDED | ports return `NOT_IMPLEMENTED`; no router call sites | implement one mock vertical slice each | M006–M009 |
| Module Lab | DONE | PARTIAL | lifecycle types exist; `ModuleRunner` requires injected bus; old tests expect removed simulated API | update tests and add bus-backed mock | M010 |
| Connectors | MOCK | SCAFFOLDED | mock runner reports AUTH_REQUIRED; no real auth | OAuth is external; finish safe adapters | M011 |
| Routes harness | DONE | VERIFIED_DONE | new `tests/gen2/route-integration.test.mjs` exercises active entrypoint, auth and persistence | keep this as gate | none |
| Full `npm test` | DONE | BROKEN | 12/37 files passed; legacy `/tmp` imports and stale ModuleRunner tests fail | isolate/update legacy harness | M012 |

`TEST_HARNESS_QUALITY=MOSTLY_CONTRACT` for `npm run test:openhands` (the reporter says one file while the file contains contract assertions). `npm run test:smoke` is the same contract-only suite. `npm run test:mvp` is local mock/in-memory integration. `npm run test:routes` is now a real local integration test. `test:bindings` is a presence report only. `test:connections` is MOCK only.

Post-audit wiring: Core PARTIAL; Identity WORKING for Basic auth; Conversation/Archive WORKING_INTEGRATED on `/api/chat`; Memory/RAG WORKING_INTEGRATED with lexical retrieval; Model Registry/Router WORKING_MOCK_ONLY; Capability Bus WORKING_MOCK_ONLY (`echo`); Plugin/Module/Module Lab/Agent WORKING_MOCK_ONLY through `src/core/orchestrator/gen2-runtime.js`; DevAgent and Media now have local mock vertical-slice proofs in `tests/integration/dev-media-flow.test.mjs`; Automations/Teachers SCAFFOLDED; connectors SCAFFOLDED and `BLOCKED_EXTERNAL` for auth; Professor/PWA PARTIAL; security PARTIAL; audit/backup/evaluation SCAFFOLDED.

`SECRET_EXPOSURE_FOUND=NO` for tracked files. No deployment, OAuth change, destructive migration or production D1 write was performed.
