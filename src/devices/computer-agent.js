// MEL prend le contrôle du PC d'Adrien pour accomplir un objectif :
// regarder la fenêtre active (ui.snapshot), décider UNE action, l'exécuter via
// le Companion, recommencer, puis prouver le résultat par une capture.
//
// Garde-fous (tous déjà appliqués par le Companion sur le PC) : accès à
// distance autorisé localement, applications limitées à la liste cochée par
// Adrien, bouton STOP local prioritaire. Ici : nombre d'étapes borné, aucune
// commande shell/fichier/alimentation, arrêt immédiat si le PC refuse.

import { evaluateComputerUsePlan, classifyComputerUseAction, COMPUTER_USE_RISK } from './computer-use.js';

export const AGENT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const AGENT_MAX_STEPS = 15;
const COMMAND_TIMEOUT_MS = 25_000;
const POLL_MS = 400;
const ENGINE_FRESH_MS = 20_000;

// Exactly the keys supported by the Companion engine (Key-Token) and the policy.
const KEYS = ['ENTER', 'TAB', 'ESC', 'BACKSPACE', 'DELETE', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'HOME', 'END', 'PGUP', 'PGDN', 'CTRL+L', 'CTRL+C', 'CTRL+V', 'CTRL+A', 'CTRL+S', 'ALT+TAB', 'F5'];

function parseJson(text, fallback = null) {
  try { return JSON.parse(text); } catch { return fallback; }
}

export async function diagnoseAgentDevice(db, now = Date.now()) {
  const rows = (await db.prepare("SELECT * FROM computer_devices WHERE platform='windows' AND halted=0 ORDER BY last_seen_at DESC LIMIT 5").all())?.results || [];
  if (!rows.length) return { device: null, code: 'COMPANION_NO_ACTIVE_WINDOWS_DEVICE' };
  let failure = 'COMPANION_HEARTBEAT_STALE';
  for (const row of rows) {
    const meta = parseJson(row.metadata, {}) || {};
    if (meta.remote_access_enabled !== true) {
      failure = 'COMPANION_REMOTE_ACCESS_DISABLED';
      continue;
    }
    const engineSeen = Number(meta.engine_heartbeat_at || 0);
    if (!Number.isFinite(engineSeen) || engineSeen <= 0 || engineSeen > now || now - engineSeen > ENGINE_FRESH_MS) {
      failure = 'COMPANION_HEARTBEAT_STALE';
      continue;
    }
    return { device: { id: row.id, name: row.name, allowed_apps: parseJson(row.allowed_apps, []) || [], allowed_paths: Array.isArray(meta.allowed_paths) ? meta.allowed_paths : [], capabilities: parseJson(row.capabilities, []) || [], screen: meta.screen || null }, code: 'READY' };
  }
  return { device: null, code: failure };
}

export async function selectAgentDevice(db, now = Date.now()) {
  return (await diagnoseAgentDevice(db, now)).device;
}

// Met une commande en file pour le Companion et attend son résultat.
export async function runCompanionCommand({ db, device, steps, sessionId, sleep, now = () => Date.now(), timeoutMs = COMMAND_TIMEOUT_MS }) {
  const numbered = steps.map((step, index) => ({ ...step, id: `step-${index + 1}` }));
  const approvals = numbered
    .filter(step => classifyComputerUseAction(step.action) === COMPUTER_USE_RISK.SENSITIVE)
    .map(step => ({ approved: true, session_id: sessionId, step_id: step.id, action: step.action }));
  const plan = evaluateComputerUsePlan({
    session_id: sessionId, owner_halt: false,
    device: { id: device.id, capabilities: device.capabilities },
    // The owner's own chat request authorizes exactly the pages this command opens.
    sandbox: { allowed_apps: device.allowed_apps, allowed_paths: device.allowed_paths, allowed_origins: [...new Set(numbered.filter(step => step.url).map(step => new URL(step.url).origin))], max_steps: numbered.length },
    approvals, steps: numbered,
  });
  if (!plan.allowed) return { ok: false, code: plan.reason || 'COMPUTER_PLAN_DENIED' };
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)')
    .bind(id, device.id, sessionId, JSON.stringify(plan.request), 'PENDING', now()).run();
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    await sleep(POLL_MS);
    const row = await db.prepare('SELECT status,result_json,error_code FROM computer_commands WHERE id=?').bind(id).first();
    if (row?.status === 'SUCCEEDED') return { ok: true, id, outputs: parseJson(row.result_json, {})?.outputs || [] };
    if (row?.status === 'FAILED') return { ok: false, id, code: row.error_code || 'COMPUTER_COMMAND_FAILED' };
  }
  await db.prepare("UPDATE computer_commands SET status='FAILED',finished_at=?,error_code=? WHERE id=? AND status IN ('PENDING','RUNNING')")
    .bind(now(), 'COMPUTER_AGENT_TIMEOUT', id).run();
  return { ok: false, id, code: 'COMPUTER_AGENT_TIMEOUT' };
}

