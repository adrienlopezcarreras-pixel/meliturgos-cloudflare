# Feature matrix — verified runtime state

| FEATURE | STATUS | CANONICAL_FILE | TEST | OPENHANDS_TASK | BLOCKER |
|---|---|---|---|---|---|
| UI | WORKING_INTEGRATED | `src/pages/mvp-interface.js` | `test:mvp` | M002 | none |
| CHAT | WORKING_MOCK_ONLY | `worker.js:chat` | `test:mel`, `test:mvp` | M002 | real AI external |
| CONVERSATIONS | WORKING_INTEGRATED | `src/conversations/conversation-service.js` | `test:routes`, `test:mel` | M002 | none |
| ARCHIVE | WORKING_INTEGRATED | `ConversationService.archiveMessage` | `test:mel` | M002 | none |
| MEMORY | WORKING_INTEGRATED | `worker.js:toolContext`, `src/memory/` | `test:mel` | M003 | legacy adapter |
| KNOWLEDGE GRAPH | WORKING_INTEGRATED | `src/memory/knowledge-graph.js` + `src/core/orchestrator/d1-runtime.js` | `test:integration` | M008 | none locally |
| TIMELINE | WORKING_INTEGRATED | `src/memory/timeline.js` + `src/core/orchestrator/d1-runtime.js` | `test:integration` | M008 | none locally |
| RAG | WORKING_MOCK_ONLY | `src/search/rag-service.js` | `test:mel` | M003 | lexical; embeddings optional |
| MODEL REGISTRY | WORKING_MOCK_ONLY | `src/models/ModelRegistry.js` | phase5/contracts | M004 | provider health |
| MODEL ROUTER | WORKING_MOCK_ONLY | `src/models/ModelRouter.js`, `src/models/providers/ninjachat-provider.js`, `worker.js:askAI` | `test:mel` | M004 | AI/NinjaChat API credentials |
| MODEL COUNCIL | WORKING_MOCK_ONLY | `src/models/model-council.js` + local adapters | `test:integration` | M014 | provider adapters |
| CAPABILITY BUS | WORKING_INTEGRATED | `src/capabilities/capability-bus.js` | `test:mel` | M005 | production registry |
| PLUGINS | WORKING_INTEGRATED | `src/core/orchestrator/gen2-runtime.js` + `src/plugins/` | `test:mel` | M007 | durable persistence/loader |
| MODULES | WORKING_INTEGRATED | `src/core/orchestrator/gen2-runtime.js` + `src/modules/` | `test:mel` | M006 | durable persistence/sandbox |
| MODULE LAB | WORKING_INTEGRATED | `src/modules/module-lab.js`, `gen2-runtime.js` | `test:mel` | M006 | resumable persistence |
| CONNECTORS | WORKING_MOCK_ONLY | `src/connectors/` | `test:connections` | M011 | OAuth/secrets |
| MEDIA | WORKING_MOCK_ONLY | `src/media/media-service.js` | `tests/integration/dev-media-flow.test.mjs` | M013 | real R2 binding |
| PROFESSOR | WORKING_MOCK_ONLY | `src/professor/` + local adapters | `test:integration` | M010 | AI adapter |
| TEACHERS | WORKING_MOCK_ONLY | `src/teachers/teacher-interface.js` + local adapters | `test:integration` | M010 | external LLM adapter |
| AGENTS | WORKING_INTEGRATED | `gen2-runtime.js`, `src/agents/` | `test:mel` | M008 | persistent executor |
| DEV AGENT | WORKING_INTEGRATED | `src/dev/dev-agent.js` | `tests/integration/dev-media-flow.test.mjs` | M014 | host Git adapter |
| SELF HEALING | WORKING_MOCK_ONLY | `src/core/lifecycle/self-healing.js` + local adapters | `test:integration` | M014 | human activation |
| AUTOMATIONS | WORKING_INTEGRATED | `src/automations/automation-service.js` + `src/core/orchestrator/d1-runtime.js` | `test:integration` | M009 | Cron deployment |
| DEVICES | WORKING_INTEGRATED | `src/devices/device-service.js`, sync service | `test:mel` | M002 | reconciliation hardening |
| PWA | WORKING_INTEGRATED | manifest route + `src/pages/service-worker.js` | `test:routes` | M014 | browser install verification |
| WEB | WORKING_MOCK_ONLY | `src/services/web-tool.js` | contracts | M014 | provider adapter |
| BACKUP | WORKING_INTEGRATED | `src/backup/backup-service.js` + D1 metadata adapter | `test:integration` | M014 | R2 binding for binaries |
| AUDIT | WORKING_INTEGRATED | `src/audit/audit-service.js` + D1 audit_logs | `test:integration` | M005 | binding at deployment |

`WORKING_MOCK_ONLY` means the local path is real but provider behavior is mocked. No row is promoted to production-ready by file existence alone.
