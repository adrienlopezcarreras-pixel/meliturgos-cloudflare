import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../src/pages/mvp-interface.js';

test('current MEL interface is extracted, self-contained and serves HTML', async () => {
  const response = await onRequestGet({});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  const html = await response.text();
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<title>MEL<\/title>/);
  assert.match(html, /rel="icon"[^>]+meliturgos-avatar-fille\.png/);
  assert.doesNotMatch(html, /<div class="title">MEL<\/div>/);
  assert.match(html, /id="messages"/);
  assert.match(html, /id="input"/);
  assert.match(html, /id="send"/);
  assert.match(html, /id="full"/);
  assert.match(html, /id="avatar"/);
  assert.match(html, /id="fileInput"/);
  assert.match(html, /min-width:188px/);
  assert.doesNotMatch(html, /id="skills"|id="skillsPanel"|id="skillsList"/);
});

test('current interface keeps chat, keyboard, files, voice, full mode and seven themes without legacy skills wiring', async () => {
  const html = await (await onRequestGet({})).text();
  assert.match(html, /fetch\('\/api\/chat'/);
  assert.match(html, /fetch\('\/api\/files\/upload'/);
  assert.doesNotMatch(html, /fetch\('\/api\/gen2\/capabilities'/);
  assert.match(html, /e\.key==='Enter'/);
  assert.match(html, /location\.href='\/professor'/);
  assert.match(html, /SpeechRecognition\|\|window\.webkitSpeechRecognition/);
  assert.match(html, /classic','crusade','religious','granada','aviation','paladin','amazon/);
  assert.match(html, /Paladin Light Full Plate/);
  assert.match(html, /Amazon · Diadème du Griffon/);
  assert.match(html, /maxlength="100000"/);
  assert.match(html, /ui_theme:theme/);
  assert.doesNotMatch(html, /conversationSelect|newConversation|interaction_count|Dark Full Plate/i);
});
