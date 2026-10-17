import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { runComputerAgent, actionToSteps, parseAgentAction, describeSnapshot } from '../src/devices/computer-agent.js';
import { evaluateComputerUsePlan } from '../src/devices/computer-use.js';

async function setup({ remote = true, fresh = true } = {}) {
  const db = sqliteD1();
  await db.prepare('CREATE TABLE computer_devices(id TEXT PRIMARY KEY,token_hash TEXT,name TEXT,platform TEXT,capabilities TEXT,allowed_apps TEXT,halted INTEGER,created_at INTEGER,last_seen_at INTEGER,metadata TEXT)').run();
  await db.prepare('CREATE TABLE computer_commands(id TEXT PRIMARY KEY,device_id TEXT NOT NULL,session_id TEXT NOT NULL,plan_json TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,claimed_at INTEGER,finished_at INTEGER,result_json TEXT,error_code TEXT)').run();
  const now = Date.now();
  await db.prepare('INSERT INTO computer_devices VALUES(?,?,?,?,?,?,?,?,?,?)').bind('PC-1', 'h', 'PC', 'windows', '["computer.use"]', '["notepad","calculator","explorer","msedge","firefox","chrome"]', 0, now, now,
    JSON.stringify({ remote_access_enabled: remote, engine_heartbeat_at: fresh ? now : now - 60_000, allowed_paths: [] })).run();
  return db;
}

// Simulates the Windows Companion: executes queued commands against a tiny screen model.
function fakeCompanion(db, { failFirstSnapshot = false, noScreenshot = false } = {}) {
  let snapshotFailurePending = failFirstSnapshot;
  const screen = { app: 'firefox', text: '' };
  const executed = [];
  const snapshot = () => screen.app === 'notepad'
    ? { window_title: 'Sans titre - Bloc-notes', process: 'notepad', elements: [
      { i: 1, type: 'MenuItem', name: 'Fichier', x: 20, y: 40 },
      { i: 2, type: 'Document', name: 'Éditeur de texte', x: 600, y: 400, value: screen.text, focused: true },
    ], open_windows: [] }
    : { window_title: 'Firefox', process: 'firefox', elements: [{ i: 1, type: 'Button', name: 'Retour', x: 10, y: 10 }], open_windows: [] };
  return {
    screen, executed,
    async tick() {
      const rows = (await db.prepare("SELECT id, plan_json FROM computer_commands WHERE status='PENDING'").all()).results;
      for (const row of rows) {
        const plan = JSON.parse(row.plan_json);
        if (snapshotFailurePending && plan.steps.some(step => step.action === 'ui.snapshot')) {
          snapshotFailurePending = false;
          executed.push('ui.snapshot');
          await db.prepare("UPDATE computer_commands SET status='FAILED',error_code='UI_SNAPSHOT_NO_CONTROLS' WHERE id=?").bind(row.id).run();
          continue;
        }
        const outputs = [];
        for (const step of plan.steps) {
          executed.push(step.action);
          if (step.action === 'ui.snapshot') outputs.push({ action: step.action, ...snapshot() });
          else if (step.action === 'app.open') { screen.app = step.app; outputs.push({ action: step.action }); }
          else if (step.action === 'keyboard.type') { screen.text += step.text; outputs.push({ action: step.action }); }
          else if (step.action === 'screen.capture') outputs.push({ action: step.action, view_url: noScreenshot ? null : 'https://mel.example/api/computer/v1/screenshot?key=k' });
          else outputs.push({ action: step.action });
        }
        await db.prepare("UPDATE computer_commands SET status='SUCCEEDED', result_json=? WHERE id=?").bind(JSON.stringify({ outputs }), row.id).run();
      }
    },
  };
}

function scriptedAi(decisions) {
  const prompts = [];
  return { prompts, async run(model, input) { prompts.push(input.messages[1].content); return { response: JSON.stringify(decisions.shift() || { action: 'fail', reason: 'no more' }) }; } };
}

