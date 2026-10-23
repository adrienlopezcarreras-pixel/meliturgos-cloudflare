import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../src/pages/full-interface-v2.js';

test('full mode exposes phone-only autonomy controls without replacing desktop layout', async () => {
  const response = await onRequestGet();
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /id="autonomyBadge"/);
  assert.match(html, /id="autonomyMode"/);
  assert.match(html, /id="autonomyNext"/);
  assert.match(html, /class="mobile-home-controls"/);
  assert.match(html, /id="mobileMaxAutonomy"/);
  assert.match(html, /id="mobileStartCycle"/);
  assert.match(html, /id="mobilePauseAutonomy"/);
  assert.doesNotMatch(html, /id="mobileResumeAutonomy"/);
  assert.match(html, /id="mobileActivityAutonomy"/);
  assert.match(html, /\/api\/gen2\/autonomy\/max/);
  assert.match(html, /\/api\/gen2\/autonomy\/tick/);
  assert.match(html, /\/api\/gen2\/autonomy\/pause/);
  assert.match(html, /mobilePause[^\n]*\/api\/gen2\/autonomy\/resume/);
  assert.match(html, /\.mobile-home-controls\{display:none\}/);
  assert.match(html, /@media\(max-width:960px\)[\s\S]*\.mobile-home-controls\{display:grid/);
  assert.match(html, /production verrouillée/i);
});


test('rollback safety pause permits explicit owner controls while deployment pauses remain locked', async () => {
  const { runInNewContext } = await import('node:vm');
  const html = await (await onRequestGet()).text();
  const start = html.indexOf('function renderAutonomy(state)');
  const end = html.indexOf('async function loadAutonomy()', start);
  const helperStart = html.indexOf('function isReleaseAutonomyPause(');
  const helper = helperStart < 0 ? '' : html.slice(helperStart, html.indexOf('let autonomyControl=', helperStart));
  for (const [source, reason, locked] of [
    ['release-predeploy-binder', 'predeploy-release-safety', true],
    ['release-launch-bootstrap', 'predeploy-release-safety', true],
    ['release-launch-bootstrap', 'NEW_RELEASE_AWAITING_OWNER_LAUNCH', false],
    ['release-rollback-restore', 'restore-predeploy-autonomy-state', false],
    ['owner-ui', 'owner-emergency-stop', false],
    ['watchdog', 'NO_PROGRESS', false],
  ]) {
    const nodes = new Map();
    const qs = id => {
      if (!nodes.has(id)) nodes.set(id, {classList:{toggle(){}},disabled:false});
      return nodes.get(id);
    };
    const control = {paused:true,max_autonomy:false,max_remembered:false,source,reason};
    runInNewContext(helper + html.slice(start,end) + ';renderAutonomy({control});', {
      autonomyControl:{},control,qs,document:{querySelector:()=>null},
    });
    for (const id of ['#melFullMax','#mobileMaxAutonomy','#melFullStop','#mobilePauseAutonomy']) {
      assert.equal(qs(id).disabled, locked, source + ':' + id);
    }
    for (const id of ['#melFullCycle','#mobileStartCycle']) assert.equal(qs(id).disabled,true);
    assert.equal(control.paused,true,'render must never resume runtime');
  }
});
