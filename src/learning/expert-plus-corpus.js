// Generated expert curriculum for MEL. Source-grounded cycles are guidance, not claims of runtime validation.
export const EXPERT_PLUS_SOURCE_REGISTRY = Object.freeze({
  "CF_WORKERS_LIMITS": {
    "title": "Cloudflare Workers limits",
    "url": "https://developers.cloudflare.com/workers/platform/limits/",
    "kind": "primary"
  },
  "CF_DO_RULES": {
    "title": "Cloudflare Durable Objects rules",
    "url": "https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/",
    "kind": "primary"
  },
  "CF_DO_ALARMS": {
    "title": "Cloudflare Durable Objects alarms",
    "url": "https://developers.cloudflare.com/durable-objects/api/alarms/",
    "kind": "primary"
  },
  "CF_D1_INDEXES": {
    "title": "Cloudflare D1 indexes",
    "url": "https://developers.cloudflare.com/d1/best-practices/use-indexes/",
    "kind": "primary"
  },
  "CF_D1_TIMETRAVEL": {
    "title": "Cloudflare D1 Time Travel",
    "url": "https://developers.cloudflare.com/d1/reference/time-travel/",
    "kind": "primary"
  },
  "CF_R2_API": {
    "title": "Cloudflare R2 Workers API",
    "url": "https://developers.cloudflare.com/r2/api/workers/workers-api-reference/",
    "kind": "primary"
  },
  "CF_QUEUES_DELIVERY": {
    "title": "Cloudflare Queues delivery guarantees",
    "url": "https://developers.cloudflare.com/queues/reference/delivery-guarantees/",
    "kind": "primary"
  },
  "CF_WORKFLOWS": {
    "title": "Cloudflare Workflows",
    "url": "https://developers.cloudflare.com/workflows/",
    "kind": "primary"
  },
  "GITHUB_ACTIONS_SECURITY": {
    "title": "GitHub Actions security hardening",
    "url": "https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions",
    "kind": "primary"
  },
  "GITHUB_ATTEST": {
    "title": "GitHub artifact attestations",
    "url": "https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations",
    "kind": "primary"
  },
  "OPENAI_AGENT_GUARDRAILS": {
    "title": "OpenAI Agents SDK guardrails",
    "url": "https://openai.github.io/openai-agents-js/guides/guardrails/",
    "kind": "primary"
  },
  "OPENAI_AGENT_TRACING": {
    "title": "OpenAI Agents SDK tracing",
    "url": "https://openai.github.io/openai-agents-js/guides/tracing/",
    "kind": "primary"
  },
  "W3C_WCAG22": {
    "title": "W3C WCAG 2.2",
    "url": "https://www.w3.org/TR/WCAG22/",
    "kind": "primary"
  },
  "MDN_ABORT": {
    "title": "MDN AbortController",
    "url": "https://developer.mozilla.org/en-US/docs/Web/API/AbortController",
    "kind": "primary"
  },
  "MDN_VISIBILITY": {
    "title": "MDN Page Visibility API",
    "url": "https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API",
    "kind": "primary"
  },
  "OWASP_ASVS": {
    "title": "OWASP ASVS",
    "url": "https://owasp.org/www-project-application-security-verification-standard/",
    "kind": "primary"
  },
  "OWASP_LLM": {
    "title": "OWASP GenAI Security Project",
    "url": "https://genai.owasp.org/",
    "kind": "primary"
  },
  "NIST_AI_RMF": {
    "title": "NIST AI Risk Management Framework",
    "url": "https://www.nist.gov/itl/ai-risk-management-framework",
    "kind": "primary"
  },
  "NIST_GENAI": {
    "title": "NIST Generative AI Profile",
    "url": "https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence",
    "kind": "primary"
  },
  "MEL_PROJECT": {
    "title": "MEL exact-SHA project evidence and canonical XP protocol",
    "url": ".agents/XP_PROTOCOL.md",
    "kind": "internal"
  }
});
export const EXPERT_PLUS_DOMAIN_FAMILIES = Object.freeze([
  {
    "id": "agent-orchestration",
    "sources": [
      "OPENAI_AGENT_GUARDRAILS",
      "OPENAI_AGENT_TRACING",
      "MEL_PROJECT"
    ],
    "invariant": "Every delegated action has an explicit owner, bounded scope, observable handoff and termination condition.",
    "areas": [
      "planner decomposition",
      "handoff boundaries",
      "specialist selection",
      "manager loop termination",
      "multi-agent convergence"
    ]
  },
  {
    "id": "tool-execution",
    "sources": [
      "OPENAI_AGENT_GUARDRAILS",
      "OWASP_ASVS",
      "MEL_PROJECT"
    ],
    "invariant": "Every tool call validates inputs, authority, side effects and returned evidence before its result is trusted.",
    "areas": [
      "tool schema validation",
      "side-effect isolation",
      "approval boundaries",
      "tool result grounding",
      "tool cancellation"
    ]
  },
  {
    "id": "memory-rag",
    "sources": [
      "NIST_AI_RMF",
      "NIST_GENAI",
      "MEL_PROJECT"
    ],
    "invariant": "Memory must be attributable, deduplicated, freshness-aware and retrievable without turning stale assistant text into factual authority.",
    "areas": [
      "episodic memory",
      "semantic retrieval",
      "deduplication",
      "relevance ranking",
      "memory lifecycle"
    ]
  },
  {
    "id": "knowledge-artifacts",
    "sources": [
      "NIST_GENAI",
      "OWASP_LLM",
      "MEL_PROJECT"
    ],
    "invariant": "Knowledge artifacts carry provenance, integrity, verification level and lifecycle metadata before RAG reinjection.",
    "areas": [
      "web research capture",
      "source cross-checking",
      "artifact integrity",
      "provenance tagging",
      "RAG reinjection"
    ]
  },
  {
    "id": "learning-evaluation",
    "sources": [
      "OPENAI_AGENT_TRACING",
      "NIST_AI_RMF",
      "MEL_PROJECT"
    ],
    "invariant": "Learning changes behavior only through measured corrections, comparable benchmarks and evidence-bound promotion.",
    "areas": [
      "correction corpus",
      "benchmark cadence",
      "preference pairs",
      "LoRA readiness",
      "promotion evidence"
    ]
  },
  {
    "id": "autonomy-supervision",
    "sources": [
      "CF_WORKFLOWS",
      "CF_DO_RULES",
      "MEL_PROJECT"
    ],
    "invariant": "Autonomy is resumable, bounded, truthfully observable and unable to hide repeated failures behind retries.",
    "areas": [
      "job planning",
      "lease ownership",
      "failure quarantine",
      "resume checkpoints",
      "launch readiness"
    ]
  },
  {
    "id": "shardvault-recovery",
    "sources": [
      "CF_R2_API",
      "CF_WORKERS_LIMITS",
      "MEL_PROJECT"
    ],
    "invariant": "A backup is not proven until independent replicas can reconstruct the exact expected payload under simulated loss.",
    "areas": [
      "external target discovery",
      "fragment write/read",
      "Reed-Solomon reconstruction",
      "provider rotation",
      "independent recovery proof"
    ]
  },
  {
    "id": "d1-persistence",
    "sources": [
      "CF_D1_INDEXES",
      "CF_D1_TIMETRAVEL",
      "MEL_PROJECT"
    ],
    "invariant": "Persistent state has bounded queries, explicit schema evolution, indexes for hot predicates and a tested recovery path.",
    "areas": [
      "schema evolution",
      "indexes",
      "transactions",
      "time-travel recovery",
      "query bounds"
    ]
  },
  {
    "id": "r2-storage",
    "sources": [
      "CF_R2_API",
      "CF_WORKERS_LIMITS",
      "MEL_PROJECT"
    ],
    "invariant": "Object storage verifies bytes and metadata, bounds object operations and separates durable identity from transient request state.",
    "areas": [
      "object integrity",
      "multipart lifecycle",
      "metadata consistency",
      "retention lifecycle",
      "binding boundaries"
    ]
  },
  {
    "id": "durable-coordination",
    "sources": [
      "CF_DO_RULES",
      "CF_DO_ALARMS",
      "MEL_PROJECT"
    ],
    "invariant": "Shared mutable coordination has one authoritative owner, idempotent wakeups and explicit at-least-once semantics.",
    "areas": [
      "single-owner state",
      "alarm semantics",
      "concurrency coordination",
      "idempotent wakeups",
      "cross-request state"
    ]
  },
  {
    "id": "queues-workflows",
    "sources": [
      "CF_QUEUES_DELIVERY",
      "CF_WORKFLOWS",
      "MEL_PROJECT"
    ],
    "invariant": "Asynchronous work assumes duplicate delivery, persists checkpoints and isolates poison work without losing progress.",
    "areas": [
      "at-least-once delivery",
      "deduplication",
      "dead-letter handling",
      "checkpointing",
      "long-running orchestration"
    ]
  },
  {
    "id": "network-provider",
    "sources": [
      "MDN_ABORT",
      "CF_WORKERS_LIMITS",
      "MEL_PROJECT"
    ],
    "invariant": "External providers use bounded deadlines, semantic error parsing, rate-aware retry budgets and replaceable adapters.",
    "areas": [
      "timeouts",
      "rate limits",
      "semantic provider errors",
      "redirect safety",
      "fallback rotation"
    ]
  },
  {
    "id": "security-auth",
    "sources": [
      "OWASP_ASVS",
      "OWASP_LLM",
      "NIST_AI_RMF"
    ],
    "invariant": "Authority is least-privileged, explicit, scoped to the action and never inferred from mere credential presence.",
    "areas": [
      "least privilege",
      "secret handling",
      "authentication scope",
      "authorization policy",
      "credential rotation"
    ]
  },
  {
    "id": "research-provenance",
    "sources": [
      "NIST_GENAI",
      "NIST_AI_RMF",
      "MEL_PROJECT"
    ],
    "invariant": "Claims are mapped to current sources, conflicts remain visible and freshness is part of factual confidence.",
    "areas": [
      "freshness",
      "source authority",
      "claim-to-source mapping",
      "conflict resolution",
      "citation integrity"
    ]
  },
  {
    "id": "ui-accessibility",
    "sources": [
      "W3C_WCAG22",
      "MDN_VISIBILITY",
      "MEL_PROJECT"
    ],
    "invariant": "Every user-visible capability remains operable by keyboard, named accessibly and honest about pending, failure and success state.",
    "areas": [
      "keyboard operation",
      "focus management",
      "accessible names",
      "target sizing",
      "live status feedback"
    ]
  },
  {
    "id": "ui-performance",
    "sources": [
      "CF_WORKERS_LIMITS",
      "MDN_VISIBILITY",
      "MDN_ABORT"
    ],
    "invariant": "Interfaces minimize polling, duplicate listeners, payload size and hidden work without removing capability.",
    "areas": [
      "polling cadence",
      "visibility awareness",
      "payload shaping",
      "lazy loading",
      "listener cleanup"
    ]
  },
  {
    "id": "media-voice-files",
    "sources": [
      "CF_WORKERS_LIMITS",
      "OWASP_ASVS",
      "MDN_ABORT"
    ],
    "invariant": "Media and file flows validate type, size, lifecycle and cancellation before expensive parsing or persistence.",
    "areas": [
      "upload validation",
      "audio transcription",
      "media lifecycle",
      "file type handling",
      "large payload streaming"
    ]
  },
  {
    "id": "browser-device-control",
    "sources": [
      "OWASP_ASVS",
      "OPENAI_AGENT_GUARDRAILS",
      "MEL_PROJECT"
    ],
    "invariant": "External control surfaces expose capability state, authority and user-visible effects instead of assuming a companion exists.",
    "areas": [
      "browser companion",
      "desktop control",
      "device protocol",
      "capability detection",
      "human-visible state"
    ]
  },
  {
    "id": "ci-release-supply-chain",
    "sources": [
      "GITHUB_ACTIONS_SECURITY",
      "GITHUB_ATTEST",
      "MEL_PROJECT"
    ],
    "invariant": "Promotion follows exact-SHA evidence, isolated preview, supply-chain controls and post-deploy verification.",
    "areas": [
      "exact-SHA validation",
      "dependency pinning",
      "artifact provenance",
      "preview isolation",
      "post-deploy smoke"
    ]
  },
  {
    "id": "observability-audit",
    "sources": [
      "OPENAI_AGENT_TRACING",
      "NIST_AI_RMF",
      "MEL_PROJECT"
    ],
    "invariant": "Audits distinguish sensor failure from product failure and retain enough structured evidence to replay causality.",
    "areas": [
      "structured tracing",
      "failure evidence",
      "correlation ids",
      "audit replay",
      "capability truthfulness"
    ]
  }
]);
export const EXPERT_PLUS_LENS_FAMILIES = Object.freeze([
  {
    "id": "state-machine",
    "principle": "Model allowed transitions explicitly and reject impossible or ambiguous states.",
    "limit": "A green happy path does not prove interrupted or resumed transitions.",
    "pattern": "assert precondition -> mutate once -> persist state -> assert postcondition",
    "anti": "implicit state inferred from UI text or last response",
    "gate": "exercise transition and verify durable state",
    "variants": [
      "happy-path transition",
      "illegal transition",
      "partial transition",
      "resume transition",
      "terminal transition"
    ]
  },
  {
    "id": "idempotency",
    "principle": "Repeated delivery must not duplicate side effects.",
    "limit": "An idempotency key that expires before retries finish is not sufficient.",
    "pattern": "stable operation id + dedupe record + replay-safe result",
    "anti": "perform side effect before dedupe check",
    "gate": "replay the same operation and compare side effects",
    "variants": [
      "duplicate request",
      "replayed event",
      "concurrent duplicate",
      "retry after partial success",
      "dedupe expiry"
    ]
  },
  {
    "id": "timeouts",
    "principle": "Every external wait consumes an explicit deadline budget and propagates cancellation.",
    "limit": "A request timeout alone does not cancel nested work already started elsewhere.",
    "pattern": "deadline budget + AbortSignal propagation + cleanup",
    "anti": "unbounded await or stacked independent timeouts",
    "gate": "inject a hung dependency and observe bounded termination",
    "variants": [
      "slow provider",
      "hung provider",
      "deadline budget",
      "nested timeout",
      "cancellation propagation"
    ]
  },
  {
    "id": "retries",
    "principle": "Retry only failures classified as transient, with provider-aware delay and a finite budget.",
    "limit": "HTTP 200 can still contain a semantic rate-limit or provider error.",
    "pattern": "classify -> honor Retry-After/semantic wait -> jittered bounded retry -> quarantine",
    "anti": "retry every error at fixed cadence",
    "gate": "simulate transient, semantic-rate-limit and permanent failures",
    "variants": [
      "transient retry",
      "backoff growth",
      "Retry-After compliance",
      "retry budget exhaustion",
      "permanent error stop"
    ]
  },
  {
    "id": "concurrency",
    "principle": "Shared writes require an authoritative owner or compare-and-swap style freshness check.",
    "limit": "Single-threaded code can still race across requests or agents.",
    "pattern": "re-read authoritative version immediately before write",
    "anti": "write from a stale snapshot because the task started first",
    "gate": "run competing writers and prove no lost update",
    "variants": [
      "race on shared state",
      "stale read",
      "lost update",
      "double writer",
      "lease contention"
    ]
  },
  {
    "id": "integrity",
    "principle": "Verify content identity independently of location or transport success.",
    "limit": "Successful upload/download status does not prove the bytes are correct.",
    "pattern": "length + cryptographic hash + expected identity",
    "anti": "trust provider status or filename as integrity",
    "gate": "corrupt one byte and require detection",
    "variants": [
      "hash verification",
      "length verification",
      "schema digest",
      "artifact tampering",
      "cross-store mismatch"
    ]
  },
  {
    "id": "authorization",
    "principle": "Check the principal, action, resource and scope at the point of use.",
    "limit": "Authentication proves identity, not permission for every tool.",
    "pattern": "explicit scope check immediately before side effect",
    "anti": "credential present => authorized",
    "gate": "attempt wrong-scope and expired-principal operations",
    "variants": [
      "missing permission",
      "overbroad permission",
      "wrong principal",
      "expired credential",
      "cross-scope reuse"
    ]
  },
  {
    "id": "failure-truth",
    "principle": "Represent unknown, partial and failed states distinctly from success.",
    "limit": "A failing observer does not prove the observed system failed.",
    "pattern": "separate transport, provider, product and evidence status",
    "anti": "convert missing evidence into success or global incapacity",
    "gate": "remove one observation channel and compare independent evidence",
    "variants": [
      "sensor failure",
      "partial success",
      "unknown state",
      "semantic provider failure",
      "stale success"
    ]
  },
  {
    "id": "observability",
    "principle": "Trace causality across user request, planner, tool, persistence and recovery boundaries.",
    "limit": "High-volume logs without correlation are not actionable evidence.",
    "pattern": "correlation id + bounded structured spans + redaction",
    "anti": "free-form logs with secrets or no operation identity",
    "gate": "reconstruct one failure end-to-end from retained evidence",
    "variants": [
      "trace completeness",
      "cause correlation",
      "redaction",
      "metric cardinality",
      "evidence retention"
    ]
  },
  {
    "id": "performance",
    "principle": "Measure startup, CPU, memory, I/O and payload amplification separately.",
    "limit": "Reducing one metric can shift cost to another boundary.",
    "pattern": "measure baseline -> change one bottleneck -> compare p50/p95 and bounds",
    "anti": "optimize by intuition without before/after evidence",
    "gate": "budget the selected resource and stress the bound",
    "variants": [
      "startup cost",
      "CPU bound",
      "memory bound",
      "I/O bound",
      "payload amplification"
    ]
  },
  {
    "id": "schema-versioning",
    "principle": "Persisted and cross-boundary data needs explicit version tolerance.",
    "limit": "Tests with only the newest producer and consumer miss rolling-upgrade failures.",
    "pattern": "version field + tolerant reader + migration proof",
    "anti": "breaking rename with no compatibility window",
    "gate": "read old/new fixtures through current code",
    "variants": [
      "backward compatibility",
      "forward compatibility",
      "unknown field",
      "migration interruption",
      "old client"
    ]
  },
  {
    "id": "recovery",
    "principle": "Recovery must be executable from durable evidence, not merely documented.",
    "limit": "A backup copy is not a restore proof.",
    "pattern": "independent restore/reconstruct -> integrity verify -> resume",
    "anti": "declare protected after write-only backup test",
    "gate": "destroy or hide the primary source and recover",
    "variants": [
      "rollback",
      "point-in-time restore",
      "rebuild from replicas",
      "resume checkpoint",
      "disaster bootstrap"
    ]
  },
  {
    "id": "chaos-loss",
    "principle": "Exercise combinations of realistic losses up to the promised tolerance.",
    "limit": "One canned failure pattern can miss index- or provider-specific coupling.",
    "pattern": "systematic loss matrix + exact output comparison",
    "anti": "single happy-path recovery demo",
    "gate": "enumerate supported loss combinations",
    "variants": [
      "single dependency loss",
      "three-fragment loss",
      "network partition",
      "provider outage",
      "corrupted replica"
    ]
  },
  {
    "id": "adversarial-security",
    "principle": "Treat model text, web content and external metadata as untrusted input to tools.",
    "limit": "Prompt-only instructions do not enforce tool security.",
    "pattern": "structured parser + allowlist + tool guardrail + output validation",
    "anti": "concatenate untrusted text into privileged commands",
    "gate": "inject prompt, SSRF, exfiltration and malformed payload cases",
    "variants": [
      "prompt injection",
      "SSRF attempt",
      "data exfiltration",
      "tool abuse",
      "malformed payload"
    ]
  },
  {
    "id": "freshness-provenance",
    "principle": "Freshness and provenance are first-class dimensions of knowledge quality.",
    "limit": "A historically correct source can be wrong for a current-state query.",
    "pattern": "source timestamp + authority + claim mapping + conflict note",
    "anti": "reuse stale answer because wording matches",
    "gate": "replace a source with a newer contradictory source and rerank",
    "variants": [
      "stale source",
      "conflicting sources",
      "missing provenance",
      "source downgrade",
      "time-sensitive fact"
    ]
  },
  {
    "id": "ux-accessibility",
    "principle": "A capability is incomplete if state or controls are inaccessible on keyboard, assistive tech or constrained screens.",
    "limit": "Visual success on one desktop viewport is not sufficient.",
    "pattern": "semantic control + focus discipline + responsive state + recovery action",
    "anti": "click-only unlabeled control or invisible error",
    "gate": "keyboard, screen-reader semantics, narrow viewport and error-path audit",
    "variants": [
      "keyboard only",
      "screen reader",
      "mobile narrow view",
      "slow network UI",
      "error recovery UX"
    ]
  },
  {
    "id": "cost-quota",
    "principle": "Budget is a runtime constraint with explicit zero-spend defaults and quota-aware degradation.",
    "limit": "Free today does not guarantee free under volume or provider policy change.",
    "pattern": "cost policy + quota observation + bounded fanout + fallback",
    "anti": "credential availability silently enables spend",
    "gate": "force quota exhaustion and verify no unauthorized paid path",
    "variants": [
      "free-tier ceiling",
      "quota exhaustion",
      "unexpected billing path",
      "high fanout",
      "storage growth"
    ]
  },
  {
    "id": "testing-evidence",
    "principle": "Match the claimed capability level to the strongest relevant test level.",
    "limit": "Unit green cannot substitute for external E2E proof.",
    "pattern": "unit -> integration -> live E2E -> stress/regression as claim requires",
    "anti": "promote from mocks alone",
    "gate": "link each capability claim to exact-SHA evidence",
    "variants": [
      "unit contract",
      "integration path",
      "end-to-end proof",
      "stress proof",
      "regression proof"
    ]
  },
  {
    "id": "deployment-rollout",
    "principle": "Separate candidate validation, promotion and post-deploy observation.",
    "limit": "A production smoke run before the deploy cannot prove the new release.",
    "pattern": "exact SHA preview -> promote exact tree -> deploy -> later live smoke",
    "anti": "infer causality from nearby timestamps",
    "gate": "verify run chronology and deployed tree identity",
    "variants": [
      "candidate preview",
      "canary",
      "promotion",
      "rollback release",
      "post-deploy verification"
    ]
  },
  {
    "id": "learning-feedback",
    "principle": "Promote lessons only when reusable, deduplicated and supported by evidence.",
    "limit": "A large corpus can amplify duplicated or contradictory mistakes.",
    "pattern": "capture -> dedupe -> validate -> benchmark -> retain/retire",
    "anti": "count lessons as progress without quality gates",
    "gate": "inject duplicate and contradictory lessons and inspect selection",
    "variants": [
      "new correction",
      "duplicate lesson",
      "contradictory lesson",
      "benchmark regression",
      "lesson retirement"
    ]
  }
]);
export const EXPERT_PLUS_DISTILLED_XP_IDS = Object.freeze([
  "shardvault-representative-payload-proof-20260920",
  "shardvault-semantic-rate-limit-20260920",
  "shardvault-independent-exact-sha-restore-gate-20260920",
  "knowledge-routing-specificity-precedence-20260920",
  "knowledge-artifact-integrity-provenance-20260920",
  "shardvault-resumable-external-replication-20260920",
  "provider-capacity-conservative-registry-20260920",
  "ci-test-expectation-follows-intentional-contract-20260920",
  "expert-corpus-runtime-distillation-20260920",
  "audit-sensor-vs-product-proof-chain-20260920"
]);

