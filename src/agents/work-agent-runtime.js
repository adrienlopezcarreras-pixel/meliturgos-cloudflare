import { requireValue } from '../core/contracts.js';
import { D1WorkDagStore } from '../work/d1-work-dag-store.js';
import {
  WORK_DAG_STATUS,
  WORK_NODE_STATUS,
  WorkDagRunner,
  createWorkDag,
} from '../work/work-dag.js';
import { summarizeWorkDag } from '../work/work-dag-state.js';
import {
  releaseMultiAiLot,
  tryReserveMultiAiLot,
} from '../coordination/multi-ai-lot-reservation.js';

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
const clone = value => value == null ? value : structuredClone(value);

class MemoryWorkDagStore {
  constructor(id, store) {
    this.id = id;
    this.store = store;
  }
  async load() {
    const row = this.store.get(this.id);
    return row ? clone(row) : null;
  }
  async save(dag) {
    this.store.set(this.id, clone(dag));
    return clone(dag);
  }
}

function runId(input = {}) {
  const id = input.run_id ?? input.id;
  requireValue(nonEmptyString(id), 'AGENT_RUN_ID_REQUIRED', 400);
  return id.trim();
}

function agentId(input = {}) {
  const id = input.agent_id ?? input.agentId;
  requireValue(nonEmptyString(id), 'AGENT_ID_REQUIRED', 400);
  return id.trim();
}

function compiledNodes(definition, runInput) {
  return definition.steps.map(step => ({
    id: step.id,
    kind: step.kind,
    depends_on: [...(step.depends_on || [])],
    idempotent: step.idempotent === true,
    payload: {
      ...clone(step.payload || {}),
      ...(step.payload?.use_run_input === true ? { input: clone(runInput ?? {}) } : {}),
    },
  }));
}

function taskExecutor(bus, context) {
  return async node => {
    const capability = node.payload?.capability;
    requireValue(nonEmptyString(capability), 'AGENT_STEP_CAPABILITY_REQUIRED', 400);
    return bus.execute(capability, clone(node.payload?.input ?? {}), context);
  };
}

function augmentioExecutor(bus, context, definition, runIdValue) {
  return async node => {
    const capability = nonEmptyString(node.payload?.capability)
      ? node.payload.capability.trim()
      : 'council.state-of-play';
    let input = clone(node.payload?.input ?? {});
    if (capability === 'council.state-of-play') {
      if (!isRecord(input)) input = {};
      input = {
        goal: input.goal || definition.goal || definition.description || definition.name,
        context: {
          ...(isRecord(input.context) ? input.context : {}),
          agent_id: definition.id,
          agent_version: definition.version,
          agent_run_id: runIdValue,
        },
        ...(input.minResponses === undefined ? {} : { minResponses: input.minResponses }),
      };
    }
    return bus.execute(capability, input, context);
  };
}

