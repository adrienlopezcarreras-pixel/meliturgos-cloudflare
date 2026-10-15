-- MEL evolution id v19: the supervised job queue lowercases IDs, so D1 must
-- forbid ABC/abc for the same owner. Existing conflicts stop migration safely.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mel_evolution_owner_id_nocase
 ON mel_evolution_items(owner_scope,lower(id));
