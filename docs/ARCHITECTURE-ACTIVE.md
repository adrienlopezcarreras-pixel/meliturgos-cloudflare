# Gen2 — architecture active (source of truth)

Entrypoint: `wrangler.jsonc` → `src/index.js` → `src/router.js` → `src/core/security.js`.
`/` and `/mvp` are served by `src/pages/mvp-interface.js`; validated contract: 401 without auth, 200 HTML with auth. `worker.js` is a compatibility dependency for APIs still being extracted, never an entrypoint or primary UI. `src/pages/index.html` and old routers are `LEGACY_DO_NOT_USE`.

Ports use `src/core/contracts.js`: `method(input, context)`, fail-closed `NOT_IMPLEMENTED` without an injected adapter. D1 is `DB`; binaries are R2 `MEDIA_BUCKET`; AI is injected and mockable. Existing tables are reused; `migrations/0004_gen2_foundations.sql` is ADD-ONLY and was not applied to production.

| System | Canonical file / contract | Implementation and test | State |
|---|---|---|---|
| Core | `src/core/contracts.js`, `src/core/http.js`, `src/core/errors.js`, `src/core/orchestrator/context-builder.js`, `gen2-runtime.js` | `tests/integration/gen2-flow.test.mjs`, contracts | PARTIAL |
| Identity/Auth | `src/identity/identity.js`, `src/core/security.js` | identity + MVP tests | WORKING (Basic auth) |
| Conversation/Archive/Sync | `src/conversations/conversation-service.js`, message/archive/sync facades | route + MVP + MEL tests | WORKING_INTEGRATED (chat path) |
| Memory | `src/memory/memory-service.js`, `worker.js:toolContext` | MEL + phase3 tests | WORKING_INTEGRATED (legacy persistence adapter) |
| Knowledge Graph/Timeline | `src/memory/knowledge-graph.js`, `timeline.js` | contract test | SCAFFOLDED |
| RAG | `src/search/rag-service.js`, `src/core/orchestrator/conversation-context.js` | MEL + phase6 tests | WORKING_INTEGRATED (lexical) |
| Model Registry/Router/Fallback | `src/models/ModelRegistry.js`, `ModelRouter.js`, `fallback.js`; `worker.js:askAI` | MEL + phase4/5 + contracts | WORKING_INTEGRATED (mock AI) |
| Model Council | `src/models/model-council.js` | port contract | SCAFFOLDED |
| Capability Bus | `src/capabilities/capability-bus.js`, `src/capabilities/default-bus.js` | MEL + contract tests | WORKING_INTEGRATED (echo only) |
| Plugins | `src/plugins/sdk.js`, validator/registry/loader facades, lifecycle | contract test | SCAFFOLDED |
| Modules/Module Lab | `src/modules/`, `src/core/orchestrator/gen2-runtime.js`, lifecycle | MEL + module/contract tests | WORKING_MOCK_ONLY |
| Connectors | `src/connectors/sdk.js`, registry, connection runner, provider adapters | `scripts/test-connections.mjs`, connector tests | SCAFFOLDED; OAuth BLOCKED_EXTERNAL |
| Media | `src/media/media-service.js`, `media-generation-service.js` | existing media tests | PARTIAL; R2/auth dependent |
| Professor/Teachers | `src/professor/`, `src/teachers/teacher-interface.js` | professor + contract tests | PARTIAL |
| Agents/Automations | `src/agents/`, `src/automations/`; runtime proof in `gen2-runtime.js` | MEL + contract tests | PARTIAL (agent mock; automation isolated) |
| Devices | `src/devices/device-service.js`, conversation sync | phase3/sync tests | PARTIAL |
| Dev Agent/Self Healing | `src/dev/dev-agent.js`, `src/core/lifecycle/self-healing.js` | contract test | SCAFFOLDED; activation human-gated |
| Evaluation | `src/evaluation/`, model evaluation ports | contract test | SCAFFOLDED |
| Security | `src/security/permissions.js`, `validation.js`, core security | contract/security tests | PARTIAL |
| Audit/Backup | `src/audit/`, `src/backup/` | existing audit + contract tests | SCAFFOLDED |
| API | `src/api/routes/conversations.js`, `src/router.js`, legacy delegation | route/MVP tests | PARTIAL |
| UI/PWA | `src/pages/mvp-interface.js`; manifest route in worker | MVP/UI/PWA tests | PARTIAL |

Connector status is never `CONNECTED` without a successful real probe. Secrets are environment names only. No secret values are documented or committed.
