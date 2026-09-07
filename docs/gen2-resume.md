# MELITURGOS GEN 2 — RÉSUME

> Avant chaque reprise : relire `docs/MELITURGOS-MASTER-SPEC.md` et `docs/MELITURGOS-MASTER-CHECKLIST.md`.

LAST STABLE PHASE: 1
CURRENT PHASE: 5 COMPLETED — P0 UI-V5 CLASSIC CANDIDATE
LAST STABLE TAG: v0.2.5-rc.1
CURRENT VERSION: 0.2.5-rc.3-gen2.1-gen2-ui-v5-classic
BRANCHE: meliturgos-gen2
TAILLE CODER: 26/26 tests passants

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
- UI V5 Classic basée sur V1 validée par Adrien :
  - `ROOT_PAGE_V5_CLASSIC` avec avatar central cliquable, zone texte+dépôt fichiers, mode complet, preview média
  - Responsive fix : 320/375/430/768/1024/1366/1920 ✅
  - Pas d'overflow horizontal, avatar/composer dans viewport ✅
  - Aperçu : `previews/preview_V5_classic.html`

IN PROGRESS:
- (Phase 3 automatiquement en cours)

REMAINING (Phase 3+):
- (Phase 3 terminée - voir docs/PHASE3-COMPLETION.md)
- Importer contexte ChatGPT réel (H-A-14)
- Test specialists-router manquant
- Router extraction câblé (Phase 2)

FILES MODIFIED RÉCEMMENT:
- worker.js (ROOT_PAGE_V5_CLASSIC, responsive V1 classic, hack PAGE désactivé)
- tests/ui-anti-regression-v3.test.mjs → V5 Classic assertions
- tests/ui-regression.test.mjs → V5 Classic assertions
- tests/voice-mobile.test.mjs → V5 avatar assertion
- tests/root-media-video.test.mjs → V5 preview assertions
- tests/sync-endpoint.test.mjs → mock params fix
- previews/preview_V5_classic.html
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
Attendre validation visuelle humaine de `previews/preview_V5_classic.html` avant deploy. Si validée, déployer avec `npx wrangler deploy`. Sinon ajuster ROOT_PAGE_V5_CLASSIC via /tmp/build_v5_classic.py puis relancer tests.

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

