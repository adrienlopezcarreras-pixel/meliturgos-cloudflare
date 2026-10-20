import test from 'node:test';
import assert from 'node:assert/strict';
import { runChatSelftest, CHAT_SELFTEST_CASES } from '../src/diagnostics/chat-selftest.js';
import { isReleaseSmokeRequest } from '../src/core/security.js';
import { createConversationService } from '../src/conversations/conversation-service.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

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

async function connectedProof({ failed = false, replayTools = false, archived = true } = {}) {
  const DB = sqliteD1();
  let calls = 0;
  const service = createConversationService({ DB });
  const handleChat = async req => {
    assert.equal(req.headers.get('authorization'), 'Bearer pw');
    assert.equal(req.headers.has('x-mel-release-smoke'), false, 'the live owner pipeline must execute, not the code-only smoke path');
    const input = await req.json();
    assert.equal(input.stream, false);
    assert.equal(input.capability, undefined, 'the real chat infers all three reads from text');
    calls += 1;
    if (calls === 1 && archived) {
      const metadata = { client_message_id: input.client_message_id };
      await service.archiveMessage({ conversationId: input.conversation_id, role: 'user', content: input.text, metadata });
      await service.archiveMessage({ conversationId: input.conversation_id, role: 'assistant', content: 'Lectures exécutées ou refusées.', metadata });
    }
    const tool_results = ['gmail.messages.search', 'calendar.events.read', 'drive.files.list'].map(capability => ({
      capability, status: failed ? 'FAILED' : 'SUCCEEDED',
      error: failed ? 'UNRELATED_PROVIDER_ERROR' : null,
      result: { messages: ['private-email-subject-and-body'] },
    }));
    return Response.json({ ok: true, text: 'Lectures exécutées ou refusées.', archive_saved: archived,
      replayed: calls === 2, tool_results: calls === 1 || replayTools ? tool_results : [] });
  };
  try {
    const result = await (await runChatSelftest({ request, env: { DB, MELITURGOS_PASSWORD: 'pw' }, handleChat, cases: ['connected_reads'] })).json();
    assert.equal(calls, 2);
    assert.doesNotMatch(JSON.stringify(result), /private-email|Lectures exécutées|SELECT|Bearer/);
    return result;
  } finally { DB.close(); }
}

test('connected read self-test checks all three receipts, one durable turn and a replay without tools', async () => {
  const body = await connectedProof();
  assert.equal(body.ok, true, JSON.stringify(body));
  assert.equal(body.results[0].connectors.length, 3);
  assert.equal(body.results[0].replay_verified, true);
  assert.equal(body.results[0].archive_exactly_one_turn, true);
  assert.equal(body.results[0].private_content_logged, false);
});

test('connected read self-test cannot certify unrelated failures, duplicate execution or absent archives', async () => {
  for (const options of [{ failed: true }, { replayTools: true }, { archived: false }]) {
    assert.equal((await connectedProof(options)).ok, false, JSON.stringify(options));
  }
});
