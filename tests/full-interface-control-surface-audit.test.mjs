import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');

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
  assert.ok(rows.length <= 84, 'control surface grew beyond the audited 84-button budget');
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
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\'\\\\$&'');
    const occurrences = source.match(new RegExp(escaped, 'g'))?.length || 0;
    assert.ok(occurrences >= 2, 'orphan button without runtime wiring: ' + id);
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
    ['data-view', "qsa('[data-view]')"],
    ['data-jump', "qsa('[data-jump]')"],
    ['data-mode', "qsa('[data-mode]')"],
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
    'compétences',
    'feuille de route',
    'ordinateur',
    'terminal mel',
    'lora',
    'diagnostic',
    'actualiser',
    'tester',
    'enregistrer chiffré',
  ]);

  for (const label of duplicates) {
    assert.ok(allowed.has(label), 'new duplicate control label requires explicit audit: ' + label);
  }
});

test('owner UI keeps event wiring out of inline HTML attributes', () => {
  assert.equal(/<button\b[^>]*\bonclick\s*=/.test(source), false);
});
