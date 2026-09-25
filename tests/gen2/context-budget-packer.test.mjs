import test from 'node:test';
import assert from 'node:assert/strict';

import { ContextAssembler } from '../../src/context/context-assembler.js';
import { estimateContextTokens, packContext } from '../../src/context/context-packer.js';

function message(index, role = index % 2 ? 'assistant' : 'user') {
  return {
    id: `m-${index}`,
    role,
    content: `message ${index} ` + 'x'.repeat(500),
    timestamp: index * 1_000,
    provenance: 'conversation-service',
    metadata: {},
  };
}

test('context packer keeps newest conversation state and references omitted history', () => {
  const messages = Array.from({ length: 80 }, (_, index) => message(index));
  const bundle = packContext({
    messages,
    budgetTokens: 4_000,
  });

  assert.equal(bundle.schema, 'mel.context-bundle/v1');
  assert.equal(bundle.sections.recent_messages.at(-1).id, 'm-79');
  assert.ok(bundle.omissions.message_count > 0);
  assert.equal(bundle.retrieval_hints.conversation_history_required, true);
  assert.equal(bundle.retrieval_hints.omitted_message_range.first_id, 'm-0');
  assert.ok(bundle.sections.historical_excerpts.every(row => row.id));
  assert.ok(bundle.estimated_tokens <= bundle.budget_tokens || bundle.within_budget === false);
});

test('memory packing keeps higher-ranked grounded evidence and provenance', () => {
  const bundle = packContext({
    messages: [message(1)],
    memories: [
      {
        id: 'low',
        source: 'memories',
        content: 'low score fact',
        rank_score: 0.2,
        provenance: { table: 'memories', id: 'low' },
      },
      {
        id: 'high',
        source: 'archive_messages',
        content: 'high score historical user evidence',
        rank_score: 0.95,
        authority: 'historical_user_message',
        provenance: { table: 'archive_messages', id: 'high', role: 'user' },
      },
    ],
    budgetTokens: 2_000,
  });

  assert.equal(bundle.sections.memory_evidence[0].id, 'high');
  assert.deepEqual(bundle.sections.memory_evidence[0].provenance, {
    table: 'archive_messages',
    id: 'high',
    role: 'user',
  });
  assert.ok(bundle.source_ids.memories.includes('archive_messages:high'));
});

test('continuity state prioritizes resume queue, active projects and recent decisions', () => {
  const bundle = packContext({
    messages: [message(1)],
    restartSnapshot: {
      resume_queue: [
        { id: 'loop-1', priority: 50, status: 'resumable', next_action: 'continue work' },
      ],
      active_projects: [
        { project_id: 'p1', title: 'Core continuity', status: 'ACTIVE', objectives: ['recover after restart'] },
      ],
      recent_decisions: [
        { decision_id: 'd1', project_id: 'p1', title: 'Use durable replay', rationale: 'Crash-safe' },
      ],
      recent_lessons: [
        { lesson_id: 'l1', project_id: 'p1', content: 'Do not rely on one-shot callbacks.' },
      ],
    },
    budgetTokens: 3_000,
  });

  assert.equal(bundle.sections.continuity.resume_queue[0].id, 'loop-1');
  assert.equal(bundle.sections.continuity.active_projects[0].project_id, 'p1');
  assert.equal(bundle.sections.continuity.recent_decisions[0].decision_id, 'd1');
  assert.equal(bundle.sections.continuity.recent_lessons[0].lesson_id, 'l1');
});

test('same selected evidence yields a deterministic bundle digest', () => {
  const input = {
    messages: [message(1), message(2)],
    memories: [{ id: 'mem-1', source: 'memories', content: 'fact', rank_score: 1 }],
    budgetTokens: 4_000,
  };
  const first = packContext(input);
  const second = packContext(structuredClone(input));

  assert.equal(first.bundle_digest, second.bundle_digest);
  assert.deepEqual(first.source_ids, second.source_ids);
});

test('ContextAssembler reads archive, memory and restart state without mutating them', async () => {
  const calls = [];
  const archived = [message(1), message(2), message(3)];
  const memoryResults = [{
    id: 'memory-1',
    source: 'memories',
    content: 'User prefers durable state',
    rank_score: 0.8,
    provenance: { table: 'memories', id: 'memory-1' },
  }];
  const restart = {
    resume_queue: [{ id: 'work-1', status: 'running', priority: 0 }],
    active_projects: [],
    recent_decisions: [],
    recent_lessons: [],
  };

  const assembler = new ContextAssembler({
    conversationService: {
      getMessages: async (conversationId, options) => {
        calls.push(['messages', conversationId, options]);
        return structuredClone(archived);
      },
    },
    memoryService: {
      retrieve: async input => {
        calls.push(['memory', input]);
        return {
          results: structuredClone(memoryResults),
          retrieval: 'unified-operational-memory',
          semantic_status: 'SUCCEEDED',
        };
      },
    },
    restartSnapshot: {
      build: async input => {
        calls.push(['restart', input]);
        return structuredClone(restart);
      },
    },
  });

  const bundle = await assembler.build({
    owner: 'adrien',
    conversationId: 'conv-1',
    query: 'what should I resume?',
    budgetTokens: 4_000,
  });

  assert.equal(bundle.owner, 'adrien');
  assert.equal(bundle.conversation_id, 'conv-1');
  assert.equal(bundle.evidence.archived_messages_read, 3);
  assert.equal(bundle.evidence.memory_results_read, 1);
  assert.equal(bundle.evidence.restart_snapshot_used, true);
  assert.equal(bundle.evidence.semantic_status, 'SUCCEEDED');
  assert.equal(bundle.sections.continuity.resume_queue[0].id, 'work-1');

  assert.equal(calls[0][0], 'messages');
  assert.equal(calls[1][0], 'memory');
  assert.equal(calls[1][1].owner, 'adrien');
  assert.equal(calls[2][0], 'restart');
  assert.deepEqual(archived[0], message(1));
  assert.equal(memoryResults[0].content, 'User prefers durable state');
});

test('ContextAssembler skips memory retrieval when there is no query', async () => {
  let memoryCalls = 0;
  const assembler = new ContextAssembler({
    conversationService: {
      getMessages: async () => [message(1)],
    },
    memoryService: {
      retrieve: async () => {
        memoryCalls += 1;
        return { results: [] };
      },
    },
  });

  const bundle = await assembler.build({
    owner: 'adrien',
    conversationId: 'conv-1',
    query: '',
    budgetTokens: 2_000,
  });

  assert.equal(memoryCalls, 0);
  assert.equal(bundle.evidence.memory_results_read, 0);
});

test('token estimate is monotonic enough for deterministic budgeting', () => {
  assert.ok(estimateContextTokens('a'.repeat(400)) > estimateContextTokens('a'.repeat(40)));
});
