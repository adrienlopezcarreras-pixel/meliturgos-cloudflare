import test from 'node:test';
import assert from 'node:assert/strict';
import { testPipedreamSharePointRead } from '../src/api/connection-settings-api.js';

const config = Object.freeze({
  project_id: 'project-test',
  client_id: 'client-test',
  client_secret: 'secret-test',
  environment: 'development',
});

function mockFetcher({ status = 200, account = true, value = [] } = {}) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    const target = String(url);
    calls.push({ url: target, method: init.method, environment: init.headers?.['x-pd-environment'] });
    if (target.endsWith('/v1/oauth/token')) return Response.json({ access_token: 'test-only-token' });
    if (target.includes('/accounts?')) return Response.json({
      data: account ? [{ id: 'sharepoint-account-1', app: { name_slug: 'sharepoint' }, healthy: true }] : [],
    });
    if (target.includes('/proxy/')) {
      if (status !== 200) return Response.json({ code: 'accessDenied' }, { status });
      return Response.json({ '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#sites', value });
    }
    throw new Error('UNEXPECTED_TEST_REQUEST');
  };
  return { fetcher, calls };
}

test('Pipedream SharePoint proof performs only bounded Graph site-search and returns no private site data', async () => {
  const { fetcher, calls } = mockFetcher({ value: [{ id: 's1', name: 'private-site-name' }] });
  const result = await testPipedreamSharePointRead(config, 'owner', { fetcher });
  assert.equal(result.ok, true);
  assert.equal(result.read_only, true);
  assert.equal(result.graph_site_read_proven, true);
  assert.equal(result.private_content_returned, false);
  assert.equal(result.sites_count, 1);
  assert.equal(JSON.stringify(result).includes('private-site-name'), false);
  const proxy = calls.find(row => row.url.includes('/proxy/'));
  assert.ok(proxy, 'real Graph proxy GET required');
  assert.equal(proxy.method, 'GET');
  assert.equal(proxy.environment, 'development');
  const encoded = proxy.url.split('/proxy/')[1].split('?')[0];
  assert.equal(Buffer.from(encoded, 'base64url').toString('utf8'), 'https://graph.microsoft.com/v1.0/sites?search=mel');
});

test('SharePoint Graph 403 remains an unavailable proof and explains account/scopes', async () => {
  const { fetcher } = mockFetcher({ status: 403 });
  await assert.rejects(testPipedreamSharePointRead(config, 'owner', { fetcher }), error => {
    assert.equal(error.code, 'PIPEDREAM_SHAREPOINT_GRAPH_READ_FAILED');
    assert.equal(error.upstream_status, 403);
    assert.equal(error.action_required, 'VERIFY_WORK_SCHOOL_ACCOUNT_AND_SITES_READ_ALL');
    return true;
  });
});

test('SharePoint linked app absence is not a successful Graph proof', async () => {
  const { fetcher, calls } = mockFetcher({ account: false });
  await assert.rejects(testPipedreamSharePointRead(config, 'owner', { fetcher }), {
    code: 'PIPEDREAM_SHAREPOINT_ACCOUNT_REQUIRED',
    action_required: 'CONNECT_PIPEDREAM_SHAREPOINT',
  });
  assert.equal(calls.some(x => x.url.includes('/proxy/')), false);
});

test('Graph response must contain an actual sites collection', async () => {
  const { fetcher } = mockFetcher({ value: null });
  await assert.rejects(testPipedreamSharePointRead(config, 'owner', { fetcher }), {
    code: 'PIPEDREAM_SHAREPOINT_GRAPH_RESPONSE_INVALID',
  });
});
