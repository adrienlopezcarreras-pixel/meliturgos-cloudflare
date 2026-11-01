import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');
const objectiveRuntime = fs.readFileSync(new URL('../src/pages/objective-panel-runtime.js', import.meta.url), 'utf8');

function buttons() {
  return [...source.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((match, index) => ({
    index,
    attrs: match[1],
    label: match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  }));
}

function attr(attrs, name) {
  const match = new RegExp('(?:^|\\s)' + name + '="([^"]+)"').exec(attrs);
  return match?.[1] || null;
}

test('full control surface stays bounded and free of retired Vercel controls', () => {
  const rows = buttons();
  assert.ok(rows.length <= 101, 'control surface grew beyond the neuron-day button, the LoRA mode button and the PC mode light');
  assert.equal(rows.filter(row => attr(row.attrs, 'id') === 'pcMode').length, 1, 'one PC mode light');
  assert.equal(rows.filter(row => attr(row.attrs, 'id') === 'chatLoraMode').length, 1, 'one canonical LoRA mode button');
  assert.equal(rows.filter(row => /id="melRole(?:Assistant|Code)"/.test(row.attrs)).length, 2, 'exactly two role controls in Professor');
  assert.match(source, /let melChatRole='code'/);
  assert.match(source, /id="melClearActivity"/);
  assert.match(source, /id="mobileClearActivity"/);
  assert.match(source, /\/api\/gen2\/autonomy\/activity\/reset/);
  assert.match(source, /Rien n’est effacé de la base/);
  assert.ok(source.includes('href="/revenus"'), 'reconciled MEL WORK revenue route must remain in the desktop navigation');
  assert.ok(source.includes('<a class="nav-entry" href="/revenus">'), 'MEL WORK is a main navigation entry on desktop and in the mobile bar');
  assert.ok(!/\.nav a\[href="\/revenus"\][^{]*\{display:none/.test(source), 'MEL WORK is never hidden in the mobile bar');
  for (const retired of [
    'vercelSave',
    'vercelTest',
    'vercelRefresh',
    'vercelRedeployPreview',
    'vercelRedeployProduction',
  ]) {
    assert.equal(source.includes('id="' + retired + '"'), false, retired + ' must remain retired from the owner UI');
  }
  assert.equal(source.includes('<h2>Vercel</h2>'), false, 'retired Vercel card must not return');
});

test('every id-bearing button is uniquely declared and wired outside its markup declaration', () => {
  const rows = buttons();
  const ids = rows.map(row => attr(row.attrs, 'id')).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, 'button IDs must remain unique');

  for (const id of ids) {
    const occurrences = source.split(id).length - 1;
    // Submit controls are wired by their containing form. The Professor
    // objective form delegates its submit action to the imported runtime.
    const objectiveSubmit = id === 'objectiveAddSubmit'
      && source.includes('<form id="objectiveAdd"')
      && source.includes('<button id="objectiveAddSubmit" type="submit">')
      && objectiveRuntime.includes("document.getElementById('objectiveAdd').addEventListener('submit'");
    const objectiveControls = new Set(['objectiveCollapse', 'objectiveHide', 'objectiveShow']);
    const objectiveWired = objectiveControls.has(id)
      && objectiveRuntime.includes("document.getElementById('" + id + "')")
      && objectiveRuntime.includes(id + ".addEventListener('click'");
    assert.ok(occurrences >= 2 || objectiveSubmit || objectiveWired, 'orphan button without runtime wiring: ' + id);
  }
});

test('all navigation and jump controls target an existing canonical panel', () => {
  const panels = new Set([...source.matchAll(/data-panel="([^"]+)"/g)].map(match => match[1]));
  assert.ok(panels.size >= 8, 'canonical panel inventory unexpectedly shrank');

  for (const row of buttons()) {
    const view = attr(row.attrs, 'data-view');
    const jump = attr(row.attrs, 'data-jump');
    if (view) assert.ok(panels.has(view), 'data-view targets missing panel: ' + view);
    if (jump) assert.ok(panels.has(jump), 'data-jump targets missing panel: ' + jump);
  }
});

test('generic control families keep their delegated handlers', () => {
  const families = [
    ['data-view', "qsa('#nav button[data-view]')"],
    ['data-jump', "qsa('[data-jump]')"],
    ['data-mode', "qsa('#melUnifiedTabs [data-mode]')"],
    ['data-pc-app', "qsa('[data-pc-app]')"],
    ['data-pc-key', "qsa('[data-pc-key]')"],
    ['data-pd-connect', "qsa('[data-pd-connect]')"],
  ];

  for (const [attribute, handlerMarker] of families) {
    const count = buttons().filter(row => attr(row.attrs, attribute)).length;
    if (!count) continue;
    assert.ok(source.includes(handlerMarker), attribute + ' controls exist without delegated handler');
  }
});

test('responsive duplicate controls are limited to the audited autonomy/navigation cases', () => {
  const normalized = buttons().map(row => row.label.toLowerCase());
  const duplicates = [...new Set(normalized.filter((label, index) => normalized.indexOf(label) !== index))];
  const allowed = new Set([
    'max 100%',
    '▶ démarrer cycle mel',
    'mettre mel en pause',
    'activité',
    'vider la liste',
    'compétences',
    'feuille de route',
    'ordinateur',
    'terminal mel',
    'lora',
    'diagnostic',
    'développement',
    'actualiser',
    'tester',
    'enregistrer chiffré',
    'réduire', // floating Professor objective and activity panel have independent collapse controls
  ]);

  for (const label of duplicates) {
    assert.ok(allowed.has(label), 'new duplicate control label requires explicit audit: ' + label);
  }
});

test('owner UI keeps event wiring out of inline HTML attributes', () => {
  assert.equal(/<button\b[^>]*\bonclick\s*=/.test(source), false);
});

// MEL-UI-AUDIT-06: each control shows the real API receipt, handles
// unavailability and refusal, and a second click never starts a second run.
test('MEL-UI-AUDIT-06: control bench demands a real receipt and refuses a doubled run', async () => {
  const { controlActionReceipt, controlBenchReport, AUDITED_CONTROL_GROUPS } = await import('../scripts/ui-production-audit.mjs');
  const { alreadyRunningWorkflow } = await import('../src/professor-live-learning-entry.js');
  const ok = g => ({ control: g + 'Btn', group: g, api_path: '/api/' + g, displayed: true, status: 200,
    shown_as_success: true, first_click_started: true, second_click_started: false, body: { dispatched: true } });

  assert.deepEqual(controlActionReceipt(ok('work')).problems, []);
  assert.deepEqual(controlActionReceipt({ ...ok('lora'), api_path: null }).problems, ['NO_API_RECEIPT']);
  assert.deepEqual(controlActionReceipt({ ...ok('lora'), displayed: false }).problems, ['RECEIPT_NOT_DISPLAYED']);
  assert.deepEqual(controlActionReceipt({ ...ok('council'), status: 503 }).problems, ['UNAVAILABLE_SHOWN_AS_SUCCESS']);
  assert.deepEqual(controlActionReceipt({ ...ok('memory'), status: 403 }).problems, ['REFUSAL_SHOWN_AS_SUCCESS']);
  assert.deepEqual(controlActionReceipt({ ...ok('lora'), second_click_started: true }).problems, ['SECOND_CLICK_STARTED_A_SECOND_RUN']);

  const full = controlBenchReport(AUDITED_CONTROL_GROUPS.map(ok));
  assert.equal(full.conclusive, true);
  assert.deepEqual(full.groups_missing, []);
  const partial = controlBenchReport([ok('work')]);
  assert.equal(partial.conclusive, false, 'a bench that skipped groups never concludes');
  assert.deepEqual(partial.groups_missing, ['memory', 'council', 'lora', 'connections']);

  // The running-run guard is what makes the second click safe.
  assert.equal(alreadyRunningWorkflow([{ status: 'completed' }, { status: 'in_progress', id: 7 }]).id, 7);
  assert.equal(alreadyRunningWorkflow([{ status: 'completed' }]), null);
  assert.equal(alreadyRunningWorkflow(null), null);
});
