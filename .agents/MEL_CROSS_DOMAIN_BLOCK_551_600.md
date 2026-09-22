# MEL cross-domain expert PLUS — cycles 551–600

Date: 2026-09-22
Counter after this block: `MEL_CROSS_DOMAIN_EXPERT_PLUS_cycle_600/10000`

Scope: agent/tool/MCP security boundaries. These are source-grounded design/evaluation cycles, not claims of runtime validation.

Primary/current basis consulted 2026-09-22: OWASP LLM Prompt Injection Prevention, AI Agent Security, MCP Security and Secure Coding with AI cheat sheets; MCP 2026-07-28 specification release notes (authorization issuer validation and cache metadata); Cloudflare Workers secrets, bindings, service-binding RPC and Workers best-practice documentation.

## Cycles

551. **Direct prompt injection** — Problem: user text can impersonate privileged instructions. Principle: instruction authority must be structural, not inferred from persuasive text. Limit: classifiers are bypassable. Pattern: typed trust zones + deterministic policy before model. Anti-pattern: concatenated system/user strings. Gate: adversarial corpus cannot alter protected policy. MEL: tag provenance/role before reasoning.
552. **Indirect prompt injection** — Remote pages/files are data, never authority. Limit: sanitization cannot recognize every semantic attack. Pattern: quarantine untrusted content. Anti-pattern: web text flows directly to actor model. Gate: hostile document cannot trigger a tool. MEL: retrieval output is untrusted evidence.
553. **Action-intent binding** — Proposed action must be checked against original user intent, independent of injected intermediate text. Limit: ambiguous intent may require clarification. Gate: injected email cannot expand requested action. MEL: preserve immutable task envelope.
554. **Confused deputy** — Possession of a tool is not authorization to use it for arbitrary retrieved instructions. Pattern: authorize principal+resource+action. Anti-pattern: model says “needed”. Gate: cross-principal request denied.
555. **Least-privilege tool registry** — Expose only tools required for current task/role. Limit: dynamic tasks may need explicit capability elevation. Gate: unrelated destructive tool absent. MEL: task-scoped capability sets.
556. **Per-tool parameter authorization** — Authorization includes arguments, not just tool name. Gate: allowed `read_file` cannot escape allowed path/scope. MEL: schema + policy validation after generation.
557. **High-risk approval boundary** — Irreversible/destructive/external actions require explicit approval where policy requires it. Limit: approval fatigue. Gate: delete/send/deploy path cannot execute before approval token.
558. **Decision/execution separation** — Planner cannot silently become executor for irreversible operations. Pattern: proposal artifact → policy → executor. Gate: planner output alone has no side effect.
559. **Structured tool outputs** — Validate output schema and treat free text as untrusted. Limit: schema-valid content may still be malicious. Gate: malformed/extra fields fail closed.
560. **Tool-description poisoning** — Tool descriptions are untrusted supply-chain inputs. Pattern: pin/review/hash definitions. Gate: changed description invalidates approval/cache.
561. **Tool rug pull** — A previously approved server/tool may change. Pattern: identity+version/schema fingerprint. Gate: changed fingerprint forces requalification.
562. **Cross-server shadowing** — One MCP server must not redefine semantics/identity of another. Gate: namespace collision rejected. MEL: canonical server/tool IDs.
563. **MCP issuer validation** — OAuth authorization issuer must be validated before code redemption. Gate: mix-up issuer mismatch rejected. MEL: auth metadata pinned to connection.
564. **Token audience/scope** — Tokens are server/audience scoped and never reused across unrelated MCP servers. Gate: wrong-audience token rejected.
565. **No model-only authorization** — LLM judgement can assist risk classification but cannot grant access. Gate: deterministic authorization remains authoritative.
566. **Secret non-disclosure** — Secrets never enter prompts/logs/UI unless explicitly necessary and safe. Gate: canary secret absent from traces/model context.
567. **Workers secret storage** — Sensitive values use Workers Secrets/Secrets Store, not plaintext vars/source. Gate: repository/config scan finds no live secret material.
568. **Required-secret contract** — Declare required secret names so missing deployment prerequisites fail early. Gate: candidate upload fails on missing required secret, without revealing value.
569. **Binding as capability** — Cloudflare bindings grant concrete resource capability; minimize per Worker/environment. Gate: candidate cannot access undeclared production resource.
570. **Service-binding isolation** — Prefer internal service bindings/RPC over public endpoints for internal capabilities where applicable. Limit: still requires method-level authorization. Gate: sensitive internal service has no unintended public route.
571. **Environment separation** — Preview/candidate bindings cannot alias production mutation targets. Gate: binding inventory proves distinct resource IDs.
572. **SSRF URL policy** — Agent-generated URLs need scheme/host/IP/redirect validation. Limit: DNS rebinding/redirects require revalidation. Gate: localhost, metadata, private ranges and disallowed hosts rejected.
573. **Redirect revalidation** — Every redirect target is rechecked, not inherited as trusted. Gate: public URL redirecting private is blocked.
574. **Path traversal** — Decode/canonicalize then enforce root boundary. Gate: encoded/double-encoded `..` cannot escape root.
575. **Archive traversal** — Uploaded archive entry paths are canonicalized before extraction. Gate: zip-slip corpus cannot write outside sandbox.
576. **File type distrust** — Extension/MIME/client metadata are hints, not proof. Pattern: bounded parser/magic validation. Gate: polyglot/mismatch rejected or quarantined.
577. **Upload quotas** — Bound bytes, files, expansion ratio, parse time and recursion. Gate: archive bomb stops within budget and cleans partial state.
578. **Sandbox arbitrary code** — Untrusted/generated code gets restricted filesystem/network/credentials and bounded resources. Gate: escape/canary exfiltration test fails safely.
579. **Network egress allowlist** — High-privilege execution gets explicit destinations rather than ambient internet. Gate: unexpected exfiltration domain blocked/logged.
580. **Data-flow labels** — Sensitive/untrusted/provenance labels survive tool and agent handoffs. Gate: transformation does not erase classification.
581. **Memory poisoning boundary** — Retrieved external claims cannot become durable preference/fact without validation/provenance policy. Gate: injected memory candidate stays quarantined.
582. **Cross-user/session isolation** — Memory, cache, retrieval and traces are partitioned by principal/session where required. Gate: tenant canary never appears cross-tenant.
583. **RAG exfiltration resistance** — Retrieval permissions are checked before model context assembly. Gate: prompt injection cannot retrieve unauthorized corpus.
584. **Output exfiltration controls** — Rendering/link fetching must not turn model text into credential-bearing outbound requests. Gate: hostile markdown/image URL cannot leak secrets.
585. **HTML/Markdown sanitization** — Rich model output is sanitized under a restrictive policy. Gate: script/event-handler/unsafe URL corpus inert.
586. **CSRF/action origin** — Browser-exposed state-changing endpoints require appropriate origin/auth/CSRF controls. Gate: cross-site request cannot mutate state.
587. **Replay protection** — Sensitive signed actions include nonce/time/idempotency semantics. Gate: replayed approved request does not repeat effect.
588. **Idempotent external writes** — Retries use stable operation IDs. Gate: timeout+retry yields one logical side effect.
589. **Bounded agent loops** — Enforce tool-chain, retry, token/time/cost ceilings to prevent denial-of-wallet/work. Gate: cyclic adversarial task terminates with explicit status.
590. **Failure quarantine** — Repeated failing tool/provider is isolated rather than hammered indefinitely. Gate: breaker/backoff engages and preserves resume state.
591. **Security trace correlation** — Record principal, task, tool, policy decision, effect ID and outcome without secrets. Gate: incident can reconstruct causal chain.
592. **Log redaction** — Structured logs redact credentials/PII by policy. Gate: seeded canaries absent from retained logs.
593. **Supply-chain pinning** — Dependencies/actions/tools are pinned/reviewed according to risk; mutable references are not equivalent evidence. Gate: provenance report identifies mutable dependencies.
594. **Generated-code dependency restraint** — Agent cannot silently install arbitrary packages to solve convenience problems. Gate: new dependency requires explicit allow/policy and lockfile diff.
595. **CI untrusted-input boundary** — PR/artifact content must not gain repository secrets through unsafe workflow context. Gate: fork/untrusted fixture receives no privileged credential.
596. **Capability self-knowledge** — MEL reports actual current permissions, not desired architecture. Gate: remove a binding/tool and capability answer changes accordingly.
597. **Negative tool-selection eval** — Evaluate when MEL should use no tool. Gate: adversarial irrelevant instructions do not cause side effects.
598. **Adversarial security regression** — Prompt/tool/memory/provider changes rerun injection, exfiltration and privilege-boundary suites. Gate: release blocks on regression.
599. **Security evidence ladder** — Code presence/HTTP 200 are sensors, not proof; require request→authorization→handler→effect→readback plus negative-path evidence. Gate: PASS needs observable authorized effect and denied unauthorized twin.
600. **Production invariant** — Security learning never authorizes production. Gate: candidate remains preview-only until all canonical launch gates are green and explicit production approval exists.

## Deduplicated block implications for MEL

1. Add immutable task-intent/provenance labels to every agent/tool decision and check proposed actions against them.
2. Treat web/files/RAG/tool descriptions/tool outputs as untrusted data; quarantine before privileged execution.
3. Make authorization deterministic and principal/resource/action/argument scoped; never delegate final authorization to the LLM.
4. Inventory Cloudflare bindings/secrets per environment and prove candidate/production resource separation.
5. Add security regression fixtures for indirect injection, tool poisoning/rug-pull, SSRF+redirect, traversal/archive bombs, memory poisoning, cross-tenant retrieval, replay/idempotency and bounded-loop behavior.
6. Keep production unchanged until the full canonical gate chain and explicit approval are satisfied.

ROMAN transfer correction remains active: technical density must serve medium/intention. Novel expertise requires substantial scene, desire, obstacle, subtext, sensory embodiment, material/social causality, concrete motifs and anti-fragmentation; `Le Roman des signes` 125-micro-chapter version remains a rejected draft and V2 restarts from substantial human/material-life chapters with computing only accessory.
