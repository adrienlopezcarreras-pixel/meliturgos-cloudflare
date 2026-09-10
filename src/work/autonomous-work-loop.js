import { WORK_DAG_STATUS, WORK_NODE_STATUS } from './work-dag.js';

function requireChannel(channel) {
  if (!channel || typeof channel.publishRequest !== 'function' || typeof channel.getReply !== 'function') {
    throw Object.assign(new Error('TEACHER_CHANNEL_REQUIRED'), { code: 'TEACHER_CHANNEL_REQUIRED' });
  }
  return channel;
}

export class InMemoryTeacherChannel {
  constructor() {
    this.requests = new Map();
    this.replies = new Map();
  }

  async publishRequest(request, metadata = {}) {
    const id = String(request?.request_id || '');
    if (!id) throw Object.assign(new Error('TEACHER_REQUEST_ID_REQUIRED'), { code: 'TEACHER_REQUEST_ID_REQUIRED' });
    if (!this.requests.has(id)) this.requests.set(id, { request: structuredClone(request), metadata: structuredClone(metadata) });
    return { request_id: id, published: true, duplicate: this.requests.has(id) && this.requests.size > 0 };
  }

  async getReply(requestId) {
    return structuredClone(this.replies.get(String(requestId)) || null);
  }

  async submitReply(reply) {
    const id = String(reply?.request_id || '');
    if (!id) throw Object.assign(new Error('TEACHER_REPLY_ID_REQUIRED'), { code: 'TEACHER_REPLY_ID_REQUIRED' });
    this.replies.set(id, structuredClone(reply));
    return { request_id: id, stored: true };
  }
}

/**
 * Bounded supervisor around WorkDagRunner.
 * It never invents a Teacher reply. It publishes pending requests, polls the
 * configured channel, applies only a matching reply through WorkDagRunner,
 * and continues already-authorized work until completion/block/wait.
 */
export class AutonomousWorkLoop {
  constructor({ runner, store, teacherChannel, maxCycles = 8 } = {}) {
    if (!runner || typeof runner.run !== 'function' || typeof runner.submitTeacherReply !== 'function') {
      throw Object.assign(new Error('WORK_DAG_RUNNER_REQUIRED'), { code: 'WORK_DAG_RUNNER_REQUIRED' });
    }
    if (!store || typeof store.load !== 'function') {
      throw Object.assign(new Error('WORK_DAG_STORE_REQUIRED'), { code: 'WORK_DAG_STORE_REQUIRED' });
    }
    this.runner = runner;
    this.store = store;
    this.teacherChannel = requireChannel(teacherChannel);
    this.maxCycles = Math.max(1, Math.min(32, Number(maxCycles) || 8));
  }

  async publishAndMaybeResume(dag) {
    const waiting = dag.nodes.filter((node) => node.status === WORK_NODE_STATUS.WAITING_TEACHER);
    if (!waiting.length) return { dag, progressed: false };

    let current = dag;
    for (const node of waiting) {
      const request = node.teacher_request;
      if (!request?.request_id) {
        throw Object.assign(new Error('WORK_TEACHER_REQUEST_REQUIRED'), { code: 'WORK_TEACHER_REQUEST_REQUIRED' });
      }
      await this.teacherChannel.publishRequest(request, {
        work_dag_id: current.id,
        job_id: current.job_id,
        node_id: node.id,
        candidate_branch: current.candidate_branch,
        candidate_sha: current.candidate_sha,
      });
      const reply = await this.teacherChannel.getReply(request.request_id);
      if (!reply) continue;
      if (String(reply.request_id || '') !== request.request_id) {
        throw Object.assign(new Error('TEACHER_REPLY_REQUEST_MISMATCH'), { code: 'TEACHER_REPLY_REQUEST_MISMATCH' });
      }
      current = await this.runner.submitTeacherReply(node.id, reply);
      return { dag: current, progressed: true };
    }
    return { dag: current, progressed: false };
  }

  async run() {
    let dag = await this.store.load();
    if (!dag) throw Object.assign(new Error('WORK_DAG_NOT_FOUND'), { code: 'WORK_DAG_NOT_FOUND' });

    for (let cycle = 0; cycle < this.maxCycles; cycle += 1) {
      dag = await this.runner.run(dag);
      if (dag.status === WORK_DAG_STATUS.COMPLETED || dag.status === WORK_DAG_STATUS.BLOCKED) return dag;
      if (dag.status === WORK_DAG_STATUS.WAITING) {
        const reconciled = await this.publishAndMaybeResume(dag);
        dag = reconciled.dag;
        if (!reconciled.progressed) return dag;
        if (dag.status === WORK_DAG_STATUS.COMPLETED || dag.status === WORK_DAG_STATUS.BLOCKED) return dag;
        continue;
      }
    }

    const latest = await this.store.load();
    if (latest) {
      latest.audit = [...(latest.audit || []), { event: 'AUTONOMOUS_WORK_LOOP_CYCLE_LIMIT', at: Date.now(), max_cycles: this.maxCycles }];
      return this.store.save(latest);
    }
    return dag;
  }
}
