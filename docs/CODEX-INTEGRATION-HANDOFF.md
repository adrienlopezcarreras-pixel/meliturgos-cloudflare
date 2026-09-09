# Codex integration handoff

LAST_COMMIT=76320d8 (workspace changes cannot be indexed: `.git/index` is read-only)
RUNTIME_FLOW=UI → src/index.js → src/router.js → worker chat → ConversationService archive → memory/RAG → Context Builder → ModelRouter → assistant archive
INTEGRATED_FEATURES=conversation/archive; memory+lexical RAG chat context; ModelRouter fallback; CapabilityBus echo; device sync
MOCK_ONLY_FEATURES=plugin; module; Module Lab; agent; DevAgent candidate workflow; MediaService bucket/D1 metadata workflow; connectors
CONTRACT_ONLY_FEATURES=knowledge graph; timeline; model council; teachers; self healing; backup
BLOCKED_EXTERNAL=OAuth/provider credentials; real AI/R2; DNS/account permissions; deployment
OPENHANDS_FIRST_TASK=M002
TEST_MEL_RESULT=PASS (2 integration files)
TEST_INTEGRATION_RESULT=PASS (2 integration files)

The historical `GEN2 COMPLETE` claim remains FALSE_DONE as a claim; the central local wiring is now covered by integration tests. `npm test` still contains stale legacy harness failures and is queued for OpenHands triage.