function normalize(value){
  return String(value||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
}
function expandDomains(){
  const rows=[];
  for(const family of EXPERT_PLUS_DOMAIN_FAMILIES){
    for(let i=0;i<family.areas.length;i++) rows.push({
      id: family.id+'-'+String(i+1).padStart(2,'0'),
      family: family.id,
      area: family.areas[i],
      invariant: family.invariant,
      sources: family.sources
    });
  }
  return rows;
}
function expandLenses(){
  const rows=[];
  for(const family of EXPERT_PLUS_LENS_FAMILIES){
    for(let i=0;i<family.variants.length;i++) rows.push({
      id: family.id+'-'+String(i+1).padStart(2,'0'),
      family: family.id,
      variant: family.variants[i],
      principle: family.principle,
      limitation: family.limit,
      pattern: family.pattern,
      antipattern: family.anti,
      gate: family.gate
    });
  }
  return rows;
}
export const EXPERT_PLUS_DOMAIN_COUNT = EXPERT_PLUS_DOMAIN_FAMILIES.reduce((n,row)=>n+row.areas.length,0);
export const EXPERT_PLUS_LENS_COUNT = EXPERT_PLUS_LENS_FAMILIES.reduce((n,row)=>n+row.variants.length,0);
export const EXPERT_PLUS_CYCLE_COUNT = EXPERT_PLUS_DOMAIN_COUNT * EXPERT_PLUS_LENS_COUNT;

function makeCycle(domain,lens,index){
  const source_basis=domain.sources.map(id=>({id,...EXPERT_PLUS_SOURCE_REGISTRY[id]})).filter(row=>row.url);
  return {
    id:'mel-expert-plus-'+String(index+1).padStart(5,'0'),
    domain:domain.family,
    subdomain:domain.area,
    lens:lens.family,
    scenario:lens.variant,
    problem:'Audit '+domain.area+' under '+lens.variant+': determine whether MEL preserves '+domain.invariant.toLowerCase(),
    source_basis,
    principle:domain.invariant+' '+lens.principle,
    limitation_counterexample:lens.limitation,
    pattern:lens.pattern,
    antipattern:lens.antipattern,
    test_gate:lens.gate+' for '+domain.area+' and retain exact evidence.',
    mel_implication:'Before claiming '+domain.area+' ready, apply the '+lens.family+' gate for '+lens.variant+', record layer-specific evidence, and create canonical XP only if the lesson is proven and reusable.',
    status:'SOURCE_GROUNDED_GUIDANCE'
  };
}

export function buildExpertPlusCycles({domain=null,lens=null,limit=null}={}){
  const domains=expandDomains().filter(row=>!domain||row.family===domain||row.id===domain);
  const lenses=expandLenses().filter(row=>!lens||row.family===lens||row.id===lens);
  const out=[];
  let globalIndex=0;
  const allDomains=expandDomains();
  const allLenses=expandLenses();
  const domainIndex=new Map(allDomains.map((row,i)=>[row.id,i]));
  const lensIndex=new Map(allLenses.map((row,i)=>[row.id,i]));
  for(const d of domains){
    for(const l of lenses){
      globalIndex=domainIndex.get(d.id)*allLenses.length+lensIndex.get(l.id);
      out.push(makeCycle(d,l,globalIndex));
      if(Number(limit)>0&&out.length>=Number(limit)) return out;
    }
  }
  return out;
}

export function searchExpertPlusCycles(query,{limit=24}={}){
  const terms=normalize(query).split(/\s+/).filter(Boolean);
  if(!terms.length)return [];
  const cap=Math.max(1,Math.min(200,Number(limit)||24));
  const out=[];
  for(const cycle of buildExpertPlusCycles()){
    const hay=normalize([cycle.domain,cycle.subdomain,cycle.lens,cycle.scenario,cycle.problem,cycle.principle,cycle.test_gate,cycle.mel_implication].join(' '));
    let score=0;
    for(const term of terms) if(hay.includes(term)) score+=term.length>5?2:1;
    if(score>0)out.push({score,cycle});
  }
  out.sort((a,b)=>b.score-a.score||a.cycle.id.localeCompare(b.cycle.id));
  return out.slice(0,cap).map(row=>row.cycle);
}

export function expertPlusSummary(){
  return {
    status:'COMPLETED',
    cycles:EXPERT_PLUS_CYCLE_COUNT,
    domains:EXPERT_PLUS_DOMAIN_COUNT,
    lenses:EXPERT_PLUS_LENS_COUNT,
    distilled_lessons:EXPERT_PLUS_DISTILLED_XP_IDS.length,
    runtime_policy:'ON_DEMAND_GUIDANCE_PLUS_VALIDATED_DISTILLATION'
  };
}
