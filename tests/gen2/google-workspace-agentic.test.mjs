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
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  assert.equal(calls[0].init.method, 'POST');
  const payload = JSON.parse(calls[0].init.body);
  assert.match(payload.raw, /^[A-Za-z0-9_-]+$/);
  assert.equal(JSON.stringify(calls[0]).includes('person@example.com\r\nBcc:'), false);
});

test('Gmail header injection is rejected before network', async () => {
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
  assert.equal(calls.length, 0);
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
  assert.equal(calls[0].url, 'https://www.googleapis.com/calendar/v3/calendars/primary/events');
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
  assert.equal(calls[0].url, 'https://tasks.googleapis.com/tasks/v1/lists/list-1/tasks');

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
    { code: 'GMAIL_AUTH_REQUIRED' },
  );
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
