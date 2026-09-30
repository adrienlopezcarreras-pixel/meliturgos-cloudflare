const SECRET_KEY = /(secret|token|password|authorization|cookie|api[_-]?key|otp|private[_-]?key|credential)/i;
const SECRET_VALUE = /(bearer\s+[a-z0-9._~+/=-]{8,}|\bsk-[a-z0-9_-]{8,}|\bgh[pousr]_[a-z0-9]{12,})/i;

function planningError(code) {
  return Object.assign(new Error(code), { code });
}

function clean(value, depth = 0) {
  if (depth > 6) return '[TRUNCATED]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return SECRET_VALUE.test(value) ? '[REDACTED]' : value.slice(0, 12000);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => clean(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = clean(item, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 12000);
}

function normalizeId(value, fallback) {
  const id = String(value || fallback || '').trim().slice(0, 200);
  if (!id) throw planningError('WORK_PLAN_STEP_ID_REQUIRED');
  return id;
}

function normalizeDependsOn(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw planningError('WORK_PLAN_DEPENDENCIES_INVALID');
  if (value.length > 64) throw planningError('WORK_PLAN_DEPENDENCY_COUNT_INVALID');
  return value.map((item) => String(item || '').trim().slice(0, 200)).filter(Boolean);
}

function assertNoCycles(steps) {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const visiting = new Set();
  const visited = new Set();

  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw planningError('WORK_PLAN_CYCLE');
    visiting.add(id);
    for (const dep of byId.get(id)?.depends_on || []) visit(dep);
    visiting.delete(id);
    visited.add(id);
  }

  for (const step of steps) visit(step.id);
}

export function validateWorkPlan(plan) {
  if (!plan || plan.schema !== 'mel.work-plan' || plan.version !== 1 || !plan.id || !plan.goal) {
    throw planningError('WORK_PLAN_INVALID');
  }
  if (!Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 64) {
    throw planningError('WORK_PLAN_STEP_COUNT_INVALID');
  }

  const ids = new Set();
  for (const step of plan.steps) {
    if (!step?.id || ids.has(step.id)) throw planningError('WORK_PLAN_STEP_ID_INVALID');
    ids.add(step.id);
    if (!step.capability) throw planningError('WORK_PLAN_CAPABILITY_REQUIRED');
    if (step.input == null || Array.isArray(step.input) || typeof step.input !== 'object') {
      throw planningError('WORK_PLAN_INPUT_OBJECT_REQUIRED');
    }
  }

  for (const step of plan.steps) {
    for (const dep of step.depends_on || []) {
      if (!ids.has(dep) || dep === step.id) throw planningError('WORK_PLAN_DEPENDENCY_INVALID');
    }
  }

  assertNoCycles(plan.steps);
  return true;
}

export function createWorkPlan({
  id = crypto.randomUUID(),
  goal,
  steps = [],
  constraints = [],
  source = 'mel',
  conversationId = null,
} = {}) {
  const normalizedGoal = String(goal || '').trim().slice(0, 4000);
  if (!normalizedGoal) throw planningError('WORK_PLAN_GOAL_REQUIRED');
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 64) {
    throw planningError('WORK_PLAN_STEP_COUNT_INVALID');
  }
  if (!Array.isArray(constraints) || constraints.length > 32) {
    throw planningError('WORK_PLAN_CONSTRAINTS_INVALID');
  }

  const normalizedSteps = steps.map((step, index) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) throw planningError('WORK_PLAN_STEP_INVALID');
    const capability = String(step.capability || '').trim().slice(0, 200);
    if (!capability) throw planningError('WORK_PLAN_CAPABILITY_REQUIRED');
    const input = step.input == null ? {} : step.input;
    if (Array.isArray(input) || typeof input !== 'object') throw planningError('WORK_PLAN_INPUT_OBJECT_REQUIRED');

    return {
      id: normalizeId(step.id, `step-${index + 1}`),
      title: String(step.title || capability).trim().slice(0, 300),
      capability,
      input: clean(input),
      depends_on: normalizeDependsOn(step.depends_on ?? step.dependsOn),
      idempotent: step.idempotent === true,
    };
  });

  const now = Date.now();
  const plan = {
    schema: 'mel.work-plan',
    version: 1,
    id: String(id).slice(0, 200),
    goal: normalizedGoal,
    conversation_id: String(conversationId || '').trim().slice(0, 200) || null,
    source: String(source || 'mel').slice(0, 100),
    constraints: constraints.map((item) => String(item || '').trim().slice(0, 500)).filter(Boolean),
    steps: normalizedSteps,
    created_at: now,
  };

  validateWorkPlan(plan);
  return plan;
}

export function compileWorkPlanNodes(plan) {
  validateWorkPlan(plan);
  return plan.steps.map((step) => ({
    id: step.id,
    kind: 'TASK',
    depends_on: [...step.depends_on],
    idempotent: step.idempotent === true,
    payload: {
      capability: step.capability,
      input: clean(step.input),
    },
  }));
}

export function summarizeWorkPlan(plan) {
  validateWorkPlan(plan);
  const roots = plan.steps.filter((step) => step.depends_on.length === 0).map((step) => step.id);
  const leaves = plan.steps
    .filter((step) => !plan.steps.some((candidate) => candidate.depends_on.includes(step.id)))
    .map((step) => step.id);
  const nonIdempotent = plan.steps.filter((step) => !step.idempotent).map((step) => step.id);

  return {
    id: plan.id,
    step_count: plan.steps.length,
    root_step_ids: roots,
    leaf_step_ids: leaves,
    non_idempotent_step_ids: nonIdempotent,
    constraint_count: plan.constraints.length,
  };
}
