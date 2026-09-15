import { DomainError, requireValue } from '../core/contracts.js';

export const NOTIFICATION_CHANNELS = Object.freeze(['WEB_PUSH', 'COMPANION']);
export const NOTIFICATION_PERMISSIONS = Object.freeze({
  MANAGE: 'notifications:manage',
  SEND: 'notifications:send'
});

const CHANNEL_SET = new Set(NOTIFICATION_CHANNELS);
const MAX_TITLE = 120;
const MAX_BODY = 1200;
const MAX_TAG = 80;

const text = (value, max, code) => {
  const normalized = String(value ?? '').trim();
  requireValue(normalized.length > 0 && normalized.length <= max, code);
  return normalized;
};

const safeUrl = value => {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  requireValue(raw.startsWith('/') || raw.startsWith('https://'), 'INVALID_NOTIFICATION_URL');
  return raw;
};

const normalizeChannel = channel => {
  const value = String(channel || '').trim().toUpperCase();
  requireValue(CHANNEL_SET.has(value), 'INVALID_NOTIFICATION_CHANNEL');
  return value;
};

const normalizeSubscriptionTarget = (channel, target) => {
  requireValue(target && typeof target === 'object' && !Array.isArray(target), 'INVALID_NOTIFICATION_TARGET');
  if (channel === 'WEB_PUSH') {
    const endpoint = String(target.endpoint || '').trim();
    requireValue(endpoint.startsWith('https://'), 'INVALID_WEB_PUSH_ENDPOINT');
    return {
      endpoint,
      expirationTime: target.expirationTime ?? null,
      keys: target.keys && typeof target.keys === 'object' ? { ...target.keys } : {}
    };
  }
  const deviceId = text(target.deviceId, 200, 'INVALID_COMPANION_DEVICE');
  return { deviceId };
};

const publicSubscription = row => ({
  id: row.id,
  channel: row.channel,
  enabled: row.enabled !== false,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  targetHint: row.channel === 'COMPANION'
    ? String(row.target?.deviceId || '').slice(-8)
    : (() => {
        try { return new URL(row.target?.endpoint || '').host; } catch { return 'configured'; }
      })()
});

const normalizeNotification = input => {
  requireValue(input && typeof input === 'object' && !Array.isArray(input), 'INVALID_NOTIFICATION');
  return Object.freeze({
    title: text(input.title, MAX_TITLE, 'INVALID_NOTIFICATION_TITLE'),
    body: text(input.body, MAX_BODY, 'INVALID_NOTIFICATION_BODY'),
    url: safeUrl(input.url),
    tag: input.tag == null || input.tag === '' ? null : text(input.tag, MAX_TAG, 'INVALID_NOTIFICATION_TAG'),
    data: input.data && typeof input.data === 'object' && !Array.isArray(input.data) ? { ...input.data } : {}
  });
};

const safeFailureCode = error => {
  const code = String(error?.code || error?.name || 'DELIVERY_FAILED').toUpperCase();
  return /^[A-Z0-9:_-]{1,80}$/.test(code) ? code : 'DELIVERY_FAILED';
};

function assertAdapter(condition, name) {
  if (!condition) throw new DomainError(`NOT_IMPLEMENTED:notifications.${name}`);
}

export function createMemoryNotificationStore() {
  const subscriptions = new Map();
  const deliveries = new Map();
  return {
    async putSubscription(row) { subscriptions.set(row.id, structuredClone(row)); return structuredClone(row); },
    async deleteSubscription(id) { return subscriptions.delete(id); },
    async listSubscriptions() { return [...subscriptions.values()].map(structuredClone); },
    async claimDelivery(key, row) {
      if (deliveries.has(key)) return false;
      deliveries.set(key, structuredClone(row));
      return true;
    },
    async getDelivery(key) { const row = deliveries.get(key); return row ? structuredClone(row) : null; },
    async putDelivery(key, row) { deliveries.set(key, structuredClone(row)); return structuredClone(row); }
  };
}

/**
 * Provider-neutral notification core for GEN2-41.
 *
 * It deliberately does not depend on the Event Bus so GEN2-40 can evolve on a
 * separate branch. Event Bus integration only needs to call service.send().
 * Authorization is fail-closed by default and transport/store implementations
 * are injected so Web Push and companion runtimes can be wired independently.
 */
