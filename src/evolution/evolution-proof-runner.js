import { runLearningBenchmarkSuite } from '../evaluation/benchmarks.js';
import { evaluateRegressionGate } from '../evaluation/regression.js';

export const EVOLUTION_PROOF_RUNNER_SCHEMA = 'mel.evolution-proof-loop.v1';
const MAX_CYCLES_LIMIT = 8;
const DEFAULT_MAX_CYCLES = 3;

function runnerError(code, details = {}) {
  return Object.assign(new Error(code), { code, ...details });
}

function requireFunction(value, code) {
  if (typeof value !== 'function') throw runnerError(code);
  return value;
}

function normalizeMaxCycles(value) {
  if (value == null) return DEFAULT_MAX_CYCLES;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw runnerError('EVOLUTION_MAX_CYCLES_INVALID', { value });
  return Math.min(MAX_CYCLES_LIMIT, n);
}

function normalizeArtifacts(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))]
    .slice(0, 100);
}

function cloneState(value) {
  if (value == null || typeof value !== 'object') {
    throw runnerError('EVOLUTION_STATE_REQUIRED');
  }
  try {
    return structuredClone(value);
  } catch {
    throw runnerError('EVOLUTION_STATE_NOT_CLONEABLE');
  }
}

function stateFingerprint(value) {
  try {
    return JSON.stringify(value);
  } catch {
    throw runnerError('EVOLUTION_STATE_NOT_SERIALIZABLE');
  }
}

function normalizeTests(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { passed: false, code: 'TEST_RESULT_INVALID', artifacts: [], details: null };
  }
  return {
    passed: raw.passed === true,
    code: raw.passed === true ? null : String(raw.code || 'TESTS_FAILED').slice(0, 160),
    artifacts: normalizeArtifacts(raw.artifacts),
    details: raw.details ?? null,
    production_touched: raw.production_touched === true,
  };
}

function normalizeCritique(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { approved: false, code: 'CRITIQUE_RESULT_INVALID', issues: [], artifacts: [] };
  }
  return {
    approved: raw.approved === true,
    code: raw.approved === true ? null : String(raw.code || 'CRITIQUE_REJECTED').slice(0, 160),
    issues: (Array.isArray(raw.issues) ? raw.issues : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .slice(0, 30),
    artifacts: normalizeArtifacts(raw.artifacts),
    production_touched: raw.production_touched === true,
  };
}

function compactBenchmark(run) {
  if (!run) return null;
  return {
    suite_id: run.suite_id || null,
    suite_digest: run.suite_digest || null,
    overall: Number.isFinite(Number(run.overall)) ? Number(run.overall) : null,
    cases: Number(run.cases || 0),
    domains: run.domains || {},
    repeated_errors: Array.isArray(run.repeated_errors) ? run.repeated_errors.slice(0, 50) : [],
  };
}

function compactRegression(gate) {
  if (!gate) return null;
  return {
    allowed: gate.allowed === true,
    decision: gate.decision || 'BLOCK',
    comparison: gate.comparison || null,
    blockers: Array.isArray(gate.blockers) ? gate.blockers.slice(0, 50) : [],
  };
}

/**
 * Canonical bounded proof runner for MEL evolution work.
 *
 * It deliberately reuses the existing benchmark suite and regression gate.
 * The runner itself performs no repository write, commit, deployment or
 * production mutation. Any correction is delegated to an injected candidate-
 * only corrector which must explicitly attest `production_touched: false`.
 */
