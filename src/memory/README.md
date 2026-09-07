# Memory 2.0 Service

Service tier pour la gestion de la mémoire cognitive MELITURGOS Gen2.

## Objectifs

- Cycle de vie: OBSERVED → CANDIDATE → CONFIRMED → ACTIVE → SUPERSEDED
- Distinction archive vs mémoire cognitive
- Gestion des contradictions, provenance, temporalité

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

- `service.js` - MemoryService centralisé
- `lifecycle.js` - Cycle de vie automation
- `conflict.js` - Gestion contradictions
- `sources.js` - Source integration