export function describeSnapshot(snapshot = {}) {
  const lines = [];
  lines.push(`Fenêtre active : « ${String(snapshot.window_title || '').slice(0, 120)} » (${snapshot.process || '?'})`);
  const windows = Array.isArray(snapshot.open_windows) ? snapshot.open_windows : [];
  if (windows.length) lines.push('Fenêtres ouvertes : ' + windows.slice(0, 10).map(w => `${w.process}: ${String(w.title || '').slice(0, 50)}`).join(' | '));
  const elements = Array.isArray(snapshot.elements) ? snapshot.elements : [];
  lines.push(`Éléments visibles (${elements.length}${snapshot.truncated ? ', liste tronquée' : ''}) :`);
  for (const el of elements.slice(0, 150)) {
    const value = el.value ? ` = « ${String(el.value).slice(0, 80)} »` : '';
    lines.push(`#${el.i} ${el.type} « ${String(el.name || '').slice(0, 80)} »${value}${el.focused ? ' [focus]' : ''}${el.enabled === false ? ' [désactivé]' : ''}`);
  }
  return lines.join('\n');
}

function systemPrompt(device) {
  return [
    'Tu pilotes le PC Windows d\'Adrien pour accomplir son objectif. À chaque tour tu reçois la fenêtre active et ses éléments numérotés.',
    'Réponds UNIQUEMENT par un objet JSON, une seule action :',
    '{"action":"open_app","app":"notepad"} — applications autorisées : ' + (device.allowed_apps || []).join(', '),
    '{"action":"open_url","url":"https://fr.wikipedia.org/wiki/Paris"}  (ouvre une page web dans le navigateur ; https uniquement)',
    'Pour chercher sur le web : {"action":"open_url","url":"https://duckduckgo.com/?q=mots+cl%C3%A9s"} puis lis les résultats et clique sur le bon lien.',
    '{"action":"click","element":12}  (clic au centre de l\'élément #12)',
    '{"action":"double_click","element":12}',
    '{"action":"type","text":"..."}  (tape dans l\'élément qui a le focus ; clique d\'abord dessus si besoin)',
    '{"action":"key","key":"ENTER"}  touches : ' + KEYS.join(', '),
    '{"action":"scroll","delta":-480}  (négatif = vers le bas)',
    '{"action":"done","summary":"ce qui a été fait, vérifié sur l\'écran"}',
    '{"action":"fail","reason":"pourquoi c\'est impossible"}',
    'Règles : vérifie sur les éléments que l\'action précédente a marché avant de dire done. N\'invente jamais un numéro d\'élément. Pas plus d\'actions que nécessaire. N\'envoie, ne publie, ne supprime et ne paie rien sans que l\'objectif le demande explicitement.',
  ].join('\n');
}

export function parseAgentAction(text) {
  const raw = String(text || '');
  const match = raw.match(/\{[\s\S]*\}/);
  const value = match ? parseJson(match[0], null) : null;
  if (!value || typeof value.action !== 'string') return { action: 'fail', reason: 'AGENT_ACTION_UNPARSEABLE' };
  return value;
}