export function createWorkAgentRuntime({
  db = null,
  bus,
  registry,
  memoryDagStore = new Map(),
  reservationStore = null,
  sourceSha = '',
} = {}) {
  requireValue(bus && typeof bus.execute === 'function', 'AGENT_CAPABILITY_BUS_REQUIRED', 500);
  requireValue(registry && typeof registry.get === 'function', 'AGENT_REGISTRY_REQUIRED', 500);
  if (!db) requireValue(reservationStore instanceof Map || reservationStore === null, 'AGENT_RESERVATION_STORE_INVALID', 500);

  const memoryReservations = reservationStore ?? new Map();

  async function acquireReservation(item, owner) {
    if (!item) return null;
    if (db) {
      const reservation = await tryReserveMultiAiLot({
        db,
        item,
        owner,
        sourceSha,
      });
      requireValue(reservation.acquired, 'MULTI_AI_LOT_RESERVED', 409);
      return reservation;
    }

    const key = String(item);
    const current = memoryReservations.get(key);
    if (current && current.owner !== owner) {
      requireValue(false, 'MULTI_AI_LOT_RESERVED', 409);
    }
    const reservation = { acquired: true, item: key, owner, expires_at: Date.now() + 10 * 60 * 1000 };
    memoryReservations.set(key, reservation);
    return reservation;
  }

  async function releaseReservation(item, owner) {
    if (!item) return true;
    if (db) return releaseMultiAiLot({ db, item, owner });
    const current = memoryReservations.get(String(item));
    if (!current || current.owner !== owner) return false;
    memoryReservations.delete(String(item));
    return true;
  }

  function storeFor(id) {
    return db ? new D1WorkDagStore(db, id) : new MemoryWorkDagStore(id, memoryDagStore);
  }

  async function run(input = {}, context = {}) {
    const id = runId(input);
    const agent = await registry.get({ agent_id: agentId(input) });
    requireValue(agent.status === 'ACTIVE', 'AGENT_DISABLED', 409);
    const reservationOwner = `agent-run:${id}`;
    const roadmapItem = nonEmptyString(input.roadmap_item) ? input.roadmap_item.trim() : '';
    const reservation = await acquireReservation(roadmapItem, reservationOwner);
    const store = storeFor(id);

    try {
      let dag = await store.load();
      if (!dag) {
        dag = createWorkDag({
          id,
          jobId: `agent:${agent.id}`,
          goal: agent.goal || agent.description || agent.name,
          candidateBranch: input.candidate_branch || null,
          candidateSha: input.candidate_sha || null,
          nodes: compiledNodes(agent, input.input),
        });
        dag = await store.save(dag);
      } else {
        requireValue(dag.job_id === `agent:${agent.id}`, 'AGENT_RUN_AGENT_MISMATCH', 409);
      }

      const runner = new WorkDagRunner({
        store,
        expectedCandidateSha: input.candidate_sha || null,
        executors: {
          TASK: taskExecutor(bus, context),
          AUGMENTIO: augmentioExecutor(bus, context, agent, id),
        },
      });
      dag = await runner.run(dag);
      const summary = summarizeWorkDag(dag);
      if (summary.terminal) await releaseReservation(roadmapItem, reservationOwner);
      return Object.freeze({
        agent: Object.freeze({ id: agent.id, version: agent.version }),
        run_id: id,
        reservation,
        summary,
        dag,
      });
    } catch (error) {
      await releaseReservation(roadmapItem, reservationOwner);
      throw error;
    }
  }

  async function getRun(input = {}) {
    const id = runId(input);
    const dag = await storeFor(id).load();
    requireValue(dag, 'AGENT_RUN_NOT_FOUND', 404);
    return Object.freeze({ run_id: id, summary: summarizeWorkDag(dag), dag });
  }

  async function cancel(input = {}) {
    const id = runId(input);
    const store = storeFor(id);
    const dag = await store.load();
    requireValue(dag, 'AGENT_RUN_NOT_FOUND', 404);
    if (dag.status === WORK_DAG_STATUS.COMPLETED || dag.status === WORK_DAG_STATUS.BLOCKED) {
      return Object.freeze({ run_id: id, summary: summarizeWorkDag(dag), dag });
    }
    for (const node of dag.nodes) {
      if (node.status !== WORK_NODE_STATUS.COMPLETED) {
        node.status = WORK_NODE_STATUS.BLOCKED;
        node.error = 'AGENT_RUN_CANCELLED';
      }
    }
    dag.status = WORK_DAG_STATUS.BLOCKED;
    dag.audit = [...(dag.audit || []), { event: 'AGENT_RUN_CANCELLED', at: Date.now() }];
    const saved = await store.save(dag);
    if (nonEmptyString(input.roadmap_item)) {
      await releaseReservation(input.roadmap_item.trim(), `agent-run:${id}`);
    }
    return Object.freeze({ run_id: id, summary: summarizeWorkDag(saved), dag: saved });
  }

  return Object.freeze({
    run,
    resume: run,
    getRun,
    cancel,
  });
}
