# MELITURGOS GEN 2 — PROGRESSION

## Sources de vérité
- **MASTER SPEC** : `docs/MELITURGOS-MASTER-SPEC.md`
- **MASTER CHECKLIST** : `docs/MELITURGOS-MASTER-CHECKLIST.md`
- **HUMAN ACTIONS** : `docs/human-actions-required.md`

## Phase 0 — Audit + Backup ✅
- [x] Audit complet
- [x] Sauvegarde stable `backups/v0.2.5-rc.1-stable/`
- [x] Export D1 schema + data
- [x] Rollback.md + CHECKSUMS
- [x] Initialisation Git
- [x] Branche `meliturgos-gen2`
- [x] Tag `v0.2.5-rc.1`

## Phase 1 — Architecture Gen 2 ✅
- [x] Structure `src/`
- [x] Core minimal (config, errors, http, security, audit)
- [x] `ConversationService` + tests
- [x] `AuditService` scaffold
- [x] Migration Gen2 D1 scaffoldée
- [x] Route `/api/v1/sync` ajoutée (`worker.js`)
- [x] Fonctions `syncDevice`, `archiveProfessorMessage`, `ensureArchiveTables`
- [x] Fonctions `/api/import/chatgpt-context` dans `worker.js`
- [x] Tests `chatgpt-context-import.test.mjs` passant
- [x] Tests régression complète : 18/18
- [x] UI moderne CORRECTEMENT implémentée : ROOT_PAGE_PATCHED_V3
  - Avatar assistant intégré
  - Voix mobile actif
  - Capabilities panel ajouté
  - Bottom actions ROOT_BOTTOM_ACTIONS_ROOT
- [x] Fix ORCHESTRATION_LIMITS : suppression duplicate et ajout max_input_chars:12000
- [x] Resolve LEARNING_CLASSES undefined error
- [x] Resolve npm packages (tsx)
- [x] Commit stable `4330f15`
- [x] Tag `v0.2.5-rc.1-gen2-phase1`
- [x] Commit UI fix `241fd44`
- [x] Tag UI fix `v0.2.5-rc.2-gen2.1-gen2-ui-fixed`
- [ ] Router extraction câblé via `wrangler.jsonc` (Phase 2)

## Phase 2 — Archive + Multi-device 🔄
- [ ] Brancher `/api/chat` et `/api/professor/ask` sur `ConversationService`
- [ ] Migrer `interactions` vers `archive_messages`
- [ ] Valider `/api/v1/sync`

## Phase 3+ — Mémoire cognitive, Models, Capabilities, Connectors, Companions
- Voir MASTER CHECKLIST.

## Journal

### 2026-09-06 — Phase 0 complétée
Auteur: openhands
Backup intégré, Git initialisé, branche gen2 créée.

### 2026-09-06 — Phase 1 complétée
Auteur: openhands
- Commit `4330f15` sur branche `meliturgos-gen2`.
- Tag `v0.2.5-rc.1-gen2-phase1`.
- Endpoint `/api/import/chatgpt-context` ajouté avec guard, simulation, confirmation, source `chatgpt_context_summary`.
- Test `chatgpt-context-import.test.mjs` ajouté et passant.
- Regressions : 17/17 tests OK.
- Documentation MAJ : MASTER-CHECKLIST, gen2-progress, human-actions-required.
- Import ChatGPT réel bloqué par H-A-14 (fichier JSON manquant).