export async function runEvolutionProofLoop({
  source_sha,
  baseline,
  state,
  testRunner,
  benchmarkEvaluator,
  critic,
  corrector = null,
  regressionPolicy = {},
  artifacts = [],
  maxCycles = DEFAULT_MAX_CYCLES,
  now = () => new Date(),
} = {}) {
  const sourceSha = String(source_sha || '').trim();
  if (!/^[a-f0-9]{40}$/i.test(sourceSha)) throw runnerError('EVOLUTION_SOURCE_SHA_REQUIRED');
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) {
    throw runnerError('EVOLUTION_BASELINE_REQUIRED');
  }
  const runTests = requireFunction(testRunner, 'EVOLUTION_TEST_RUNNER_REQUIRED');
  const evaluateCase = requireFunction(benchmarkEvaluator, 'EVOLUTION_BENCHMARK_EVALUATOR_REQUIRED');
  const runCritic = requireFunction(critic, 'EVOLUTION_CRITIC_REQUIRED');
  const limit = normalizeMaxCycles(maxCycles);
  let accumulatedArtifacts = normalizeArtifacts(artifacts);
  let currentState = cloneState(state);
  const history = [];

  for (let cycle = 1; cycle <= limit; cycle += 1) {
    const cycleStarted = now();
    if (!(cycleStarted instanceof Date) || Number.isNaN(cycleStarted.getTime())) {
      throw runnerError('EVOLUTION_RUNNER_TIME_INVALID');
    }

    let tests;
    try {
      tests = normalizeTests(await runTests({
        cycle,
        source_sha: sourceSha,
        state: cloneState(currentState),
        candidate_only: true,
        production_allowed: false,
      }));
    } catch (error) {
      tests = {
        passed: false,
        code: String(error?.code || error?.message || 'TEST_EXECUTION_FAILED').slice(0, 160),
        artifacts: [],
        details: null,
        production_touched: false,
      };
    }
    if (tests.production_touched) throw runnerError('EVOLUTION_TEST_TOUCHED_PRODUCTION');

    let benchmark = null;
    let benchmarkError = null;
    try {
      benchmark = await runLearningBenchmarkSuite({
        evaluator: (testCase) => evaluateCase(testCase, {
          cycle,
          source_sha: sourceSha,
          state: cloneState(currentState),
          candidate_only: true,
          production_allowed: false,
        }),
      });
    } catch (error) {
      benchmarkError = String(error?.code || error?.message || 'BENCHMARK_EXECUTION_FAILED').slice(0, 160);
    }

    const proofArtifacts = normalizeArtifacts([...accumulatedArtifacts, ...tests.artifacts]);
    let regression = null;
    let regressionError = null;
    if (benchmark) {
      try {
        regression = evaluateRegressionGate({
          baseline,
          candidate: benchmark,
          policy: regressionPolicy,
          source_sha: sourceSha,
          artifacts: proofArtifacts,
          now,
        });
      } catch (error) {
        regressionError = String(error?.code || error?.message || 'REGRESSION_GATE_FAILED').slice(0, 160);
      }
    }

    let critique;
    try {
      critique = normalizeCritique(await runCritic({
        cycle,
        source_sha: sourceSha,
        state: cloneState(currentState),
        tests,
        benchmark: compactBenchmark(benchmark),
        benchmark_error: benchmarkError,
        regression: compactRegression(regression),
        regression_error: regressionError,
        candidate_only: true,
        production_allowed: false,
      }));
    } catch (error) {
      return {
        ok: false,
        schema: EVOLUTION_PROOF_RUNNER_SCHEMA,
        version: 1,
        status: 'BLOCKED',
        decision: 'BLOCK',
        code: String(error?.code || error?.message || 'CRITIC_EXECUTION_FAILED').slice(0, 160),
        source_sha: sourceSha,
        cycles: history.length,
        history,
        final_state: cloneState(currentState),
        production_touched: false,
      };
    }
    if (critique.production_touched) throw runnerError('EVOLUTION_CRITIC_TOUCHED_PRODUCTION');

    const cycleRecord = {
      cycle,
      started_at: cycleStarted.toISOString(),
      tests: {
        passed: tests.passed,
        code: tests.code || null,
        artifacts: tests.artifacts,
      },
      benchmark: compactBenchmark(benchmark),
      benchmark_error: benchmarkError,
      regression: compactRegression(regression),
      regression_error: regressionError,
      critique: {
        approved: critique.approved,
        code: critique.code || null,
        issues: critique.issues,
        artifacts: critique.artifacts,
      },
      corrected: false,
    };
    history.push(cycleRecord);

    const verified = tests.passed
      && Boolean(benchmark)
      && !benchmarkError
      && regression?.allowed === true
      && !regressionError
      && critique.approved;

    if (verified) {
      return {
        ok: true,
        schema: EVOLUTION_PROOF_RUNNER_SCHEMA,
        version: 1,
        status: 'VERIFIED',
        decision: 'ALLOW',
        code: null,
        source_sha: sourceSha,
        cycles: cycle,
        history,
        final_state: cloneState(currentState),
        evidence: normalizeArtifacts([...proofArtifacts, ...critique.artifacts]),
        production_touched: false,
      };
    }

    if (cycle >= limit) {
      return {
        ok: false,
        schema: EVOLUTION_PROOF_RUNNER_SCHEMA,
        version: 1,
        status: 'BLOCKED',
        decision: 'BLOCK',
        code: 'EVOLUTION_PROOF_CYCLE_LIMIT',
        source_sha: sourceSha,
        cycles: cycle,
        history,
        final_state: cloneState(currentState),
        production_touched: false,
      };
    }

    if (typeof corrector !== 'function') {
      return {
        ok: false,
        schema: EVOLUTION_PROOF_RUNNER_SCHEMA,
        version: 1,
        status: 'BLOCKED',
        decision: 'BLOCK',
        code: 'EVOLUTION_CORRECTOR_REQUIRED',
        source_sha: sourceSha,
        cycles: cycle,
        history,
        final_state: cloneState(currentState),
        production_touched: false,
      };
    }

    const before = stateFingerprint(currentState);
    let correction;
    try {
      correction = await corrector({
        cycle,
        source_sha: sourceSha,
        state: cloneState(currentState),
        evidence: structuredClone(cycleRecord),
        candidate_only: true,
        production_allowed: false,
      });
    } catch (error) {
      return {
        ok: false,
        schema: EVOLUTION_PROOF_RUNNER_SCHEMA,
        version: 1,
        status: 'BLOCKED',
        decision: 'BLOCK',
        code: String(error?.code || error?.message || 'CORRECTION_FAILED').slice(0, 160),
        source_sha: sourceSha,
        cycles: cycle,
        history,
        final_state: cloneState(currentState),
        production_touched: false,
      };
    }

    if (!correction || typeof correction !== 'object' || correction.production_touched !== false) {
      return {
        ok: false,
        schema: EVOLUTION_PROOF_RUNNER_SCHEMA,
        version: 1,
        status: 'BLOCKED',
        decision: 'BLOCK',
        code: 'EVOLUTION_CORRECTION_SAFETY_ATTESTATION_REQUIRED',
        source_sha: sourceSha,
        cycles: cycle,
        history,
        final_state: cloneState(currentState),
        production_touched: false,
      };
    }

    const nextState = cloneState(correction.state);
    if (stateFingerprint(nextState) === before) {
      return {
        ok: false,
        schema: EVOLUTION_PROOF_RUNNER_SCHEMA,
        version: 1,
        status: 'BLOCKED',
        decision: 'BLOCK',
        code: 'EVOLUTION_CORRECTION_NO_CHANGE',
        source_sha: sourceSha,
        cycles: cycle,
        history,
        final_state: cloneState(currentState),
        production_touched: false,
      };
    }
    cycleRecord.corrected = true;
    cycleRecord.correction = {
      code: correction.code ? String(correction.code).slice(0, 160) : null,
      artifacts: normalizeArtifacts(correction.artifacts),
    };
    accumulatedArtifacts = normalizeArtifacts([
      ...proofArtifacts,
      ...critique.artifacts,
      ...cycleRecord.correction.artifacts,
    ]);
    currentState = nextState;
  }

  throw runnerError('EVOLUTION_PROOF_LOOP_UNREACHABLE');
}
