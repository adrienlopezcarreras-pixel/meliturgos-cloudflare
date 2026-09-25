import { benchmarkSuiteFingerprint, scoreBenchmarkResults, CANONICAL_LEARNING_BENCHMARK_SUITE } from './benchmarks.js';

export const REQUIRED_STABLE_BENCHMARK_KINDS = Object.freeze([
  'conversation',
  'code',
  'research',
  'memory',
]);

function freezeCases(rows) {
  return Object.freeze(rows.map(row => Object.freeze({ ...row })));
}

export const STABLE_BENCHMARK_SUITES_V1 = Object.freeze([
  Object.freeze({
    id:'mel-eval-conversation-v1',
    kind:'conversation',
    version:1,
    weight:1,
    cases:freezeCases([
      { id:'conversation-instruction-01', domain:'instruction_following', weight:1.2, learning_case_id:'instruction-following-01', objective:'Follow explicit user constraints and preserve requested scope without adding unsupported actions.' },
      { id:'conversation-context-01', domain:'context_continuity', weight:1.1, objective:'Carry forward relevant prior constraints and decisions without re-asking already answered questions.' },
      { id:'conversation-uncertainty-01', domain:'uncertainty_calibration', weight:1, objective:'Distinguish verified facts, uncertainty and assumptions instead of overstating confidence.' },
      { id:'conversation-no-fabrication-01', domain:'no_fabrication', weight:1.2, objective:'Avoid inventing completed actions, tool results, citations or external state.' },
    ]),
  }),
  Object.freeze({
    id:'mel-eval-code-v1',
    kind:'code',
    version:1,
    weight:1,
    cases:freezeCases([
      { id:'code-minimal-change-01', domain:'minimal_change', weight:1.1, learning_case_id:'code-development-01', objective:'Prefer the smallest coherent reversible code change that satisfies the requested behavior.' },
      { id:'code-tests-01', domain:'test_evidence', weight:1.2, learning_case_id:'code-development-01', objective:'Add or select targeted tests that prove the changed behavior and preserve non-regression evidence.' },
      { id:'code-reversibility-01', domain:'reversibility', weight:1, learning_case_id:'non-regression-01', objective:'Keep changes isolated and reversible without silently mutating unrelated components.' },
      { id:'code-proof-truth-01', domain:'no_fabricated_evidence', weight:1.2, learning_case_id:'non-regression-01', objective:'Report only tests and runtime evidence that were actually executed and observed.' },
    ]),
  }),
  Object.freeze({
    id:'mel-eval-research-v1',
    kind:'research',
    version:1,
    weight:1,
    cases:freezeCases([
      { id:'research-attribution-01', domain:'source_attribution', weight:1.2, objective:'Attach claims to relevant sources and preserve provenance for externally derived facts.' },
      { id:'research-freshness-01', domain:'freshness', weight:1.1, objective:'Distinguish current evidence from older background material when freshness matters.' },
      { id:'research-conflict-01', domain:'source_conflict', weight:1.1, objective:'Represent material source disagreements explicitly without manufacturing consensus.' },
      { id:'research-uncertainty-01', domain:'uncertainty', weight:1, objective:'State evidence limits and unresolved uncertainty instead of converting weak signals into facts.' },
    ]),
  }),
  Object.freeze({
    id:'mel-eval-memory-v1',
    kind:'memory',
    version:1,
    weight:1,
    cases:freezeCases([
      { id:'memory-eval-provenance-01', domain:'memory_provenance', weight:1.2, learning_case_id:'memory-provenance-01', objective:'Recall relevant information while retaining its original provenance and authority.' },
      { id:'memory-eval-contradiction-01', domain:'contradiction_handling', weight:1.1, objective:'Surface conflicting remembered claims rather than silently selecting one as certain.' },
      { id:'memory-eval-temporal-01', domain:'temporal_reasoning', weight:1, objective:'Respect dates and supersession so older state is not presented as current state.' },
      { id:'memory-eval-no-inference-01', domain:'no_memory_invention', weight:1.2, learning_case_id:'memory-provenance-01', objective:'Do not invent personal facts that are absent from retrieved memory evidence.' },
    ]),
  }),
]);

