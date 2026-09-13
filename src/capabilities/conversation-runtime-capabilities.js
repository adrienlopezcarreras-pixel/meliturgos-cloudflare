import { createConversationService } from '../conversations/conversation-service.js';

function missingDb() {
  const error = new Error('DB_BINDING_MISSING');
  error.code = 'DB_BINDING_MISSING';
  error.status = 503;
  return error;
}

function serviceFor(env) {
  if (!env.DB) throw missingDb();
  return createConversationService(env);
}

const objectOutput = { type: 'object', additionalProperties: true };

function register(bus, env, { id, name, description, input_schema, risk = 'LOW' }, execute) {
  bus.discover({
    id,
    name,
    category: id.startsWith('device.') ? 'device' : 'conversation',
    version: '1.0.0',
    provider: 'core',
    description,
    input_schema,
    output_schema: objectOutput,
    risk,
    permissions: [],
    health: env.DB ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, execute);
}

export function registerConversationRuntimeCapabilities(bus, env = {}) {
  register(bus, env, {
    id: 'conversation.get',
    name: 'Lire une conversation',
    description: 'Reads one persisted conversation by id without mutating it.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['id'],
      additionalProperties: false,
    },
  }, async input => ({ conversation: await serviceFor(env).get({ id: input.id }) }));

  register(bus, env, {
    id: 'conversation.create',
    name: 'Créer une conversation',
    description: 'Creates one owner conversation in persistent storage.',
    risk: 'MEDIUM',
    input_schema: {
      type: 'object',
      properties: { title: { type: 'string', minLength: 0, maxLength: 200 } },
      required: ['title'],
      additionalProperties: false,
    },
  }, async input => serviceFor(env).create({ owner: env.MELITURGOS_USER || '', title: input.title }));

  register(bus, env, {
    id: 'conversation.update',
    name: 'Renommer une conversation',
    description: 'Updates the bounded title of an existing conversation.',
    risk: 'MEDIUM',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 200 },
        title: { type: 'string', minLength: 0, maxLength: 200 },
      },
      required: ['id', 'title'],
      additionalProperties: false,
    },
  }, async input => serviceFor(env).update({ id: input.id, title: input.title }));

  register(bus, env, {
    id: 'conversation.archive',
    name: 'Archiver une conversation',
    description: 'Archives an existing conversation without deleting its history.',
    risk: 'MEDIUM',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['id'],
      additionalProperties: false,
    },
  }, async input => serviceFor(env).archive({ id: input.id }));

  register(bus, env, {
    id: 'conversation.messages.list',
    name: 'Lire les messages d’une conversation',
    description: 'Returns persisted messages for one conversation.',
    input_schema: {
      type: 'object',
      properties: { conversationId: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['conversationId'],
      additionalProperties: false,
    },
  }, async input => ({ messages: await serviceFor(env).listMessages({ conversationId: input.conversationId }) }));

  register(bus, env, {
    id: 'conversation.messages.add',
    name: 'Ajouter un message utilisateur',
    description: 'Appends one bounded user message to an existing conversation.',
    risk: 'MEDIUM',
    input_schema: {
      type: 'object',
      properties: {
        conversationId: { type: 'string', minLength: 1, maxLength: 200 },
        content: { type: 'string', minLength: 1, maxLength: 12000 },
        deviceId: { type: 'string', minLength: 0, maxLength: 200 },
      },
      required: ['conversationId', 'content'],
      additionalProperties: false,
    },
  }, async input => serviceFor(env).addMessage({
    conversationId: input.conversationId,
    content: input.content,
    role: 'user',
    deviceId: input.deviceId || null,
  }));

  register(bus, env, {
    id: 'device.register',
    name: 'Enregistrer un appareil',
    description: 'Registers or refreshes one owner device in persistent storage.',
    risk: 'MEDIUM',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 200 },
        owner: { type: 'string', minLength: 0, maxLength: 200 },
        name: { type: 'string', minLength: 0, maxLength: 200 },
        kind: { type: 'string', minLength: 1, maxLength: 100 },
        metadata: { type: 'object', additionalProperties: true },
      },
      required: ['id', 'owner', 'name', 'kind', 'metadata'],
      additionalProperties: false,
    },
  }, async input => serviceFor(env).registerDevice(input));

  register(bus, env, {
    id: 'device.sync',
    name: 'Synchroniser un appareil',
    description: 'Reads messages newer than a device conversation checkpoint.',
    input_schema: {
      type: 'object',
      properties: {
        deviceId: { type: 'string', minLength: 1, maxLength: 200 },
        conversationId: { type: 'string', minLength: 1, maxLength: 200 },
      },
      required: ['deviceId', 'conversationId'],
      additionalProperties: false,
    },
  }, async input => serviceFor(env).sync({ deviceId: input.deviceId, conversationId: input.conversationId }));

  return bus;
}
