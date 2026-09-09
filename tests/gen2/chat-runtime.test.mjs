import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkersAIProvider } from '../../src/models/providers/workers-ai-provider.js';
import { Gen2ChatOrchestrator } from '../../src/chat/gen2-chat-orchestrator.js';
import { createGen2ChatHandler } from '../../src/api/chat-gen2.js';

function responseJson(response) {
  return response.json();
}

test('WorkersAIProvider invokes the configured Cloudflare AI binding and normalizes response text', async () => {
  const calls = [];
  const provider = new WorkersAIProvider({
    ai: {
      async run(model, input) {
        calls.push({ model, input });
        return { response: 'Bonjour depuis Workers AI' };
      }
    }
  });

  const result = await provider.invoke(
    { id: '@cf/test/model', model_id: '@cf/test/model', provider: 'workers-ai' },
    [{ role: 'user', content: 'Bonjour' }],
    { maxTokens: 1234 }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, '@cf/test/model');
  assert.equal(calls[0].input.max_tokens, 1234);
  assert.equal(result.text, 'Bonjour depuis Workers AI');
});

test('Gen2ChatOrchestrator executes an allowed capability then reinjects its result', async () => {
  const modelCalls = [];
  const modelRouter = {
    classifyTask: () => 'coding',
    async execute({ messages }) {
      modelCalls.push(messages);
      if (modelCalls.length === 1) {
        return {
          text: JSON.stringify({ type: 'tool_call', tool: 'code.search', input: { query: 'ModelRouter', path: 'src' } }),
          model: '@cf/test/model', provider: 'workers-ai', fallback_used: false
        };
      }
      assert.match(messages.at(-1).content, /MEL_TOOL_RESULT code\.search/);
      assert.match(messages.at(-1).content, /ModelRouter\.js/);
      return { text: 'Le routeur se trouve dans src/models/ModelRouter.js.', model: '@cf/test/model', provider: 'workers-ai', fallback_used: false };
    }
  };
  const bus = {
    list() {
      return [{
        id: 'code.search', name: 'Code search', description: 'Search code', input_schema: { type: 'object' },
        risk: 'LOW', enabled: true, health: 'HEALTHY', provider: 'github'
      }];
    },
    async execute(id, input) {
      assert.equal(id, 'code.search');
      assert.equal(input.query, 'ModelRouter');
      return { query: input.query, path: 'src', matches: [{ path: 'src/models/ModelRouter.js', line: 1, excerpt: 'export class ModelRouter' }], searched_files: 4, branch: 'mel-current', repository: 'owner/repo' };
    }
  };

  const orchestrator = new Gen2ChatOrchestrator({ modelRouter, capabilityBus: bus, maxToolCalls: 3 });
  const result = await orchestrator.run({ messages: [{ role: 'user', content: 'Où est ModelRouter ?' }] }, { owner: 'adrien', requestId: 'req-1' });

  assert.equal(result.text, 'Le routeur se trouve dans src/models/ModelRouter.js.');
  assert.deepEqual(result.capabilitiesUsed, ['code.search']);
  assert.equal(result.provenance[0].status, 'SUCCEEDED');
  assert.equal(result.toolCalls, 1);
});

test('Gen2ChatOrchestrator refuses automatic deployment capabilities', async () => {
  let executions = 0;
  const modelRouter = {
    classifyTask: () => 'conversation',
    async execute() {
      if (executions === 0) {
        executions++;
        return { text: '{"type":"tool_call","tool":"deployment.request_review","input":{}}', model: 'm', provider: 'workers-ai' };
      }
      return { text: 'Je ne déclenche pas de déploiement automatiquement.', model: 'm', provider: 'workers-ai' };
    }
  };
  const bus = {
    list: () => [{ id: 'deployment.request_review', name: 'deploy', description: 'deploy', input_schema: {}, risk: 'LOW', enabled: true, health: 'HEALTHY', provider: 'teacher' }],
    async execute() { throw new Error('must not execute'); }
  };

  const result = await new Gen2ChatOrchestrator({ modelRouter, capabilityBus: bus }).run({ messages: [{ role: 'user', content: 'Déploie' }] });
  assert.equal(result.capabilitiesUsed.length, 0);
  assert.equal(result.provenance[0].code, 'TOOL_NOT_ALLOWED');
});

test('Gen2ChatOrchestrator bounds repeated tool calls and forces a final answer turn', async () => {
  let calls = 0;
  const modelRouter = {
    classifyTask: () => 'coding',
    async execute() {
      calls++;
      if (calls <= 2) return { text: '{"type":"tool_call","tool":"echo","input":{"value":"x"}}', model: 'm', provider: 'workers-ai' };
      return { text: 'Réponse finale sans nouvel outil.', model: 'm', provider: 'workers-ai' };
    }
  };
  const bus = {
    list: () => [{ id: 'echo', name: 'echo', description: 'echo', input_schema: {}, risk: 'LOW', enabled: true, health: 'HEALTHY', provider: 'core' }],
    execute: async (_id, input) => input
  };

  const result = await new Gen2ChatOrchestrator({ modelRouter, capabilityBus: bus, maxToolCalls: 1 }).run({ messages: [{ role: 'user', content: 'Test' }] });
  assert.equal(result.text, 'Réponse finale sans nouvel outil.');
  assert.equal(result.capabilitiesUsed.length, 1);
  assert.ok(result.provenance.some(item => item.type === 'tool_limit'));
  assert.equal(calls, 3);
});

test('Gen2 chat handler archives one user message and one assistant message with provenance', async () => {
  const archived = [];
  const service = {
    async migrate() {},
    async getMessages() { return [{ role: 'assistant', content: 'Ancienne réponse' }]; },
    async archiveMessage(message) { archived.push(message); return { id: message.id }; }
  };

  const handler = createGen2ChatHandler({
    conversationServiceFactory: () => service,
    capabilityBusFactory: () => ({ list: () => [], execute: async () => ({}) }),
    modelRouterFactory: () => ({ execute: async () => ({ text: 'unused' }) }),
    orchestratorFactory: () => ({
      async run({ messages }) {
        assert.equal(messages.at(-1).content, 'Bonjour MEL');
        return {
          text: 'Bonjour Adrien', model: '@cf/test/model', provider: 'workers-ai', task: 'conversation',
          capabilitiesUsed: ['code.search'], provenance: [{ type: 'capability', tool: 'code.search', status: 'SUCCEEDED' }], toolCalls: 1, fallbackUsed: false
        };
      }
    })
  });

  const request = new Request('https://example.test/api/gen2/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'Bonjour MEL', conversation_id: 'conv-1', device_id: 'pc-1', message_id: 'client-msg-1' })
  });
  const response = await handler(request, { MELITURGOS_USER: 'adrien' });
  const body = await responseJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.text, 'Bonjour Adrien');
  assert.equal(body.runtime, 'gen2-chat');
  assert.deepEqual(body.capabilities_used, ['code.search']);
  assert.equal(archived.length, 2);
  assert.equal(archived[0].id, 'client-msg-1');
  assert.equal(archived[0].role, 'user');
  assert.equal(archived[1].role, 'assistant');
  assert.equal(archived[1].model, '@cf/test/model');
  assert.match(archived[1].provenance, /code\.search/);
});
