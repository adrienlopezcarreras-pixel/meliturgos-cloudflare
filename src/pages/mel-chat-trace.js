// « Ce que j'ai fait » : un résumé vérifiable sous chaque réponse de MEL.
//
// Construit uniquement à partir de la réponse du serveur (tool_results,
// modèle, archivage, troncature, durée) : aucun appel IA supplémentaire,
// aucune donnée inventée. Une action n'est marquée ✓ que si le serveur a
// renvoyé SUCCEEDED pour cette capacité dans cette requête.

const TRACE_STATUS = { SUCCEEDED: '✓', FAILED: '✗', QUEUED: '…', PENDING: '…', RUNNING: '…', BLOCKED: '⛔' };

export function melTraceModel(d) {
  const source = d && typeof d === 'object' ? d : {};
  const tools = Array.isArray(source.tool_results) ? source.tool_results : [];
  const steps = tools.map(tool => {
    const status = String(tool?.status || '').toUpperCase();
    return {
      icon: TRACE_STATUS[status] || '•',
      label: String(tool?.capability || 'action'),
      status: status || 'INCONNU',
      detail: tool?.error ? String(tool.error).slice(0, 120) : '',
    };
  });
  const outputs = [];
  if (source.work?.id) outputs.push('Travail persistant ' + String(source.work.id));
  if (source.computer_command?.command_id) outputs.push('Commande PC ' + String(source.computer_command.command_id));
  if (source.development_job?.id) outputs.push('Tâche de développement ' + String(source.development_job.id));
  const model = String(source.model || '').replace(/^@cf\/[^/]+\//, '');
  const seconds = Number.isFinite(Number(source.elapsed_ms)) ? (Number(source.elapsed_ms) / 1000).toFixed(1).replace('.', ',') + ' s' : null;
  const ok = steps.filter(step => step.status === 'SUCCEEDED').length;
  const failed = steps.filter(step => step.status === 'FAILED').length;
  const parts = [];
  if (steps.length) parts.push(ok + ' action' + (ok > 1 ? 's' : '') + ' réussie' + (ok > 1 ? 's' : '') + (failed ? ', ' + failed + ' en échec' : ''));
  else parts.push('réponse directe');
  if (model) parts.push(model);
  if (seconds) parts.push(seconds);
  const notes = [];
  if (source.streamed) notes.push('écrite en flux continu');
  if (source.archive_saved === true) notes.push('enregistrée dans la conversation');
  else if (source.archive_saved === false) notes.push('non enregistrée');
  if (source.response_truncated === true) notes.push('réponse tronquée');
  if (source.stream_error) notes.push('interrompue : ' + String(source.stream_error));
  return { summary: parts.join(' · '), steps, outputs, notes };
}

function melRenderTrace(d) {
  const log = document.getElementById('chatlog');
  const bubble = log ? log.lastElementChild : null;
  if (!bubble || !d || typeof d !== 'object') return;
  if (!document.getElementById('melTraceStyle')) {
    const style = document.createElement('style');
    style.id = 'melTraceStyle';
    style.textContent = '.mel-trace{margin-top:.6rem;font-size:.82em;opacity:.8}.mel-trace summary{cursor:pointer;list-style:none}.mel-trace summary::before{content:"▸ ";}.mel-trace[open] summary::before{content:"▾ ";}.mel-trace ul{margin:.35rem 0 0;padding-left:1.1rem}.mel-trace li{margin:.1rem 0}.mel-trace .muted{opacity:.75}';
    document.head.appendChild(style);
  }
  const model = melTraceModel(d);
  const details = document.createElement('details');
  details.className = 'mel-trace';
  const summary = document.createElement('summary');
  summary.textContent = 'Ce que j’ai fait : ' + model.summary;
  details.appendChild(summary);
  const list = document.createElement('ul');
  const add = (text, muted) => { const li = document.createElement('li'); li.textContent = text; if (muted) li.className = 'muted'; list.appendChild(li); };
  for (const step of model.steps) add(step.icon + ' ' + step.label + (step.detail ? ' — ' + step.detail : ''));
  for (const output of model.outputs) add('Sortie : ' + output);
  for (const note of model.notes) add(note, true);
  if (list.children.length) details.appendChild(list);
  bubble.appendChild(details);
}

export const MEL_CHAT_TRACE_SOURCE = [melTraceModel, melRenderTrace].map(fn => fn.toString()).join('\n') + '\nconst TRACE_STATUS = ' + JSON.stringify(TRACE_STATUS) + ';\n';
