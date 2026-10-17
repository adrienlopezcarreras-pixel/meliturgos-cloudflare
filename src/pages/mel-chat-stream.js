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

async function melChatFetch(payload, { firstByteMs = 90000, idleMs = 45000 } = {}) {
  const startedAt = Date.now();
  const controller = new AbortController();
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
    throw error?.name === 'AbortError' ? Error('Réponse serveur trop lente') : error;
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
  let text = '';
  let meta = {};
  let failure = null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bump();
      buffer += decoder.decode(value, { stream: true });
      const parsed = melParseNdjsonLines(buffer);
      buffer = parsed.rest;
      for (const event of parsed.events) {
        if (event.type === 'start') { if (status) status.textContent = 'MEL écrit…'; }
        else if (event.type === 'step') {
          const box = ensureSteps();
          if (box) { const line = document.createElement('div'); line.textContent = String(event.text || ''); box.appendChild(line); }
          if (status) status.textContent = 'MEL agit sur ton PC… étape ' + String(event.n || '');
          if (log) log.scrollTop = log.scrollHeight;
        } else if (event.type === 'proof') {
          const url = new URL(String(event.url || ''), location.origin);
          if (bubble && url.origin === location.origin && url.pathname === '/api/computer/v1/screenshot') {
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
        else if (event.type === 'error') failure = event;
      }
    }
  } catch (error) {
    failure = { code: error?.name === 'AbortError' ? 'Réponse interrompue (aucun texte reçu depuis 45 s)' : String(error?.message || error) };
  } finally {
    clearTimeout(timer);
    if (bubble) bubble.classList.remove('streaming');
  }
  if (text && typeof melRenderRichText === 'function') { textBox.textContent = ''; melRenderRichText(textBox, text); }
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
  return { ok: !failure, text, model: meta.model || null, streamed: true, agent_steps: meta.steps || 0, proof_url: meta.proof_url || null, archive_saved: meta.archived === true, response_truncated: meta.truncated === true, elapsed_ms: Date.now() - startedAt, stream_error: failure ? String(failure.code || 'STREAM_FAILED') : null };
}

export const MEL_CHAT_STREAM_SOURCE = [melParseNdjsonLines, melChatFetch].map(fn => fn.toString()).join('\n') + '\n';
