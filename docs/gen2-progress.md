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

## Phase 2 — Archive + Multi-device ✅ COMPLETED
Auteur: openhands (reprise session)
- ✅ Brancher `/api/chat` et `/api/professor/ask` sur `ConversationService`
- ✅ Migrer `interactions` vers `archive_messages` via `archiveMessage()`
- ✅ Valider `/api/v1/sync` (indexing + schema migrations)
- ✅ Créer tests `phase2-archiving-direct.test.mjs`
- ✅ Tous les tests passants (18/18)
- ✅ Déployé v0.2.5-rc.2-gen2.1-gen2-ui-fixed (production)

## Phase 3 — Mémoire cognitive, Models, Capabilities, Connectors, Companions
- Voir MASTER CHECKLIST.

## Phase 4 — Model Registry & Orchestrated Fallback ✅
Auteur: openhands (reprise session)
- ✅ Création `src/models/ModelRegistry.js`
- ✅ Création `src/registry/orchestration-registry.js`
- ✅ Test `phase4-registry-and-fallback.test.mjs`
- ✅ Cycle de vie de modèle (add, get, update, delete)
- ✅ Recherche par capacité
- ✅ Configuration prix (input/output + estimates)
- ✅ Fonction de secours orchestrée (orchestrated fallback)
- ✅ Gestion d'épuisement (exhaustion handling)
- ✅ Représentation de tous les modèles Cloudflare (Kimi K2.7 Code, GLM-4.7 Flash, Gemma-3)
- ✅ 11/11 tests passants

## Journal

### 2026-09-06 — Phase 0 complétée
Auteur: openhands
Backup intégré, Git initialisé, branche gen2 créée.

### 2026-09-06 — Phase 1 complétée
Auteur: openhands
- Commit `4330f15` sur branche `meliturgos-gen2`.
- Tag `v0.2.5-rc.1-gen2-phase1`.
- Endpoint `/api/import/chatgpt-context` ajouté avec guard, simulation, confirmation, source `chatgpt_context_summary`.
- Détection stable : v0.2.5-rc.1 avec MODELS par défaut GLM/Gemma/Llama pour compatibilité Cloudflare.

### 2026-09-06 — Jour 2 - v0.2.5-rc.2-gen2.1 ✅
Auteur: openhands
- **Déploiement production** : https://meliturgos.adrien-lopezcarreras.workers.dev/ (401 Basic Auth OK)
- **Versions** :
  - APP_VERSION: `0.2.5-rc.2-gen2.1`
  - BACKEND_VERSION: `gen2.1`
  - UI_VERSION: `patched-v3`
  - SCHEMA_VERSION: `2.1`
- **UI moderne CORRECTEMENT implémentée** : ROOT_PAGE_PATCHED_V3
  - ✅ Avatar assistant intégré (MEL_AVATAR_B64)
  - ✅ Voix mobile actif (ROOT_VOICE_ENHANCEMENT)
  - ✅ Capabilities panel ajouté (ROOT_CAPABILITIES)
  - ✅ Bottom actions ROOT_BOTTOM_ACTIONS_ROOT
  - ✅ Professeur page séparée (`/professor`)
- **Configuration** :
  - ✅ ORCHESTRATION_LIMITS corrigé : `max_input_chars:12000` (suppression duplicate)
  - ✅ LEARNING_CLASSES fixé (déclaration Array)
  - ✅ Media contracts préservés
- **Tests** : 18/18 passants (anti-régression UI rétablie)
- **Git** :
  - Commit phase1: `4330f15`
  - Commit UI fix: `241fd44`
  - Commit jour2: `5fdf7ac`, nightly shift: `5fdf7ac`
- **Documentation** :
  - MASTER-CHECKLIST: MÉTRIQUES JOURNÉE 2
  - MASTER-SPEC: versions factuelles
  - human-actions-required: URL production + statuts
- **Backup** : Pre-import JSON + SQL scripts préservés
- **Blocking** : Aucun. Tout RÉTROGRADE SÛREMENT au tag stable `v0.2.5-rc.1`.
- Test `chatgpt-context-import.test.mjs` ajouté et passant.
- Regressions : 17/17 tests OK.
- Documentation MAJ : MASTER-CHECKLIST, gen2-progress, human-actions-required.
- Import ChatGPT réel bloqué par H-A-14 (fichier JSON manquant).

---

## Phase 3 (AUTONOMES) - COMPLETED TESTS

### ✅ Gen2-65: Memory 2.0 Service (2026-09-06)

- **Test**: `phase3-memory-2.0.test.mjs`
- **Feature**: MemoryService CRUD operations
- **Status**: Tests passing (lifecycle, CRUD, conflicts)
- **Components**:
  - `MemoryService.create()` - Create memory (OBSERVED)
  - `MemoryService.confirm()` - Confirm memory (CANDIDATE → CONFIRMED)
  - `MemoryService.list()` - List memories with filters
  - `MemoryService.findConflicts()` - Detect memory conflicts
- **Schema**: Memories table with role, confidence, valid_from, valid_until

### ✅ Gen2-66: Model Fallback (2026-09-06)

- **Test**: `phase3-model-fallback.test.mjs`
- **Feature**: Model fallback chain (Kimi → GLM → Gemma)
- **Status**: Tests passing (primary model, exhaustion handling)
- **Components**:
  - `ModelFallback.callModelWithFallback()` - Retry with next available model
  - `MODEL_FALLBACK_CHAIN` configuration
  - Metadata tracking (attempts, duration)

---

## GEN2-57: Migration Gen1 sans perte de données

**Status**: Phase 2 COMPLETED ✓  
**Remaining**: Manual migration (optionnel pour Adrien)

See: `docs/GEN2-57-migration-gen1-legacy.md` for complete documentation

