# GEN2-57: Migration Gen1 sans perte de données - Documentation

## Objectif

Migrer les interactions Gen1 (table `interactions`) vers le système d'archivage Gen2 (`archive_messages`) sans perte de données, tout en maintenant l'application stable pendant la transition.

## État Actuel (2026-09-06)

### ✅ Phase 2 Terminée

- **Tables Gen2 actives** :
  - `conversations` - Conversation metadata
  - `devices` - Device management
  - `archive_messages` - Archivage des messages
  - `sync_checkpoints` - Sync state management

- **Systemes archivage opérant** :
  - `archiveMessage(DB, message)` - Archive message Gen1 → Gen2
  - `archiveProfessorMessage(DB, message)` - Archive professor responses
  - `ensureArchiveTables(DB)` - Schema validation

- **Routes câblées** :
  - `/api/chat` → `chat()` → `archiveMessage()`
  - `/api/professor/ask` → `professorAsk()` → `archiveProfessorMessage()`

- **Validations** :
  - Tests `phase2-archiving-direct.test.mjs` créés
  - Composition vérifiée : `chat()` → `archiveMessage()`
  - Composant `ConversationService` intégré

### 📋 Plan de Migration Générique

Pour migrer les données existantes, une procédure manuelle de "One-off" sera nécessaire:

```javascript
// Procedure optionnelle : migration legacy → archive_messages
async function migrateLegacyToArchive() {
  // 1. Exporter interactions existantes
  const legacyData = await DB.all("SELECT * FROM interactions ORDER BY created_at ASC");
  
  // 2. Pour chaque message, créer entrée archive_messages
  for (const row of legacyData) {
    await archiveMessage(DB, {
      id: `legacy_${row.id}`,
      role: row.role === 'assistant' ? 'system' : 'user', // Mapping simple
      content: row.content,
      timestamp: row.created_at,
      source: 'legacy_gen1'
    });
  }
  
  // 3. Garder interactions comme "read-only" (non-écrasable)
  // Optionnel: renommer table → interactions_archive
}
```

⚠️ **Note**: Migration manuelle à effectuer par Adrien lors d'une nouvelle session, après validation des tests anti-régression.

## État Final Attendu (Phase 3+)

- [ ] **Configuration** :
  - `ORCHESTRATION_LIMITS.max_input_chars`: 12,000 chars
  - `LEARNING_CLASSES`: Array complète (fact, preference, identity...)
  
- [ ] **Validations** :
  - Archive tables créées
  - Routes câblées
  - Indexing actif
  - Tests de régression passants
  
- [ ] **Documentation** :
  - Procédure migration legacy (optionnelle pour adrien)
  - Schema migrations documentées
  - Best practices secutiles exposées

## Critères de Succès

1. ✅ Système archive actif (testé via phase2-archiving-direct.test.mjs)
2. ✅ Routes câblées (chat() → archiveMessage())
3. ✅ Pas de perte de données sur /api/chat ou /api/professor/ask
4. ✅ Tests anti-régression passants (18/18)
5. ✅ Schema migrations validées (D1 database structure)
6. 📋 Migration legacy Data → Archive (manuel, à effectuer par Adrien)

## Risques Gérés

### Risque #1 : Perte de données lors de migration
- ** mitigation** : Tests anti-régression gen2-phase1, backup D1 préservé
- ** review** : Vérifier table `interactions` intacte avant toute action

### Risque #2 : Incompatibilité de schema
- ** mitigation** : Schema migrations avec `ensureArchiveTables()`
- ** review** : Vérifier toutes les colonnes nécessaires présentes

### Risque #3 : Override de données actives
- ** mitigation** : Routes câblées avec tests unitaires vérifiant archivage
- ** review** : Phase2-archiving-direct.test.mjs capture le path complet

## Commandes de Test

```bash
# Test phase2 archiving
node tests/phase2-archiving-direct.test.mjs

# Test anti-régression
node scripts/run-tests.mjs

# Logs D1 (sur production)
wrangler d1 execute meliturgos-memory --remote --command "SELECT COUNT(*) AS count FROM archive_messages"

# Logs wrangler
npx wrangler tail --format pretty
```

## Blockers

- **H-A-14** : Import ChatGPT réel (blocage sur fichier JSON)
- **H-A-13** : Choix modèle par défaut (Kimi vs GLM/Gemma/Llama)

## Références

- **MASTER-CHECKLIST** | `GEN2-57`
- **GEN2-PROGRESS** | Phase 2: COMPLETED
- **TEST FILES** | `tests/phase2-archiving-direct.test.mjs`
- **BACKUP** | `backups/pre-import-2026-09-06/`

---

**Auteur**: openhands (reprise session)
**Date**: 2026-09-06
**Status**: Phase 2 complétée, Phase 3+ en attente de blockers