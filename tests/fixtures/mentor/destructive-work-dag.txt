export function createWorkDag(options) {
  const dag = {
    id: options.id,
    jobId: options.jobId,
    goal: options.goal,
    candidateBranch: options.candidateBranch,
    nodes: options.nodes,
  };

  // Ajouter un mécanisme de récupération pour les travaux interrompus
  dag.nodes.forEach((node) => {
    if (node.kind === 'AUGMENTIO' && node.idempotent) {
      node.status = 'RUNNING';
      node.attempts = 1;
    }
  });

  return dag;
}