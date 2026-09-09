# Codex integration handoff

LAST_COMMIT=76320d8 (workspace changes cannot be indexed: `.git/index` is read-only)
RUNTIME_FLOW=UI → src/index.js → src/router.js → worker chat → ConversationService archive → memory/RAG → Context Builder → ModelRouter → assistant archive
INTEGRATED_FEATURES=conversation/archive; memory+lexical RAG chat context; ModelRouter fallback; CapabilityBus echo; device sync
MOCK_ONLY_FEATURES=AI/NinjaChat providers; lexical RAG; model council roles; connectors; Media R2 storage; Professor/Teachers adapters; self-healing activation; Web provider
CONTRACT_ONLY_FEATURES=none
BLOCKED_EXTERNAL=OAuth/provider credentials; real AI/R2; DNS/account permissions; deployment
OPENHANDS_FIRST_TASK=M002
TEST_MEL_RESULT=PASS (4 integration files)
TEST_INTEGRATION_RESULT=PASS (4 integration files)
TEST_ACCEPTANCE_RESULT=PASS (single coherent local flow)

The historical `GEN2 COMPLETE` claim remains FALSE_DONE as a claim; the central local wiring is now covered by integration tests. `npm test` still contains stale legacy harness failures and is queued for OpenHands triage.