export function createNotificationService({
  store,
  transports = {},
  authorize = async () => false,
  audit = async () => {},
  clock = () => new Date().toISOString()
} = {}) {
  assertAdapter(store, 'store');
  for (const method of ['putSubscription', 'deleteSubscription', 'listSubscriptions', 'claimDelivery', 'getDelivery', 'putDelivery']) {
    assertAdapter(typeof store[method] === 'function', `store.${method}`);
  }

  async function requirePermission(permission, context) {
    const allowed = await authorize(permission, context || {});
    if (!allowed) throw new DomainError('NOTIFICATION_PERMISSION_DENIED', 403);
  }

  return Object.freeze({
    async subscribe(input = {}, context = {}) {
      await requirePermission(NOTIFICATION_PERMISSIONS.MANAGE, context);
      const channel = normalizeChannel(input.channel);
      const id = text(input.id, 200, 'INVALID_NOTIFICATION_SUBSCRIPTION_ID');
      const now = clock();
      const previous = (await store.listSubscriptions()).find(row => row.id === id);
      const row = {
        id,
        channel,
        target: normalizeSubscriptionTarget(channel, input.target),
        enabled: input.enabled !== false,
        createdAt: previous?.createdAt || now,
        updatedAt: now
      };
      await store.putSubscription(row);
      await audit({ action: 'notification.subscribe', subscriptionId: id, channel, requestId: context.requestId || null });
      return publicSubscription(row);
    },

    async unsubscribe(input = {}, context = {}) {
      await requirePermission(NOTIFICATION_PERMISSIONS.MANAGE, context);
      const id = text(input.id, 200, 'INVALID_NOTIFICATION_SUBSCRIPTION_ID');
      const removed = await store.deleteSubscription(id);
      await audit({ action: 'notification.unsubscribe', subscriptionId: id, removed: Boolean(removed), requestId: context.requestId || null });
      return { id, removed: Boolean(removed) };
    },

    async listSubscriptions(_input = {}, context = {}) {
      await requirePermission(NOTIFICATION_PERMISSIONS.MANAGE, context);
      const rows = await store.listSubscriptions();
      return rows.map(publicSubscription);
    },

    async send(input = {}, context = {}) {
      await requirePermission(NOTIFICATION_PERMISSIONS.SEND, context);
      const idempotencyKey = text(input.idempotencyKey, 240, 'IDEMPOTENCY_KEY_REQUIRED');
      const notification = normalizeNotification(input.notification);
      const requestedChannels = input.channels == null
        ? null
        : new Set((Array.isArray(input.channels) ? input.channels : [input.channels]).map(normalizeChannel));
      const startedAt = clock();
      const claim = {
        idempotencyKey,
        status: 'IN_PROGRESS',
        startedAt,
        completedAt: null,
        delivered: 0,
        failed: 0,
        results: []
      };

      if (!await store.claimDelivery(idempotencyKey, claim)) {
        const previous = await store.getDelivery(idempotencyKey);
        return { ...(previous || claim), duplicate: true };
      }

      const subscriptions = (await store.listSubscriptions()).filter(row =>
        row.enabled !== false && (!requestedChannels || requestedChannels.has(row.channel))
      );
      const results = [];

      for (const subscription of subscriptions) {
        const transport = transports[subscription.channel];
        if (!transport || typeof transport.send !== 'function') {
          results.push({ subscriptionId: subscription.id, channel: subscription.channel, ok: false, code: 'TRANSPORT_UNAVAILABLE' });
          continue;
        }
        try {
          await transport.send({ subscription: structuredClone(subscription), notification }, context);
          results.push({ subscriptionId: subscription.id, channel: subscription.channel, ok: true, code: 'DELIVERED' });
        } catch (error) {
          results.push({ subscriptionId: subscription.id, channel: subscription.channel, ok: false, code: safeFailureCode(error) });
        }
      }

      const delivered = results.filter(row => row.ok).length;
      const failed = results.length - delivered;
      const finalRow = {
        ...claim,
        status: failed === 0 ? 'DELIVERED' : delivered > 0 ? 'PARTIAL' : 'FAILED',
        completedAt: clock(),
        delivered,
        failed,
        results
      };
      await store.putDelivery(idempotencyKey, finalRow);
      await audit({
        action: 'notification.send',
        idempotencyKey,
        delivered,
        failed,
        channels: [...new Set(results.map(row => row.channel))],
        requestId: context.requestId || null
      });
      return { ...finalRow, duplicate: false };
    }
  });
}