test('MEL opens Notepad, types the text, verifies it and proves it with a screenshot', async () => {
  const db = await setup();
  const pc = fakeCompanion(db);
  const ai = scriptedAi([
    { action: 'click', element: 2 },
    { action: 'type', text: 'bonjour Adrien' },
    { action: 'done', summary: 'Bloc-notes ouvert, « bonjour Adrien » est écrit.' },
  ]);
  const events = [];
  const result = await runComputerAgent({ env: { DB: db, AI: ai }, goal: 'ouvre le bloc-notes et écris bonjour Adrien', onEvent: e => events.push(e), sleep: () => pc.tick() });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, 'DONE');
  assert.equal(pc.screen.app, 'notepad');
  assert.equal(pc.screen.text, 'bonjour Adrien');
  assert.deepEqual(pc.executed, ['app.open', 'ui.snapshot', 'cursor.move', 'pointer.click', 'ui.snapshot', 'keyboard.type', 'ui.snapshot', 'screen.capture']);
  assert.ok(ai.prompts[2].includes('= « bonjour Adrien »'), 'the model verifies on the real field value before saying done');
  assert.deepEqual(events.filter(e => e.type === 'step').map(e => e.text), ['Ouvrir notepad', 'Cliquer sur « Éditeur de texte »', 'Taper « bonjour Adrien »']);
  assert.equal(events.find(e => e.type === 'proof')?.url, 'https://mel.example/api/computer/v1/screenshot?key=k');
  assert.equal(events.at(-1).type, 'end');
  db.close();
});

test('allowlisted Notepad launch works without initial UIA; result still requires observed verification', async () => {
  const db = await setup();
  const pc = fakeCompanion(db, { failFirstSnapshot: true });
  const ai = scriptedAi([
    { action: 'type', text: 'bonjour' },
    { action: 'done', summary: 'Le texte est présent dans le champ.' },
  ]);
  const result = await runComputerAgent({
    env: { DB: db, AI: ai }, goal: 'ouvre le bloc-notes et écris bonjour',
    sleep: () => pc.tick(),
  });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.summary, 'UI_SNAPSHOT_NO_CONTROLS');
  assert.equal(pc.screen.app, 'notepad');
  assert.deepEqual(pc.executed.slice(0, 3), ['app.open', 'ui.snapshot', 'screen.capture']);
  assert.equal(ai.prompts.length, 0, 'no model action without an observed window');
  db.close();
});

