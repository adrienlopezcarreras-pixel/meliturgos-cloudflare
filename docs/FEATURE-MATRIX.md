# Feature matrix — verified runtime state

| FEATURE | STATUS | CANONICAL_FILE | TEST | OPENHANDS_TASK | BLOCKER |
|---|---|---|---|---|---|
| UI | WORKING_INTEGRATED | `src/pages/mvp-interface.js` | `test:mvp` | M002 | none |
| CHAT | WORKING_MOCK_ONLY | `worker.js:chat` | `test:mel`, `test:mvp` | M002 | real AI external |
| CONVERSATIONS | WORKING_INTEGRATED | `src/conversations/conversation-service.js` | `test:routes`, `test:mel` | M002 | none |
| ARCHIVE | WORKING_INTEGRATED | `ConversationService.archiveMessage` | `test:mel` | M002 | none |
| MEMORY | WORKING_INTEGRATED | `worker.js:toolContext`, `src/memory/` | `test:mel` | M003 | legacy adapter |
| KNOWLEDGE GRAPH | CONTRACT_ONLY | `src/memory/knowledge-graph.js` | contracts | M008 | persistence adapter |
| TIMELINE | CONTRACT_ONLY | `src/memory/timeline.js` | contracts | M008 | persistence adapter |
| RAG | WORKING_MOCK_ONLY | `src/search/rag-service.js` | `test:mel` | M003 | lexical; embeddings optional |
| MODEL REGISTRY | WORKING_MOCK_ONLY | `src/models/ModelRegistry.js` | phase5/contracts | M004 | provider health |
| MODEL ROUTER | WORKING_MOCK_ONLY | `src/models/ModelRouter.js`, `worker.js:askAI` | `test:mel` | M004 | real provider |
| MODEL COUNCIL | CONTRACT_ONLY | `src/models/model-council.js` | contracts | M014 | adapters |
| CAPABILITY BUS | WORKING_MOCK_ONLY | `src/capabilities/capability-bus.js` | `test:mel` | M005 | production registry |
| PLUGINS | WORKING_MOCK_ONLY | `src/core/orchestrator/gen2-runtime.js` + `src/plugins/` | `test:mel` | M007 | persistence/loader |
| MODULES | WORKING_MOCK_ONLY | `src/core/orchestrator/gen2-runtime.js` + `src/modules/` | `test:mel` | M006 | persistence/sandbox |
| MODULE LAB | WORKING_MOCK_ONLY | `src/modules/module-lab.js`, `gen2-runtime.js` | `test:mel` | M006 | resumable persistence |
| CONNECTORS | WORKING_MOCK_ONLY | `src/connectors/` | `test:connections` | M011 | OAuth/secrets |
| MEDIA | WORKING_MOCK_ONLY | `src/media/media-service.js` | `tests/integration/dev-media-flow.test.mjs` | M013 | real R2 binding |
| PROFESSOR | PARTIAL | `src/professor/` | professor tests | M010 | AI adapter |
| TEACHERS | CONTRACT_ONLY | `src/teachers/teacher-interface.js` | contracts | M010 | adapters |
| AGENTS | WORKING_MOCK_ONLY | `gen2-runtime.js`, `src/agents/` | `test:mel` | M008 | persistent executor |
| DEV AGENT | WORKING_MOCK_ONLY | `src/dev/dev-agent.js` | `tests/integration/dev-media-flow.test.mjs` | M014 | host Git adapter |
| SELF HEALING | CONTRACT_ONLY | `src/core/lifecycle/self-healing.js` | contracts | M014 | human activation |
| AUTOMATIONS | CONTRACT_ONLY | `src/automations/` | contracts | M009 | scheduler/persistence |
| DEVICES | WORKING_INTEGRATED | `src/devices/device-service.js`, sync service | `test:mel` | M002 | reconciliation hardening |
| PWA | PARTIAL | manifest route + `src/pages/` | PWA tests | M014 | service worker |
| WEB | PARTIAL | `src/services/web-tool.js` | contract | M014 | provider adapter |
| BACKUP | CONTRACT_ONLY | `src/backup/` | contracts | M014 | storage adapter |
| AUDIT | PARTIAL | `src/audit/` | audit tests + MEL audit hook | M005 | persistence |

`WORKING_MOCK_ONLY` means the local path is real but provider behavior is mocked. No row is promoted to production-ready by file existence alone.
