import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PERMISSIONS,
  createMemoryNotificationStore,
  createNotificationService,
} from '../notifications/notification-service.js';
import { createD1NotificationStore } from '../notifications/d1-notification-store.js';

const objectSchema = (properties = {}, required = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const notificationSchema = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 120 },
    body: { type: 'string', minLength: 1, maxLength: 1200 },
    url: { type: 'string', maxLength: 2048 },
    tag: { type: 'string', maxLength: 80 },
    data: { type: 'object', additionalProperties: true },
  },
  required: ['title', 'body'],
  additionalProperties: false,
};

function permissionAuthorizer(permission, context = {}) {
  const permissions = Array.isArray(context.permissions) ? context.permissions : [];
  return permissions.includes('*') || permissions.includes(permission);
}

function transportMap(env = {}) {
  const value = env.MEL_NOTIFICATION_TRANSPORTS;
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function registerNotificationCapabilities(bus, env = {}) {
  const explicitStore = env.MEL_NOTIFICATION_STORE;
  const persistent = Boolean(explicitStore || (env.DB && typeof env.DB.prepare === 'function'));
  const store = explicitStore
    || (persistent ? createD1NotificationStore(env.DB) : createMemoryNotificationStore());
  const transports = transportMap(env);
  const service = createNotificationService({
    store,
    transports,
    authorize: permissionAuthorizer,
    audit: typeof env.MEL_NOTIFICATION_AUDIT === 'function'
      ? env.MEL_NOTIFICATION_AUDIT
      : async () => {},
  });

  bus.discover({
    id: 'notifications.status',
    name: 'État notifications',
    category: 'notifications',
    version: '1.0.0',
    provider: 'core',
    description: 'Expose la disponibilité du store et des transports notification sans révéler les abonnements.',
    input_schema: objectSchema(),
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: persistent ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, async () => ({
    ok: true,
    persistent_store: persistent,
    channels: NOTIFICATION_CHANNELS.map(channel => ({
      channel,
      transport_configured: typeof transports[channel]?.send === 'function',
    })),
  }));

  bus.discover({
    id: 'notifications.subscriptions.list',
    name: 'Lister les abonnements notifications',
    category: 'notifications',
    version: '1.0.0',
    provider: 'core',
    description: 'Liste uniquement les métadonnées publiques des abonnements; les endpoints/keys ne sont jamais renvoyés.',
    input_schema: objectSchema(),
    output_schema: { type: 'array', items: { type: 'object', additionalProperties: true } },
    risk: 'LOW',
    permissions: [NOTIFICATION_PERMISSIONS.MANAGE],
    health: persistent ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, (input, context) => service.listSubscriptions(input, context));

  bus.discover({
    id: 'notifications.subscribe',
    name: 'Ajouter un abonnement notifications',
    category: 'notifications',
    version: '1.0.0',
    provider: 'core',
    description: 'Enregistre un endpoint Web Push ou un identifiant compagnon après approbation explicite.',
    input_schema: objectSchema({
      id: { type: 'string', minLength: 1, maxLength: 200 },
      channel: { type: 'string', enum: NOTIFICATION_CHANNELS },
      target: { type: 'object', additionalProperties: true },
      enabled: { type: 'boolean' },
    }, ['id', 'channel', 'target']),
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'HIGH',
    permissions: [NOTIFICATION_PERMISSIONS.MANAGE],
    approval: {
      required: true,
      scope: 'notifications.subscribe',
      reason: 'Notification subscription persistence is a user-visible side effect.',
    },
    health: persistent ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, (input, context) => service.subscribe(input, context));

  bus.discover({
    id: 'notifications.unsubscribe',
    name: 'Retirer un abonnement notifications',
    category: 'notifications',
    version: '1.0.0',
    provider: 'core',
    description: 'Supprime un abonnement de notification après approbation explicite.',
    input_schema: objectSchema({
      id: { type: 'string', minLength: 1, maxLength: 200 },
    }, ['id']),
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'HIGH',
    permissions: [NOTIFICATION_PERMISSIONS.MANAGE],
    approval: {
      required: true,
      scope: 'notifications.unsubscribe',
      reason: 'Subscription deletion is a persistent side effect.',
    },
    health: persistent ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, (input, context) => service.unsubscribe(input, context));

  bus.discover({
    id: 'notifications.send',
    name: 'Envoyer une notification',
    category: 'notifications',
    version: '1.0.0',
    provider: 'core',
    description: 'Envoie une notification idempotente uniquement via les transports serveur explicitement configurés.',
    input_schema: objectSchema({
      idempotencyKey: { type: 'string', minLength: 1, maxLength: 240 },
      channels: {
        type: 'array',
        maxItems: 2,
        items: { type: 'string', enum: NOTIFICATION_CHANNELS },
      },
      notification: notificationSchema,
    }, ['idempotencyKey', 'notification']),
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'HIGH',
    permissions: [NOTIFICATION_PERMISSIONS.SEND],
    approval: {
      required: true,
      scope: 'notifications.send',
      reason: 'Sending a user-visible notification is an external side effect.',
    },
    health: persistent ? 'HEALTHY' : 'DEGRADED',
    enabled: true,
  }, (input, context) => service.send(input, context));

  return service;
}
