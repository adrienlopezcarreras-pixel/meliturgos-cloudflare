import { createWorkDag, WorkDagRunner } from '../work/work-dag.js';
import { summarizeWorkDag } from '../work/work-dag-state.js';
import { D1WorkDagStore } from '../work/d1-work-dag-store.js';
import { createWorkPlan, compileWorkPlanNodes, summarizeWorkPlan } from '../work/planning-engine.js';
import { D1PlanningStore, PLAN_STATUSES, TASK_STATUSES } from '../work/d1-planning-store.js';
import { buildPlanningCatalog, buildWorkPlanningPrompt, parseCapabilityAwareWorkPlan } from '../work/ai-planning-engine.js';
import { createOpenLoopService } from '../conversations/open-loop-service.js';
import { validate } from '../security/validation.js';

function workError(code) {
  return Object.assign(new Error(code), { code });
}


function synthesizeSchemaValue(schema = {}, seed = 'plan') {
  const type = String(schema?.type || 'string');
  if (Array.isArray(schema?.enum) && schema.enum.length) return schema.enum[0];
  if (type === 'string') {
    const min = Math.max(1, Number(schema?.minLength) || 1);
    const max = Math.max(min, Number(schema?.maxLength) || 200);
    const base = String(seed || 'plan');
    return (base.length >= min ? base : base.padEnd(min, 'x')).slice(0, max);
  }
  if (type === 'integer') return Number.isFinite(Number(schema?.minimum)) ? Math.ceil(Number(schema.minimum)) : 1;
  if (type === 'number') return Number.isFinite(Number(schema?.minimum)) ? Number(schema.minimum) : 1;
  if (type === 'boolean') return false;
  if (type === 'array') {
    const min = Math.max(0, Number(schema?.minItems) || 0);
    const items = [];
    for (let i = 0; i < min; i += 1) items.push(synthesizeSchemaValue(schema?.items || {}, seed));
    return items;
  }
  if (type === 'object') {
    const out = {};
    const properties = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
    for (const key of Array.isArray(schema?.required) ? schema.required : []) {
      out[key] = synthesizeSchemaValue(properties[key] || {}, seed);
    }
    return out;
  }
  return String(seed || 'plan').slice(0, 200);
}

function minimalCapabilityInput(record, seed) {
  return synthesizeSchemaValue(record?.input_schema || { type: 'object' }, seed);
}

function selectAllowedCapabilityId(text, catalog = []) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const exact = catalog.find(record => raw === String(record?.id || ''));
  if (exact) return String(exact.id);
  const tokens = raw.match(/[A-Za-z0-9_.:-]+/g) || [];
  const allowed = new Set(catalog.map(record => String(record?.id || '')));
  const matches = [...new Set(tokens.filter(token => allowed.has(token)))];
  return matches.length === 1 ? matches[0] : '';
}

const DAG_ID = { type: 'string', minLength: 1, maxLength: 200 };
const CONVERSATION_ID = { type: 'string', minLength: 1, maxLength: 200 };
const PASSIVE_RESUME_AT = Number.MAX_SAFE_INTEGER;
const WORK_NODE_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 200 },
    kind: { type: 'string', minLength: 1, maxLength: 32 },
    depends_on: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 200 } },
    idempotent: { type: 'boolean' },
    payload: { type: 'object', additionalProperties: true },
  },
  required: ['id', 'payload'],
  additionalProperties: false,
};

function assertDb(db) {
  if (!db) throw workError('WORK_DAG_DB_REQUIRED');
}

function assertBoundedNodes(nodes) {
  if (!Array.isArray(nodes) || nodes.length < 1 || nodes.length > 64) throw workError('WORK_NODE_COUNT_INVALID');
  for (const node of nodes) {
    if (Array.isArray(node?.depends_on) && node.depends_on.length > 64) throw workError('WORK_DEPENDENCY_COUNT_INVALID');
  }
}

function assertMaterializablePlan(bus, plan) {
  for (const step of plan?.steps || []) {
    const capability = String(step?.capability || '');
    if (!capability || capability.startsWith('work.')) throw workError('WORK_PLAN_CAPABILITY_INVALID');
    let descriptor;
    try {
      descriptor = bus.describe(capability);
    } catch {
      throw workError('WORK_PLAN_CAPABILITY_NOT_FOUND');
    }
    if (descriptor.enabled !== true || descriptor.health === 'UNAVAILABLE') {
      throw workError('WORK_PLAN_CAPABILITY_UNAVAILABLE');
    }
    try {
      validate(step.input || {}, descriptor.input_schema);
    } catch {
      throw workError('WORK_PLAN_CAPABILITY_INPUT_INVALID');
    }
  }
  return true;
}

