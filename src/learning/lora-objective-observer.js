// OBSERVE -> DIAGNOSE -> DECIDE for MEL's continuous learning (issue #2650).
// AGENTIC_READY is a change of objective, not the end of learning: the
// observer keeps measuring the real objectives and decides, from repeated and
// measured gaps only, whether a LoRA cycle can help or whether the cause is in
// the code (pipeline, tools, interface) and needs a code mission instead.

export const LORA_OBJECTIVE_THRESHOLDS = Object.freeze({
  agentic_execution: 0.7,
  over_refusal_rate: 0.25,
  technical_depth: 0.75,
  mission_completion_rate: 0.5,
});

// Failures a LoRA cannot fix: they come from MEL's own pipeline or tools.
const PIPELINE_CODES = /TIMEOUT|CONFLICT|QUOTA|RATE_LIMIT|UNAVAILABLE|EMPTY_WORKERS_AI|LEASE|PROVIDER/;

function impactMetrics(row) {
  const meta = row?.metadata || {};
  return meta.candidate || meta.metrics || meta.candidate_metrics || {};
}

// Every gap must be seen on the last `streak` measurements, never on one.
function persistent(rows, key, test, streak) {
  const values = rows.slice(-streak).map(row => {
    const raw = impactMetrics(row)[key];
    // Missing measurements are unknown, not zero: never train on absent evidence.
    return raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
  });
  return values.length === streak && values.every(value => Number.isFinite(value) && test(value));
}

export function observeLoraObjectives({ impactRows = [], jobs = [], streak = 2 } = {}) {
  const impacts = impactRows.filter(row => row?.kind === 'lora-impact-candidate');
  const latest = impacts.at(-1) || null;
  const stage = String(latest?.metadata?.next_stage || 'UNCENSORED_WAITING');
  const finished = jobs.filter(job => ['COMPLETED', 'FAILED'].includes(String(job?.status || '').toUpperCase()));
  const completed = finished.filter(job => String(job.status).toUpperCase() === 'COMPLETED').length;
  const rejections = jobs.flatMap(job => job?.result_json?.bridge_preparation_diagnostic?.mentor_failure_codes || []).map(row => String(row?.code || ''));
  const pipelineShare = rejections.length ? rejections.filter(code => PIPELINE_CODES.test(code)).length / rejections.length : 0;
  const metrics = {
    ...impactMetrics(latest),
    mission_completion_rate: finished.length ? completed / finished.length : null,
    missions_finished: finished.length,
    mentor_rejections: rejections.length,
    pipeline_rejection_share: rejections.length ? pipelineShare : null,
    measurements: impacts.length,
  };
  const t = LORA_OBJECTIVE_THRESHOLDS;
  const findings = [];
  if (stage !== 'AGENTIC_READY') {
    return { stage, metrics, decision: 'TRAIN_UNCENSORED', reason: 'UNCENSORED_GATE_NOT_REACHED', findings };
  }
  // A regression of the uncensored behaviour reopens that objective first.
  if (persistent(impacts, 'over_refusal_rate', v => v > t.over_refusal_rate, streak)) {
    return { stage, metrics, decision: 'TRAIN_UNCENSORED', reason: 'OVER_REFUSAL_REGRESSED', findings };
  }
  // Missions failing mostly for pipeline reasons: fix the code, do not train.
  if (finished.length >= 4 && metrics.mission_completion_rate < t.mission_completion_rate && pipelineShare >= 0.5) {
    findings.push({ code: 'LORA_GAP_IS_PIPELINE', detail: `completion ${(metrics.mission_completion_rate * 100).toFixed(0)}%, ${Math.round(pipelineShare * 100)}% pipeline rejections` });
    return { stage, metrics, decision: 'CODE_FIX', reason: 'PIPELINE_FAILURES_DOMINATE', findings };
  }
  if (persistent(impacts, 'agentic_execution', v => v < t.agentic_execution, streak)) {
    return { stage, metrics, decision: 'TRAIN_AGENTIC', reason: 'AGENTIC_EXECUTION_BELOW_OBJECTIVE', findings };
  }
  if (persistent(impacts, 'technical_depth', v => v < t.technical_depth, streak)) {
    return { stage, metrics, decision: 'TRAIN_AGENTIC', reason: 'TECHNICAL_DEPTH_BELOW_OBJECTIVE', findings };
  }
  return { stage, metrics, decision: 'OBSERVE', reason: 'OBJECTIVES_MET_OR_NOT_PERSISTENT', findings };
}
