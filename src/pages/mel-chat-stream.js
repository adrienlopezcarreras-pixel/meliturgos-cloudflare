// Côté navigateur : lecture en flux des réponses de MEL (voir src/api/chat-stream.js).
//
// La réponse apparaît pendant que MEL l'écrit. Le délai n'est plus une durée
// totale (une longue réponse pouvait dépasser 120 s) mais une durée
// d'inactivité : tant que du texte arrive, la lecture continue.
// Si le serveur répond en JSON classique (outil, vocal, travail durable…),
// le comportement est identique à avant.

export function melParseNdjsonLines(buffer) {
  const lines = String(buffer).split('\n');
  const rest = lines.pop();
  const events = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch {}
  }
  return { events, rest };
}

// Le serveur peut travailler 90 s sans nouveau fragment si un appel de modèle
// bloque les battements. Le silence autorisé reste sous le délai client de
// 120 s, et au-dessus de ce budget, pour ne pas couper une réponse encore en cours.
async function melChatFetch(payload, { firstByteMs = 90000, idleMs = 105000, signal = null, onProgress = null } = {}) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const abortFromOwner = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abortFromOwner, { once: true });
  let timer = setTimeout(() => controller.abort(), firstByteMs);
  const bump = () => { clearTimeout(timer); timer = setTimeout(() => controller.abort(), idleMs); };
  let response;
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/x-ndjson, application/json' },
      body: JSON.stringify({ ...payload, stream: true }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromOwner);
    throw error?.name === 'AbortError' ? Error(signal?.aborted ? 'Réponse interrompue par le propriétaire' : 'Réponse serveur trop lente') : error;
  }
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/x-ndjson') || !response.body) {
    try {
      const raw = await response.text();
      let data;
      try { data = raw ? JSON.parse(raw) : {}; } catch { throw Error('Réponse serveur invalide'); }
      if (!response.ok) throw Error(typeof apiErrorMessage === 'function' ? apiErrorMessage(data, response.status) : 'HTTP ' + response.status);
      if (data && typeof data === 'object') data.elapsed_ms = Date.now() - startedAt;
      return data;
    } catch (error) {
      throw error?.name === 'AbortError' ? Error('Réponse serveur trop lente') : error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abortFromOwner);
    }
  }

  const status = document.getElementById('chatStatus');
  const log = document.getElementById('chatlog');
  addMsg('mel', '');
  const bubble = log ? log.lastElementChild : null;
  if (bubble) bubble.classList.add('streaming');
  // Live agent steps and proof image live in their own boxes; text goes in textBox.
  let stepsBox = null;
  const textBox = document.createElement('div');
  if (bubble) { bubble.textContent = ''; bubble.appendChild(textBox); }
  const ensureSteps = () => {
    if (!stepsBox && bubble) { stepsBox = document.createElement('div'); stepsBox.className = 'mel-agent-steps'; bubble.insertBefore(stepsBox, textBox); }
    return stepsBox;
  };
  // Live panel: what MEL is doing right now (steps and tools), like an agent's progress view.
  const progress = new Map();
  let liveBox = null;
  const renderLive = () => {
    // [GPT] Code-mode window owns live progress; keep the chat bubble light.
    if (typeof onProgress === 'function') return;
    if (!bubble) return;
    if (!liveBox) { liveBox = document.createElement('div'); liveBox.className = 'mel-live'; bubble.insertBefore(liveBox, bubble.firstChild); }
    liveBox.textContent = '';
    for (const step of progress.values()) {
      const line = document.createElement('div');
      line.className = 'mel-live-' + step.status;
      const icon = step.status === 'done' ? '✓' : step.status === 'failed' ? '✗' : '⏳';
      line.textContent = icon + ' ' + step.label + (step.detail ? ' — ' + step.detail : '') + (step.ms ? ' · ' + (step.ms / 1000).toFixed(1).replace('.', ',') + ' s' : '');
      liveBox.appendChild(line);
    }
  };
  let text = '';
  let meta = {};
  let failure = null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (!done) bump();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (done && buffer.trim()) buffer += '\n';
      const parsed = melParseNdjsonLines(buffer);
      buffer = parsed.rest;
      for (const event of parsed.events) {
        if (event.type === 'progress') {
          progress.set(String(event.id || progress.size), { label: String(event.label || ''), status: String(event.status || 'running'), detail: String(event.detail || ''), ms: Number(event.ms) || 0, kind: String(event.kind || 'step'), tool: event.tool ? String(event.tool) : '' });
          renderLive();
          // [GPT] Forward only server-authored progress, never fabricate a tool action.
          try { if(typeof onProgress==='function')onProgress({id:String(event.id||''),label:String(event.label||''),status:String(event.status||'running'),source:'server'}); } catch {}
          if (status && event.status === 'running') status.textContent = String(event.label || 'MEL travaille…') + '…';
          if (log) log.scrollTop = log.scrollHeight;
        }
        else if (event.type === 'start') { if (status) status.textContent = 'MEL écrit…'; try{if(typeof onProgress==='function')onProgress({id:'response-start',label:'Réponse démarrée par MEL',status:'running',source:'server'})}catch{} }
        else if (event.type === 'step') {
          try{if(typeof onProgress==='function')onProgress({id:'pc-step-'+String(event.n||''),label:'PC : '+String(event.text||'étape confirmée').slice(0,115),status:'done',source:'server'})}catch{}
          const box = ensureSteps();
          if (box) { const line = document.createElement('div'); line.textContent = String(event.text || ''); box.appendChild(line); }
          if (status) status.textContent = 'MEL agit sur ton PC… étape ' + String(event.n || '');
          if (log) log.scrollTop = log.scrollHeight;
        } else if (event.type === 'proof') {
          const url = new URL(String(event.url || ''), location.origin);
          if (bubble && url.origin === location.origin && url.pathname === '/api/computer/v1/screenshot') {
            try{if(typeof onProgress==='function')onProgress({id:'pc-proof-'+Date.now(),label:'Capture PC reçue',status:'done',source:'server'})}catch{}
            const img = document.createElement('img');
            img.alt = 'Capture de ton écran après l’action de MEL';
            img.src = url.href;
            img.style.maxWidth = '100%'; img.style.height = 'auto'; img.style.borderRadius = '10px'; img.style.marginTop = '.5rem';
            bubble.appendChild(img);
          }
        } else if (event.type === 'delta') {
          text += String(event.text || '');
          textBox.textContent = text;
          if (log) log.scrollTop = log.scrollHeight;
        } else if (event.type === 'done') meta = event;
        else if (event.type === 'error'){ failure = event; try{if(typeof onProgress==='function')onProgress({id:'server-error',label:'Erreur du serveur : '+String(event.code||'UNKNOWN').slice(0,70),status:'failed',source:'server'})}catch{} }
      }
      if (done) break;
    }
  } catch (error) {
    failure = { code: error?.name === 'AbortError' ? (signal?.aborted ? 'Interrompu par le propriétaire' : 'Réponse interrompue (aucun texte reçu)') : String(error?.message || error) };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromOwner);
    if (bubble) bubble.classList.remove('streaming');
  }
  if (liveBox) liveBox.remove();
  if (text && typeof melRenderRichText === 'function') { textBox.textContent = ''; melRenderRichText(textBox, text, meta.result || {}); }
  if (failure && !text) {
    if (bubble) bubble.remove();
    throw Error(String(failure.code || 'STREAM_FAILED'));
  }
  if (failure && bubble) {
    const note = document.createElement('div');
    note.className = 'muted';
    note.textContent = 'Réponse interrompue : ' + String(failure.code || 'STREAM_FAILED') + (meta.archived ? '' : ' · partie reçue conservée');
    bubble.appendChild(note);
  }
  const result = meta.result && typeof meta.result === 'object' ? meta.result : {};
  // MEL-UI-AUDIT-02: result, partial error and error are distinct in the
  // render and the returned record; the send mode and references are kept.
  const outcome = failure ? (text ? 'PARTIAL_ERROR' : 'ERROR') : 'RESULT';
  if (bubble) bubble.dataset.outcome = outcome;
  return { ...result, outcome, mode: payload?.mode ?? result.mode ?? null, references: Array.isArray(result.references) ? result.references : [], ok: !failure && result.ok !== false, text, model: meta.model || result.model || null, streamed: true, progress: [...progress.values()], agent_steps: meta.steps || 0, proof_url: meta.proof_url || null, archive_saved: meta.archived === true, response_truncated: meta.truncated === true, elapsed_ms: Date.now() - startedAt, stream_error: failure ? String(failure.code || 'STREAM_FAILED') : null };
}

export const MEL_CHAT_STREAM_SOURCE = [melParseNdjsonLines, melChatFetch].map(fn => fn.toString()).join('\n') + '\n';
