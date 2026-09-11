# Memory 2.0 Service

Service tier pour la gestion de la mémoire cognitive MELITURGOS Gen2.

## Objectifs

- Cycle de vie: OBSERVED → CANDIDATE → CONFIRMED → ACTIVE → SUPERSEDED
- Distinction archive vs mémoire cognitive
- Gestion des contradictions, provenance, temporalité
- Conserver séparément une mémoire d'expérience du projet afin que MEL apprenne des réussites, erreurs, corrections et décisions de développement

## Trois couches de mémoire

1. **Archive conversationnelle** : historique exhaustif des échanges et événements.
2. **Mémoire cognitive** : faits, préférences, décisions et informations consolidées dans D1.
3. **Mémoire d'expérience/projet** : apprentissages du développement de MELITURGOS, erreurs à ne pas répéter, réussites, décisions d'architecture et catalogue d'outils disponibles côté Teacher/ChatGPT.

Les couches ne doivent pas être confondues. Une donnée de projet ne devient pas une permission et aucun secret ne doit être écrit dans ces fichiers.

## Mémoire d'expérience chargée par MEL

- `project-learning-ledger.js` : historique structuré des réussites, échecs, corrections, leçons, priorités et vérités actuelles du projet.
- `chatgpt-plugin-catalog.js` : catalogue des connecteurs/plugins et outils accessibles côté ChatGPT/Teacher, avec la règle stricte qu'un outil externe n'est pas automatiquement une capacité native de MEL.
- `../identity/mel-persona.js` : injecte ces deux mémoires dans le contexte d'identité de MEL afin qu'elles soient consultées à chaque conversation Gen2.

## API

```javascript
import MemoryService from "./service.js";

// Créer mémoire (OBSERVED)
const memory = await MemoryService.create(db, {
  content: "Adrien aime le chat noir",
  sourceType: "manual",
  role: "preference",
  confidence: 0.5,
  conversationId: "conv_123",
  deviceId: "device_456"
});

// Confirmer mémoire (CANDIDATE → CONFIRMED)
const confirmed = await MemoryService.confirm(db, memory.id);

// Lister mémoires
const { memories, total } = await MemoryService.list(db, {
  role: "preference",
  sourceType: "manual",
  limit: 50
});

// Trouver conflits
const { conflicts, total: conflictCount } = await MemoryService.findConflicts(db);

// Mettre à jour
const updated = await MemoryService.update(db, {
  memoryId: memory.id,
  updates: {
    confidence: 0.8,
    tags: ["borne", "chat"],
    valid_from: Date.now() - 3600000
  }
});

// Supprimer
await MemoryService.delete(db, { memoryId: memory.id });
```

## Tables D1 (à créer)

```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  source_type TEXT NOT NULL,      -- 'chatgpt', 'manual', 'auto', 'legacy'
  confidence REAL DEFAULT 0.5,    -- Incertitude 0-1
  role TEXT NOT NULL,             -- 'preference', 'fact', 'identity', 'course', 'difficulty'
  valid_from INTEGER NOT NULL,    -- Timestamp début validité
  valid_until INTEGER,            -- Timestamp fin validité (NULL = indefini)
  supersedes_id TEXT,             -- ID mémoire sujette à remplacement
  conversation_id TEXT,
  device_id TEXT,
  tags TEXT,                      -- JSON array
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_memories_role ON memories(role);
CREATE INDEX idx_memories_source ON memories(source_type, confidence);
CREATE INDEX idx_memories_validity ON memories(valid_from, valid_until);
```

## Files

- `memory-service.js` - MemoryService centralisé
- `consolidation.js` - consolidation des éléments mémoriels
- `conflicts.js` - gestion des contradictions
- `provenance.js` - provenance
- `timeline.js` - temporalité
- `knowledge-graph.js` - graphe de connaissance
- `project-learning-ledger.js` - mémoire d'expérience du projet MELITURGOS
- `chatgpt-plugin-catalog.js` - catalogue d'outils/connecteurs Teacher/ChatGPT
