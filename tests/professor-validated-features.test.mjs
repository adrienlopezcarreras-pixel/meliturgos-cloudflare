import test from 'node:test';
import assert from 'node:assert/strict';
import { enhanceProfessorValidatedFeatures } from '../src/professor-validated-features-entry.js';

function htmlResponse(body = '<!doctype html><html><head><title>canonical</title></head><body><main id="canonical-professor">base actuelle</main></body></html>') {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

test('validated Professor features are additive on the canonical /professor HTML', async () => {
  const response = await enhanceProfessorValidatedFeatures(htmlResponse(), '/professor');
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /id="canonical-professor"/);
  assert.match(html, /mel-professor-validated-features-style/);
  assert.match(html, /mel-professor-validated-features-runtime/);
  assert.match(html, /Salon Adrien · MEL · Mentor/);
  assert.match(html, /Council & Teacher du travail actif/);
  assert.match(html, /Autonomie réelle/);
});

test('consolidated features reuse current APIs without restoring the obsolete manual roadmap queue', async () => {
  const response = await enhanceProfessorValidatedFeatures(htmlResponse(), '/professor');
  const html = await response.text();

  assert.match(html, /\/api\/chat/);
  assert.match(html, /\/api\/gen2\/augmentio\/fanout/);
  assert.match(html, /\/api\/professor\/dev\/autonomy\/status/);
  assert.match(html, /\/api\/professor\/dev\/jobs/);
  assert.doesNotMatch(html, /evolution\.enqueue/);
});

test('non-Professor and non-HTML responses are left untouched', async () => {
  const other = htmlResponse();
  assert.equal(await enhanceProfessorValidatedFeatures(other, '/'), other);

  const api = Response.json({ ok: true });
  assert.equal(await enhanceProfessorValidatedFeatures(api, '/professor'), api);
});
