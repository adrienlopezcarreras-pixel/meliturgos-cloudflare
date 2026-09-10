import { createWorkDag, WorkDagRunner } from '../work/work-dag.js';
import { summarizeWorkDag } from '../work/work-dag-state.js';
import { D1WorkDagStore } from '../work/d1-work-dag-store.js';

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