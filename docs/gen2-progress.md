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

## Phase 1 — Architecture Gen 2 🔄
- [x] Structure `src/`
- [x] Core minimal (config, errors, http, security, audit)
- [x] `ConversationService` scaffoldé
- [x] Migration Gen2 D1 scaffoldée
- [x] Route `/api/v1/sync` ajoutée
- [x] Fonctions `syncDevice`, `archiveProfessorMessage`, `ensureArchiveTables`
- [x] Version alignée `0.2.5-rc.2-gen2.1`
- [ ] Router extraction câblé via `wrangler.jsonc`
- [ ] Tests régression complète
- [ ] Commit stable

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

### 2026-09-06 — Phase 1 avancée
Auteur: openhands
- MASTER SPEC et MASTER CHECKLIST créés.
- `APP_VERSION` aligné entre worker.js et package.json.
- Tables Gen2 (`devices`, `sync_checkpoints`, index archive) créées dans `ensureArchiveTables`.
- Restriction applicative `MEDIA_FEATURE_ENABLED=false` reflétée dans `toolAvailability`.
- Test `orchestration-registry.test.mjs` repassé.
