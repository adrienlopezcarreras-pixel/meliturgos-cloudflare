# Runtime flow

`src/pages/mvp-interface.js` → `src/index.js` → `src/router.js` → `src/core/security.js` → legacy-compatible `worker.js:chat`.

`chat` parses the request, creates/migrates `ConversationService`, archives the user message, retrieves existing memory (`worker.js:toolContext`) and lexical RAG (`src/core/orchestrator/conversation-context.js` → `src/search/rag-service.js`), optionally executes the safe `echo` capability (`src/capabilities/default-bus.js` → `src/capabilities/capability-bus.js`), builds one message array (`src/core/orchestrator/context-builder.js`), calls `src/models/ModelRouter.js` with bounded fallback, stores the interaction and candidate memory, then archives the assistant message through `ConversationService`.

The response returns to the MVP UI, which refreshes conversation history. Professor and other legacy APIs remain compatibility routes until their adapters are integrated. Plugin/module/agent proofs use `src/core/orchestrator/gen2-runtime.js`; they are not silently claimed as product-wide integrations.
