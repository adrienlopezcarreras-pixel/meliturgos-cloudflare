import test from 'node:test';
import assert from 'node:assert/strict';

import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import { registerNotificationCapabilities } from '../../src/capabilities/notification-capabilities.js';
import { createD1NotificationStore } from '../../src/notifications/d1-notification-store.js';
import { createNotificationService } from '../../src/notifications/notification-service.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

const manageContext = {
  owner: 'owner',
  permissions: ['notifications:manage'],
  requestId: 'notifications-manage',
  approvedCapabilities: ['notifications.subscribe', 'notifications.unsubscribe'],
};

test('D1 notification subscriptions persist while public reads redact endpoint and keys', async (t) => {
  const db = sqliteD1();
  t.after(() => db.close());

  const first = createNotificationService({
    store: createD1NotificationStore(db),
    authorize: async () => true,
    clock: () => '2026-09-25T09:00:00.000Z',
  });
  await first.subscribe({
    id: 'browser-main',
    channel: 'WEB_PUSH',
    target: {
      endpoint: 'https://push.example.test/private-endpoint',
      keys: { p256dh: 'sensitive-key', auth: 'sensitive-auth' },
    },
  });

  const second = createNotificationService({
    store: createD1NotificationStore(db),
    authorize: async () => true,
  });
  const rows = await second.listSubscriptions();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].targetHint, 'push.example.test');
  assert.equal(JSON.stringify(rows).includes('private-endpoint'), false);
  assert.equal(JSON.stringify(rows).includes('sensitive-auth'), false);
});

test('D1 delivery claims keep idempotency across service instances', async (t) => {
  const db = sqliteD1();
  t.after(() => db.close());
  let sends = 0;

  const make = () => createNotificationService({
    store: createD1NotificationStore(db),
    authorize: async () => true,
    transports: {
      COMPANION: { async send() { sends += 1; } },
    },
  });

  const first = make();
  await first.subscribe({
    id: 'companion-main',
    channel: 'COMPANION',
    target: { deviceId: 'companion-001' },
  });
  const payload = {
    idempotencyKey: 'event:done:1',
    notification: { title: 'Terminé', body: 'Une seule notification.' },
  };

  assert.equal((await first.send(payload)).duplicate, false);
  assert.equal((await make().send(payload)).duplicate, true);
  assert.equal(sends, 1);
});

test('notification runtime capabilities require permissions and explicit approvals before mutations', async (t) => {
  const db = sqliteD1();
  t.after(() => db.close());
  const bus = new CapabilityBus();
  const calls = [];
  registerNotificationCapabilities(bus, {
    DB: db,
    MEL_NOTIFICATION_TRANSPORTS: {
      COMPANION: { async send(payload) { calls.push(payload); } },
    },
  });

  const status = await bus.execute('notifications.status', {}, { owner: 'owner', permissions: [], requestId: 'status' });
  assert.equal(status.persistent_store, true);
  assert.equal(status.channels.find(row => row.channel === 'COMPANION').transport_configured, true);

  await assert.rejects(
    () => bus.execute('notifications.subscribe', {
      id: 'phone',
      channel: 'COMPANION',
      target: { deviceId: 'phone-001' },
    }, { owner: 'owner', permissions: ['notifications:manage'], requestId: 'missing-approval' }),
    { code: 'EXPLICIT_APPROVAL_REQUIRED', status: 409 },
  );

  await bus.execute('notifications.subscribe', {
    id: 'phone',
    channel: 'COMPANION',
    target: { deviceId: 'phone-001' },
  }, manageContext);

  const listed = await bus.execute('notifications.subscriptions.list', {}, {
    owner: 'owner',
    permissions: ['notifications:manage'],
    requestId: 'list',
  });
  assert.equal(listed.length, 1);

  await assert.rejects(
    () => bus.execute('notifications.send', {
      idempotencyKey: 'runtime:1',
      notification: { title: 'Runtime', body: 'Test' },
    }, {
      owner: 'owner',
      permissions: ['notifications:send'],
      requestId: 'send-no-approval',
    }),
    { code: 'EXPLICIT_APPROVAL_REQUIRED', status: 409 },
  );

  const sent = await bus.execute('notifications.send', {
    idempotencyKey: 'runtime:1',
    channels: ['COMPANION'],
    notification: { title: 'Runtime', body: 'Test' },
  }, {
    owner: 'owner',
    permissions: ['notifications:send'],
    approvedCapabilities: ['notifications.send'],
    requestId: 'send-approved',
  });
  assert.equal(sent.status, 'DELIVERED');
  assert.equal(calls.length, 1);
});

test('unconfigured transports fail honestly instead of simulating delivery', async (t) => {
  const db = sqliteD1();
  t.after(() => db.close());
  const bus = new CapabilityBus();
  registerNotificationCapabilities(bus, { DB: db });

  await bus.execute('notifications.subscribe', {
    id: 'browser',
    channel: 'WEB_PUSH',
    target: { endpoint: 'https://push.example.test/a', keys: {} },
  }, {
    owner: 'owner',
    permissions: ['notifications:manage'],
    approvedCapabilities: ['notifications.subscribe'],
    requestId: 'subscribe',
  });

  const result = await bus.execute('notifications.send', {
    idempotencyKey: 'runtime:no-transport',
    channels: ['WEB_PUSH'],
    notification: { title: 'No transport', body: 'Do not fake success.' },
  }, {
    owner: 'owner',
    permissions: ['notifications:send'],
    approvedCapabilities: ['notifications.send'],
    requestId: 'send',
  });

  assert.equal(result.status, 'FAILED');
  assert.equal(result.delivered, 0);
  assert.equal(result.results[0].code, 'TRANSPORT_UNAVAILABLE');
});
