import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ExchangeMemorySync,
  exchangeToMemoryCandidate,
  normalizeExchange,
} from '../../src/memory/exchange-sync.js';

function memorySink() {
  const store = new Map();
  return {
    store,
    async put(candidate) {
      if (store.has(candidate.id)) return { inserted: false };
      store.set(candidate.id, candidate);
      return { inserted: true };
    },
  };
}

const sample = (overrides = {}) => ({
  id: 'msg-1',
  conversationId: 'conv-1',
  role: 'user',
  content: 'Je préfère les réponses courtes.',
  timestamp: 1700000000000,
  provenance: 'chat',
  ...overrides,
});

test('same archived message produces the same deterministic candidate id', async () => {
  const first = await exchangeToMemoryCandidate(sample());
  const second = await exchangeToMemoryCandidate(sample({ content: 'Contenu immuable déjà archivé.' }));
  assert.equal(first.id, second.id);
  assert.equal(first.status, 'PENDING');
  assert.equal(first.confidence, 0.72);
  assert.match(first.source, /^conversation:chat:user$/);
});

test('sync is idempotent across repeated batches', async () => {
  const sink = memorySink();
  const service = new ExchangeMemorySync({ candidateSink: sink.put.bind(sink) });
  const batch = [sample(), sample({ id: 'msg-2', role: 'assistant', content: 'Compris.' })];

  const first = await service.sync(batch);
  const second = await service.sync(batch);

  assert.deepEqual(first, {
    scanned: 2,
    eligible: 2,
    inserted: 2,
    alreadyPresent: 0,
    skippedEmpty: 0,
  });
  assert.equal(second.inserted, 0);
  assert.equal(second.alreadyPresent, 2);
  assert.equal(sink.store.size, 2);
});

test('duplicate message inside one batch is written once', async () => {
  const sink = memorySink();
  const service = new ExchangeMemorySync({ candidateSink: sink.put.bind(sink) });
  const result = await service.sync([sample(), sample()]);
  assert.equal(result.inserted, 1);
  assert.equal(result.alreadyPresent, 1);
  assert.equal(sink.store.size, 1);
});

test('empty content is ignored without creating cognitive memory', async () => {
  const sink = memorySink();
  const service = new ExchangeMemorySync({ candidateSink: sink.put.bind(sink) });
  const result = await service.sync([sample({ content: '   ' })]);
  assert.equal(result.inserted, 0);
  assert.equal(result.skippedEmpty, 1);
  assert.equal(sink.store.size, 0);
});

test('malformed batch fails closed before any sink write', async () => {
  const sink = memorySink();
  const service = new ExchangeMemorySync({ candidateSink: sink.put.bind(sink) });
  await assert.rejects(
    service.sync([sample(), sample({ id: '', content: 'invalid' })]),
    (error) => error.code === 'MEMORY_MESSAGE_ID_REQUIRED',
  );
  assert.equal(sink.store.size, 0);
});

test('content is bounded and assistant candidates have lower confidence', async () => {
  const normalized = normalizeExchange(sample({ content: 'x'.repeat(800) }), { maxContentLength: 256 });
  assert.equal(normalized.content.length, 256);
  assert.equal(normalized.truncated, true);

  const assistant = await exchangeToMemoryCandidate(sample({ role: 'assistant' }));
  assert.equal(assistant.confidence, 0.45);
});

test('batch size limit rejects runaway synchronization', async () => {
  const sink = memorySink();
  const service = new ExchangeMemorySync({ candidateSink: sink.put.bind(sink), maxBatchSize: 1 });
  await assert.rejects(
    service.sync([sample(), sample({ id: 'msg-2' })]),
    (error) => error.code === 'MEMORY_EXCHANGE_BATCH_TOO_LARGE',
  );
  assert.equal(sink.store.size, 0);
});