// Traduit la décision du modèle en étapes Companion validées.
// Public https pages only: no local network, raw IP, credentials or odd ports.
export function safeWebUrl(raw) {
  let url;
  try { url = new URL(String(raw || '').trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || /(^|\.)(localhost|local|internal|lan|home|arpa)$/.test(host)) return null;
  return url.href;
}

const WEBSITE_IN_GOAL = /https:\/\/[^\s"'<>]+|\b(?:[a-z0-9-]+\.)+(?:fr|com|org|net|io|dev|eu|be|ch|ca|info|app|ai|tv|me)\b(?:\/[^\s"'<>]*)?/i;
export function websiteFromGoal(objective) {
  const match = String(objective || '').match(WEBSITE_IN_GOAL);
  if (!match) return null;
  return safeWebUrl(/^https:\/\//i.test(match[0]) ? match[0] : 'https://' + match[0]);
}

const TEXT_FIELD_TYPES = /^(Edit|Document|ComboBox)$/i;

export function actionToSteps(action, snapshot = {}, device = {}) {
  const elements = Array.isArray(snapshot.elements) ? snapshot.elements : [];
  const element = Number.isInteger(action.element) ? elements.find(el => el.i === action.element) : null;
  switch (action.action) {
    case 'open_app': {
      const app = String(action.app || '').toLowerCase();
      if (!(device.allowed_apps || []).map(a => String(a).toLowerCase()).includes(app)) return { error: 'APP_NOT_ALLOWED_BY_ADRIEN' };
      return { steps: [{ action: 'app.open', app }], settleMs: 1500 };
    }
    case 'open_url': {
      const url = safeWebUrl(action.url);
      if (!url) return { error: 'AGENT_URL_NOT_ALLOWED' };
      return { steps: [{ action: 'browser.navigate', url }], settleMs: 2500 };
    }
    case 'click':
    case 'double_click': {
      if (!element) return { error: 'AGENT_ELEMENT_UNKNOWN' };
      const click = [{ action: 'cursor.move', x: element.x, y: element.y }, { action: 'pointer.click' }];
      return { steps: action.action === 'double_click' ? [...click, { action: 'pointer.click' }] : click, settleMs: 700 };
    }
    case 'type': {
      const text = String(action.text || '');
      if (!text) return { error: 'AGENT_TEXT_EMPTY' };
      // keyboard.type pastes into whatever has focus: only into a text field the
      // engine reports as focused, never into a page, a menu or another app's window.
      if (!elements.some(el => el.focused === true && TEXT_FIELD_TYPES.test(String(el.type || '')))) return { error: 'AGENT_NO_FOCUSED_TEXT_FIELD' };
      return { steps: [{ action: 'keyboard.type', text: text.slice(0, 4000) }], settleMs: 300 };
    }
    case 'key': {
      const key = String(action.key || '').toUpperCase();
      if (!KEYS.includes(key)) return { error: 'AGENT_KEY_NOT_ALLOWED' };
      return { steps: [{ action: 'keyboard.press', key }], settleMs: 600 };
    }
    case 'scroll':
      return { steps: [{ action: 'pointer.scroll', delta_y: Math.max(-2400, Math.min(2400, Number(action.delta) || -480)) }], settleMs: 400 };
    default:
      return { error: 'AGENT_ACTION_UNKNOWN' };
  }
}

function describeAction(action, snapshot) {
  const el = Number.isInteger(action.element) ? (snapshot.elements || []).find(x => x.i === action.element) : null;
  switch (action.action) {
    case 'open_app': return `Ouvrir ${action.app}`;
    case 'open_url': { try { return `Ouvrir ${new URL(String(action.url)).hostname}`; } catch { return 'Ouvrir une page'; } }
    case 'click': return `Cliquer sur « ${el?.name || '#' + action.element} »`;
    case 'double_click': return `Double-cliquer sur « ${el?.name || '#' + action.element} »`;
    case 'type': return `Taper « ${String(action.text || '').slice(0, 60)}${String(action.text || '').length > 60 ? '…' : ''} »`;
    case 'key': return `Touche ${action.key}`;
    case 'scroll': return 'Faire défiler';
    default: return action.action;
  }
}

/**
 * Boucle observer → décider → agir → vérifier.
 * onEvent reçoit {type:'step'|'proof'|'end', …} pour l'affichage en direct.
 */
export async function runComputerAgent({ env, goal, maxSteps = AGENT_MAX_STEPS, onEvent = () => {}, sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => Date.now() } = {}) {
  const db = env?.DB;
  if (!db || typeof env?.AI?.run !== 'function') return { ok: false, code: 'COMPUTER_AGENT_RUNTIME_MISSING' };
  const objective = String(goal || '').trim().slice(0, 2000);
  if (!objective) return { ok: false, code: 'COMPUTER_AGENT_GOAL_REQUIRED' };
  const device = await selectAgentDevice(db, now());
  if (!device) {
    onEvent({ type: 'end', ok: false, code: 'COMPUTER_ENGINE_OFFLINE', text: 'Ton PC n’est pas joignable : le Companion doit être ouvert, avec « Autoriser MEL à accéder à ce PC » coché.' });
    return { ok: false, code: 'COMPUTER_ENGINE_OFFLINE' };
  }
  const sessionId = crypto.randomUUID();
  const history = [];
  const limit = Math.max(1, Math.min(AGENT_MAX_STEPS, Number(maxSteps) || AGENT_MAX_STEPS));
  let summary = '';
  let status = 'INCOMPLETE';
  let pendingTypedText = null;
  let typedTextVerified = false;
  let successfulActions = 0;
  for (let turn = 1; turn <= limit; turn += 1) {
    // Launch an explicitly requested allowlisted application immediately.
    // No UIA round-trip is needed to discover where a known application lives.
    // A named website opens straight away, like a named application.
    const site = turn === 1 && /\b(?:va|aller|allez|ouvre|ouvrir|navigue|naviguer|consulte|affiche)\b/i.test(objective) ? websiteFromGoal(objective) : null;
    if (site) {
      const opened = await runCompanionCommand({ db, device, steps: [{ action: 'browser.navigate', url: site }], sessionId, sleep, now });
      history.push('Ouvrir ' + site + (opened.ok ? ' → fait' : ' → échec ' + opened.code));
      onEvent({ type: 'step', n: turn, ok: opened.ok, text: 'Ouvrir ' + new URL(site).hostname, code: opened.ok ? null : opened.code });
      if (!opened.ok) { status = 'FAILED'; summary = opened.code; break; }
      successfulActions += 1;
      await sleep(2500);
      continue;
    }
    if (turn === 1 && /\b(?:ouvre|ouvrir|lance|lancer|d[ée]marre)\b/i.test(objective)) {
      const app = /\b(?:bloc[- ]?notes|notepad)\b/i.test(objective) ? 'notepad' : null;
      if (app && (device.allowed_apps || []).some(value => String(value).toLowerCase() === app)) {
        const opened = await runCompanionCommand({ db, device, steps: [{ action: 'app.open', app }], sessionId, sleep, now });
        history.push('Ouvrir ' + app + (opened.ok ? ' → fait' : ' → échec ' + opened.code));
        onEvent({ type: 'step', n: turn, ok: opened.ok, text: 'Ouvrir ' + app, code: opened.ok ? null : opened.code });
        if (!opened.ok) { status = 'FAILED'; summary = opened.code; break; }
        successfulActions += 1;
        await sleep(1500);
        continue;
      }
    }
    const look = await runCompanionCommand({ db, device, steps: [{ action: 'ui.snapshot' }], sessionId, sleep, now });
    if (!look.ok) {
      onEvent({ type: 'step', n: turn, ok: false, text: 'Lecture de l’écran impossible', code: look.code });
      status = 'FAILED'; summary = look.code; break;
    }
    const snapshot = look.outputs?.[0] || {};
    if (pendingTypedText !== null) {
      typedTextVerified = Array.isArray(snapshot.elements) && snapshot.elements.some(el =>
        typeof el.value === 'string' && el.value.includes(pendingTypedText));
    }
    const messages = [
      { role: 'system', content: systemPrompt(device) },
      { role: 'user', content: `Objectif d'Adrien : ${objective}\n\nActions déjà faites :\n${history.map((h, i) => `${i + 1}. ${h}`).join('\n') || '(aucune)'}\n\n${describeSnapshot(snapshot)}\n\nAction suivante (JSON uniquement) :` },
    ];
    let decision;
    try {
      const reply = await env.AI.run(AGENT_MODEL, { messages, max_tokens: 300, temperature: 0.1 });
      decision = parseAgentAction(reply?.response ?? reply?.choices?.[0]?.message?.content ?? '');
    } catch (error) {
      decision = { action: 'fail', reason: 'AGENT_MODEL_FAILED:' + String(error?.code || error?.message || '').slice(0, 80) };
    }
    if (decision.action === 'done' && successfulActions === 0) {
      status = 'FAILED'; summary = 'COMPUTER_NO_ACTION_PERFORMED';
      onEvent({ type: 'step', n: turn, ok: false, text: 'Aucune action effectuée sur le PC', code: summary });
      break;
    }
    if (decision.action === 'done' && pendingTypedText !== null && !typedTextVerified) {
      status = 'FAILED'; summary = 'COMPUTER_TYPED_TEXT_NOT_VERIFIED';
      onEvent({ type: 'step', n: turn, ok: false, text: 'Texte non vérifié dans la fenêtre', code: summary });
      break;
    }
    if (decision.action === 'done') { status = 'DONE'; summary = String(decision.summary || 'Terminé.').slice(0, 600); break; }
    if (decision.action === 'fail') { status = 'FAILED'; summary = String(decision.reason || 'Impossible.').slice(0, 600); onEvent({ type: 'step', n: turn, ok: false, text: 'MEL s’arrête', code: summary }); break; }
    const label = describeAction(decision, snapshot);
    const plan = actionToSteps(decision, snapshot, device);
    if (plan.error) {
      history.push(`${label} → refusé (${plan.error})`);
      onEvent({ type: 'step', n: turn, ok: false, text: label, code: plan.error });
      continue;
    }
    const done = await runCompanionCommand({ db, device, steps: plan.steps, sessionId, sleep, now });
    if (done.ok) successfulActions += 1;
    if (done.ok && decision.action === 'type') {
      pendingTypedText = String(decision.text || '').slice(0, 200);
      typedTextVerified = false;
    }
    history.push(`${label} → ${done.ok ? 'fait' : 'échec ' + done.code}`);
    onEvent({ type: 'step', n: turn, ok: done.ok, text: label, code: done.ok ? null : done.code });
    if (!done.ok && /HALT|REMOTE_ACCESS_DISABLED|STOP/i.test(String(done.code))) { status = 'STOPPED_BY_ADRIEN'; summary = done.code; break; }
    await sleep(plan.settleMs || 500);
  }
  // Preuve finale : une capture de l'écran tel qu'il est maintenant.
  let screenshot = null;
  const proof = await runCompanionCommand({ db, device, steps: [{ action: 'screen.capture' }], sessionId, sleep, now, timeoutMs: 45_000 });
  if (proof.ok) {
    screenshot = proof.outputs?.[0]?.view_url || null;
    if (screenshot) onEvent({ type: 'proof', url: screenshot });
  }
  if (status === 'DONE' && !screenshot) {
    status = 'FAILED';
    summary = 'COMPUTER_SCREENSHOT_PROOF_MISSING';
  }
  const text = status === 'DONE'
    ? `C’est fait sur ton PC : ${summary}`
    : status === 'INCOMPLETE'
      ? `Je n’ai pas terminé en ${limit} étapes. Dernières actions : ${history.slice(-3).join(' ; ')}`
      : `Je me suis arrêtée : ${summary}`;
  onEvent({ type: 'end', ok: status === 'DONE', status, text });
  return { ok: status === 'DONE', status, summary, steps: history, screenshot, device: device.id };
}

const encoder = new TextEncoder();

/**
 * Réponse NDJSON pour MEL Chat : chaque étape s'affiche en direct, puis la
 * capture de preuve et le résumé. L'échange est archivé à la fin.
 */
export function streamComputerAgent({ env, goal, archive = async () => false }) {
  const body = new ReadableStream({
    async start(controller) {
      const send = event => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      send({ type: 'start', model: 'mel-computer-agent' });
      let finalText = '';
      let proofUrl = null;
      const lines = [];
      try {
        const result = await runComputerAgent({
          env, goal,
          onEvent: event => {
            if (event.type === 'step') {
              const line = `${event.ok ? '✓' : '✗'} ${event.text}${event.code ? ' — ' + event.code : ''}`;
              lines.push(line);
              send({ type: 'step', n: event.n, ok: event.ok, text: line });
            } else if (event.type === 'proof') {
              proofUrl = event.url;
              send({ type: 'proof', url: event.url });
            } else if (event.type === 'end') {
              finalText = event.text;
            }
          },
        });
        finalText = finalText || (result.ok ? 'C’est fait.' : 'Je n’ai pas pu terminer : ' + (result.code || result.status));
        send({ type: 'delta', text: finalText });
        let archived = false;
        const archivedText = [lines.join('\n'), finalText, proofUrl || ''].filter(Boolean).join('\n\n');
        try {
          archived = await archive(archivedText, { status: result.status || result.code, proof: proofUrl });
        } catch {}
        send({ type: 'done', model: 'mel-computer-agent', chars: finalText.length, archived: archived === true, truncated: false, steps: lines.length, proof_url: proofUrl, agent_status: result.status || result.code });
      } catch (error) {
        send({ type: 'error', code: String(error?.code || error?.message || 'COMPUTER_AGENT_FAILED').slice(0, 120), partial_chars: 0 });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
}
