LAST_CODEX_COMMIT=76320d8 (current wiring is uncommitted in workspace)
CURRENT_STATE=Core chat runtime now archives before retrieval and after inference; Context Builder, RAG, ModelRouter and safe echo CapabilityBus are wired. Plugin/module/Module Lab/agent mock runtime is proven in test:mel.
CURRENT_TASK=M001
TEST_COMMAND=npm run test:integration && npm run test:mel
KNOWN_BLOCKERS=OAuth/provider secrets, real AI/R2, DNS/account permissions, deployment approval
EXTERNAL_ACTIONS=Authorize credentials only for connector REAL probes.
DO_NOT_REDO=Do not restore legacy UI, reset/clean Git, delete backups, mutate production D1, or expose secrets.
NEXT_TASK=M002
