SELECT
  (SELECT COUNT(*) FROM memories) AS total_memories,
  (SELECT COUNT(*) FROM memories WHERE source='chatgpt_context_summary') AS chatgpt_memories,
  (SELECT COUNT(*) FROM chatgpt_import_batches) AS batches,
  (SELECT source_file FROM chatgpt_import_batches ORDER BY imported_at DESC LIMIT 1) AS last_source,
  (SELECT COUNT(*) FROM chatgpt_import_batches WHERE source_file='MELITURGOS_CONTEXT_TRANSFER_MAX_2026-09-06.json') AS this_batch;
