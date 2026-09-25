import { packContext } from './context-packer.js';

function required(value, code) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

/**
 * Read-only long-context assembler. It gathers durable conversation history,
 * grounded memory retrieval and the restart snapshot, then lets packContext()
 * enforce the prompt budget.
 */
export class ContextAssembler {
  constructor({
    conversationService,
    memoryService = null,
    restartSnapshot = null,
    packer = packContext,
  } = {}) {
    if (!conversationService || typeof conversationService.getMessages !== 'function') {
      throw new Error('CONTEXT_CONVERSATION_SERVICE_REQUIRED');
    }
    if (memoryService && typeof memoryService.retrieve !== 'function') {
      throw new Error('CONTEXT_MEMORY_SERVICE_INVALID');
    }
    if (restartSnapshot && typeof restartSnapshot.build !== 'function') {
      throw new Error('CONTEXT_RESTART_SNAPSHOT_INVALID');
    }
    if (typeof packer !== 'function') throw new Error('CONTEXT_PACKER_REQUIRED');

    this.conversationService = conversationService;
    this.memoryService = memoryService;
    this.restartSnapshot = restartSnapshot;
    this.packer = packer;
  }

  async build({
    owner,
    conversationId,
    query = '',
    budgetTokens = 12_000,
    historyLimit = 2_000,
    memoryLimit = 40,
  } = {}) {
    const normalizedOwner = required(owner, 'CONTEXT_OWNER_REQUIRED');
    const normalizedConversationId = required(conversationId, 'CONTEXT_CONVERSATION_ID_REQUIRED');
    const normalizedQuery = String(query || '').trim();

    const historyPromise = this.conversationService.getMessages(normalizedConversationId, {
      limit: Math.max(1, Math.min(10_000, Math.trunc(Number(historyLimit) || 2_000))),
      latest: true,
    });

    const memoryPromise = normalizedQuery && this.memoryService
      ? this.memoryService.retrieve({
          owner: normalizedOwner,
          query: normalizedQuery,
          limit: Math.max(1, Math.min(100, Math.trunc(Number(memoryLimit) || 40))),
        })
      : Promise.resolve({ results: [] });

    const restartPromise = this.restartSnapshot
      ? this.restartSnapshot.build({ owner: normalizedOwner })
      : Promise.resolve(null);

    const [messages, memoryResult, restart] = await Promise.all([
      historyPromise,
      memoryPromise,
      restartPromise,
    ]);

    const bundle = this.packer({
      messages: Array.isArray(messages) ? messages : [],
      memories: Array.isArray(memoryResult?.results) ? memoryResult.results : [],
      restartSnapshot: restart,
      budgetTokens,
    });

    return Object.freeze({
      ...bundle,
      owner: normalizedOwner,
      conversation_id: normalizedConversationId,
      query: normalizedQuery,
      evidence: Object.freeze({
        archived_messages_read: Array.isArray(messages) ? messages.length : 0,
        memory_results_read: Array.isArray(memoryResult?.results) ? memoryResult.results.length : 0,
        restart_snapshot_used: Boolean(restart),
        memory_retrieval: memoryResult?.retrieval || null,
        semantic_status: memoryResult?.semantic_status || null,
      }),
    });
  }
}
