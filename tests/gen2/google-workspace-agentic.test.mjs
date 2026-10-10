import test from 'node:test';
import assert from 'node:assert/strict';

import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import { registerGoogleWorkspaceCapabilities } from '../../src/capabilities/google-workspace-capabilities.js';
import { connectorDefinitions } from '../../src/connectors/registry.js';

function response(body = {}, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fixture({ token = 'access-token' } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/messages/send')) return response({ id: 'm-sent', threadId: 't-1' });
    if (String(url).endsWith('/drafts')) return response({ id: 'd-1', message: { id: 'm-draft', threadId: 't-2' } });
    if (String(url).includes('/calendar/v3/calendars/') && init.method === 'POST') return response({ id: 'event-1' });
    if (String(url).includes('/tasks/v1/lists/') && init.method === 'POST') return response({ id: 'task-1' });
    if (init.method === 'DELETE') return response({}, 204);
    if (String(url).includes('/messages?')) return response({ messages: [{ id: 'm1', threadId: 't1' }] });
    if (String(url).includes('/users/@me/lists')) return response({ items: [{ id: 'list-1', title: 'Mes tâches' }] });
    return response({ items: [] });
  };
  const bus = new CapabilityBus();
  registerGoogleWorkspaceCapabilities(bus, {
    fetchImpl,
    resolveAccessToken: async () => token,
  });
  return { bus, calls };
}

test('Google Workspace runtime registers bounded mail, calendar and task capabilities', () => {
  const { bus } = fixture();
  const ids = new Set(bus.list().map(row => row.id));
  for (const id of [
    'gmail.messages.search',
    'gmail.messages.read',
    'gmail.drafts.create',
    'gmail.messages.send',
    'calendar.events.read',
    'calendar.events.create',
    'calendar.events.update',
    'calendar.events.delete',
    'tasks.tasklists.read',
    'tasks.tasks.read',
    'tasks.tasks.create',
    'tasks.tasks.update',
    'tasks.tasks.delete',
  ]) assert.equal(ids.has(id), true, id);

  for (const id of [
    'gmail.messages.send',
    'calendar.events.create',
    'calendar.events.update',
    'calendar.events.delete',
    'tasks.tasks.create',
    'tasks.tasks.update',
    'tasks.tasks.delete',
  ]) {
    const contract = bus.contract(id);
    assert.equal(contract.valid, true, id);
    assert.equal(contract.explicit_approval_gate, true, id);
  }
});

test('Gmail send fails closed before network without permission or explicit approval', async () => {
  const { bus, calls } = fixture();
  const input = { to: ['person@example.com'], subject: 'Sujet', body: 'Bonjour' };

  await assert.rejects(
    () => bus.execute('gmail.messages.send', input, { owner: 'adrien', permissions: [] }),
    { code: 'PERMISSION_DENIED' },
  );
  assert.equal(calls.length, 0);

  await assert.rejects(
    () => bus.execute('gmail.messages.send', input, {
      owner: 'adrien',
      permissions: ['google.gmail.send'],
    }),
    { code: 'EXPLICIT_APPROVAL_REQUIRED' },
  );
  assert.equal(calls.length, 0);
});