function childExecutor(bus, context) {
  return async (node) => {
    const capability = String(node.payload?.capability || '');
    if (!capability) throw workError('WORK_CHILD_CAPABILITY_REQUIRED');
    if (capability.startsWith('work.')) throw workError('WORK_RECURSIVE_CAPABILITY_DENIED');
    const input = node.payload?.input;
    if (input == null || Array.isArray(input) || typeof input !== 'object') {
      throw workError('WORK_CHILD_INPUT_OBJECT_REQUIRED');
    }
    return bus.execute(capability, input, context);
  };
}

function augmentioExecutor(bus, context) {
  return async (node) => {
    const input = String(node.payload?.input || '').slice(0, 12000);
    if (!input) throw workError('WORK_AUGMENTIO_INPUT_REQUIRED');
    return bus.execute('augmentio.fanout', {
      capability: String(node.payload?.capability || 'GENERAL').slice(0, 100),
      input,
      context: node.payload?.context && typeof node.payload.context === 'object' ? node.payload.context : {},
      maxCandidates: Math.min(12, Math.max(1, Number(node.payload?.maxCandidates) || 4)),
    }, context);
  };
}

function runnerFor(bus, db, dagId, context) {
  const store = new D1WorkDagStore(db, dagId);
  return {
    store,
    runner: new WorkDagRunner({
      store,
      executors: {
        TASK: childExecutor(bus, context),
        AUGMENTIO: augmentioExecutor(bus, context),
      },
    }),
  };
}

function publicState(dag) {
  const summary = summarizeWorkDag(dag);
  return {
    ...summary,
    artifact_count: Array.isArray(dag.artifacts) ? dag.artifacts.length : 0,
    checkpoint_count: Array.isArray(dag.audit) ? dag.audit.length : 0,
  };
}

function contextOwner(context = {}) {
  return String(context?.owner || '').trim();
}

async function syncWorkOpenLoop(db, dag, context = {}, { passive = false } = {}) {
  const conversationId = String(dag?.conversation_id || '').trim();
  const owner = contextOwner(context);
  if (!db || !conversationId || !owner) return null;
  const service = createOpenLoopService({ DB: db });
  const checkpoint = { work: publicState(dag) };
  const metadata = { workDagId: dag.id, last_work_status: dag.status };
  if (passive) {
    return service.capture({
      taskId: dag.id,
      conversationId,
      owner,
      status: 'waiting',
      nextAction: 'work.run',
      resumeAt: PASSIVE_RESUME_AT,
      checkpoint,
      metadata,
    });
  }
  const status = String(dag.status || '').toUpperCase();
  const type = status === 'COMPLETED'
    ? 'work.completed'
    : status === 'RUNNING'
      ? 'work.resumable'
      : 'work.waiting';
  return service.recordEvent({
    type,
    taskId: dag.id,
    conversationId,
    owner,
    payload: {
      nextAction: status === 'COMPLETED' ? '' : 'work.run',
      resumeAt: status === 'RUNNING' ? Date.now() + 60000 : PASSIVE_RESUME_AT,
      checkpoint,
      metadata,
    },
  });
}

async function syncPlanOpenLoop(db, plan, context = {}) {
  const conversationId = String(plan?.conversation_id || '').trim();
  const owner = contextOwner(context);
  if (!db || !conversationId || !owner) return null;
  return createOpenLoopService({ DB: db }).capture({
    taskId: plan.id,
    conversationId,
    owner,
    status: 'waiting',
    nextAction: plan.work_dag_id ? 'work.run' : 'work.plan.materialize',
    resumeAt: PASSIVE_RESUME_AT,
    checkpoint: { plan },
    metadata: { planId: plan.id, workDagId: plan.work_dag_id || '' },
  });
}

async function completePlanOpenLoop(db, plan, context = {}) {
  const conversationId = String(plan?.conversation_id || '').trim();
  const owner = contextOwner(context);
  if (!db || !conversationId || !owner) return null;
  return createOpenLoopService({ DB: db }).recordEvent({
    type: 'task.completed',
    taskId: plan.id,
    conversationId,
    owner,
    payload: {
      checkpoint: { plan },
      metadata: { planId: plan.id, workDagId: plan.work_dag_id || '' },
    },
  });
}

