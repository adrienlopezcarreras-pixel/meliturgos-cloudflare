import test from 'node:test';
import assert from 'node:assert/strict';
import { runChatSelftest, CHAT_SELFTEST_CASES } from '../src/diagnostics/chat-selftest.js';
import { isReleaseSmokeRequest } from '../src/core/security.js';

const ndjson = events => new Response(events.map(e => JSON.stringify(e)).join('\n') + '\n', { headers: { 'content-type': 'application/x-ndjson' } });
const request = new Request('https://mel.test/api/internal/chat-selftest', { method: 'POST' });

test('self-test calls the real chat as the owner, streaming, and measures each case', async () => {
  const calls = [];
  const handleChat = async req => {
    const body = await req.json();
    calls.push({ auth: req.headers.get('authorization'), stream: body.stream, chars: body.text.length });
    const answer = body.text.includes('ORCHIDEE') ? 'Le code est ORCHIDEE-7342.' : body.text.includes('5 étapes') ? '1. a\n2. b\n3. c\n4. d\n5. e' : 'Je suis MEL.';
    return ndjson([{ type: 'start', model: 'm' }, { type: 'delta', text: answer.slice(0, 5) }, { type: 'delta', text: answer.slice(5) }, { type: 'done', model: 'm', archived: true }]);
  };
  const res = await runChatSelftest({ request, env: { MELITURGOS_PASSWORD: 'pw' }, handleChat });
  const body = await res.json();
  assert.equal(body.ok, true, JSON.stringify(body));
  assert.deepEqual(body.results.map(r => r.case), ['short', 'plan', 'big', 'huge']);
  assert.ok(CHAT_SELFTEST_CASES.includes('capabilities'), 'self-knowledge case available on demand');
  assert.ok(calls.every(c => c.auth === 'Bearer pw' && c.stream === true));
  const big = body.results.find(r => r.case === 'big');
  assert.ok(big.prompt_chars > 38000 && big.understood && big.streamed && big.archived && big.deltas === 2);
  assert.ok(body.results.find(r => r.case === 'huge').prompt_chars > 90000);
});

test('a reply that misses the buried fact is reported as not understood', async () => {
  const handleChat = async () => Response.json({ ok: true, text: 'Je ne sais pas.' });
  const body = await (await runChatSelftest({ request, env: { MELITURGOS_PASSWORD: 'pw' }, handleChat, cases: ['big'] })).json();
  assert.equal(body.ok, false);
  assert.equal(body.results[0].understood, false);
  assert.equal(body.results[0].streamed, false);
});

test('the self-test route accepts only the per-deployment proof key', () => {
  const env = { MEL_PARALLEL_PROOF_TOKEN: 't'.repeat(40) };
  const make = headers => new Request('https://mel.test/api/internal/chat-selftest', { method: 'POST', headers });
  assert.equal(isReleaseSmokeRequest(make({ 'x-mel-release-smoke': '1', 'x-mel-parallel-proof': 't'.repeat(40) }), env), true);
  assert.equal(isReleaseSmokeRequest(make({ 'x-mel-release-smoke': '1', 'x-mel-parallel-proof': 'x'.repeat(40) }), env), false);
  assert.equal(isReleaseSmokeRequest(make({}), env), false);
});

test('self-knowledge case fails when MEL denies her real tools or asks for keys she does not need', async () => {
  const run = async reply => {
    const handleChat = async () => new Response([JSON.stringify({ type: 'delta', text: reply }), JSON.stringify({ type: 'done', model: 'm', archived: true })].join('\n') + '\n', { headers: { 'content-type': 'application/x-ndjson' } });
    const request = new Request('https://mel.test/api/internal/chat-selftest', { method: 'POST' });
    return (await (await runChatSelftest({ request, env: { MELITURGOS_PASSWORD: 'pw' }, handleChat, cases: ['capabilities'] })).json()).results[0];
  };
  const good = await run('Je recherche sur le web, je pilote ton PC Windows via Companion, je mets à jour la MINI et le téléphone, MEL WORK tourne toutes les 6 heures.');
  assert.equal(good.ok, true);
  const bad = await run('Je n’ai aucun accès réseau ; il me faut SEARCH_API_KEY et COMPANION_TOKEN pour ton PC.');
  assert.equal(bad.ok, false);
  assert.ok(bad.wrong_claim);
});
