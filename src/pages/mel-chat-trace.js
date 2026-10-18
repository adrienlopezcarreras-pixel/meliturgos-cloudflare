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
  // Live progress reported by the server during this answer (steps and tools).
  const live = Array.isArray(source.progress) ? source.progress : [];
  const PROGRESS_ICON = { done: '✓', failed: '✗', running: '…' };
  const progress = live.map(step => (PROGRESS_ICON[step?.status] || '•') + ' ' + String(step?.label || '') + (step?.detail ? ' — ' + String(step.detail) : ''));
  if (!steps.length) {
    for (const step of live.filter(row => row?.kind === 'tool' || row?.kind === 'pc')) {
      steps.push({ icon: PROGRESS_ICON[step.status] || '•', label: String(step.tool || step.label || 'action'), status: step.status === 'done' ? 'SUCCEEDED' : step.status === 'failed' ? 'FAILED' : 'RUNNING', detail: step.status === 'failed' ? String(step.detail || '').slice(0, 120) : '' });
    }
  }
  const outputs = [];
  if (source.work?.id) outputs.push('Travail persistant ' + String(source.work.id));
  if (source.computer_command?.command_id) outputs.push('Commande PC ' + String(source.computer_command.command_id));
  if (source.development_job?.id) outputs.push('Tâche de développement ' + String(source.development_job.id));
  if (source.artifact?.id) outputs.push('Livrable ' + String(source.artifact.id));
  if (Array.isArray(source.published_links)) for (const link of source.published_links.slice(0, 5)) outputs.push('Publié : ' + String(link));
  const model = String(source.model || '').replace(/^@cf\/[^/]+\//, '');
  const liveTools = live.filter(row => row?.kind === 'tool' || row?.kind === 'pc').map(row => String(row.label || row.tool || ''));
  const used = [...new Set((liveTools.length ? liveTools : steps.map(step => step.label)).filter(Boolean))];
  if (model) used.push('Modèle ' + model);
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
  return { summary: parts.join(' · '), steps, outputs, notes, progress, used };
}

function melRenderTrace(d) {
  const log = document.getElementById('chatlog');
  const bubble = log ? log.lastElementChild : null;
  if (!bubble || !d || typeof d !== 'object') return;
  if (!document.getElementById('melTraceStyle')) {
    const style = document.createElement('style');
    style.id = 'melTraceStyle';
    style.textContent = '.mel-trace{margin-top:.6rem;font-size:.82em;opacity:.8}.mel-trace summary{cursor:pointer;list-style:none}.mel-trace summary::before{content:"▸ ";}.mel-trace[open] summary::before{content:"▾ ";}.mel-trace ul{margin:.35rem 0 0;padding-left:1.1rem}.mel-trace li{margin:.1rem 0}.mel-trace .muted{opacity:.75}.mel-trace-h{margin-top:.45rem;font-weight:600;opacity:.9}.mel-live{font-size:.85em;opacity:.85;margin-bottom:.4rem;border-left:2px solid #60a5fa;padding-left:.5rem}.mel-live-failed{color:#fda4af}.mel-live-done{opacity:.8}';
    document.head.appendChild(style);
  }
  const model = melTraceModel(d);
  const details = document.createElement('details');
  details.className = 'mel-trace';
  // Open when MEL actually did something: the owner sees it like an agent's panel.
  if (model.steps.length || model.outputs.length) details.open = true;
  const summary = document.createElement('summary');
  summary.textContent = 'Ce que j’ai fait : ' + model.summary;
  details.appendChild(summary);
  const section = (title, rows, muted) => {
    if (!rows.length) return;
    const head = document.createElement('div'); head.className = 'mel-trace-h'; head.textContent = title; details.appendChild(head);
    const list = document.createElement('ul');
    for (const row of rows) { const li = document.createElement('li'); li.textContent = row; if (muted) li.className = 'muted'; list.appendChild(li); }
    details.appendChild(list);
  };
  section('Progression', model.progress.length ? model.progress : model.steps.map(step => step.icon + ' ' + step.label + (step.detail ? ' — ' + step.detail : '')));
  section('Sorties', model.outputs);
  section('Utilisés', model.used);
  section('Notes', model.notes, true);
  bubble.appendChild(details);
}

export const MEL_CHAT_TRACE_SOURCE = [melTraceModel, melRenderTrace].map(fn => fn.toString()).join('\n') + '\nconst TRACE_STATUS = ' + JSON.stringify(TRACE_STATUS) + ';\n';
