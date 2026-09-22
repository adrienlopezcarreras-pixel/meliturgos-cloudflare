# MEL cross-domain expertise — cycles 501–550

Date: 2026-09-22
Counter after block: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_550/10000`

This block focuses on evaluation architecture, grounding, routing, abstention, regression/adversarial sets, and observability. Each numbered cycle records a distinct falsifiable contract rather than a synthetic repetition.

## Cycles

501. **Task-level eval contract** — Problem: aggregate model scores hide whether MEL actually completes a user task. Principle: define success from observable task outcome. Counterexample: fluent answer with no persisted side effect. Gate: evaluator checks requested terminal state. MEL implication: every capability gets outcome-level acceptance criteria.
502. **Backend-state verification** — UI confirmation is not proof of mutation. Pattern: inspect database/file/API state after action. Anti-pattern: trust toast or HTTP 200. Gate: UI + backend postcondition agree.
503. **Multiple valid trajectories** — Agent tasks can have several correct paths. Pattern: grade final state and policy invariants, not an exact action trace. Gate: alternate valid trajectory passes.
504. **Trajectory constraints where necessary** — Some paths are forbidden despite correct end state. Gate: outcome success AND no forbidden action/tool/policy violation.
505. **Deterministic graders first** — Use exact/state/schema checks when truth is objective; reserve LLM judges for semantic dimensions. Gate: deterministic grader covers objective fields.
506. **Judge calibration** — LLM graders can drift. Pattern: regularly compare judge scores with expert human labels. Gate: measured agreement threshold and disagreement review queue.
507. **Judge provenance** — Store grader model/version/prompt/rubric with every score. Gate: any score can be reproduced or attributed.
508. **Judge independence** — Avoid grading with hidden access to expected answer wording when that biases style. Gate: blind semantic rubric variant agrees with deterministic facts.
509. **Pass consistency** — One lucky success is insufficient for stochastic agents. Pattern: repeated trials and consistency metric. Gate: capability threshold over repeated independent runs.
510. **Failure taxonomy** — Separate retrieval, reasoning, tool-selection, tool-execution, persistence, UI, policy, timeout failures. Gate: failed eval emits one primary cause plus evidence.
511. **Golden regression set** — Preserve previously fixed real failures. Gate: each production bug yields a minimal permanent regression case.
512. **Fresh holdout set** — Prevent tuning only to known cases. Gate: release score includes unseen/rotating cases.
513. **Adversarial paraphrases** — Robustness must survive wording changes. Gate: semantic-equivalent prompts do not materially degrade success.
514. **Ellipsis/status follow-up eval** — “and now?”, “continue”, “what about it?” require active-subject resolution. Gate: MEL identifies latest relevant task/runtime state rather than old RAG text.
515. **Contradiction precedence** — Latest explicit user constraint outranks stale memory or prior assistant claims. Gate: conflict fixture verifies source/recency precedence.
516. **Capability self-knowledge** — MEL must not claim tools it cannot execute now. Gate: declared capability matrix is generated from runtime/tool availability and tested against calls.
517. **Grounded claim atomization** — Evaluate factual claims at claim level, not response level. Gate: each material external claim maps to evidence or is labeled inference/unknown.
518. **Citation entailment** — A citation must support the attached claim, not merely mention the topic. Gate: entailment checker + sampled human audit.
519. **Citation completeness** — Supported citations on some claims do not excuse unsupported neighboring claims. Gate: material-claim coverage ratio threshold.
520. **Source quality hierarchy** — Prefer primary/current authoritative sources for volatile facts. Gate: source-type metadata and freshness requirements by domain.
521. **Freshness contract** — Time-sensitive claims need dated evidence. Gate: stale source causes abstention/research rather than confident answer.
522. **Retrieval miss detection** — No relevant evidence is a distinct state, not permission to hallucinate. Gate: low retrieval relevance triggers UNKNOWN/clarification/search.
523. **Retrieval conflict detection** — Conflicting sources must be surfaced and resolved by authority/date/context. Gate: contradictory evidence fixture cannot collapse silently.
524. **RAG role separation** — Prior assistant text is context, not authoritative fact. Gate: provenance labels distinguish user, runtime, primary source, assistant history.
525. **Memory recency weighting** — Recent explicit state should dominate old inferred preferences where incompatible. Gate: temporal conflict test.
526. **Memory scope** — A remembered constraint applies only to its intended project/domain unless explicitly generalized. Gate: cross-project contamination test.
527. **Abstention as success** — When evidence is insufficient, correct uncertainty beats fabricated completion. Gate: unanswerable cases reward calibrated abstention.
528. **Selective clarification** — Clarify only when missing information changes action materially and cannot be read from runtime. Gate: resolvable ambiguity uses tools; irreducible ambiguity asks one targeted question.
529. **Confidence calibration** — Confidence should correlate with empirical correctness, not prose tone. Gate: reliability curve/binned calibration on eval corpus.
530. **Routing by task requirements** — Choose model/provider from required capabilities, context, latency, cost ceiling, and reliability. Gate: routing fixture asserts required capability compatibility before score optimization.
531. **Routing fallback semantics** — Provider failure should not silently change behavior guarantees. Gate: fallback model meets minimum capability/policy contract or returns bounded failure.
532. **Routing observability** — Record selected provider/model, reason, fallback chain, latency, tokens, cost estimate. Gate: trace has routing decision metadata.
533. **Routing shadow eval** — Candidate routes can be compared offline/shadow without changing user-visible output. Gate: no production behavior change during shadow evaluation.
534. **Cost is not quality** — Optimize Pareto frontier, not cheapest model alone. Gate: routing benchmark tracks task success, latency and cost together.
535. **Latency tails** — Average latency hides poor UX. Gate: p50/p95/p99 per capability and provider.
536. **Timeout ambiguity** — Timeout after mutation creates UNKNOWN, not automatic retry. Gate: reconcile state/idempotency key before retry.
537. **Trace correlation** — One user task needs a stable trace/job ID across model, tool, queue and persistence boundaries. Gate: end-to-end trace can be reconstructed.
538. **Structured error semantics** — Distinguish retryable, terminal, auth, quota, schema, conflict, timeout/unknown. Gate: error class drives bounded recovery policy.
539. **Evaluation data privacy** — Logs/evals should minimize unnecessary private content. Gate: redaction/data-retention test before corpus ingestion.
540. **Evaluation provenance** — Store dataset version, source, collection time, transformations and consent/scope where relevant. Gate: every eval item has provenance metadata.
541. **Leakage control** — Training/tuning examples must not contaminate holdout claims. Gate: hash/semantic duplicate scan between training and eval partitions.
542. **Dedup semantic cases** — Near-duplicate prompts inflate scores. Gate: cluster duplicates and weight by scenario, not raw count.
543. **Slice metrics** — Aggregate score can hide failures by tool/domain/device. Gate: release report includes critical slices and minimum floors.
544. **Negative capability tests** — Verify MEL refuses or reports unsupported actions accurately. Gate: unavailable-tool fixtures cannot be reported as completed.
545. **Tool-selection eval** — Correct answer with wrong expensive/unsafe tool can be a failure. Gate: tool-choice rubric checks necessity and least-privilege path.
546. **Computer-use real environment** — Browser/computer agents require sandbox/real app execution and state inspection. Gate: screenshot/DOM action followed by backend/artifact verification.
547. **Observability deprecation resilience** — Vendor evaluation features can disappear. Current Cloudflare AI Gateway Evaluations are deprecated for new accounts. Gate: MEL's canonical eval corpus/graders remain repository/runtime owned; gateway metrics are supplemental.
548. **OTEL portability** — Export traces using open telemetry semantics where feasible. Gate: model/provider/token/cost/custom metadata can be correlated in external-compatible traces without making vendor dashboard canonical.
549. **Human feedback limitations** — Thumbs-up rate measures perception, not factual/task correctness. Gate: human preference is a separate dimension, never sole release gate.
550. **Release invariant** — No benchmark alone proves readiness. Gate: release requires regression floors + critical slice floors + deep end-to-end postconditions + no unresolved severity blockers; exact preview SHA is the evaluated artifact.

## Primary/recent source basis consulted

- Anthropic, “Demystifying evals for AI agents” — task outcome evaluation, deterministic vs LLM graders, calibration, computer-use state verification; consulted 2026-09-22.
- Anthropic, “Writing effective tools for AI agents” — real-world evaluation tasks, multiple valid paths, programmatic agent eval loops; consulted 2026-09-22.
- Anthropic, “The think tool” — repeated-run consistency / pass^k motivation for agentic tool use; consulted 2026-09-22.
- Anthropic AuditBench / Petri material — diverse auditing configurations and adversarial behavior evaluation; consulted 2026-09-22.
- Cloudflare AI Gateway Observability / Analytics / OpenTelemetry / User Insights docs, current through 2026-09-09 — request/provider/model/token/cost/error tracing and anomaly context.
- Cloudflare AI Gateway Evaluations docs, updated 2026-07-28 — explicitly deprecated for new accounts; therefore MEL must not make this vendor feature its canonical evaluation substrate.
- Google Cloud generative AI grounding documentation — grounding/RAG connects outputs to current or owned data; consulted 2026-09-22.

## Deduplication and transfer notes

Generic retry/idempotency concepts from earlier blocks were not recounted except where eval semantics add a distinct contract (UNKNOWN timeout reconciliation, routing fallback, grader reproducibility). Repository search found no `MEL_TRANSFER_*_10000.md` package, so none was ingested.

ROMAN methodological correction remains active as a cross-domain invariant: technical expertise must not dominate medium-specific aesthetic relevance. For novels, evaluate substantial scenes, desire, obstacle, subtext, sensory embodiment, material/social causality, concrete motifs/objects/places/bodies/habits/traces, and anti-fragmentation. `Le Roman des signes` 125-micro-chapter draft remains rejected; V2 restarts from substantial human/material-life chapters with computing accessory only.