test('Approved Gmail send uses only fixed Google endpoint and bounded MIME payload', async () => {
  const { bus, calls } = fixture();
  const result = await bus.execute('gmail.messages.send', {
    to: ['person@example.com'],
    cc: ['copy@example.com'],
    subject: 'Sujet sûr',
    body: 'Bonjour depuis MEL',
  }, {
    owner: 'adrien',
    permissions: ['google.gmail.send'],
    approvedCapabilities: ['gmail.messages.send'],
  });

  assert.equal(result.message_id, 'm-sent');
  const sendCall = calls.find(call => call.url === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  assert.ok(sendCall);
  assert.equal(sendCall.init.method, 'POST');
  assert.equal(calls.some(call => call.url === 'https://gmail.googleapis.com/gmail/v1/users/me/profile'), true);
  const payload = JSON.parse(sendCall.init.body);
  assert.match(payload.raw, /^[A-Za-z0-9_-]+$/);
  assert.equal(JSON.stringify(calls[0]).includes('person@example.com\r\nBcc:'), false);
});

test('Gmail header injection is rejected before any mutation request', async () => {
  const { bus, calls } = fixture();
  await assert.rejects(
    () => bus.execute('gmail.messages.send', {
      to: ['person@example.com'],
      subject: 'Sujet\r\nBcc: attacker@example.com',
      body: 'Bonjour',
    }, {
      owner: 'adrien',
      permissions: ['google.gmail.send'],
      approvedCapabilities: ['gmail.messages.send'],
    }),
    { code: 'GMAIL_SUBJECT_INVALID' },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://gmail.googleapis.com/gmail/v1/users/me/profile');
  assert.equal(calls[0].init.method || 'GET', 'GET');
});

test('Calendar create requires approval and cannot choose an arbitrary host', async () => {
  const { bus, calls } = fixture();
  const input = {
    calendar_id: 'primary',
    summary: 'RDV MEL',
    start: '2026-09-27T10:00:00+02:00',
    end: '2026-09-27T10:30:00+02:00',
    timeZone: 'Europe/Paris',
  };
  await assert.rejects(
    () => bus.execute('calendar.events.create', input, {
      owner: 'adrien',
      permissions: ['google.calendar.write'],
    }),
    { code: 'EXPLICIT_APPROVAL_REQUIRED' },
  );
  assert.equal(calls.length, 0);

  const result = await bus.execute('calendar.events.create', input, {
    owner: 'adrien',
    permissions: ['google.calendar.write'],
    approvedCapabilities: ['calendar.events.create'],
  });
  assert.equal(result.event_id, 'event-1');
  const createCall = calls.find(call => call.url === 'https://www.googleapis.com/calendar/v3/calendars/primary/events' && call.init.method === 'POST');
  assert.ok(createCall);
  assert.equal(calls.some(call => call.url === 'https://www.googleapis.com/calendar/v3/calendars/primary'), true);
});

test('Google Tasks create/delete are separately permissioned and approval gated', async () => {
  const { bus, calls } = fixture();

  const created = await bus.execute('tasks.tasks.create', {
    tasklist_id: 'list-1',
    title: 'Faire le test MEL',
  }, {
    owner: 'adrien',
    permissions: ['google.tasks.write'],
    approvedCapabilities: ['tasks.tasks.create'],
  });
  assert.equal(created.task_id, 'task-1');
  const createCall = calls.find(call => call.url === 'https://tasks.googleapis.com/tasks/v1/lists/list-1/tasks' && call.init.method === 'POST');
  assert.ok(createCall);
  assert.equal(calls.some(call => call.url === 'https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=1'), true);

  await assert.rejects(
    () => bus.execute('tasks.tasks.delete', {
      tasklist_id: 'list-1',
      task_id: 'task-1',
    }, {
      owner: 'adrien',
      permissions: ['google.tasks.write'],
      approvedCapabilities: ['tasks.tasks.delete'],
    }),
    { code: 'PERMISSION_DENIED' },
  );

  await bus.execute('tasks.tasks.delete', {
    tasklist_id: 'list-1',
    task_id: 'task-1',
  }, {
    owner: 'adrien',
    permissions: ['google.tasks.delete'],
    approvedCapabilities: ['tasks.tasks.delete'],
  });
  assert.equal(calls.at(-1).init.method, 'DELETE');
});

test('Google Workspace runtime is fail-closed without an access token', async () => {
  const { bus, calls } = fixture({ token: '' });
  await assert.rejects(
    () => bus.execute('gmail.messages.search', { query: 'is:unread' }, {
      owner: 'adrien',
      permissions: ['google.gmail.read'],
    }),
    { code: 'CAPABILITY_UNAVAILABLE' },
  );
  assert.equal(calls.length, 0);
});

test('Google Workspace refresh health turns reads healthy and approval-gated mutations protected', async () => {
  const { bus, calls } = fixture();
  const readIds = [
    'gmail.messages.search',
    'gmail.messages.read',
    'calendar.events.read',
    'tasks.tasklists.read',
    'tasks.tasks.read',
  ];
  const protectedIds = [
    'gmail.drafts.create',
    'gmail.messages.send',
    'calendar.events.create',
    'calendar.events.update',
    'calendar.events.delete',
    'tasks.tasks.create',
    'tasks.tasks.update',
    'tasks.tasks.delete',
  ];

  for (const id of readIds) assert.equal((await bus.refreshHealth(id)).health, 'HEALTHY', id);
  for (const id of protectedIds) assert.equal((await bus.refreshHealth(id)).health, 'PROTECTED', id);

  assert.equal(calls.every(call => (call.init?.method || 'GET') === 'GET'), true);
  assert.equal(calls.some(call => call.url.includes('/messages/send')), false);
});

test('Google Workspace refresh health is unavailable when no durable grant exists', async () => {
  const { bus, calls } = fixture({ token: '' });
  const row = await bus.refreshHealth('tasks.tasklists.read');
  assert.equal(row.health, 'UNAVAILABLE');
  assert.match(row.health_detail, /GOOGLE_TASKS_AUTH_REQUIRED/);
  assert.equal(calls.length, 0);
});

test('connector registry advertises Google Tasks and mutation capabilities without raw credentials', () => {
  const gmail = connectorDefinitions.find(row => row.id === 'gmail');
  const calendar = connectorDefinitions.find(row => row.id === 'google-calendar');
  const tasks = connectorDefinitions.find(row => row.id === 'google-tasks');
  assert.ok(gmail);
  assert.ok(calendar);
  assert.ok(tasks);
  assert.ok(gmail.capabilities.includes('gmail.messages.send'));
  assert.ok(calendar.capabilities.includes('calendar.events.create'));
  assert.ok(tasks.capabilities.includes('tasks.tasks.create'));
  const serialized = JSON.stringify([gmail, calendar, tasks]);
  assert.equal(serialized.includes('access-token'), false);
});


test('Calendar read stays executable through Pipedream when the native Calendar API is disabled', async () => {
  const nativeCalls = [];
  const proxyCalls = [];
  const bus = new CapabilityBus();
  registerGoogleWorkspaceCapabilities(bus, {
    env: { MELITURGOS_USER: 'adrien' },
    resolveAccessToken: async () => 'google-token',
    fetchImpl: async (url, init = {}) => {
      nativeCalls.push({ url: String(url), init });
      if (String(url).includes('www.googleapis.com/calendar/v3/')) {
        return response({ error: { code: 403, status: 'PERMISSION_DENIED' } }, 403);
      }
      return response({});
    },
    pipedreamRuntime: {
      async proxy(input) {
        proxyCalls.push(input);
        if (String(input.url).endsWith('/calendars/primary')) {
          return { provider: 'pipedream', body: { id: 'primary' } };
        }
        return {
          provider: 'pipedream',
          body: { items: [{ id: 'event-pd-1', summary: 'RDV Pipedream' }] },
        };
      },
    },
  });

  const health = await bus.refreshHealth('calendar.events.read');
  assert.equal(health.health, 'HEALTHY');

  const result = await bus.execute('calendar.events.read', { calendar_id: 'primary', limit: 1 }, {
    owner: 'adrien',
    permissions: ['google.calendar.read'],
  });
  assert.equal(result.provider, 'pipedream');
  assert.equal(result.count, 1);
  assert.equal(result.events[0].id, 'event-pd-1');
  assert.ok(nativeCalls.some(call => call.url.includes('/calendar/v3/calendars/primary/events?')));
  assert.ok(proxyCalls.some(call => call.app === 'google_calendar' && call.url.includes('/calendar/v3/calendars/primary/events?')));
});

test('Calendar mutation keeps explicit approval when execution falls back to Pipedream', async () => {
  const proxyCalls = [];
  const bus = new CapabilityBus();
  registerGoogleWorkspaceCapabilities(bus, {
    env: { MELITURGOS_USER: 'adrien' },
    resolveAccessToken: async () => 'google-token',
    fetchImpl: async (url) => {
      if (String(url).includes('www.googleapis.com/calendar/v3/')) {
        return response({ error: { code: 403 } }, 403);
      }
      return response({});
    },
    pipedreamRuntime: {
      async proxy(input) {
        proxyCalls.push(input);
        if (input.method === 'POST') return { provider: 'pipedream', body: { id: 'event-pd-create' } };
        return { provider: 'pipedream', body: { id: 'primary' } };
      },
    },
  });

  const input = {
    calendar_id: 'primary',
    summary: 'RDV fallback',
    start: '2026-10-08T10:00:00+02:00',
    end: '2026-10-08T10:30:00+02:00',
  };
  await assert.rejects(
    () => bus.execute('calendar.events.create', input, {
      owner: 'adrien',
      permissions: ['google.calendar.write'],
    }),
    { code: 'EXPLICIT_APPROVAL_REQUIRED' },
  );
  assert.equal(proxyCalls.length, 0);

  const result = await bus.execute('calendar.events.create', input, {
    owner: 'adrien',
    permissions: ['google.calendar.write'],
    approvedCapabilities: ['calendar.events.create'],
  });
  assert.equal(result.provider, 'pipedream');
  assert.equal(result.event_id, 'event-pd-create');
  assert.ok(proxyCalls.some(call => call.method === 'POST' && call.app === 'google_calendar'));
});


test('Google Tasks read stays executable through Pipedream when native Tasks access is unavailable', async () => {
  const nativeCalls = [];
  const proxyCalls = [];
  const bus = new CapabilityBus();
  registerGoogleWorkspaceCapabilities(bus, {
    env: { MELITURGOS_USER: 'adrien' },
    resolveAccessToken: async () => 'google-token',
    fetchImpl: async (url, init = {}) => {
      nativeCalls.push({ url: String(url), init });
      if (String(url).includes('tasks.googleapis.com/tasks/v1/')) {
        return response({ error: { code: 403, status: 'PERMISSION_DENIED' } }, 403);
      }
      return response({});
    },
    pipedreamRuntime: {
      async proxy(input) {
        proxyCalls.push(input);
        return {
          provider: 'pipedream',
          body: { items: [{ id: 'list-pd-1', title: 'Pipedream Tasks' }] },
        };
      },
    },
  });

  const health = await bus.refreshHealth('tasks.tasklists.read');
  assert.equal(health.health, 'HEALTHY');

  const result = await bus.execute('tasks.tasklists.read', { limit: 1 }, {
    owner: 'adrien',
    permissions: ['google.tasks.read'],
  });
  assert.equal(result.provider, 'pipedream');
  assert.equal(result.count, 1);
  assert.equal(result.tasklists[0].id, 'list-pd-1');
  assert.ok(nativeCalls.some(call => call.url.includes('/tasks/v1/users/@me/lists')));
  assert.ok(proxyCalls.some(call => call.app === 'google_tasks' && call.url.includes('/tasks/v1/users/@me/lists')));
});

test('Google Tasks mutation keeps explicit approval before Pipedream fallback can write', async () => {
  const proxyCalls = [];
  const bus = new CapabilityBus();
  registerGoogleWorkspaceCapabilities(bus, {
    env: { MELITURGOS_USER: 'adrien' },
    resolveAccessToken: async () => 'google-token',
    fetchImpl: async (url) => {
      if (String(url).includes('tasks.googleapis.com/tasks/v1/')) {
        return response({ error: { code: 403 } }, 403);
      }
      return response({});
    },
    pipedreamRuntime: {
      async proxy(input) {
        proxyCalls.push(input);
        if (input.method === 'POST') return { provider: 'pipedream', body: { id: 'task-pd-create' } };
        return { provider: 'pipedream', body: { items: [] } };
      },
    },
  });

  const input = { tasklist_id: 'list-1', title: 'Fallback Tasks' };
  await assert.rejects(
    () => bus.execute('tasks.tasks.create', input, {
      owner: 'adrien',
      permissions: ['google.tasks.write'],
    }),
    { code: 'EXPLICIT_APPROVAL_REQUIRED' },
  );
  assert.equal(proxyCalls.length, 0);

  const result = await bus.execute('tasks.tasks.create', input, {
    owner: 'adrien',
    permissions: ['google.tasks.write'],
    approvedCapabilities: ['tasks.tasks.create'],
  });
  assert.equal(result.provider, 'pipedream');
  assert.equal(result.task_id, 'task-pd-create');
  assert.ok(proxyCalls.some(call => call.app === 'google_tasks' && call.method === 'POST'));
});

test('Gmail health distinguishes upstream network and timeout failures without pretending success', async () => {
  for (const [cause, expected] of [
    [new TypeError('fetch failed'), 'GMAIL_HEALTH_FAILED_NETWORK'],
    [Object.assign(new Error('deadline reached'), { name: 'TimeoutError' }), 'GMAIL_HEALTH_FAILED_TIMEOUT'],
  ]) {
    const bus = new CapabilityBus();
    registerGoogleWorkspaceCapabilities(bus, {
      env: { MELITURGOS_USER: 'owner' },
      resolveAccessToken: async () => 'non-secret-test-token',
      fetchImpl: async () => { throw cause; },
    });
    const health = await bus.refreshHealth('gmail.messages.search');
    assert.equal(health.health, 'DEGRADED');
    assert.equal(health.health_detail, expected);
    assert.ok(!health.health_detail.includes('non-secret-test-token'));
  }
});
