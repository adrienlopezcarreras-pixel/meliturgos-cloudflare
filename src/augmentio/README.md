# .augmentio

Provider-neutral parallel orchestration core for MELITURGOS.

Goals:
- fan out independent work across configured zero-cost resources;
- enforce a zero-euro budget by default;
- respect per-provider concurrency, health and cooldowns;
- deduplicate and cache repeat work;
- score and synthesize multiple candidate results;
- preserve provenance and make teacher escalation auditable.

This module is intentionally provider-neutral. External providers stay disabled until they are explicitly configured and authorized.
