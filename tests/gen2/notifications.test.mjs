import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NOTIFICATION_PERMISSIONS,
  createMemoryNotificationStore,
  createNotificationService
} from '../../src/notifications/notification-service.js';

const allowAll = async () => true;
const context = { owner: 'owner', requestId: 'req-41' };

const makeService = (overrides = {}) => createNotificationService({
  store: createMemoryNotificationStore(),
  authorize: allowAll,
  clock: (() => {
    let tick = 0;
    return () => `2026-09-15T18:10:${String(tick++).padStart(2, '0')}Z`;
  })(),
  ...overrides
});

test('GEN2-41 fails closed when authorization is not wired', async () => {
  const service = createNotificationService({ store: createMemoryNotificationStore() });
  await assert.rejects(
    service.listSubscriptions({}, context),
    error => error?.code === 'NOTIFICATION_PERMISSION_DENIED' && error?.status === 403
  );
});

test('GEN2-41 subscriptions support Web Push and redact sensitive targets', async () => {
  const service = makeService();
  const created = await service.subscribe({
    id: 'browser-main',
    channel: 'web_push',
    target: {
      endpoint: 'https://push.example.test/secret-token',
      keys: { p256dh: 'private-ish-key-material', auth: 'auth-secret' }
    }
  }, context);

  assert.equal(created.channel, 'WEB_PUSH');
  assert.equal(created.targetHint, 'push.example.test');
  assert.equal('target' in created, false);

  const listed = await service.listSubscriptions({}, context);
  assert.equal(listed.length, 1);
  assert.equal(JSON.stringify(listed).includes('secret-token'), false);
  assert.equal(JSON.stringify(listed).includes('auth-secret'), false);
});

test('GEN2-41 routes one idempotent notification to Web Push and companion transports', async () => {
  const calls = [];
  const audits = [];
  const service = makeService({
    transports: {
      WEB_PUSH: { async send(payload) { calls.push(['WEB_PUSH', payload]); } },
      COMPANION: { async send(payload) { calls.push(['COMPANION', payload]); } }
    },
    audit: async event => audits.push(event)
  });

  await service.subscribe({
    id: 'browser', channel: 'WEB_PUSH', target: { endpoint: 'https://push.example.test/a', keys: {} }
  }, context);
  await service.subscribe({
    id: 'phone', channel: 'COMPANION', target: { deviceId: 'android-device-001' }
  }, context);

  const result = await service.send({
    idempotencyKey: 'event:work:123:done',
    notification: { title: 'Travail terminé', body: 'Le cycle MEL est terminé.', url: '/work/123', tag: 'work-123' }
  }, context);

  assert.equal(result.status, 'DELIVERED');
  assert.equal(result.delivered, 2);
  assert.equal(result.failed, 0);
  assert.equal(result.duplicate, false);
  assert.deepEqual(calls.map(([channel]) => channel).sort(), ['COMPANION', 'WEB_PUSH']);
  assert.equal(audits.at(-1).action, 'notification.send');
  assert.equal(JSON.stringify(audits).includes('Le cycle MEL est terminé.'), false);
});

test('GEN2-41 replays are deduplicated and never redelivered', async () => {
  let sends = 0;
  const service = makeService({
    transports: { COMPANION: { async send() { sends += 1; } } }
  });
  await service.subscribe({ id: 'pc', channel: 'COMPANION', target: { deviceId: 'windows-pc' } }, context);

  const input = {
    idempotencyKey: 'event:alert:42',
    notification: { title: 'Alerte', body: 'Une seule livraison.' }
  };
  const first = await service.send(input, context);
  const second = await service.send(input, context);

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(sends, 1);
});

test('GEN2-41 supports channel targeting without coupling to Event Bus', async () => {
  const calls = [];
  const service = makeService({
    transports: {
      WEB_PUSH: { async send() { calls.push('WEB_PUSH'); } },
      COMPANION: { async send() { calls.push('COMPANION'); } }
    }
  });
  await service.subscribe({ id: 'browser', channel: 'WEB_PUSH', target: { endpoint: 'https://push.example.test/b' } }, context);
  await service.subscribe({ id: 'phone', channel: 'COMPANION', target: { deviceId: 'phone-2' } }, context);

  const result = await service.send({
    idempotencyKey: 'manual:companion-only:1',
    channels: ['companion'],
    notification: { title: 'Téléphone', body: 'Companion uniquement.' }
  }, context);

  assert.deepEqual(calls, ['COMPANION']);
  assert.equal(result.delivered, 1);
});

test('GEN2-41 sanitizes transport failures and reports partial delivery', async () => {
  const service = makeService({
    transports: {
      WEB_PUSH: { async send() { const error = new Error('provider secret leaked here'); error.code = 'PUSH_REJECTED'; throw error; } },
      COMPANION: { async send() {} }
    }
  });
  await service.subscribe({ id: 'browser', channel: 'WEB_PUSH', target: { endpoint: 'https://push.example.test/c' } }, context);
  await service.subscribe({ id: 'phone', channel: 'COMPANION', target: { deviceId: 'phone-3' } }, context);

  const result = await service.send({
    idempotencyKey: 'partial:1',
    notification: { title: 'Partiel', body: 'Test de transport.' }
  }, context);

  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.delivered, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.results.find(row => !row.ok).code, 'PUSH_REJECTED');
  assert.equal(JSON.stringify(result).includes('provider secret'), false);
});

test('GEN2-41 validates notification URLs and subscription targets', async () => {
  const service = makeService();
  await assert.rejects(
    service.subscribe({ id: 'bad', channel: 'WEB_PUSH', target: { endpoint: 'http://insecure.example.test' } }, context),
    error => error?.code === 'INVALID_WEB_PUSH_ENDPOINT'
  );
  await assert.rejects(
    service.send({
      idempotencyKey: 'bad-url:1',
      notification: { title: 'Bad', body: 'Bad URL', url: 'javascript:alert(1)' }
    }, context),
    error => error?.code === 'INVALID_NOTIFICATION_URL'
  );
});

test('GEN2-41 exposes explicit permission names for host integration', () => {
  assert.deepEqual(NOTIFICATION_PERMISSIONS, {
    MANAGE: 'notifications:manage',
    SEND: 'notifications:send'
  });
});
