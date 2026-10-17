import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ModelRouter } from '../src/models/ModelRouter.js';
import { ModelRegistry } from '../src/models/ModelRegistry.js';
import {
  CLIENT_CHAT_TIMEOUT_MS,
  DEFAULT_CHAT_SERVER_BUDGET_MS,
  MAX_CHAT_SERVER_BUDGET_MS,
  MIN_CHAT_SERVER_BUDGET_MS,
  chatServerBudgetMs,
  raceChatDeadline,
} from '../src/api/chat-deadline.js';
import { handleNativeChat } from '../src/api/native-chat.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const never = () => new Promise(() => {});

function registry(count) {
  return new ModelRegistry(Array.from({ length: count }, (_, i) => ({
    id: `slow-${i}`, model_id: `slow-${i}`, provider: 'test', capabilities: ['GENERAL'],
    priority: 100 - i, cost: 0, health: 'HEALTHY', enabled: true,
  })));
}

test('the browser /api/chat timeout matches the contract and always exceeds the server budget', async () => {
  const source = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');
  const match = source.match(/value\.includes\('\/api\/chat'\)\)return (\d+);/);
  assert.ok(match, 'client /api/chat timeout must stay discoverable');
  assert.equal(Number(match[1]), CLIENT_CHAT_TIMEOUT_MS);
  assert.ok(MAX_CHAT_SERVER_BUDGET_MS < CLIENT_CHAT_TIMEOUT_MS);
  assert.ok(DEFAULT_CHAT_SERVER_BUDGET_MS <= MAX_CHAT_SERVER_BUDGET_MS);
});

test('configured server budget is clamped below the browser timeout', () => {
  assert.equal(chatServerBudgetMs({}), DEFAULT_CHAT_SERVER_BUDGET_MS);
  assert.equal(chatServerBudgetMs({ MEL_CHAT_SERVER_BUDGET_MS: '999999' }), MAX_CHAT_SERVER_BUDGET_MS);
  assert.equal(chatServerBudgetMs({ MEL_CHAT_SERVER_BUDGET_MS: '1' }), MIN_CHAT_SERVER_BUDGET_MS);
  assert.equal(chatServerBudgetMs({ MEL_CHAT_SERVER_BUDGET_MS: 'abc' }), DEFAULT_CHAT_SERVER_BUDGET_MS);
});

test('ModelRouter shares one deadline across sequential candidates instead of 120 s each', async () => {
  let calls = 0;
  let fallbackCalls = 0;
  const router = new ModelRouter({
    registry: registry(3),
    timeoutMs: 120_000,
    maxCalls: 3,
    deadlineAt: Date.now() + 150,
    invoke: () => { calls += 1; return never(); },
    finalFallback: async () => { fallbackCalls += 1; return { response: 'late' }; },
  });
  const started = Date.now();
  await assert.rejects(router.execute({ task: 'GENERAL', messages: [] }), error => error.code === 'CHAT_DEADLINE_EXCEEDED');
  assert.ok(Date.now() - started < 1_000, 'router must stop at the shared deadline');
  assert.equal(calls, 1, 'no further candidate starts once the budget is spent');
  assert.equal(fallbackCalls, 0, 'final fallback must not start after the deadline');
});

test('ModelRouter without a deadline keeps its existing per-call behaviour', async () => {
  const router = new ModelRouter({
    registry: registry(2),
    timeoutMs: 1_000,
    maxCalls: 2,
    invoke: async selected => ({ response: `ok from ${selected.id}` }),
  });
  const result = await router.execute({ task: 'GENERAL', messages: [] });
  assert.equal(result.text, 'ok from slow-0');
});

test('raceChatDeadline rejects with an explicit code instead of hanging', async () => {
  await assert.rejects(raceChatDeadline(never(), Date.now() + 20), error => error.code === 'CHAT_DEADLINE_EXCEEDED');
  assert.equal(await raceChatDeadline(Promise.resolve('fast'), Date.now() + 1_000), 'fast');
  assert.equal(await raceChatDeadline(Promise.resolve('no deadline'), null), 'no deadline');
});

test('native chat answers with an explicit deadline error before the browser would abort', { timeout: 30_000 }, async () => {
  const DB = sqliteD1();
  let aiCalls = 0;
  try {
    const env = {
      DB,
      MEL_CHAT_SERVER_BUDGET_MS: String(MIN_CHAT_SERVER_BUDGET_MS),
      AI: { run() { aiCalls += 1; return never(); } },
    };
    const request = new Request('https://mel.example/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'explique-moi en détail le fonctionnement des abeilles', conversation_id: 'deadline-test', use_companion_compute: false }),
    });
    const started = Date.now();
    const response = await handleNativeChat(request, env, { authorized: true });
    const elapsed = Date.now() - started;
    const payload = await response.json();
    assert.ok(elapsed < MIN_CHAT_SERVER_BUDGET_MS + 3_000, `server must stop near its budget, took ${elapsed} ms`);
    assert.ok(elapsed < CLIENT_CHAT_TIMEOUT_MS);
    assert.equal(response.ok, false);
    assert.equal(payload.code, 'CHAT_INFERENCE_FAILED');
    assert.equal(payload.detail, 'CHAT_DEADLINE_EXCEEDED');
    assert.ok(aiCalls >= 1);
  } finally {
    DB.close();
  }
});
