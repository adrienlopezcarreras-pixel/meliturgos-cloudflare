import { json } from '../core/http.js';
import { requireValue } from '../core/contracts.js';
import { createConversationService } from '../conversations/conversation-service.js';
import { createDefaultCapabilityBus } from '../capabilities/default-bus.js';
import { ModelRouter } from '../models/ModelRouter.js';
import { createWorkersAIInvoke } from '../models/providers/workers-ai-provider.js';
import { Gen2ChatOrchestrator } from '../chat/gen2-chat-orchestrator.js';

const DEFAULT_REPOSITORY = 'adrienlopezcarreras-pixel/meliturgos-cloudflare';
const DEFAULT_CODE_BRANCH = 'mel-current';
const MAX_INPUT_CHARS = 12_000;
const HISTORY_LIMIT = 40;

function permissionsFromEnv(value) {
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string');
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter(item => typeof item === 'string');
  } catch {}
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

function cleanAttachments(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map(file => ({
    name: String(file?.name || '').slice(0, 500),
    type: String(file?.type || '').slice(0, 200),
    size: Number(file?.size || 0),
    url: String(file?.url || '').slice(0, 2000),
  }));
}

function historyForModel(messages) {
  return (messages || [])
    .filter(message => ['user','assistant'].includes(message.role) && typeof message.content === 'string')
    .slice(-HISTORY_LIMIT)
    .map(message => ({ role: message.role, content: message.content }));
}

export function createGen2ChatHandler({
  conversationServiceFactory = createConversationService,
  capabilityBusFactory = createDefaultCapabilityBus,
  modelRouterFactory,
  orchestratorFactory,
} = {}) {
  return async function handleGen2Chat(request, env = {}) {
    try {
      requireValue(request.method === 'POST', 'METHOD_NOT_ALLOWED', 405);
      const body = await request.json().catch(() => ({}));
      const text = String(body.text || '').trim();
      const attachments = cleanAttachments(body.attachments);
      requireValue(text || attachments.length > 0, 'TEXT_OR_ATTACHMENT_REQUIRED', 400);
      requireValue(text.length <= MAX_INPUT_CHARS, 'MESSAGE_TOO_LONG', 413);

      const conversationId = String(body.conversation_id || body.conversationId || crypto.randomUUID()).slice(0, 200);
      const deviceId = body.device_id || body.deviceId ? String(body.device_id || body.deviceId).slice(0, 200) : null;
      const userText = text || `Fichier${attachments.length > 1 ? 's' : ''} joint${attachments.length > 1 ? 's' : ''}: ${attachments.map(file => file.name || 'fichier').join(', ')}`;
      const requestId = String(body.request_id || crypto.randomUUID()).slice(0, 200);
      const owner = String(env.MELITURGOS_USER || env.OWNER_NAME || '').slice(0, 200);

      const service = conversationServiceFactory(env);
      await service.migrate();
      const history = historyForModel(await service.getMessages(conversationId, { limit: HISTORY_LIMIT }));

      await service.archiveMessage({
        id: body.message_id ? String(body.message_id).slice(0, 200) : crypto.randomUUID(),
        conversationId,
        deviceId,
        role: 'user',
        content: userText,
        attachments: attachments.length ? attachments : null,
        provenance: 'gen2-chat:user',
        metadata: { requestId },
      });

      const repository = env.MEL_GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
      const branch = env.MEL_GITHUB_BRANCH || DEFAULT_CODE_BRANCH;
      const capabilityBus = capabilityBusFactory({
        env,
        repository,
        branch,
        token: env.MEL_GITHUB_TOKEN || '',
      });

      const modelRouter = modelRouterFactory
        ? modelRouterFactory(env)
        : new ModelRouter({ invoke: createWorkersAIInvoke(env), timeoutMs: 45_000, maxCalls: 2 });
      const orchestrator = orchestratorFactory
        ? orchestratorFactory({ modelRouter, capabilityBus })
        : new Gen2ChatOrchestrator({ modelRouter, capabilityBus, maxToolCalls: 3 });

      const result = await orchestrator.run({
        messages: [...history, { role: 'user', content: userText }],
        model: body.model || undefined,
      }, {
        owner,
        permissions: permissionsFromEnv(env.CAPABILITY_PERMISSIONS),
        requestId,
        signal: request.signal,
        maxTokens: 4096,
      });

      const assistantId = crypto.randomUUID();
      await service.archiveMessage({
        id: assistantId,
        conversationId,
        deviceId,
        role: 'assistant',
        content: result.text,
        model: result.model || null,
        capabilitiesUsed: result.capabilitiesUsed?.length ? result.capabilitiesUsed : null,
        provenance: JSON.stringify(result.provenance || []),
        metadata: {
          requestId,
          provider: result.provider || null,
          task: result.task || null,
          toolCalls: result.toolCalls || 0,
          fallbackUsed: Boolean(result.fallbackUsed),
          runtime: 'gen2-chat',
        },
      });

      return json({
        ok: true,
        text: result.text,
        conversation_id: conversationId,
        message_id: assistantId,
        model: result.model || null,
        provider: result.provider || null,
        capabilities_used: result.capabilitiesUsed || [],
        provenance: result.provenance || [],
        tool_calls: result.toolCalls || 0,
        archive_saved: true,
        runtime: 'gen2-chat',
      });
    } catch (error) {
      console.error(JSON.stringify({
        message: 'gen2 chat failed',
        code: error?.code || 'INTERNAL_ERROR',
        error: error?.message || String(error),
      }));
      return json({
        ok: false,
        error: error?.message || 'MEL est indisponible.',
        code: error?.code || 'INTERNAL_ERROR',
      }, error?.status || 500);
    }
  };
}

export const handleGen2Chat = createGen2ChatHandler();
export const gen2ChatRouteLimits = Object.freeze({ maxInputChars: MAX_INPUT_CHARS, historyLimit: HISTORY_LIMIT });
