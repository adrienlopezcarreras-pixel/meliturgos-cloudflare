import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import { registerPipedreamLinkedCapabilities } from '../../src/capabilities/pipedream-linked-capabilities.js';

function fixture() {
  const calls = [];
  const pipedreamRuntime = {
    async proxy(input) {
      calls.push(input);
      const url = String(input.url || '');
      if (url.includes('/sendMail')) return { body: {} };
      if (url.includes('/move')) return { body: { id: 'moved-1' } };
      if (url.includes('/me/messages/')) return { body: { id: 'msg-1', subject: 'Sujet' } };
      if (url.includes('/me/messages?')) return { body: { value: [{ id: 'msg-1', subject: 'Sujet' }] } };
      if (url.includes('/me/drive/items/') && url.endsWith('/content')) return { body: { text: 'contenu' } };
      if (url.includes('/me/drive/items/')) return { body: { id: 'file-1', name: 'doc.txt', file: {} } };
      if (url.includes('/me/drive/root/children') || url.includes('/search(')) {
        return { body: { value: [{ id: 'file-1', name: 'doc.txt' }] } };
      }
      if (url.includes('/me/drive/root')) return { body: { id: 'root' } };
      if (url.includes('/me/followedSites')) return { body: { value: [{ id: 'site-1', name: 'Site' }] } };
      if (url.includes('/sites?')) return { body: { value: [{ id: 'site-1', name: 'Site' }] } };
      if (url.includes('/sites/root')) return { body: { id: 'root-site', name: 'Root' } };
      if (url.includes('/sites/')) return { body: { id: 'site-1', name: 'Site' } };
      return { body: {} };
    },
  };
  const bus = new CapabilityBus();
  const ids = registerPipedreamLinkedCapabilities(bus, { pipedreamRuntime });
  return { bus, calls, ids };
}

test('Pipedream linked runtime registers Outlook OneDrive and SharePoint execution capabilities', () => {
  const { bus, ids } = fixture();
  assert.deepEqual(ids, [
    'mail.messages.search',
    'mail.messages.read',
    'mail.messages.send',
    'mail.messages.move',
    'files.list',
    'files.search',
    'files.read',
    'files.write',
    'files.delete',
    'sites.list',
    'sites.search',
    'sites.read',
    'sites.write',
  ]);
  for (const id of ids) assert.equal(bus.contract(id).valid, true, id);
  for (const id of ['mail.messages.send','mail.messages.move','files.write','files.delete','sites.write']) {
    assert.equal(bus.contract(id).explicit_approval_gate, true, id);
  }
});

test('Outlook read is executable through the linked Pipedream account', async () => {
  const { bus, calls } = fixture();
  const result = await bus.execute('mail.messages.search', { query: 'facture', limit: 5 }, {
    owner: 'adrien',
    permissions: ['microsoft.mail.read'],
  });
  assert.equal(result.provider, 'pipedream');
  assert.equal(result.count, 1);
  assert.equal(result.messages[0].id, 'msg-1');
  assert.ok(calls.some(call => call.app === 'microsoft_outlook' && call.url.includes('/me/messages?')));
});

test('Outlook send is denied before Pipedream without explicit approval', async () => {
  const { bus, calls } = fixture();
  const input = { to: ['person@example.com'], subject: 'Sujet', body: 'Bonjour' };
  await assert.rejects(
    () => bus.execute('mail.messages.send', input, {
      owner: 'adrien',
      permissions: ['microsoft.mail.send'],
    }),
    { code: 'EXPLICIT_APPROVAL_REQUIRED' },
  );
  assert.equal(calls.length, 0);

  const result = await bus.execute('mail.messages.send', input, {
    owner: 'adrien',
    permissions: ['microsoft.mail.send'],
    approvedCapabilities: ['mail.messages.send'],
  });
  assert.equal(result.accepted, true);
  const send = calls.find(call => call.url.includes('/me/sendMail'));
  assert.ok(send);
  assert.equal(send.method, 'POST');
  assert.equal(send.body.message.subject, 'Sujet');
});

test('OneDrive read works and write stays approval-gated', async () => {
  const { bus, calls } = fixture();
  const list = await bus.execute('files.list', { limit: 2 }, {
    owner: 'adrien',
    permissions: ['microsoft.files.read'],
  });
  assert.equal(list.count, 1);
  assert.equal(list.files[0].id, 'file-1');

  await assert.rejects(
    () => bus.execute('files.write', { path: 'MEL/note.txt', content: 'ok' }, {
      owner: 'adrien',
      permissions: ['microsoft.files.write'],
    }),
    { code: 'EXPLICIT_APPROVAL_REQUIRED' },
  );

  await bus.execute('files.write', { path: 'MEL/note.txt', content: 'ok' }, {
    owner: 'adrien',
    permissions: ['microsoft.files.write'],
    approvedCapabilities: ['files.write'],
  });
  assert.ok(calls.some(call => call.app === 'microsoft_onedrive' && call.method === 'PUT'));
});

test('SharePoint search is real and SharePoint writes require approval', async () => {
  const { bus, calls } = fixture();
  const result = await bus.execute('sites.search', { query: 'MEL', limit: 5 }, {
    owner: 'adrien',
    permissions: ['microsoft.sites.read'],
  });
  assert.equal(result.count, 1);
  assert.equal(result.sites[0].id, 'site-1');

  await assert.rejects(
    () => bus.execute('sites.write', { site_id: 'site-1', path: 'Notes/a.txt', content: 'A' }, {
      owner: 'adrien',
      permissions: ['microsoft.sites.write'],
    }),
    { code: 'EXPLICIT_APPROVAL_REQUIRED' },
  );
  assert.equal(calls.some(call => call.method === 'PUT'), false);
});

test('Linked capabilities become unavailable rather than fake-healthy when Pipedream is absent', async () => {
  const bus = new CapabilityBus();
  registerPipedreamLinkedCapabilities(bus, { pipedreamRuntime: null });
  const row = await bus.refreshHealth('mail.messages.search');
  assert.equal(row.health, 'UNAVAILABLE');
  assert.equal(row.health_detail, 'PIPEDREAM_RUNTIME_UNAVAILABLE');
});
