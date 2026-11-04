import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

// Exercise the actual render helper without loading or mutating live D1.
const source = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');
const marker = "function renderActivityPanel(panel,activity){";
const start = source.indexOf(marker);
const end = source.indexOf("\nasync function showActivity(panel){", start);
assert.ok(start >= 0 && end > start, 'MAX activity render helper must exist');
const helper = source.slice(start, end);
const markup = '<details class="act-roadmap-passive"><summary>Objectifs roadmap à venir (39)</summary><div>39 items</div></details>';

function fakePanel() {
  let html = '', details = null;
  return {
    querySelector(selector) {
      if (selector === '.act-waiting-passive') return null;
      assert.equal(selector, '.act-roadmap-passive');
      return details;
    },
    get innerHTML() { return html; },
    set innerHTML(next) {
      html = next;
      details = next.includes('class="act-roadmap-passive"')
        ? { open: next.includes('class="act-roadmap-passive" open') }
        : null;
    },
  };
}

const render = runInNewContext('(' + helper + ')', { activityMarkup: () => markup });

test('MAX roadmap is collapsed by default while all 39 items remain in the markup', () => {
  assert.ok(source.includes(":'<details class=\"act-roadmap-passive\"><summary>"),
    'catalog should have no default open attribute');
  assert.ok(!source.includes('class="act-roadmap-passive" open'),
    'the roadmap must not be forced open on initial display');
  const panel = fakePanel();
  render(panel, {});
  assert.equal(panel.querySelector('.act-roadmap-passive').open, false);
  assert.match(panel.innerHTML, /39 items/);
});

test('MAX roadmap manual expansion survives 15-second refresh, and closing stays closed', () => {
  const panel = fakePanel();
  render(panel, {});
  panel.querySelector('.act-roadmap-passive').open = true;
  render(panel, {});
  assert.equal(panel.querySelector('.act-roadmap-passive').open, true);
  panel.querySelector('.act-roadmap-passive').open = false;
  render(panel, {});
  assert.equal(panel.querySelector('.act-roadmap-passive').open, false);
  const otherPanel = fakePanel();
  render(otherPanel, {});
  assert.equal(otherPanel.querySelector('.act-roadmap-passive').open, false,
    'a fresh panel must not inherit the previous panel expansion');
});

test('initial render and polling both use the same state-preserving helper', () => {
  assert.ok(source.includes('renderPcMode(d?.pc_executor);renderActivityPanel(panel,d)'));
  assert.ok(!source.includes('panel.innerHTML=activityMarkup(d)'));
});
