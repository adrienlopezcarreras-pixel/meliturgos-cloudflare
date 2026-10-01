import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as renderFullInterface } from '../src/pages/full-interface-v2.js';

test('Professor connections UI exposes Google Tasks through Pipedream Connect', async () => {
  const response=await renderFullInterface();
  const html=await response.text();
  assert.match(html,/data-pd-connect="google_tasks">Google Tasks<\/button>/);
  assert.match(html,/google_tasks:'Google Tasks'/);
  assert.match(html,/button\.dataset\.pdConnect/);
  assert.match(html,/connectViaPipedream\(button\.dataset\.pdConnect,button\)/);
});

test('Google Tasks Pipedream button participates in connected-account rendering', async () => {
  const response=await renderFullInterface();
  const html=await response.text();
  assert.match(html,/const connected=new Set\(accountState\.connected_apps\|\|\[\]\)/);
  assert.match(html,/if\(connected\.has\(app\)\)/);
  assert.match(html,/google_tasks:'Google Tasks'/);
});
