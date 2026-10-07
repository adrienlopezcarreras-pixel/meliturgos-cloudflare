import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPipedreamRuntime,
  listPipedreamRuntimeAccounts,
  pipedreamRuntimeAccessToken,
} from '../../src/connectors/pipedream-runtime.js';

const config = {
  project_id: 'proj_demo123',
  client_id: 'client-id',
  client_secret: 'client-secret',
  environment: 'production',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('Pipedream runtime token exchange never sends environment in OAuth body', async () => {
  const calls = [];
  const token = await pipedreamRuntimeAccessToken(config, {
    fetcher: async (url, init) => {
      calls.push({ url: String(url), init });
      return json({ access_token: 'server-token' });
    },
  });
  assert.equal(token, 'server-token');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.pipedream.com/v1/oauth/token');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.grant_type, 'client_credentials');
  assert.equal('environment' in body, false);
});

test('Pipedream account inventory retries Development after Production 401', async () => {
  const calls = [];
  const result = await listPipedreamRuntimeAccounts(config, 'adrien', {
    fetcher: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/v1/oauth/token')) return json({ access_token: 'server-token' });
      if (init.headers['x-pd-environment'] === 'production') {
        return json({ error: 'Unauthorized' }, 401);
      }
      return json({
        data: [
          { id: 'apn_calendar', healthy: true, app: { name_slug: 'google_calendar' } },
          { id: 'apn_outlook', healthy: true, app: { name_slug: 'microsoft_outlook' } },
        ],
      });
    },
  });
  assert.equal(result.environment, 'development');
  assert.equal(result.environment_fallback_used, true);
  assert.deepEqual(result.accounts.map(row => row.app), ['google_calendar', 'microsoft_outlook']);
  assert.ok(calls.some(row => row.init?.headers?.['x-pd-environment'] === 'production'));
  assert.ok(calls.some(row => row.init?.headers?.['x-pd-environment'] === 'development'));
});

test('Pipedream proxy selects the healthy linked account and forwards only through the Connect proxy', async () => {
  const calls = [];
  const runtime = createPipedreamRuntime({
    env: { MELITURGOS_USER: 'adrien' },
    configResolver: async () => ({ ...config, environment: 'development' }),
    fetcher: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/v1/oauth/token')) return json({ access_token: 'server-token' });
      if (String(url).includes('/accounts?')) {
        return json({
          data: [
            { id: 'apn_calendar', healthy: true, app: { name_slug: 'google_calendar' } },
          ],
        });
      }
      if (String(url).includes('/proxy/')) {
        return json({ items: [{ id: 'event-1' }] });
      }
      return json({}, 404);
    },
  });

  const result = await runtime.proxy({
    app: 'google_calendar',
    url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1',
  });
  assert.equal(result.provider, 'pipedream');
  assert.equal(result.app, 'google_calendar');
  assert.equal(result.account_id, 'apn_calendar');
  assert.equal(result.environment, 'development');
  assert.equal(result.body.items[0].id, 'event-1');

  const proxy = calls.find(row => row.url.includes('/proxy/'));
  assert.ok(proxy);
  assert.match(proxy.url, /external_user_id=adrien/);
  assert.match(proxy.url, /account_id=apn_calendar/);
  assert.equal(proxy.init.headers.authorization, 'Bearer server-token');
  assert.equal(proxy.init.headers['x-pd-environment'], 'development');
  assert.equal(calls.some(row => row.url.startsWith('https://www.googleapis.com/')), false);
});

test('Pipedream proxy fails closed when the requested linked account is absent', async () => {
  const runtime = createPipedreamRuntime({
    env: { MELITURGOS_USER: 'adrien' },
    configResolver: async () => ({ ...config, environment: 'development' }),
    fetcher: async (url) => {
      if (String(url).endsWith('/v1/oauth/token')) return json({ access_token: 'server-token' });
      if (String(url).includes('/accounts?')) return json({ data: [] });
      throw new Error('proxy must not be called');
    },
  });
  await assert.rejects(
    () => runtime.proxy({
      app: 'microsoft_outlook',
      url: 'https://graph.microsoft.com/v1.0/me/messages?$top=1',
    }),
    /PIPEDREAM_MICROSOFT_OUTLOOK_ACCOUNT_REQUIRED/,
  );
});
