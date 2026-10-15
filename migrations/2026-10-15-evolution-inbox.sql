-- MEL evolution inbox v1. Apply during controlled D1 schema migration before enabling capabilities.
-- Separate owner-scoped proposals from historical, immutable initial roadmap certification.
CREATE TABLE IF NOT EXISTS mel_evolution_items (
  owner_scope TEXT NOT NULL,
  id TEXT NOT NULL,
  canonical_title TEXT NOT NULL,
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (owner_scope, id),
  UNIQUE (owner_scope, canonical_title)
);
CREATE INDEX IF NOT EXISTS idx_mel_evolution_owner_updated
  ON mel_evolution_items(owner_scope, updated_at DESC);

-- Historical snapshot is deliberately not auto-populated from a live registry.
-- Closure must be explicitly certified, with a source SHA and evidence.
CREATE TABLE IF NOT EXISTS mel_evolution_initial_archive (
  archive_id TEXT PRIMARY KEY,
  source_sha TEXT NOT NULL,
  verified_count INTEGER NOT NULL,
  total_count INTEGER NOT NULL,
  proof_reference TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  CHECK (verified_count >= 0 AND total_count >= verified_count),
  CHECK (length(source_sha) = 40)
);
