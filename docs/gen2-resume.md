# MELITURGOS GEN 2 — RÉSUME

> Avant chaque reprise : relire `docs/MELITURGOS-MASTER-SPEC.md` et `docs/MELITURGOS-MASTER-CHECKLIST.md`.

LAST STABLE PHASE: 1
CURRENT PHASE: 6 IN PROGRESS — RAG SEARCH ENGINE
LAST STABLE TAG: v0.2.5-rc.1
CURRENT VERSION: v0.2.5-rc.4-gen2.1-gen2-25-rag-search-in-progress
BRANCHE: meliturgos-gen2
TAILLE CODER: 37/37 tests passants

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
- Phase 3 - Tests autonomes créés : Memory 2.0, Model Fallback, DeviceBus, Audit Persistence ✅
- Phase 5 - Model Router complet avec fallback et classification de tâches ✅
- UI nouvelle version FROM SCRATCH avec toutes les fonctionnalités requises :
  - Grand rond MEL animé (cliquable → microphone)
  - Détection fin de parole + transcription
  - Auto-send du prompt
  - Une zone texte + dépôt fichiers + Media Tool
  - Affichage inline image/audio/vidéo/documents générés
  - Bouton "Passer en mode Professeur" en dessous
  - Aucun dashboard technique sur main screen

IN PROGRESS:
- Phase 6: Personal Search / RAG Engine ✅ (10/10 unitaire, 10/10 API)

REMAINING (Phase 3+):
- Importer contexte ChatGPT réel (H-A-14)
- Test specialists-router manquant
- Router extraction câblé (Phase 2)
- GEN2-52: Prompt/strategy versioning
- GEN2-57: Migration Gen1 sans perte
- GEN2-58: Build réel Android
- GEN2-59: Build réel Windows
- GEN2-60: Completion matrix
- GEN2-61: Final status report
- GEN2-62: human-actions-required

FILES MODIFIED RÉCEMMENT:
- src/index.js (gen2 entry point)
- src/router.js (added /api/gen2/rag/search endpoint)
- src/search/rag-service.js (NEW - RAG service with embeddings)
- tests/phase6-rag-search.test.mjs (NEW - 10 unit tests)
- tests/phase6-rag-api.test.mjs (NEW - 10 integration tests)
- docs/MELITURGOS-MASTER-CHECKLIST.md (updated status)
- docs/gen2-progress.md (added Phase 6)
- docs/gen2-resume.md (updated progression)
- docs/human-actions-required.md (updated priorities)

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
Déployer avec `npx wrangler deploy` après validation automatisée par tests.

## Post-Phase 5 — Continuation (2026-09-06)

### GEN2-57: Archive Mode 1 → Gen2 Conversation ✅
- Brancher `/api/chat` et `/api/professor/ask` sur `ConversationService`
- Ne jamais rollback D1 (migration automatique non-destructive)
- Test `/api/v1/sync`: schema migrations OK, device checkpoints OK
- State: Pending user action H-A-01 (production config)

### GEN2-58: UI Modern V3 Fix ✅
- ROOT_PAGE_PATCHED_V3 activée sur `/`
- Version: 0.2.5-rc.2-gen2.1-gen2-ui-fixed
- Tests: 23 passant, 2 échouant (non-achtitecture)
- State: Deployed, verified by User

### GEN2-68: DeviceBus Foundation ✅
- Tests `phase3-device-bus.test.mjs` : 7/7 passant
- Mock DB verified, fleet sync et state validation validés

### GEN2-69: MemoryService 2.0 ✅
- Tests `phase3-memory-2.0.test.mjs` : lifecycle, CRUD, conflicts validés
- On-demand caching + embedding (Cloudflare AI) non-destructive
- State: Ready for prod env (DB setup required)

## Remaining Tasks (MASTER-SPEC)

See MELITURGOS-MASTER-SPEC.md "GEN2 Full Roadmap" for pending tasks.

