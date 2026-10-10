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
      if (url.includes('www.googleapis.com/drive/v3/files?') && input.method === 'POST') return { body: { id: 'g-file-created', name: 'note.txt' } };
      if (url.includes('www.googleapis.com/upload/drive/v3/files/')) return { body: { id: 'g-file-created', name: 'note.txt' } };
      if (url.includes('www.googleapis.com/drive/v3/files/') && url.includes('alt=media')) return { body: { text: 'drive-content' } };
      if (url.includes('www.googleapis.com/drive/v3/files/')) return { body: { id: 'g-file-1', name: 'drive.txt', mimeType: 'text/plain' } };
      if (url.includes('www.googleapis.com/drive/v3/files?')) return { body: { files: [{ id: 'g-file-1', name: 'drive.txt' }] } };
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
    'drive.files.list',
    'drive.files.search',
    'drive.files.read',
    'drive.files.create',
    'drive.files.delete',
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


test('Google Drive linked account is executable and mutations remain approval-gated', async () => {
  const { bus, calls } = fixture();
  const list = await bus.execute('drive.files.list', { limit: 3 }, {
    owner: 'adrien',
    permissions: ['google.drive.read'],
  });
  assert.equal(list.count, 1);
  assert.equal(list.files[0].id, 'g-file-1');

  await assert.rejects(
    () => bus.execute('drive.files.create', { name: 'note.txt', content: 'bonjour' }, {
      owner: 'adrien',
      permissions: ['google.drive.write'],
    }),
    { code: 'EXPLICIT_APPROVAL_REQUIRED' },
  );

  const created = await bus.execute('drive.files.create', { name: 'note.txt', content: 'bonjour' }, {
    owner: 'adrien',
    permissions: ['google.drive.write'],
    approvedCapabilities: ['drive.files.create'],
  });
  assert.equal(created.accepted, true);
  assert.ok(calls.some(call => call.app === 'google_drive' && call.method === 'POST'));
  assert.ok(calls.some(call => call.app === 'google_drive' && call.method === 'PATCH'));
});


test('SharePoint read health uses the same bounded endpoints as list and search', async () => {
  const { bus, calls } = fixture();
  const listHealth = await bus.refreshHealth('sites.list');
  const searchHealth = await bus.refreshHealth('sites.search');
  assert.equal(listHealth.health, 'HEALTHY');
  assert.equal(searchHealth.health, 'HEALTHY');
  assert.ok(calls.some(call => call.app === 'sharepoint' && call.url.includes('/me/followedSites?$top=1')));
  assert.ok(calls.some(call => call.app === 'sharepoint' && call.url.includes('/sites?search=mel')));
  assert.equal(calls.some(call => call.url.includes('/sites/root') && (call.method || 'GET') === 'GET'), false);
});

test('SharePoint health does not probe an unsupported tenant root site', async () => {
  const { bus, calls } = fixture();
  const read = await bus.refreshHealth('sites.read');
  const write = await bus.refreshHealth('sites.write');
  assert.equal(read.health, 'HEALTHY');
  assert.equal(write.health, 'PROTECTED');
  assert.ok(calls.some(call => call.app === 'sharepoint' && call.url.includes('/sites?search=mel')));
  assert.ok(!calls.some(call => call.app === 'sharepoint' && call.url.includes('/sites/root')),
    'a nonexistent tenant root must not mark healthy SharePoint accounts unavailable');
});

test('Pipedream SharePoint health retains sanitized HTTP errors for actionable repair', async () => {
  const bus = new CapabilityBus();
  const pipedreamRuntime = {
    async proxy() {
      const err = Object.assign(new Error('PIPEDREAM_PROXY_FAILED'), {
        code: 'PIPEDREAM_PROXY_FAILED', upstream_status: 403,
        upstream_code: 'Authorization_RequestDenied',
      });
      throw err;
    },
  };
  registerPipedreamLinkedCapabilities(bus, { pipedreamRuntime });
  const health = await bus.refreshHealth('sites.search');
  assert.equal(health.health, 'UNAVAILABLE');
  assert.equal(health.health_detail, 'PIPEDREAM_PROXY_FAILED_HTTP_403_Authorization_RequestDenied');
  assert.ok(!health.health_detail.includes('Bearer '));
});

test('SharePoint search sends the documented Graph site-search query without unsupported OData options', async () => {
  const { bus, calls } = fixture();
  const result = await bus.execute('sites.search', { query: 'a b', limit: 1 }, {
    owner: 'adrien', permissions: ['microsoft.sites.read'],
  });
  assert.equal(result.count, 1);
  const search = calls.find(call => call.app === 'sharepoint' && call.url.includes('/sites?search='));
  assert.ok(search);
  const parsed = new URL(search.url);
  assert.equal(parsed.searchParams.get('search'), 'a b');
  assert.equal(parsed.searchParams.has('$top'), false);
  assert.equal(parsed.searchParams.has('$select'), false);
  await Promise.all(['sites.search', 'sites.read', 'sites.write'].map(id => bus.refreshHealth(id)));
  const healthUrls = calls.filter(call => call.app === 'sharepoint' && call.url.includes('/sites?')).map(call => call.url);
  assert.ok(healthUrls.every(url => !url.includes('$top') && !url.includes('$select')));
});

test('identical Pipedream read-only health probes are coalesced without caching success', async () => {
  const counts = [];
  const pipedreamRuntime = {
    async proxy(call) {
      counts.push(call);
      await new Promise(resolve => setTimeout(resolve, 5));
      return { body: { id: 'drive-root' } };
    },
  };
  const bus = new CapabilityBus();
  registerPipedreamLinkedCapabilities(bus, { pipedreamRuntime });
  const [list, read, search] = await Promise.all([
    bus.refreshHealth('files.list'),
    bus.refreshHealth('files.read'),
    bus.refreshHealth('files.search'),
  ]);
  assert.deepEqual([list.health,read.health,search.health], ['HEALTHY','HEALTHY','HEALTHY']);
  assert.equal(counts.filter(c => c.app === 'microsoft_onedrive' && c.url.includes('/me/drive/root?$select=id')).length, 1);
  await bus.refreshHealth('files.read');
  assert.equal(counts.filter(c => c.app === 'microsoft_onedrive').length, 2, 'completed health must not be cached');
});

test('shared Pipedream probe failures remain unavailable for every consumer and do not bypass approvals', async () => {
  let calls = 0;
  const pipedreamRuntime = {
    async proxy() {
      calls++;
      await new Promise(resolve => setTimeout(resolve, 5));
      const e = Object.assign(new Error('PIPEDREAM_PROXY_FAILED'), {
        code: 'PIPEDREAM_PROXY_FAILED', upstream_status: 403, upstream_code: 'accessDenied',
      });
      throw e;
    },
  };
  const bus = new CapabilityBus();
  registerPipedreamLinkedCapabilities(bus, { pipedreamRuntime });
  const [a, b] = await Promise.all([bus.refreshHealth('files.list'),bus.refreshHealth('files.read')]);
  assert.equal(calls,1);
  assert.equal(a.health, 'UNAVAILABLE');
  assert.equal(b.health, 'UNAVAILABLE');
  assert.equal(a.health_detail, 'PIPEDREAM_PROXY_FAILED_HTTP_403_accessDenied');
  await assert.rejects(
    () => bus.execute('files.write',{ path: 'note.txt', content: 'secret' },{
      owner:'adrien', permissions:['microsoft.files.write'],
    }),
    { code:'EXPLICIT_APPROVAL_REQUIRED' },
  );
  assert.equal(calls,1);
});
