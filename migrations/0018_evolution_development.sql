-- Evolution & Development, additive and idempotent. Applies to Wrangler-managed
-- preview/production migrations as well as the code migration v18.
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
CREATE INDEX IF NOT EXISTS idx_mel_evolution_owner_updated ON mel_evolution_items(owner_scope,updated_at DESC);
CREATE TABLE IF NOT EXISTS mel_evolution_initial_archive (
 archive_id TEXT PRIMARY KEY,
 source_sha TEXT NOT NULL CHECK (length(source_sha) = 40),
 verified_count INTEGER NOT NULL CHECK (verified_count >= 0),
 total_count INTEGER NOT NULL CHECK (total_count >= verified_count),
 proof_reference TEXT NOT NULL,
 closed_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS mel_evolution_archive_no_update BEFORE UPDATE ON mel_evolution_initial_archive BEGIN SELECT RAISE(ABORT, 'ARCHIVE_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS mel_evolution_archive_no_delete BEFORE DELETE ON mel_evolution_initial_archive BEGIN SELECT RAISE(ABORT, 'ARCHIVE_IMMUTABLE'); END;