test('F6 refuses model done when typed text has no observable readback', async () => {
  const db = await setup();
  const pc = fakeCompanion(db);
  const ai = scriptedAi([
    { action: 'type', text: 'bonjour' },
    { action: 'done', summary: 'affirmation sans preuve' },
  ]);
  // The model can claim success, but the actual UIA value is not the text typed.
  const originalTick = pc.tick;
  const result = await runComputerAgent({
    env: { DB: db, AI: ai },
    goal: 'ouvre le bloc-notes et écris bonjour',
    sleep: async () => {
      await originalTick();
      pc.screen.text = '';
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.summary, 'COMPUTER_TYPED_TEXT_NOT_VERIFIED');
  db.close();
});

test('F5/F6 cannot report DONE when screenshot proof is absent', async () => {
  const db = await setup();
  const pc = fakeCompanion(db, { noScreenshot: true });
  const ai = scriptedAi([{ action: 'key', key: 'TAB' }, { action: 'done', summary: 'terminé' }]);
  const result = await runComputerAgent({
    env: { DB: db, AI: ai }, goal: 'sur mon PC, contrôle la fenêtre',
    sleep: () => pc.tick(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.summary, 'COMPUTER_SCREENSHOT_PROOF_MISSING');
  db.close();
});

test('MEL cannot call a PC mission successful without performing any PC action', async () => {
  const db = await setup();
  const pc = fakeCompanion(db);
  const ai = scriptedAi([{ action: 'done', summary: 'terminé' }]);
  const result = await runComputerAgent({
    env: { DB: db, AI: ai }, goal: 'sur mon PC, contrôle la fenêtre',
    sleep: () => pc.tick(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.summary, 'COMPUTER_NO_ACTION_PERFORMED');
  db.close();
});

test('apps outside Adrien’s allowlist and invented elements are refused without touching the PC', async () => {
  const device = { allowed_apps: ['notepad'] };
  assert.equal(actionToSteps({ action: 'open_app', app: 'cmd' }, {}, device).error, 'APP_NOT_ALLOWED_BY_ADRIEN');
  assert.equal(actionToSteps({ action: 'click', element: 99 }, { elements: [{ i: 1, x: 1, y: 1 }] }, device).error, 'AGENT_ELEMENT_UNKNOWN');
  assert.equal(actionToSteps({ action: 'key', key: 'WIN+R' }, {}, device).error, 'AGENT_KEY_NOT_ALLOWED');
  assert.deepEqual(actionToSteps({ action: 'click', element: 1 }, { elements: [{ i: 1, x: 5, y: 7 }] }, device).steps, [{ action: 'cursor.move', x: 5, y: 7 }, { action: 'pointer.click' }]);
  assert.equal(parseAgentAction('pas du json').action, 'fail');
  assert.equal(parseAgentAction('Voici : {"action":"key","key":"ENTER"}').key, 'ENTER');
});

test('every step the agent can emit passes the existing computer-use policy', () => {
  const device = { id: 'PC-1', capabilities: ['computer.use'] };
  for (const steps of [
    [{ action: 'ui.snapshot' }],
    [{ action: 'app.open', app: 'notepad' }],
    [{ action: 'cursor.move', x: 10, y: 20 }, { action: 'pointer.click' }],
    [{ action: 'keyboard.type', text: 'bonjour' }],
    [{ action: 'keyboard.press', key: 'CTRL+S' }],
    [{ action: 'pointer.scroll', delta_y: -480 }],
    [{ action: 'screen.capture' }],
  ]) {
    const numbered = steps.map((s, i) => ({ ...s, id: `step-${i + 1}` }));
    const plan = evaluateComputerUsePlan({ session_id: 's', device, sandbox: { allowed_apps: ['notepad'], allowed_paths: [], max_steps: 5 },
      approvals: numbered.map(s => ({ approved: true, session_id: 's', step_id: s.id, action: s.action })), steps: numbered });
    assert.equal(plan.allowed, true, JSON.stringify(steps) + ' ' + plan.reason);
  }
});

test('an offline PC or a disabled remote access gives a clear message instead of hanging', async () => {
  for (const options of [{ fresh: false }, { remote: false }]) {
    const db = await setup(options);
    const events = [];
    const result = await runComputerAgent({ env: { DB: db, AI: scriptedAi([]) }, goal: 'ouvre la calculatrice', onEvent: e => events.push(e), sleep: async () => {} });
    assert.equal(result.code, 'COMPUTER_ENGINE_OFFLINE');
    assert.match(events.at(-1).text, /Companion/);
    db.close();
  }
});

test('the window description gives the model numbered elements and current field values', () => {
  const text = describeSnapshot({ window_title: 'Sans titre - Bloc-notes', process: 'notepad', elements: [{ i: 2, type: 'Document', name: 'Éditeur', value: 'abc', focused: true }] });
  assert.match(text, /#2 Document « Éditeur » = « abc » \[focus\]/);
});

test('chat requests that need several actions on the PC go to the agent, simple ones do not', async () => {
  const { inferComputerAgentGoal } = await import('../src/devices/computer-agent-intent.js');
  for (const text of ['ouvre le bloc-notes et écris bonjour', 'sur mon PC, ouvre Firefox et va sur meteo.fr', 'calcule 128*37 avec la calculatrice', 'prends le contrôle de mon ordinateur et ouvre l’explorateur']) {
    assert.ok(inferComputerAgentGoal(text), text);
  }
  for (const text of ['quel est l’état de mon PC ?', 'fais une capture de mon écran', 'comment ouvrir le bloc-notes ?', 'raconte-moi une histoire', 'explique le fonctionnement de Firefox']) {
    assert.equal(inferComputerAgentGoal(text), null, text);
  }
});

test('MEL Chat streams each PC step live, then the proof and the summary, and archives the exchange', async () => {
  const { handleNativeChat } = await import('../src/api/native-chat.js');
  const db = await setup();
  const pc = fakeCompanion(db);
  const ai = scriptedAi([
    { action: 'type', text: 'bonjour' },
    { action: 'done', summary: 'Bloc-notes ouvert avec « bonjour ».' },
  ]);
  const timer = setInterval(() => { pc.tick().catch(() => {}); }, 40);
  try {
    const response = await handleNativeChat(new Request('https://mel.example/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'ouvre le bloc-notes et écris bonjour', conversation_id: 'pc-1', stream: true }),
    }), { DB: db, AI: ai }, { authorized: true });
    assert.match(response.headers.get('content-type'), /ndjson/);
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(events.filter(e => e.type === 'step').map(e => e.text), ['✓ Ouvrir notepad', '✓ Taper « bonjour »']);
    assert.ok(events.some(e => e.type === 'proof'));
    const done = events.at(-1);
    assert.equal(done.type, 'done');
    assert.equal(done.agent_status, 'DONE');
    assert.equal(done.archived, true);
    assert.equal(pc.screen.text, 'bonjour');
  } finally {
    clearInterval(timer);
    db.close();
  }
});

test('the agent never types when no text field has focus (e.g. a browser page)', () => {
  const firefox = { process: 'firefox', elements: [{ i: 1, type: 'Button', name: 'Retour', x: 10, y: 10 }, { i: 2, type: 'Document', name: 'Page', x: 50, y: 50, focused: false }] };
  assert.deepEqual(actionToSteps({ action: 'type', text: 'bonjour' }, firefox, {}), { error: 'AGENT_NO_FOCUSED_TEXT_FIELD' });
  const notepad = { process: 'notepad', elements: [{ i: 2, type: 'Document', name: 'Éditeur', x: 600, y: 400, focused: true }] };
  assert.deepEqual(actionToSteps({ action: 'type', text: 'bonjour' }, notepad, {}).steps, [{ action: 'keyboard.type', text: 'bonjour' }]);
});

test('web browsing: https pages open through browser.navigate, local or plain-http targets never', async () => {
  const { safeWebUrl, websiteFromGoal } = await import('../src/devices/computer-agent.js');
  assert.deepEqual(actionToSteps({ action: 'open_url', url: 'https://fr.wikipedia.org/wiki/Paris' }, {}, {}).steps, [{ action: 'browser.navigate', url: 'https://fr.wikipedia.org/wiki/Paris' }]);
  for (const bad of ['http://example.com', 'https://localhost/x', 'https://192.168.1.1/', 'https://user:pw@example.com', 'https://example.com:8443/', 'file:///C:/x', 'javascript:alert(1)']) {
    assert.deepEqual(actionToSteps({ action: 'open_url', url: bad }, {}, {}), { error: 'AGENT_URL_NOT_ALLOWED' }, bad);
  }
  assert.equal(safeWebUrl('https://duckduckgo.com/?q=m%C3%A9t%C3%A9o'), 'https://duckduckgo.com/?q=m%C3%A9t%C3%A9o');
  assert.equal(websiteFromGoal('va sur leboncoin.fr et cherche un vélo'), 'https://leboncoin.fr/');
  assert.equal(websiteFromGoal('ouvre https://github.com/anthropics'), 'https://github.com/anthropics');
  assert.equal(websiteFromGoal('ouvre le bloc-notes'), null);
});

test('chat requests naming a website or the browser go to the agent', async () => {
  const { inferComputerAgentGoal } = await import('../src/devices/computer-agent-intent.js');
  assert.ok(inferComputerAgentGoal('va sur wikipedia.org et cherche la tour Eiffel'));
  assert.ok(inferComputerAgentGoal('ouvre le navigateur et cherche la météo à Lyon'));
  assert.equal(inferComputerAgentGoal('quelle est la capitale du Japon ?'), null);
  assert.equal(inferComputerAgentGoal('comment aller sur wikipedia.org ?'), null);
});

test('the agent opens a named website first and the policy allows exactly that origin', async () => {
  const db = await setup();
  const pc = fakeCompanion(db);
  const ai = scriptedAi([{ action: 'done', summary: 'La page est ouverte.' }]);
  await runComputerAgent({ env: { DB: db, AI: ai }, goal: 'va sur wikipedia.org', sleep: () => pc.tick() });
  assert.equal(pc.executed[0], 'browser.navigate');
  const row = await db.prepare("SELECT plan_json FROM computer_commands WHERE plan_json LIKE '%browser.navigate%'").first();
  const plan = JSON.parse(row.plan_json);
  assert.deepEqual(plan.sandbox.allowed_origins, ['https://wikipedia.org']);
  db.close();
});
