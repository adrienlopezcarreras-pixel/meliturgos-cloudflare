import test from 'node:test';
import assert from 'node:assert/strict';

import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import {
  registerGooglePersonalAgentCapabilities,
  __test as helpers,
} from '../../src/capabilities/google-personal-agent-capabilities.js';
import { connectorDefinitions } from '../../src/connectors/registry.js';

function response(body, { status = 200 } = {}) {
  return new Response(
    status === 204 ? null : JSON.stringify(body),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

function fixture(env = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init: structuredClone({
      method: init.method,
      headers: init.headers,
      body: init.body,
    }) });

    const href = String(url);
    if (href.includes('/gmail/v1/users/me/messages?')) {
      return response({ messages: [{ id: 'm1', threadId: 't1' }], resultSizeEstimate: 1 });
    }
    if (href.endsWith('/gmail/v1/users/me/messages/send')) {
      return response({ id: 'sent-1', threadId: 'thread-1', labelIds: ['SENT'] });
    }
    if (href.endsWith('/gmail/v1/users/me/drafts')) {
      return response({ id: 'draft-1', message: { id: 'm2', threadId: 't2' } });
    }
    if (href.includes('/calendar/v3/calendars/primary/events') && init.method === 'POST') {
      return response({ id: 'event-1', status: 'confirmed', htmlLink: 'https://calendar.google.com/event?e=1' });
    }
    if (href.includes('/tasks/v1/lists/@default/tasks') && init.method === 'POST') {
      return response({ id: 'task-1', title: 'Rappeler Adrien', status: 'needsAction', due: '2026-09-27T10:00:00.000Z' });
    }
    if (href.includes('/tasks/v1/lists/@default/tasks?')) {
      return response({ items: [{ id: 'task-0', title: 'Existante', status: 'needsAction' }] });
    }
    return response({}, { status: 404 });
  };

  const bus = new CapabilityBus();
  const ids = registerGooglePersonalAgentCapabilities(bus, env, { fetchImpl });
  return { bus, calls, ids };
}

test('Google personal-agent connector catalog exposes Gmail, Calendar and Tasks action surfaces', () => {
  const byId = new Map(connectorDefinitions.map(row => [row.id, row]));
  assert.ok(byId.has('google-tasks'));
  assert.deepEqual(byId.get('gmail').capabilities, [
    'gmail.messages.search',
    'gmail.messages.read',
    'gmail.drafts.create',
    'gmail.messages.send',
  ]);
  assert.deepEqual(byId.get('google-calendar').capabilities, [
    'calendar.events.list',
    'calendar.events.create',
    'calendar.events.update',
    'calendar.events.delete',
  ]);
  assert.deepEqual(byId.get('google-tasks').capabilities, [
    'tasks.list',
    'tasks.create',
    'tasks.update',
    'tasks.delete',
  ]);
});

test('Google personal-agent capabilities fail closed while OAuth tokens are absent', async () => {
  const { bus } = fixture({});
  assert.equal(bus.describe('gmail.messages.search').health, 'UNAVAILABLE');
  assert.equal(bus.describe('calendar.events.list').health, 'UNAVAILABLE');
  assert.equal(bus.describe('tasks.list').health, 'UNAVAILABLE');

  await assert.rejects(
    () => bus.execute('gmail.messages.search', { query: 'is:unread' }, {
      owner: 'adrien',
      permissions: ['personal.mail.read'],
      requestId: 'missing-google-oauth',
    }),
    error => error?.message === 'CAPABILITY_UNAVAILABLE' || error?.code === 'CAPABILITY_UNAVAILABLE',
  );
});

test('Gmail search executes a bounded fixed-origin read with bearer auth', async () => {
  const { bus, calls } = fixture({ GMAIL_ACCESS_TOKEN: 'gmail-secret' });

  const out = await bus.execute('gmail.messages.search', {
    query: 'from:example@example.com is:unread',
    limit: 10,
  }, {
    owner: 'adrien',
    permissions: ['personal.mail.read'],
    requestId: 'gmail-search',
  });

  assert.equal(out.messages.length, 1);
  assert.equal(out.messages[0].id, 'm1');
  assert.equal(calls.length, 1);
  const call = calls[0];
  const url = new URL(call.url);
  assert.equal(url.origin, 'https://gmail.googleapis.com');
  assert.equal(url.pathname, '/gmail/v1/users/me/messages');
  assert.equal(url.searchParams.get('q'), 'from:example@example.com is:unread');
  assert.equal(url.searchParams.get('maxResults'), '10');
  assert.equal(call.init.headers.authorization, 'Bearer gmail-secret');
  assert.equal(JSON.stringify(out).includes('gmail-secret'), false);
});

