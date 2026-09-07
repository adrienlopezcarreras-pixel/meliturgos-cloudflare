# MELITURGOS GEN 2 — RÉSUME

> Avant chaque reprise : relire `docs/MELITURGOS-MASTER-SPEC.md` et `docs/MELITURGOS-MASTER-CHECKLIST.md`.

LAST STABLE PHASE: 1
CURRENT PHASE: 5 COMPLETED
LAST STABLE TAG: v0.2.5-rc.1
CURRENT VERSION: 0.2.5-rc.2-gen2.1
BRANCHE: meliturgos-gen2
TAILLE CODER: 23/23 tests passants

COMPLETED:
- Sauvegarde stable v0.2.5-rc.1
- Export D1
- Git + branche meliturgos-gen2
- Structure src/core/src/conversations/src/persistence/src/audit
- Tables Gen2 dans worker.js (conversations, devices, archive_messages, sync_checkpoints)
- Route /api/v1/sync
- Correction du test orchestration-registry
- RESTAURATION UI MODERNE v3 : ROOT_PAGE_PATCHED_V3 ✅
- Fix ORCHESTRATION_LIMITS + LEARNING_CLASSES ✅
- Déploiement production https://meliturgos.adrien-lopezcarreras.workers.dev/ ✅
- D1 backup préservé, mémoires ChatGPT pré-importées ✅
- Documentation MASTER-SPEC, MASTER-CHECKLIST, human-actions-required ✅
- Phase 2 complète : Brancher /api/chat et /api/professor/ask ✅
- Archive system active (interactions → archive_messages) ✅
- Tests phase2-archiving-direct.test.mjs créés ✅
- Phase 3 - Tests autonomes créés : Memory 2.0, Model Fallback, DeviceBus ✅

IN PROGRESS:
- (Phase 3 automatiquement en cours)

REMAINING (Phase 3+):
- (Phase 3 terminée - voir docs/PHASE3-COMPLETION.md)
- Importer contexte ChatGPT réel (H-A-14)
- Test specialists-router manquant
- Router extraction câblé (Phase 2)

FILES MODIFIED RÉCEMMENT:
- worker.js (UI modernisée, versions configurées)
- tests/ui-regression.test.mjs (pattern fixes)
- docs/MELITURGOS-MASTER-CHECKLIST.md
- docs/gen2-progress.md
- docs/gen2-resume.md
- docs/human-actions-required.md

TEST COMMANDS:
npm test
npx wrangler dev
curl -u meliturgos:password https://meliturgos.adrien-lopezcarreras.workers.dev/
curl -u meliturgos:password https://meliturgos.adrien-lopezcarreras.workers.dev/api/status
curl -u meliturgos:password -X GET https://meliturgos.adrien-lopezcarreras.workers.dev/professor

ROLLBACK COMMAND:
git checkout v0.2.5-rc.1
npx wrangler deploy --name meliturgos

RESUME INSTRUCTION:
Continue Phase 2 - Brancher ConversationService sur chat/professor routes ⚡
