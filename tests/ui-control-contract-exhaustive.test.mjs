import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet as renderNormal } from '../src/pages/mvp-interface-v3.js';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';
import { onRequestGet as renderFull } from '../src/pages/full-interface-v2.js';
import { FULL_MODE_CONTROL_PATCH } from '../src/pages/full-mode-control-enhancer.js';
import { onRequestGet as renderWatch } from '../src/pages/watch-interface.js';

function expectAll(source, patterns, label) {
  for (const pattern of patterns) assert.match(source, pattern, label + ' missing ' + pattern);
}

test('normal page exposes only controls that are wired by the canonical normal runtime', async () => {
  const html = await (await renderNormal()).text();
  const themeButtons = [...html.matchAll(/data-mel-theme-choice="/g)].length;
  assert.equal(themeButtons, 8, 'all 8 theme choices must be rendered');

  expectAll(html, [
    /id="themeTrigger"/,
    /id="melAvatar"[^>]*role="button"/,
    /id="previousMessage"[^>]*role="link"/,
    /id="drop"/,
    /id="fileInput"/,
    /id="send"/,
    /id="full"/,
    /src="\/normal-runtime\.js\?v=5"/,
  ], 'normal UI');

  expectAll(NORMAL_RUNTIME_SOURCE, [
    /themeTrigger\.addEventListener\('click'/,
    /querySelectorAll\('\[data-mel-theme-choice\]'/,
    /b=>b\.addEventListener\('click'/,
    /send\.addEventListener\('click'/,
    /full\.addEventListener\('click'/,
    /previousMessage\.addEventListener\('click'/,
    /avatar\.addEventListener\('click'/,
    /drop\.addEventListener\('click'/,
    /fileInput\.addEventListener\('change'/,
    /input\.addEventListener\('keydown'/,
  ], 'normal runtime');
});

test('full-mode base controls, navigation and injected controls all have a click path', async () => {
  const html = await (await renderFull()).text();
  const source = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');

  const ids = [
    'chatCapRefresh','chatSend','refreshSkills','multiRun','workCreate','workRefresh',
    'memoryRefresh','chatgptStatusRefresh','chatgptImport','freeLoraRefresh',
    'codeSelfCheck','diagCaps','diagRoadmap','diagAug',
  ];
  for (const id of ids) {
    assert.match(html, new RegExp('id="' + id + '"'), 'missing full-mode control ' + id);
    assert.match(source, new RegExp("(?:qs\\('#" + id + "'\\)|getElementById\\('" + id + "'\\))\\.onclick"), 'missing handler for ' + id);
  }

  assert.match(source, /qsa\('#nav button'\)\.forEach\(b=>b\.onclick=/);
  assert.match(source, /qsa\('\[data-jump\]'\)\.forEach\(b=>b\.onclick=/);
  assert.match(source, /freeAgenticColab/);
  assert.match(source, /agenticLink\.href=d\.agentic_colab_url/);

  expectAll(FULL_MODE_CONTROL_PATCH, [
    /id="melFullMax"/,
    /id="melFullCycle"/,
    /href="\/veille"/,
    /id="melFullStop"/,
    /id="melFullActivity"/,
    /getElementById\('melFullMax'\)\.onclick=setMax/,
    /getElementById\('melFullCycle'\)\.onclick=runCycle/,
    /getElementById\('melFullStop'\)\.onclick=toggleStop/,
    /getElementById\('melFullActivity'\)\.onclick=/,
    /getElementById\('melFullActivityRefresh'\)\.onclick=loadActivity/,
  ], 'full-mode enhancer');
  assert.doesNotMatch(FULL_MODE_CONTROL_PATCH, /capability-watch\/run/, 'watch execution must stay on /veille');
  assert.doesNotMatch(FULL_MODE_CONTROL_PATCH, /melProposalChatNotice/, 'watch proposals must not leak into chat');
});

test('dedicated watch page owns all watch actions and every top-level button is wired', async () => {
  const html = await (await renderWatch()).text();
  expectAll(html, [
    /id="testAll"/,
    /id="runReal"/,
    /id="refresh"/,
    /q\('#testAll'\)\.onclick=testAll/,
    /q\('#runReal'\)\.onclick=runReal/,
    /q\('#refresh'\)\.onclick=/,
    /\/api\/mel\/capability-watch\/test-all/,
    /\/api\/mel\/capability-watch\/run/,
    /\/api\/mel\/capability-watch\/proposal/,
    /document\.querySelectorAll\('\[data-act\]'\)\.forEach/,
  ], 'watch page');
});

test('learning controls are wired and LoRA validation is not mislabeled as runtime activation', async () => {
  const source = await readFile(new URL('../src/professor-live-learning-entry.js', import.meta.url), 'utf8');
  const learning = await readFile(new URL('../src/learning-entry.js', import.meta.url), 'utf8');

  expectAll(source, [
    /benchmark\.id='melRunBenchmark'/,
    /benchmark\.addEventListener\('click'/,
    /lora\.id='melPrepareLora'/,
    /lora\.addEventListener\('click'/,
  ], 'learning operator controls');
  expectAll(learning, [
    /learningChip\.addEventListener\('click'/,
    /Poids runtime/,
    /LoRA validé techniquement/,
    /aucun adaptateur actif en runtime/,
  ], 'learning meter');
  assert.doesNotMatch(learning, /inchangés · LoRA inactif/);
});