export function registerWorkCapabilities(bus, { db } = {}) {
  const health = db ? 'HEALTHY' : 'DEGRADED';


  bus.discover({
    id: 'work.plan', name: 'Planifier un objectif en étapes', category: 'work', version: '1.0.0', provider: 'mel',
    description: 'Builds one validated, bounded and dependency-aware plan that compiles directly to Work DAG nodes. Planning itself has no storage or network side effects.',
    input_schema: {
      type: 'object',
      properties: {
        id: DAG_ID,
        goal: { type: 'string', minLength: 1, maxLength: 4000 },
        constraints: { type: 'array', maxItems: 32, items: { type: 'string', minLength: 1, maxLength: 500 } },
        steps: {
          type: 'array', minItems: 1, maxItems: 64,
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', minLength: 1, maxLength: 200 },
              title: { type: 'string', minLength: 1, maxLength: 300 },
              capability: { type: 'string', minLength: 1, maxLength: 200 },
              input: { type: 'object', additionalProperties: true },
              dependsOn: { type: 'array', maxItems: 64, items: { type: 'string', minLength: 1, maxLength: 200 } },
              idempotent: { type: 'boolean' },
            },
            required: ['capability'],
            additionalProperties: false,
          },
        },
      },
      required: ['goal', 'steps'], additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
  }, async (input) => {
    const plan = createWorkPlan({
      id: input.id,
      goal: input.goal,
      constraints: input.constraints || [],
      steps: input.steps,
      source: 'capability:work.plan',
    });
    return {
      ok: true,
      plan,
      summary: summarizeWorkPlan(plan),
      nodes: compileWorkPlanNodes(plan),
    };
  });

  bus.discover({
    id: 'work.plan.generate', name: 'Générer un plan depuis un objectif', category: 'work', version: '1.0.0', provider: 'mel',
    description: 'Uses zero-added-cost multi-AI planning to propose a bounded plan, then validates every selected capability and input schema before returning it. No task is executed or persisted.',
    input_schema: {
      type: 'object',
      properties: {
        id: DAG_ID,
        goal: { type: 'string', minLength: 1, maxLength: 4000 },
        constraints: { type: 'array', maxItems: 32, items: { type: 'string', minLength: 1, maxLength: 500 } },
        maxCandidates: { type: 'integer', minimum: 1, maximum: 4 },
      },
      required: ['goal'], additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'DEGRADED', enabled: true,
  }, async (input, context) => {
    const constraintSize = JSON.stringify(input.constraints || []).length;
    const catalogBudget = Math.max(2200, Math.min(5200, 9000 - String(input.goal || '').length - constraintSize));
    const catalog = buildPlanningCatalog(bus.list(), {
      query: input.goal,
      maxChars: catalogBudget,
    });
    if (!catalog.length) throw workError('WORK_PLAN_CAPABILITY_CATALOG_EMPTY');
    const prompt = buildWorkPlanningPrompt({
      goal: input.goal,
      constraints: input.constraints || [],
      catalog,
    });
    const generated = await bus.execute('augmentio.fanout', {
      capability: 'REASONING',
      input: prompt,
      context: {
        purpose: 'work-plan-generation',
        execution_policy: 'PLAN_ONLY_NO_EXECUTION',
        capability_count: catalog.length,
      },
      maxCandidates: Math.min(4, Math.max(1, Number(input.maxCandidates) || 3)),
    }, context);
    const validationFailures = [];
    let accepted = null;
    let acceptedCandidate = null;
    let repairAttempted = false;
    let providerFailures = Number(generated?.failures || 0);
    let candidateCount = 0;

    const tryCandidates = (result, source) => {
      const ranked = Array.isArray(result?.candidates) && result.candidates.length
        ? result.candidates
        : result?.best ? [result.best] : [];
      candidateCount += ranked.length;
      for (const candidate of ranked) {
        try {
          accepted = parseCapabilityAwareWorkPlan({
            text: candidate?.text,
            id: input.id,
            goal: input.goal,
            constraints: input.constraints || [],
            catalog,
            source,
          });
          acceptedCandidate = candidate;
          return true;
        } catch (error) {
          validationFailures.push({
            provider: candidate?.provider || null,
            model: candidate?.model || null,
            code: String(error?.code || error?.message || 'WORK_PLAN_CANDIDATE_INVALID').slice(0, 120),
          });
        }
      }
      return false;
    };

    tryCandidates(generated, 'augmentio:work.plan.generate');

    if (!accepted) {
      repairAttempted = true;
      const repairCatalog = catalog
        .filter((record) => {
          const id = String(record?.id || '');
          const risk = String(record?.risk || '').toUpperCase();
          return risk === 'LOW'
            && record?.approval_required !== true
            && record?.enabled !== false
            && String(record?.health || '').toUpperCase() !== 'UNAVAILABLE'
            && !id.startsWith('work.')
            && !id.startsWith('augmentio.');
        })
        .sort((a, b) => {
          if (String(a.id) === 'echo' && String(b.id) !== 'echo') return -1;
          if (String(b.id) === 'echo' && String(a.id) !== 'echo') return 1;
          const aRequired = Array.isArray(a?.input_schema?.required) ? a.input_schema.required.length : 0;
          const bRequired = Array.isArray(b?.input_schema?.required) ? b.input_schema.required.length : 0;
          return aRequired - bRequired || String(a.id).localeCompare(String(b.id));
        })
        .slice(0, 4);
      const constrainedCatalog = repairCatalog.length ? repairCatalog : catalog
        .filter((record) => !String(record?.id || '').startsWith('work.') && !String(record?.id || '').startsWith('augmentio.'))
        .slice(0, 4);
      const repairPrompt = [
        'Tu répares un plan MEL qui a échoué à la validation stricte.',
        'Réponds UNIQUEMENT avec un objet JSON valide, sans markdown ni commentaire.',
        'FORMAT EXACT:',
        '{"steps":[{"id":"step-1","title":"...","capability":"capability.id","input":{},"dependsOn":[],"idempotent":false}],"constraints":[]}',
        'RÈGLES ABSOLUES:',
        '- choisis UNE SEULE capability dans REPAIR_CAPABILITIES;',
        '- copie exactement son id;',
        '- fournis exactement les champs requis par son input_schema, sans champ supplémentaire;',
        '- n’utilise jamais work.* ni augmentio.*;',
        '- si echo est présent, préfère echo pour un diagnostic sans effet de bord et utilise un champ value texte non vide;',
        '- ne lance rien et ne persiste rien;',
        'OBJECTIF:',
        String(input.goal || '').slice(0, 4000),
        'CONTRAINTES:',
        JSON.stringify((input.constraints || []).slice(0, 32)),
        'REPAIR_CAPABILITIES:',
        JSON.stringify(constrainedCatalog),
        'ECHECS PRECEDENTS:',
        JSON.stringify(validationFailures.slice(0, 12)),
      ].join('\n').slice(0, 12000);

      const repaired = await bus.execute('augmentio.fanout', {
        capability: 'REASONING',
        input: repairPrompt,
        context: {
          purpose: 'work-plan-generation-repair',
          execution_policy: 'PLAN_ONLY_NO_EXECUTION',
          capability_count: catalog.length,
        },
        maxCandidates: Math.min(4, Math.max(1, Number(input.maxCandidates) || 3)),
      }, context);
      providerFailures += Number(repaired?.failures || 0);
      tryCandidates(repaired, 'augmentio:work.plan.generate:repair');

      if (!accepted && constrainedCatalog.length) {
        const selectionPrompt = [
          'Choisis UNE SEULE capability pour réaliser un plan de diagnostic sans effet de bord.',
          'Réponds UNIQUEMENT avec son id exact, sans JSON, sans phrase et sans markdown.',
          'IDS_AUTORISES:',
          constrainedCatalog.map(record => String(record.id)).join('\n'),
          'OBJECTIF:',
          String(input.goal || '').slice(0, 2000),
        ].join('\n').slice(0, 6000);

        const selected = await bus.execute('augmentio.fanout', {
          capability: 'REASONING',
          input: selectionPrompt,
          context: {
            purpose: 'work-plan-generation-capability-selection',
            execution_policy: 'PLAN_ONLY_NO_EXECUTION',
            capability_count: constrainedCatalog.length,
          },
          maxCandidates: Math.min(4, Math.max(1, Number(input.maxCandidates) || 3)),
        }, context);
        providerFailures += Number(selected?.failures || 0);
        const rankedSelections = Array.isArray(selected?.candidates) && selected.candidates.length
          ? selected.candidates
          : selected?.best ? [selected.best] : [];
        candidateCount += rankedSelections.length;

        for (const candidate of rankedSelections) {
          const capabilityId = selectAllowedCapabilityId(candidate?.text, constrainedCatalog);
          if (!capabilityId) {
            validationFailures.push({
              provider: candidate?.provider || null,
              model: candidate?.model || null,
              code: 'WORK_PLAN_MODEL_CAPABILITY_SELECTION_INVALID',
            });
            continue;
          }
          const record = constrainedCatalog.find(item => String(item.id) === capabilityId);
          try {
            const syntheticText = JSON.stringify({
              steps: [{
                id: 'step-1',
                title: `Diagnostic via ${capabilityId}`,
                capability: capabilityId,
                input: minimalCapabilityInput(record, input.goal),
                dependsOn: [],
                idempotent: true,
              }],
              constraints: input.constraints || [],
            });
            accepted = parseCapabilityAwareWorkPlan({
              text: syntheticText,
              id: input.id,
              goal: input.goal,
              constraints: input.constraints || [],
              catalog,
              source: 'augmentio:work.plan.generate:structured-selection',
            });
            acceptedCandidate = candidate;
            break;
          } catch (error) {
            validationFailures.push({
              provider: candidate?.provider || null,
              model: candidate?.model || null,
              code: String(error?.code || error?.message || 'WORK_PLAN_STRUCTURED_SELECTION_INVALID').slice(0, 120),
            });
          }
        }
      }
    }

    if (!accepted) {
      const error = workError('WORK_PLAN_GENERATION_NO_VALID_CANDIDATE');
      error.validation_failures = validationFailures.slice(0, 12);
      throw error;
    }

    return {
      ok: true,
      plan: accepted.plan,
      summary: summarizeWorkPlan(accepted.plan),
      nodes: compileWorkPlanNodes(accepted.plan),
      generator: {
        ...accepted.generator,
        provider: acceptedCandidate?.provider || null,
        model: acceptedCandidate?.model || null,
        candidate_count: candidateCount,
        provider_failures: providerFailures,
        rejected_candidates: validationFailures,
        repair_attempted: repairAttempted,
        execution_started: false,
        persisted: false,
      },
    };
  });

  const planInputSchema = {
    type: 'object',
    properties: {
      id: DAG_ID,
      goal: { type: 'string', minLength: 1, maxLength: 4000 },
      conversationId: CONVERSATION_ID,
      constraints: { type: 'array', maxItems: 32, items: { type: 'string', minLength: 1, maxLength: 500 } },
      steps: {
        type: 'array', minItems: 1, maxItems: 64,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', minLength: 1, maxLength: 200 },
            title: { type: 'string', minLength: 1, maxLength: 300 },
            capability: { type: 'string', minLength: 1, maxLength: 200 },
            input: { type: 'object', additionalProperties: true },
            dependsOn: { type: 'array', maxItems: 64, items: { type: 'string', minLength: 1, maxLength: 200 } },
            idempotent: { type: 'boolean' },
          },
          required: ['capability'],
          additionalProperties: false,
        },
      },
    },
    required: ['goal', 'steps'], additionalProperties: false,
  };

  bus.discover({
    id: 'work.plan.save', name: 'Enregistrer un plan durable', category: 'work', version: '1.0.0', provider: 'mel',
    description: 'Persists one validated Goal with its Tasks in D1 and starts an append-only planning history. It does not execute any task.',
    input_schema: planInputSchema,
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM', permissions: [], health, enabled: true,
  }, async (input, context) => {
    assertDb(db);
    const plan = createWorkPlan({
      id: input.id,
      goal: input.goal,
      constraints: input.constraints || [],
      steps: input.steps,
      source: 'capability:work.plan.save',
      conversationId: input.conversationId || null,
    });
    const saved = await new D1PlanningStore(db).create(plan);
    await syncPlanOpenLoop(db, saved, context);
    return saved;
  });

  bus.discover({
    id: 'work.plan.get', name: 'Lire un plan durable', category: 'work', version: '1.0.0', provider: 'mel',
    description: 'Reads one persisted Goal/Task plan without task payload inputs or secrets.',
    input_schema: { type: 'object', properties: { id: DAG_ID }, required: ['id'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health, enabled: true,
  }, async (input) => {
    assertDb(db);
    const record = await new D1PlanningStore(db).get(input.id);
    if (!record) throw workError('WORK_PLAN_NOT_FOUND');
    return record;
  });

  bus.discover({
    id: 'work.plan.list', name: 'Lister les plans durables', category: 'work', version: '1.0.0', provider: 'mel',
    description: 'Lists bounded Goal metadata ordered by the latest planning update.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        status: { type: 'string', enum: Object.values(PLAN_STATUSES) },
      },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health, enabled: true,
  }, async (input) => {
    assertDb(db);
    const plans = await new D1PlanningStore(db).list({ limit: input.limit, status: input.status });
    return { ok: true, count: plans.length, plans };
  });

  bus.discover({
    id: 'work.plan.history', name: 'Historique d’un plan durable', category: 'work', version: '1.0.0', provider: 'mel',
    description: 'Reads the append-only bounded history for one persisted plan.',
    input_schema: {
      type: 'object',
      properties: { id: DAG_ID, limit: { type: 'integer', minimum: 1, maximum: 200 } },
      required: ['id'], additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health, enabled: true,
  }, async (input) => {
    assertDb(db);
    const store = new D1PlanningStore(db);
    if (!await store.get(input.id)) throw workError('WORK_PLAN_NOT_FOUND');
    const events = await store.history(input.id, { limit: input.limit });
    return { ok: true, id: input.id, events };
  });

  bus.discover({
    id: 'work.task.update', name: 'Mettre à jour une tâche planifiée', category: 'work', version: '1.0.0', provider: 'mel',
    description: 'Applies a validated manual Task state transition and records it in planning history. Work-linked plans can later be resynchronized from the authoritative DAG.',
    input_schema: {
      type: 'object',
      properties: {
        planId: DAG_ID,
        taskId: DAG_ID,
        status: { type: 'string', enum: Object.values(TASK_STATUSES) },
        detail: { type: 'object', additionalProperties: true },
      },
      required: ['planId', 'taskId', 'status'], additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM', permissions: [], health, enabled: true,
  }, async (input, context) => {
    assertDb(db);
    const updated = await new D1PlanningStore(db).updateTask(input.planId, input.taskId, input.status, input.detail || {});
    await syncPlanOpenLoop(db, updated, context);
    return updated;
  });

  bus.discover({
    id: 'work.plan.materialize', name: 'Matérialiser un plan dans Work', category: 'work', version: '1.0.0', provider: 'mel',
    description: 'Creates a persistent Work DAG from a saved plan without executing it, then durably links the Goal/Tasks record to that DAG.',
    input_schema: { type: 'object', properties: { id: DAG_ID }, required: ['id'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM', permissions: [], health, enabled: true,
  }, async (input, context) => {
    assertDb(db);
    const planning = new D1PlanningStore(db);
    const record = await planning.loadRecord(input.id);
    if (!record) throw workError('WORK_PLAN_NOT_FOUND');

    assertMaterializablePlan(bus, record.plan);
    const dagId = record.work_dag_id || `work-${String(record.id).slice(0, 195)}`;
    const workStore = new D1WorkDagStore(db, dagId);
    let dag = await workStore.load();
    if (!dag) {
      dag = await workStore.save(createWorkDag({
        id: dagId,
        jobId: dagId,
        goal: record.goal,
        conversationId: record.conversation_id || record.plan?.conversation_id || null,
        nodes: compileWorkPlanNodes(record.plan),
      }));
    } else {
      const expectedIds = compileWorkPlanNodes(record.plan).map((node) => node.id);
      const actualIds = dag.nodes.map((node) => node.id);
      if (dag.goal !== record.goal || JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
        throw workError('WORK_PLAN_DAG_COLLISION');
      }
    }

    const plan = await planning.linkWorkDag(record.id, dagId);
    await completePlanOpenLoop(db, plan, context);
    await syncWorkOpenLoop(db, dag, context, { passive: true });
    return { ok: true, plan, work: publicState(dag) };
  });

  bus.discover({
    id: 'work.plan.sync', name: 'Synchroniser plan et Work', category: 'work', version: '1.0.0', provider: 'mel',
    description: 'Synchronizes persisted Task states from the linked Work DAG, which remains authoritative for execution progress.',
    input_schema: { type: 'object', properties: { id: DAG_ID }, required: ['id'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health, enabled: true,
  }, async (input) => {
    assertDb(db);
    const planning = new D1PlanningStore(db);
    const record = await planning.loadRecord(input.id);
    if (!record) throw workError('WORK_PLAN_NOT_FOUND');
    if (!record.work_dag_id) throw workError('WORK_PLAN_DAG_NOT_LINKED');
    const dag = await new D1WorkDagStore(db, record.work_dag_id).load();
    if (!dag) throw workError('WORK_DAG_NOT_FOUND');
    const plan = await planning.syncFromWork(record.id, dag);
    return { ok: true, plan, work: publicState(dag) };
  });

  bus.discover({
    id: 'work.create', name: 'Créer un travail persistant', category: 'work', version: '1.0.0', provider: 'mel',
    description: 'Creates and durably checkpoints a bounded multi-step Work DAG in D1. Nodes can call only registered CapabilityBus capabilities.',
    input_schema: {
      type: 'object',
      properties: {
        id: DAG_ID,
        jobId: { type: 'string', minLength: 1, maxLength: 200 },
        goal: { type: 'string', minLength: 1, maxLength: 4000 },
        conversationId: CONVERSATION_ID,
        candidateBranch: { type: 'string', minLength: 1, maxLength: 200 },
        candidateSha: { type: 'string', minLength: 1, maxLength: 100 },
        nodes: { type: 'array', items: WORK_NODE_SCHEMA },
      },
      required: ['goal', 'nodes'], additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM', permissions: [], health, enabled: true,
  }, async (input, context) => {
    assertDb(db);
    assertBoundedNodes(input.nodes);
    const dagId = input.id || crypto.randomUUID();
    const nodes = input.nodes.map((node) => {
      const kind = String(node.kind || 'TASK').toUpperCase();
      if (!['TASK', 'AUGMENTIO'].includes(kind)) throw workError('WORK_PUBLIC_NODE_KIND_DENIED');
      return { ...node, kind, idempotent: node.idempotent === true };
    });
    const dag = createWorkDag({
      id: dagId,
      jobId: input.jobId || dagId,
      goal: input.goal,
      conversationId: input.conversationId || null,
      candidateBranch: input.candidateBranch || null,
      candidateSha: input.candidateSha || null,
      nodes,
    });
    const store = new D1WorkDagStore(db, dagId);
    const saved = await store.save(dag);
    await syncWorkOpenLoop(db, saved, context, { passive: true });
    return publicState(saved);
  });

  bus.discover({
    id: 'work.run', name: 'Exécuter ou reprendre un travail', category: 'work', version: '1.0.0', provider: 'mel',
    description: 'Runs the next persistent Work steps and resumes interrupted idempotent nodes from their D1 checkpoint. Every child action still passes through CapabilityBus governance.',
    input_schema: { type: 'object', properties: { id: DAG_ID }, required: ['id'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM', permissions: [], health, enabled: true,
  }, async (input, context) => {
    assertDb(db);
    const { runner } = runnerFor(bus, db, input.id, context);
    const dag = await runner.run();
    await syncWorkOpenLoop(db, dag, context);
    return publicState(dag);
  });

  bus.discover({
    id: 'work.status', name: 'État d’un travail persistant', category: 'work', version: '1.0.0', provider: 'mel',
    description: 'Reads a bounded, non-payload Work state from D1 including completion, blockers, runnable nodes and checkpoint counts.',
    input_schema: { type: 'object', properties: { id: DAG_ID }, required: ['id'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health, enabled: true,
  }, async (input) => {
    assertDb(db);
    const dag = await new D1WorkDagStore(db, input.id).load();
    if (!dag) throw workError('WORK_DAG_NOT_FOUND');
    return publicState(dag);
  });

  bus.discover({
    id: 'work.artifacts', name: 'Artefacts d’un travail persistant', category: 'work', version: '1.0.0', provider: 'mel',
    description: 'Reads the bounded sanitized artifacts already persisted by completed Work nodes without re-executing them.',
    input_schema: { type: 'object', properties: { id: DAG_ID }, required: ['id'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health, enabled: true,
  }, async (input) => {
    assertDb(db);
    const dag = await new D1WorkDagStore(db, input.id).load();
    if (!dag) throw workError('WORK_DAG_NOT_FOUND');
    return {
      id: dag.id,
      status: dag.status,
      artifacts: Array.isArray(dag.artifacts) ? dag.artifacts.slice(0, 100) : [],
    };
  });
}