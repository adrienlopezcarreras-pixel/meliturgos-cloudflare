import assert from 'node:assert/strict';
import test from 'node:test';

import { createNotificationService } from '../../src/notifications/notification-service.js';
import { createD1NotificationStore } from '../../src/notifications/d1-notification-store.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

const allowAll = async () => true;
const context = { owner: 'adrien', requestId: 'notification-d1-test' };

function service(db, owner, transports = {}) {
  return createNotificationService({
    store: createD1NotificationStore(db, { owner }),
    authorize: allowAll,
    transports,
    clock: (() => {
      let tick = 0;
      return () => `2026-09-25T09:40:${String(tick++).padStart(2, '0')}Z`;
    })(),
  });
}

test('GEN2-41 D1 subscriptions survive service recreation', async () => {
  const db = sqliteD1();
  try {
    const first = service(db, 'adrien');
    await first.subscribe({
      id: 'browser-main',
      channel: 'WEB_PUSH',
      target: {
        endpoint: 'https://push.example.test/durable',
        keys: { auth: 'secret' },
      },
    }, context);

    const second = service(db, 'adrien');
    const rows = await second.listSubscriptions({}, context);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'browser-main');
    assert.equal(rows[0].channel, 'WEB_PUSH');
    assert.equal(rows[0].targetHint, 'push.example.test');
    assert.equal(JSON.stringify(rows).includes('secret'), false);
  } finally {
    db.close();
  }
});

test('GEN2-41 D1 notification state is strictly owner-scoped', async () => {
  const db = sqliteD1();
  try {
    const adrien = service(db, 'adrien');
    const other = service(db, 'other-owner');

    await adrien.subscribe({
      id: 'same-id',
      channel: 'COMPANION',
      target: { deviceId: 'adrien-device' },
    }, context);

    await other.subscribe({
      id: 'same-id',
      channel: 'COMPANION',
      target: { deviceId: 'other-device' },
    }, { owner: 'other-owner', requestId: 'other' });

    const adrienRows = await adrien.listSubscriptions({}, context);
    const otherRows = await other.listSubscriptions({}, { owner: 'other-owner' });

    assert.equal(adrienRows.length, 1);
    assert.equal(otherRows.length, 1);
    assert.equal(adrienRows[0].id, 'same-id');
    assert.equal(otherRows[0].id, 'same-id');
    assert.equal(adrienRows[0].targetHint.endsWith('n-device'), true);
    assert.equal(otherRows[0].targetHint.endsWith('r-device'), true);
  } finally {
    db.close();
  }
});

test('GEN2-41 delivery idempotency survives Worker/service restart', async () => {
  const db = sqliteD1();
  let sends = 0;
  try {
    const first = service(db, 'adrien', {
      COMPANION: {
        async send() { sends += 1; },
      },
    });
    await first.subscribe({
      id: 'pc',
      channel: 'COMPANION',
      target: { deviceId: 'windows-pc-1' },
    }, context);

    const input = {
      idempotencyKey: 'event:work:durable:1',
      notification: {
        title: 'Travail terminé',
        body: 'Livraison durable.',
      },
    };

    const delivered = await first.send(input, context);
    assert.equal(delivered.status, 'DELIVERED');
    assert.equal(delivered.duplicate, false);
    assert.equal(sends, 1);

    const restarted = service(db, 'adrien', {
      COMPANION: {
        async send() { sends += 1; },
      },
    });
    const replay = await restarted.send(input, context);

    assert.equal(replay.duplicate, true);
    assert.equal(replay.status, 'DELIVERED');
    assert.equal(sends, 1);
  } finally {
    db.close();
  }
});

test('GEN2-41 owner-scoped idempotency keys do not collide across owners', async () => {
  const db = sqliteD1();
  const sends = [];
  try {
    const adrien = service(db, 'adrien', {
      COMPANION: { async send() { sends.push('adrien'); } },
    });
    const other = service(db, 'other-owner', {
      COMPANION: { async send() { sends.push('other'); } },
    });

    await adrien.subscribe({
      id: 'a',
      channel: 'COMPANION',
      target: { deviceId: 'a-device' },
    }, context);
    await other.subscribe({
      id: 'b',
      channel: 'COMPANION',
      target: { deviceId: 'b-device' },
    }, { owner: 'other-owner' });

    const input = {
      idempotencyKey: 'same-event-key',
      notification: { title: 'Test', body: 'Owner isolation.' },
    };

    const a = await adrien.send(input, context);
    const b = await other.send(input, { owner: 'other-owner' });

    assert.equal(a.duplicate, false);
    assert.equal(b.duplicate, false);
    assert.deepEqual(sends.sort(), ['adrien', 'other']);
  } finally {
    db.close();
  }
});

test('GEN2-41 D1 store exposes durable bounded status and unsubscribe persists', async () => {
  const db = sqliteD1();
  try {
    const store = createD1NotificationStore(db, { owner: 'adrien' });
    const instance = createNotificationService({
      store,
      authorize: allowAll,
      transports: {},
    });

    await instance.subscribe({
      id: 'browser',
      channel: 'WEB_PUSH',
      target: { endpoint: 'https://push.example.test/status', keys: {} },
    }, context);

    const before = await store.status();
    assert.deepEqual(before, {
      owner: 'adrien',
      subscriptions: 1,
      deliveries: 0,
      durable: true,
    });

    await instance.unsubscribe({ id: 'browser' }, context);

    const after = await createD1NotificationStore(db, { owner: 'adrien' }).status();
    assert.equal(after.subscriptions, 0);
    assert.equal(after.deliveries, 0);
    assert.equal(after.durable, true);
  } finally {
    db.close();
  }
});
