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
  const rawModel = String(source.model || '').replace(/^@cf\/[^/]+\//, '');
  const model = rawModel === 'deterministic-media-evidence' ? 'outils, sans modèle' : rawModel === 'deterministic-code-evidence' ? 'lecture du code, sans modèle' : rawModel;
  const liveTools = live.filter(row => row?.kind === 'tool' || row?.kind === 'pc').map(row => String(row.label || row.tool || ''));
  const used = [...new Set((liveTools.length ? liveTools : steps.map(step => step.label)).filter(Boolean))];
  if (model) used.push('Modèle ' + model);
  const seconds = Number.isFinite(Number(source.elapsed_ms)) ? (Number(source.elapsed_ms) / 1000).toFixed(1).replace('.', ',') + ' s' : null;
  const ok = steps.filter(step => step.status === 'SUCCEEDED').length;
  const failed = steps.filter(step => step.status === 'FAILED').length;
  const parts = [];
  const loraRefused = source.ok === false && String(source.code || '').startsWith('LORA_');
  if (steps.length) parts.push(ok + ' action' + (ok > 1 ? 's' : '') + ' réussie' + (ok > 1 ? 's' : '') + (failed ? ', ' + failed + ' en échec' : ''));
  else if (loraRefused) parts.push('LoRA UNCENSORED non activé');
  else if (source.ok === false) parts.push('modèle non utilisé');
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
  if (!d || typeof d !== 'object' || typeof melCodeLiveRecord !== 'function') return;
  const model = melTraceModel(d);
  const status = d.ok === false ? 'failed' : 'done';
  melCodeLiveRecord({ id: 'trace-' + Date.now(), kind: 'trace', label: model.summary, status, source: 'server' });
}

export const MEL_CHAT_TRACE_SOURCE = [melTraceModel, melRenderTrace].map(fn => fn.toString()).join('\n') + '\nconst TRACE_STATUS = ' + JSON.stringify(TRACE_STATUS) + ';\n';