test('Gmail send cannot self-approve and executes only after exact trusted approval', async () => {
  const { bus, calls } = fixture({ GMAIL_ACCESS_TOKEN: 'gmail-secret' });
  const input = {
    to: 'dest@example.com',
    subject: 'Test MEL',
    body: 'Message envoyé par le banc de test.',
  };
  const baseContext = {
    owner: 'adrien',
    permissions: ['personal.mail.send'],
    requestId: 'gmail-send',
  };

  await assert.rejects(
    () => bus.execute('gmail.messages.send', input, baseContext),
    error => error?.code === 'EXPLICIT_APPROVAL_REQUIRED',
  );
  assert.equal(calls.length, 0);

  const out = await bus.execute('gmail.messages.send', input, {
    ...baseContext,
    approvedCapabilities: ['gmail.messages.send'],
  });
  assert.equal(out.id, 'sent-1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  const body = JSON.parse(calls[0].init.body);
  const decoded = helpers.decodeBase64UrlUtf8(body.raw);
  assert.match(decoded, /To: dest@example\.com/);
  assert.match(decoded, /Subject: Test MEL/);
  assert.match(decoded, /Message envoyé par le banc de test\./);
});

test('Calendar creation requires exact approval and sends only bounded event fields', async () => {
  const { bus, calls } = fixture({ GOOGLE_CALENDAR_ACCESS_TOKEN: 'calendar-secret' });
  const input = {
    summary: 'Rendez-vous test MEL',
    start: '2026-09-27T10:00:00+02:00',
    end: '2026-09-27T10:30:00+02:00',
    time_zone: 'Europe/Paris',
  };
  const context = {
    owner: 'adrien',
    permissions: ['personal.calendar.write'],
    requestId: 'calendar-create',
  };

  await assert.rejects(
    () => bus.execute('calendar.events.create', input, context),
    error => error?.code === 'EXPLICIT_APPROVAL_REQUIRED',
  );
  assert.equal(calls.length, 0);

  const out = await bus.execute('calendar.events.create', input, {
    ...context,
    approvedCapabilities: ['calendar.events.create'],
  });

  assert.equal(out.id, 'event-1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://www.googleapis.com/calendar/v3/calendars/primary/events');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.summary, 'Rendez-vous test MEL');
  assert.equal(body.start.timeZone, 'Europe/Paris');
  assert.equal(body.end.timeZone, 'Europe/Paris');
  assert.equal(calls[0].init.headers.authorization, 'Bearer calendar-secret');
});

test('Google Tasks creation is a guarded executable capability', async () => {
  const { bus, calls } = fixture({ GOOGLE_TASKS_ACCESS_TOKEN: 'tasks-secret' });
  const input = {
    title: 'Rappeler Adrien',
    due: '2026-09-27T10:00:00+02:00',
  };
  const context = {
    owner: 'adrien',
    permissions: ['personal.tasks.write'],
    requestId: 'task-create',
  };

  await assert.rejects(
    () => bus.execute('tasks.create', input, context),
    error => error?.code === 'EXPLICIT_APPROVAL_REQUIRED',
  );
  assert.equal(calls.length, 0);

  const out = await bus.execute('tasks.create', input, {
    ...context,
    approvedCapabilities: ['tasks.create'],
  });
  assert.equal(out.id, 'task-1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks');
  assert.equal(calls[0].init.headers.authorization, 'Bearer tasks-secret');
});

test('every sensitive Google mutation advertises the central approval gate', () => {
  const { bus, ids } = fixture({
    GMAIL_ACCESS_TOKEN: 'gmail-secret',
    GOOGLE_CALENDAR_ACCESS_TOKEN: 'calendar-secret',
    GOOGLE_TASKS_ACCESS_TOKEN: 'tasks-secret',
  });
  assert.ok(ids.length >= 12);

  for (const id of [
    'gmail.drafts.create',
    'gmail.messages.send',
    'calendar.events.create',
    'calendar.events.update',
    'calendar.events.delete',
    'tasks.create',
    'tasks.update',
    'tasks.delete',
  ]) {
    const contract = bus.contract(id);
    assert.equal(contract.valid, true, id);
    assert.equal(contract.explicit_approval_gate, true, id);
  }

  for (const id of ['gmail.messages.search', 'gmail.messages.read', 'calendar.events.list', 'tasks.list']) {
    assert.equal(bus.contract(id).explicit_approval_gate, false, id);
  }
});