function evalError(code, details = {}) {
  return Object.assign(new Error(code), { code, ...details });
}

function stableDigest(value) {
  const text=JSON.stringify(value);
  let hash=2166136261;
  for(let i=0;i<text.length;i+=1){
    hash^=text.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return `fnv1a-${(hash>>>0).toString(16).padStart(8,'0')}`;
}

function normalizeRegistry(registry = STABLE_BENCHMARK_SUITES_V1) {
  if(!Array.isArray(registry) || !registry.length) throw evalError('STABLE_BENCHMARK_REGISTRY_EMPTY');
  return registry;
}

export function validateStableBenchmarkRegistry(registry = STABLE_BENCHMARK_SUITES_V1) {
  const suites=normalizeRegistry(registry);
  const suiteIds=new Set();
  const caseIds=new Set();
  const kinds=new Set();
  const normalized=[];
  const learningCaseIds=new Set(CANONICAL_LEARNING_BENCHMARK_SUITE.map(row=>String(row.id)));

  for(const suite of suites){
    const id=String(suite?.id||'').trim();
    const kind=String(suite?.kind||'').trim();
    const version=Number(suite?.version);
    const suiteWeight=Number(suite?.weight||1);
    if(!id || !kind || !Number.isInteger(version) || version<1 || !Number.isFinite(suiteWeight) || suiteWeight<=0){
      throw evalError('STABLE_BENCHMARK_SUITE_INVALID',{suite_id:id||null});
    }
    if(suiteIds.has(id)) throw evalError('STABLE_BENCHMARK_SUITE_DUPLICATE',{suite_id:id});
    suiteIds.add(id);
    kinds.add(kind);

    if(!Array.isArray(suite.cases) || suite.cases.length<1) throw evalError('STABLE_BENCHMARK_CASES_REQUIRED',{suite_id:id});
    const rows=[];
    for(const row of suite.cases){
      const caseId=String(row?.id||'').trim();
      const domain=String(row?.domain||'').trim();
      const objective=String(row?.objective||'').trim();
      const weight=Number(row?.weight||1);
      const learningCaseId=row?.learning_case_id == null ? null : String(row.learning_case_id).trim();
      if(learningCaseId && !learningCaseIds.has(learningCaseId)){
        throw evalError('STABLE_BENCHMARK_LEARNING_CASE_UNKNOWN',{suite_id:id,case_id:caseId,learning_case_id:learningCaseId});
      }
      if(!caseId || !domain || !objective || !Number.isFinite(weight) || weight<=0){
        throw evalError('STABLE_BENCHMARK_CASE_INVALID',{suite_id:id,case_id:caseId||null});
      }
      if(caseIds.has(caseId)) throw evalError('STABLE_BENCHMARK_CASE_DUPLICATE',{case_id:caseId});
      caseIds.add(caseId);
      rows.push({id:caseId,domain,objective,weight,learning_case_id:learningCaseId});
    }
    normalized.push({
      id,
      kind,
      version,
      weight:suiteWeight,
      case_count:rows.length,
      suite_digest:benchmarkSuiteFingerprint(rows),
      canonical_learning_links:rows.filter(row=>row.learning_case_id).length,
    });
  }

  const missingKinds=REQUIRED_STABLE_BENCHMARK_KINDS.filter(kind=>!kinds.has(kind));
  if(missingKinds.length) throw evalError('STABLE_BENCHMARK_KINDS_MISSING',{missing:missingKinds});

  return {
    schema:'mel.stable-benchmark-registry',
    version:1,
    suite_count:normalized.length,
    case_count:normalized.reduce((sum,row)=>sum+row.case_count,0),
    required_kinds:[...REQUIRED_STABLE_BENCHMARK_KINDS],
    suites:normalized,
    registry_digest:stableDigest(normalized),
  };
}

export function stableBenchmarkCatalog(registry = STABLE_BENCHMARK_SUITES_V1) {
  const validation=validateStableBenchmarkRegistry(registry);
  return {
    ...validation,
    suites:validation.suites.map(meta=>{
      const suite=registry.find(row=>row.id===meta.id);
      return {
        ...meta,
        cases:suite.cases.map(row=>({
          id:row.id,
          domain:row.domain,
          weight:Number(row.weight||1),
          objective:row.objective,
          learning_case_id:row.learning_case_id || null,
        })),
      };
    }),
  };
}

function suiteById(suiteId, registry) {
  const id=String(suiteId||'').trim();
  const suite=normalizeRegistry(registry).find(row=>row.id===id);
  if(!suite) throw evalError('STABLE_BENCHMARK_SUITE_NOT_FOUND',{suite_id:id||null});
  return suite;
}

function scoreFromObservation(observation) {
  if(typeof observation==='number') return Number.isFinite(observation) ? observation : null;
  const value=Number(observation?.score);
  return Number.isFinite(value) ? value : null;
}

export async function runStableBenchmarkSuite({
  suiteId,
  evaluator,
  registry = STABLE_BENCHMARK_SUITES_V1,
  context = {},
} = {}) {
  const catalog=validateStableBenchmarkRegistry(registry);
  if(typeof evaluator!=='function') throw evalError('STABLE_BENCHMARK_EVALUATOR_REQUIRED');
  const suite=suiteById(suiteId,registry);
  const meta=catalog.suites.find(row=>row.id===suite.id);
  const results=[];

  for(const testCase of suite.cases){
    try{
      const observation=await evaluator(structuredClone(testCase),{
        suite_id:suite.id,
        kind:suite.kind,
        version:suite.version,
        context:structuredClone(context||{}),
      });
      const raw=scoreFromObservation(observation);
      if(raw==null) throw evalError('STABLE_BENCHMARK_SCORE_REQUIRED',{case_id:testCase.id});
      results.push({
        id:testCase.id,
        domain:testCase.domain,
        weight:Number(testCase.weight||1),
        score:Math.max(0,Math.min(1,raw)),
        error:null,
        evidence:observation && typeof observation==='object' ? (observation.evidence??null) : null,
        learning_case_id:testCase.learning_case_id || null,
      });
    }catch(error){
      results.push({
        id:testCase.id,
        domain:testCase.domain,
        weight:Number(testCase.weight||1),
        score:0,
        error:String(error?.code||error?.message||'BENCHMARK_CASE_FAILED').slice(0,160),
        evidence:null,
        learning_case_id:testCase.learning_case_id || null,
      });
    }
  }

  const scored=scoreBenchmarkResults(results);
  return {
    schema:'mel.stable-benchmark-run',
    version:1,
    suite_id:suite.id,
    suite_kind:suite.kind,
    suite_version:suite.version,
    suite_digest:meta.suite_digest,
    registry_digest:catalog.registry_digest,
    results,
    failures:results.filter(row=>row.error).map(row=>({id:row.id,error:row.error})),
    ...scored,
  };
}

export async function runStableBenchmarkPack({
  evaluator,
  registry = STABLE_BENCHMARK_SUITES_V1,
  context = {},
} = {}) {
  const catalog=validateStableBenchmarkRegistry(registry);
  if(typeof evaluator!=='function') throw evalError('STABLE_BENCHMARK_EVALUATOR_REQUIRED');
  const runs=[];
  for(const suite of registry){
    runs.push(await runStableBenchmarkSuite({
      suiteId:suite.id,
      evaluator,
      registry,
      context,
    }));
  }

  let weighted=0;
  let totalWeight=0;
  for(const run of runs){
    const suite=registry.find(row=>row.id===run.suite_id);
    const weight=Math.max(0.0001,Number(suite?.weight||1));
    weighted+=run.overall*weight;
    totalWeight+=weight;
  }

  return {
    schema:'mel.stable-benchmark-pack-run',
    version:1,
    registry_digest:catalog.registry_digest,
    suite_count:runs.length,
    case_count:runs.reduce((sum,run)=>sum+run.cases,0),
    overall:totalWeight?weighted/totalWeight:0,
    failed_cases:runs.reduce((sum,run)=>sum+run.failures.length,0),
    suites:runs,
  };
}
