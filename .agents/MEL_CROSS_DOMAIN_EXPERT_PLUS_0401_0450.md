# MEL Cross-domain Expert PLUS — cycles 401–450

Counter after this block: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_450/10000`

Provenance: additive block prepared from candidate HEAD `a7c1f932c22ead0bd6f518e48eb7cd939042949b`. No production action authorized. No private autobiographical material included. Format: problem → principle/limit → pattern/anti-pattern → falsifiable gate → MEL implication.

## Primary/recent sources reviewed 2026-09-21
- NIST NCCoE, Software/AI Agent Identity and Authorization concept, 2026-02-05: https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents
- NIST CAISI, agent-security RFI summary, NIST AI 800-5, 2026-05-18: https://www.nist.gov/publications/summary-analysis-responses-request-information-regarding-security-considerations-ai
- NIST, continuous monitor/update AI security model, 2026-06-09: https://www.nist.gov/news-events/news/2026/06/nist-mathematical-proof-supports-transition-continuous-monitor-and-update
- Cloudflare Workers Best Practices, updated 2026-08-20: https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- Cloudflare Workers Secrets, updated 2026-07-03: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare Dynamic Workers egress control, updated 2026-04-21: https://developers.cloudflare.com/dynamic-workers/usage/egress-control/
- OWASP Agentic AI Cornucopia AAI2/AAI6/AAI8 and Secure Coding with AI MCP/tool guidance: https://cornucopia.owasp.org/cards/AAI2 ; https://cornucopia.owasp.org/cards/AAI6 ; https://cornucopia.owasp.org/cards/AAI8 ; https://cheatsheetseries.owasp.org/cheatsheets/Secure_Coding_with_AI_Cheat_Sheet.html

401. Agent identity → every autonomous actor needs distinguishable identity → shared credentials erase attribution → two-agent audit fixture → MEL records actor/session/job identity on effects.
402. Delegated authority → agent authority must derive from user/service authorization, not model confidence → broad service accounts overreach → cross-user denial fixture → MEL checks authority per operation.
403. Per-request authorization → initialization-time permission is insufficient for later data reads → permissions can change mid-session → revoke-then-query fixture → MEL revalidates protected access.
404. Least privilege → provision only capabilities needed for current task → permanent broad tools enlarge blast radius → capability-minimum fixture → MEL narrows tool scope by task.
405. Authority attenuation → delegated subagents cannot silently gain privileges parent lacks → convenience escalation breaks trust boundary → child-escalation fixture → MEL propagates bounded authority.
406. Non-repudiation → mutating actions need actor, intent, correlation and result evidence → logs alone can be incomplete → mutation-trace fixture → MEL links request to observed postcondition.
407. Prompt injection boundary → external/user/retrieved content is data, not policy → textual claims of authority are forgeable → injected-policy fixture → MEL never elevates untrusted instructions.
408. Indirect injection → documents/web/tool output can carry adversarial instructions → source reputation does not make embedded commands trusted → poisoned-document fixture → MEL sanitizes authority semantics, not merely text.
409. Tool-description injection → discovered schemas/descriptions are also untrusted supply-chain input → MCP metadata can steer model → malicious-description fixture → MEL pins/compares approved tool definitions.
410. Tool shadowing → duplicate/similar tool names can redirect calls → name alone is not identity → shadow-server fixture → MEL binds calls to server identity + schema fingerprint.
411. Schema drift → approved tool behavior can change after discovery → static allowlist by name is weak → schema-change fixture → MEL requires review/revalidation for material drift.
412. Mutation confirmation boundary → irreversible/high-impact actions need stronger intent evidence → blanket confirmations cripple safe automation → risk-tier fixture → MEL gates by effect class and authorization.
413. Planning/execution split → discussing an action is not permission to execute → natural language ambiguity is common → hypothetical-request fixture → MEL maintains explicit execution state.
414. Data/tool separation → retrieved text cannot directly populate privileged parameters without validation → injection can smuggle destinations/recipients → adversarial-parameter fixture → MEL validates parameter provenance.
415. Input allowlisting → tool parameters require type/range/pattern/domain checks → schema-valid can still be semantically dangerous → hostile-URL fixture → MEL adds semantic policy validators.
416. SSRF containment → autonomous fetch must not expose internal/private endpoints → URL syntax validation alone misses redirects/DNS changes → redirect/rebinding fixture → MEL applies destination policy across hops.
417. Egress deny-by-default → untrusted/generated execution should have no network except required destinations → unrestricted fetch enables exfiltration → forbidden-host fixture → MEL isolates execution egress where platform supports it.
418. Credential injection → downstream credentials should be added by trusted boundary, not exposed to generated code → environment-wide secrets leak across tools → exfiltration fixture → MEL keeps secrets outside model/code payloads.
419. Secret storage → credentials belong in secret bindings, never source/config/logs → secret bindings do not prevent accidental runtime logging → repository/log scan fixture → MEL redacts and scans both paths.
420. Secret minimization → each component receives only secrets it needs → one Worker env can become universal credential bag → missing-secret positive/negative fixtures → MEL scopes bindings by service.
421. Secret rotation → credentials must be replaceable without code semantic changes → long-lived credentials increase compromise window → rotate-under-load fixture → MEL treats auth failure as possible rotation state.
422. Outbound audit → log destination/operation metadata without secret-bearing payloads → full HTTP logging can itself leak → redaction fixture → MEL keeps egress observability with bounded metadata.
423. Sandbox boundary → generated/untrusted code executes isolated from host filesystem/process/network → sandbox escape is never assumed impossible → escape-attempt fixture → MEL layers isolation and effect limits.
424. Runtime compatibility date → platform behavior is versioned input → blindly jumping dates can alter semantics → staged-date CI fixture → MEL tests compatibility-date upgrades in candidate first.
425. Cryptographic randomness → security tokens use Web Crypto/CSPRNG, never Math.random → UUID uniqueness is not authorization → statistical/static scan fixture → MEL separates identifier generation from access checks.
426. Idempotency key scope → mutating retries need stable operation identity → reusing keys across distinct intents suppresses valid work → replay/new-intent fixture → MEL keys include operation scope and canonical intent.
427. Timeout reconciliation → timeout means unknown outcome, not failure → blind retry duplicates side effects → delayed-success fixture → MEL reads state before retry.
428. Retry budget → retries are bounded with backoff/jitter and terminal diagnosis → infinite resilience loops become load amplifiers → persistent-failure fixture → MEL exposes exhausted budget.
429. Circuit breaking → repeated downstream faults should shed work temporarily → global breaker can block unrelated tenants/tasks → scoped-failure fixture → MEL keys breaker to dependency/failure domain.
430. Queue delivery semantics → assume at-least-once unless proven otherwise → duplicate delivery is normal failure mode → duplicate-message fixture → MEL consumers converge idempotently.
431. Poison job handling → permanently invalid jobs must stop recycling → dead-lettering without diagnosis hides systemic bugs → deterministic-bad-job fixture → MEL records cause and isolates payload safely.
432. Job leases → concurrent workers must not both own one mutation indefinitely → expired leases can overlap slow worker → lease-expiry fixture → MEL combines lease with idempotent commit guard.
433. Fencing tokens → stale workers must be unable to commit after newer owner → locks alone fail under pauses → stale-owner fixture → MEL validates monotonic generation on commit.
434. Durable workflow checkpoints → persist semantic progress at safe boundaries → checkpointing before effect confirmation creates false completion → crash-between-effect/readback fixture → MEL checkpoints observed postconditions.
435. Compensation semantics → rollback is not assumed possible → compensating action may differ from erasure → partial-failure fixture → MEL reports irreversible residue explicitly.
436. Concurrency graph → parallelize independent reads, serialize conflicting writes → blanket serialization wastes latency → resource-conflict fixture → MEL scheduler uses declared read/write sets.
437. TOCTOU authorization → permission checked before a long plan can become stale at effect time → repeated checks have cost → revoke-before-commit fixture → MEL rechecks high-impact commit boundary.
438. Cross-user isolation → connector/data retrieval must enforce requesting principal every query → model context can contain another user's identifiers → foreign-record fixture → MEL cannot use remembered IDs to bypass ACLs.
439. Privacy minimization → collect only data needed for task/evidence → “memory everything” conflicts with least-data principles → irrelevant-sensitive-field fixture → MEL separates useful memory from unnecessary capture.
440. Audit minimization → security logs need enough evidence but not wholesale private content → overlogging creates secondary breach surface → log-inspection fixture → MEL stores hashes/metadata/redacted excerpts when sufficient.
441. Provenance chain → external facts/actions carry source, timestamp, authority and transformation lineage → provenance can itself be spoofed by content → forged-metadata fixture → MEL provenance comes from trusted adapters.
442. Continuous red teaming → finite guardrails cannot justify permanent robustness claims → tests age as attacks adapt → newly seeded attack fixture → MEL security gate is continuously refreshed.
443. Security regression corpus → every confirmed exploit becomes a durable test → exact-string tests overfit → paraphrase/structural variants fixture → MEL stores exploit class plus variants.
444. Blast-radius design → assume some control eventually fails → prevention-only architecture is brittle → compromised-agent simulation → MEL limits reachable data/tools/effects.
445. Recovery objective → security includes rapid containment/recovery, not just blocking → automatic recovery can erase forensic evidence → incident fixture → MEL snapshots evidence before safe reset where feasible.
446. Capability truthfulness → agent reports only capabilities proven in current runtime → configured tool is not working tool → revoke/broken-binding fixture → MEL status distinguishes configured/discovered/authorized/proven.
447. Fail-closed mutation → uncertain authorization/policy blocks mutation while preserving diagnostic reads → fail-closed everywhere can destroy availability → auth-service-failure fixture → MEL degrades to read/diagnostic mode.
448. Fail-safe read paths → observability needed during incidents must not require dangerous mutation privileges → diagnostics can leak secrets → degraded-mode fixture → MEL offers redacted health/readback endpoints.
449. Security/performance balance → policy checks should be cached only within safe freshness bounds → stale auth cache violates revocation → revoke-during-TTL fixture → MEL separates immutable schema cache from dynamic authorization.
450. Pre-send security consistency → before claiming autonomous completion, reconcile intent, authority, tool identity, postcondition and current runtime → fluent model output can hide any missing link → mixed-fault end-to-end fixture → MEL says completed only when the full evidence chain is observed.

## Deduplication / transfer notes
This block specializes prior generic tool safety into identity/authorization, prompt-injection containment, MCP supply-chain identity, egress/secrets, autonomous-job concurrency/idempotence, privacy/provenance and continuous security regression. Repository transfer search returned no discoverable `MEL_TRANSFER_*_10000.md`; none ingested. Standing ROMAN correction remains active: aesthetic/narrative expertise must not be collapsed into technical protocol density; `Le Roman des signes` 125-micro-chapter draft remains rejected and V2 is treated as a from-zero substantive-scene rewrite when a ROMAN transfer appears.

## Run checkpoint 2026-09-21 — cycles 401–450
- `head_initial`: `a7c1f932c22ead0bd6f518e48eb7cd939042949b`
- pre-write HEAD recheck: unchanged (`a7c1f932c22ead0bd6f518e48eb7cd939042949b`)
- cycles completed: 50; additive counter: 450/10000
- transfer packages ingested: none
- code/process/button changes: none; expert-corpus advancement only
- stress tests: none; no runtime/code mutation
- production: untouched
- `remaining_open`: cycles 451–10000; periodic transfer ingestion; after completion full audit/repair/stress
- `next_exact_fix`: cycles 451–500 on Cloudflare state/concurrency, D1/R2/Queues/DO/Workflows failure semantics and measurable UI/API performance gates, then map those gates to candidate defects without production mutation.
