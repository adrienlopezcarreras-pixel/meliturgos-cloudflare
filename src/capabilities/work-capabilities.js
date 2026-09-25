import { createWorkDag, WorkDagRunner } from '../work/work-dag.js';
import { summarizeWorkDag } from '../work/work-dag-state.js';
import { D1WorkDagStore } from '../work/d1-work-dag-store.js';
import { createWorkPlan, compileWorkPlanNodes, summarizeWorkPlan } from '../work/planning-engine.js';
import { D1PlanningStore, PLAN_STATUSES, TASK_STATUSES } from '../work/d1-planning-store.js';
import { buildPlanningCatalog, buildWorkPlanningPrompt, parseCapabilityAwareWorkPlan } from '../work/ai-planning-engine.js';

function workError(code) {
  return Object.assign(new Error(code), { code });
}

const DAG_ID = { type: 'string', minLength: 1, maxLength: 200 };
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
    const catalog = buildPlanningCatalog(bus.list());
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
    const text = generated?.best?.text;
    const parsed = parseCapabilityAwareWorkPlan({
      text,
      id: input.id,
      goal: input.goal,
      constraints: input.constraints || [],
      catalog,
      source: 'augmentio:work.plan.generate',
    });
    return {
      ok: true,
      plan: parsed.plan,
      summary: summarizeWorkPlan(parsed.plan),
      nodes: compileWorkPlanNodes(parsed.plan),
      generator: {
        ...parsed.generator,
        provider: generated?.best?.provider || null,
        model: generated?.best?.model || null,
        candidate_count: Array.isArray(generated?.candidates) ? generated.candidates.length : 0,
        failures: Number(generated?.failures || 0),
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
  }, async (input) => {
    assertDb(db);
    const plan = createWorkPlan({
      id: input.id,
      goal: input.goal,
      constraints: input.constraints || [],
      steps: input.steps,
      source: 'capability:work.plan.save',
    });
    return new D1PlanningStore(db).create(plan);
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
  }, async (input) => {
    assertDb(db);
    return new D1PlanningStore(db).updateTask(input.planId, input.taskId, input.status, input.detail || {});
  });

  bus.discover({
    id: 'work.plan.materialize', name: 'Matérialiser un plan dans Work', category: 'work', version: '1.0.0', provider: 'mel',
    description: 'Creates a persistent Work DAG from a saved plan without executing it, then durably links the Goal/Tasks record to that DAG.',
    input_schema: { type: 'object', properties: { id: DAG_ID }, required: ['id'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM', permissions: [], health, enabled: true,
  }, async (input) => {
    assertDb(db);
    const planning = new D1PlanningStore(db);
    const record = await planning.loadRecord(input.id);
    if (!record) throw workError('WORK_PLAN_NOT_FOUND');

    const dagId = record.work_dag_id || `work-${String(record.id).slice(0, 195)}`;
    const workStore = new D1WorkDagStore(db, dagId);
    let dag = await workStore.load();
    if (!dag) {
      dag = await workStore.save(createWorkDag({
        id: dagId,
        jobId: dagId,
        goal: record.goal,
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
        candidateBranch: { type: 'string', minLength: 1, maxLength: 200 },
        candidateSha: { type: 'string', minLength: 1, maxLength: 100 },
        nodes: { type: 'array', items: WORK_NODE_SCHEMA },
      },
      required: ['goal', 'nodes'], additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM', permissions: [], health, enabled: true,
  }, async (input) => {
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
      candidateBranch: input.candidateBranch || null,
      candidateSha: input.candidateSha || null,
      nodes,
    });
    const store = new D1WorkDagStore(db, dagId);
    return publicState(await store.save(dag));
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
    return publicState(await runner.run());
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