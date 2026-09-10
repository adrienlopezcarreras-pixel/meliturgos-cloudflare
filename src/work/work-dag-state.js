import { WORK_DAG_STATUS, WORK_NODE_STATUS, validateWorkDag } from './work-dag.js';

const TERMINAL_NODE_STATUSES = new Set([
  WORK_NODE_STATUS.COMPLETED,
  WORK_NODE_STATUS.FAILED,
  WORK_NODE_STATUS.BLOCKED,
]);

export function summarizeWorkDag(dag) {
  validateWorkDag(dag);

  const counts = Object.fromEntries(Object.values(WORK_NODE_STATUS).map((status) => [status, 0]));
  for (const node of dag.nodes) {
    if (Object.hasOwn(counts, node.status)) counts[node.status] += 1;
  }

  const completed = dag.status === WORK_DAG_STATUS.COMPLETED &&
    dag.nodes.every((node) => node.status === WORK_NODE_STATUS.COMPLETED);
  const blocked = dag.status === WORK_DAG_STATUS.BLOCKED ||
    dag.nodes.some((node) => [WORK_NODE_STATUS.FAILED, WORK_NODE_STATUS.BLOCKED].includes(node.status));
  const waitingTeacherNodeIds = dag.nodes
    .filter((node) => node.status === WORK_NODE_STATUS.WAITING_TEACHER)
    .map((node) => node.id);
  const runnableNodeIds = dag.nodes
    .filter((node) => node.status === WORK_NODE_STATUS.PENDING)
    .filter((node) => (node.depends_on || []).every((dep) =>
      dag.nodes.find((candidate) => candidate.id === dep)?.status === WORK_NODE_STATUS.COMPLETED))
    .map((node) => node.id);

  return {
    id: dag.id,
    job_id: dag.job_id,
    candidate_branch: dag.candidate_branch || null,
    candidate_sha: dag.candidate_sha || null,
    status: dag.status,
    completed,
    blocked,
    terminal: completed || blocked || dag.nodes.every((node) => TERMINAL_NODE_STATUSES.has(node.status)),
    node_counts: counts,
    runnable_node_ids: runnableNodeIds,
    waiting_teacher_node_ids: waitingTeacherNodeIds,
    updated_at: dag.updated_at || null,
  };
}

export function isWorkDagComplete(dag) {
  return summarizeWorkDag(dag).completed;
}
