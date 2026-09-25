import test from 'node:test';
import assert from 'node:assert/strict';

import { createOAuth2 } from '../../src/connectors/oauth.js';

class TransactionVault {
  constructor() { this.rows = new Map(); }
  key(owner, connectorId, state) { return owner + '::' + connectorId + '::' + state; }
  async put({ owner, connector_id, state, record }) {
    this.rows.set(this.key(owner, connector_id, state), structuredClone(record));
  }
  async take({ owner, connector_id, state }) {
    const key = this.key(owner, connector_id, state);
    const row = this.rows.get(key);
    if (!row) return null;
    this.rows.delete(key);
    return structuredClone(row);
  }
}

class TokenVault {
  constructor() { this.rows = new Map(); }
  key(owner, connectorId) { return owner + '::' + connectorId; }
  async put({ owner, connector_id, token_set }) {
    this.rows.set(this.key(owner, connector_id), structuredClone(token_set));
  }
  async get({ owner, connector_id }) {
    const row = this.rows.get(this.key(owner, connector_id));
    return row ? structuredClone(row) : null;
  }
  async delete({ owner, connector_id }) {
    return this.rows.delete(this.key(owner, connector_id));
  }
}

const manifest = {
  id: 'github',
  name: 'GitHub',
  version: '1.0.0',
  auth: 'oauth2',
  capabilities: ['repo.read', 'repo.write'],
  scopes: {
    required: ['repo:read'],
    optional: ['repo:write', 'user:email'],
  },
};

const provider = {
  connector_id: 'github',
  auth: 'oauth2',
  client_id: 'public-client-id',
  authorization_endpoint: 'https://github.example/oauth/authorize',
  redirect_uri: 'https://mel.example/oauth/github/callback',
  extra_authorization_params: {
    prompt: 'consent',
  },
};

function fixture({
  now = (() => { let t = 1_000_000; return () => t; })(),
  exchange = null,
  refresh = null,
  revoke = null,
  onAuthorized = null,
  onRevoked = null,
} = {}) {
  const transactions = new TransactionVault();
  const tokens = new TokenVault();
  const calls = [];
  const tokenClient = {
    async exchange(input) {
      calls.push(['exchange', structuredClone(input)]);
      return exchange ? exchange(input) : {
        access_token: 'access-secret',
        refresh_token: 'refresh-secret',
        token_type: 'Bearer',
        scope: 'repo:read repo:write',
        expires_in: 3600,
      };
    },
    async refresh(input) {
      calls.push(['refresh', structuredClone(input)]);
      return refresh ? refresh(input) : {
        access_token: 'access-secret-2',
        token_type: 'Bearer',
        scope: 'repo:read repo:write',
        expires_in: 7200,
      };
    },
    async revoke(input) {
      calls.push(['revoke', structuredClone(input)]);
      return revoke ? revoke(input) : { ok: true };
    },
  };

  const options = {
    resolveProvider: async id => {
      assert.equal(id, 'github');
      return structuredClone(provider);
    },
    resolveManifest: async id => {
      assert.equal(id, 'github');
      return structuredClone(manifest);
    },
    transactionVault: transactions,
    tokenVault: tokens,
    tokenClient,
    onAuthorized,
    onRevoked,
    now,
  };

  return { options, transactions, tokens, tokenClient, calls };
}

test('OAuth2 begin emits fixed-provider authorization URL with state and S256 PKCE', async () => {
  const f = fixture();
  const oauth = createOAuth2(f.options);
  const result = await oauth.begin({
    connector_id: 'github',
    optional_scopes: ['repo:write'],
    authorization_endpoint: 'https://attacker.example/override',
  }, { owner: 'adrien' });

  const url = new URL(result.authorization_url);
  assert.equal(url.origin, 'https://github.example');
  assert.equal(url.pathname, '/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), 'public-client-id');
  assert.equal(url.searchParams.get('redirect_uri'), provider.redirect_uri);
  assert.equal(url.searchParams.get('scope'), 'repo:read repo:write');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.match(url.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{40,}$/);
  assert.match(url.searchParams.get('state'), /^[A-Za-z0-9_-]{32,}$/);
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(result.pkce_method, 'S256');

  const rows = [...f.transactions.rows.values()];
  assert.equal(rows.length, 1);
  assert.match(rows[0].code_verifier, /^[A-Za-z0-9_-]{60,}$/);
  assert.notEqual(rows[0].code_verifier, url.searchParams.get('code_challenge'));
});

test('OAuth2 begin rejects undeclared optional scopes before transaction creation', async () => {
  const f = fixture();
  const oauth = createOAuth2(f.options);

  await assert.rejects(
    () => oauth.begin({
      connector_id: 'github',
      optional_scopes: ['admin:org'],
    }, { owner: 'adrien' }),
    { code: 'OAUTH_SCOPE_UNDECLARED', status: 403 },
  );
  assert.equal(f.transactions.rows.size, 0);
});

test('OAuth2 callback survives runtime restart, stores tokens only in token vault and returns safe status', async () => {
  let now = 1_000_000;
  const f = fixture({ now: () => now });
  const first = createOAuth2(f.options);
  const begun = await first.begin({
    connector_id: 'github',
    optional_scopes: ['repo:write'],
  }, { owner: 'adrien' });
  const state = new URL(begun.authorization_url).searchParams.get('state');

  // New runtime instance shares only the injected secure vaults/provider adapters.
  const restarted = createOAuth2(f.options);
  now += 2_000;
  const result = await restarted.callback({
    connector_id: 'github',
    state,
    code: 'authorization-code',
  }, { owner: 'adrien' });

  assert.deepEqual(result, {
    connector_id: 'github',
    authorized: true,
    token_type: 'Bearer',
    scopes: ['repo:read', 'repo:write'],
    expires_at: now + 3_600_000,
    refreshable: true,
  });
  assert.equal(JSON.stringify(result).includes('access-secret'), false);
  assert.equal(JSON.stringify(result).includes('refresh-secret'), false);

  const stored = await f.tokens.get({ owner: 'adrien', connector_id: 'github' });
  assert.equal(stored.access_token, 'access-secret');
  assert.equal(stored.refresh_token, 'refresh-secret');
  assert.equal(f.transactions.rows.size, 0);

  const exchangeCall = f.calls.find(([kind]) => kind === 'exchange')[1];
  assert.equal(exchangeCall.code, 'authorization-code');
  assert.ok(exchangeCall.code_verifier);
  assert.equal(exchangeCall.redirect_uri, provider.redirect_uri);
});

test('OAuth2 state is one-time and cannot be replayed after callback', async () => {
  const f = fixture();
  const oauth = createOAuth2(f.options);
  const begun = await oauth.begin({ connector_id: 'github' }, { owner: 'adrien' });
  const state = new URL(begun.authorization_url).searchParams.get('state');

  await oauth.callback({
    connector_id: 'github',
    state,
    code: 'code-1',
  }, { owner: 'adrien' });

  await assert.rejects(
    () => oauth.callback({
      connector_id: 'github',
      state,
      code: 'code-2',
    }, { owner: 'adrien' }),
    { code: 'OAUTH_STATE_INVALID_OR_REPLAYED', status: 409 },
  );
});

test('OAuth2 state is owner scoped', async () => {
  const f = fixture();
  const oauth = createOAuth2(f.options);
  const begun = await oauth.begin({ connector_id: 'github' }, { owner: 'adrien' });
  const state = new URL(begun.authorization_url).searchParams.get('state');

  await assert.rejects(
    () => oauth.callback({
      connector_id: 'github',
      state,
      code: 'stolen-code',
    }, { owner: 'other' }),
    { code: 'OAUTH_STATE_INVALID_OR_REPLAYED', status: 409 },
  );

  // Wrong owner cannot consume Adrien's transaction.
  assert.equal(f.transactions.rows.size, 1);
});

test('OAuth2 expired transaction fails closed after atomic consumption', async () => {
  let now = 1_000_000;
  const f = fixture({ now: () => now });
  const oauth = createOAuth2({
    ...f.options,
    transactionTtlMs: 60_000,
  });
  const begun = await oauth.begin({ connector_id: 'github' }, { owner: 'adrien' });
  const state = new URL(begun.authorization_url).searchParams.get('state');

  now += 60_001;
  await assert.rejects(
    () => oauth.callback({
      connector_id: 'github',
      state,
      code: 'late-code',
    }, { owner: 'adrien' }),
    { code: 'OAUTH_TRANSACTION_EXPIRED', status: 409 },
  );
  assert.equal(f.transactions.rows.size, 0);
  assert.equal(f.calls.some(([kind]) => kind === 'exchange'), false);
});

test('OAuth2 rejects provider-returned undeclared scopes and never stores token', async () => {
  const f = fixture({
    exchange: async () => ({
      access_token: 'access-secret',
      refresh_token: 'refresh-secret',
      scope: 'repo:read admin:org',
    }),
  });
  const oauth = createOAuth2(f.options);
  const begun = await oauth.begin({ connector_id: 'github' }, { owner: 'adrien' });
  const state = new URL(begun.authorization_url).searchParams.get('state');

  await assert.rejects(
    () => oauth.callback({
      connector_id: 'github',
      state,
      code: 'code',
    }, { owner: 'adrien' }),
    { code: 'OAUTH_RETURNED_SCOPE_UNDECLARED', status: 409 },
  );
  assert.equal(await f.tokens.get({ owner: 'adrien', connector_id: 'github' }), null);
});

test('OAuth2 requires every manifest required scope to be granted', async () => {
  const f = fixture({
    exchange: async () => ({
      access_token: 'access-secret',
      scope: 'repo:write',
    }),
  });
  const oauth = createOAuth2(f.options);
  const begun = await oauth.begin({
    connector_id: 'github',
    optional_scopes: ['repo:write'],
  }, { owner: 'adrien' });
  const state = new URL(begun.authorization_url).searchParams.get('state');

  await assert.rejects(
    () => oauth.callback({
      connector_id: 'github',
      state,
      code: 'code',
    }, { owner: 'adrien' }),
    { code: 'OAUTH_REQUIRED_SCOPE_NOT_GRANTED', status: 409 },
  );
});

test('OAuth2 refresh uses vault refresh token and never returns raw token material', async () => {
  let now = 5_000_000;
  const f = fixture({ now: () => now });
  await f.tokens.put({
    owner: 'adrien',
    connector_id: 'github',
    token_set: {
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      token_type: 'Bearer',
      scopes: ['repo:read', 'repo:write'],
      expires_at: now - 1,
    },
  });

  const oauth = createOAuth2(f.options);
  now += 100;
  const status = await oauth.refresh({ connector_id: 'github' }, { owner: 'adrien' });

  assert.equal(status.authorized, true);
  assert.equal(status.refreshable, true);
  assert.equal(JSON.stringify(status).includes('access-secret-2'), false);
  assert.equal(JSON.stringify(status).includes('old-refresh'), false);

  const stored = await f.tokens.get({ owner: 'adrien', connector_id: 'github' });
  assert.equal(stored.access_token, 'access-secret-2');
  assert.equal(stored.refresh_token, 'old-refresh');
  assert.equal(stored.expires_at, now + 7_200_000);

  const refreshCall = f.calls.find(([kind]) => kind === 'refresh')[1];
  assert.equal(refreshCall.refresh_token, 'old-refresh');
});

test('OAuth2 revoke confirms provider revoke before deleting token and is idempotent when absent', async () => {
  const revoked = [];
  const f = fixture({
    onRevoked: async input => revoked.push(structuredClone(input)),
  });
  await f.tokens.put({
    owner: 'adrien',
    connector_id: 'github',
    token_set: {
      access_token: 'access-secret',
      refresh_token: 'refresh-secret',
      token_type: 'Bearer',
      scopes: ['repo:read'],
      expires_at: null,
    },
  });

  const oauth = createOAuth2(f.options);
  const first = await oauth.revoke({ connector_id: 'github' }, { owner: 'adrien' });
  assert.deepEqual(first, {
    connector_id: 'github',
    revoked: true,
    already_absent: false,
  });
  assert.equal(await f.tokens.get({ owner: 'adrien', connector_id: 'github' }), null);
  assert.equal(revoked.length, 1);

  const second = await oauth.revoke({ connector_id: 'github' }, { owner: 'adrien' });
  assert.deepEqual(second, {
    connector_id: 'github',
    revoked: true,
    already_absent: true,
  });
  assert.equal(revoked.length, 1);
});

test('OAuth2 failed provider revoke keeps token in vault', async () => {
  const f = fixture({
    revoke: async () => ({ ok: false }),
  });
  await f.tokens.put({
    owner: 'adrien',
    connector_id: 'github',
    token_set: {
      access_token: 'access-secret',
      refresh_token: 'refresh-secret',
      token_type: 'Bearer',
      scopes: ['repo:read'],
      expires_at: null,
    },
  });
  const oauth = createOAuth2(f.options);

  await assert.rejects(
    () => oauth.revoke({ connector_id: 'github' }, { owner: 'adrien' }),
    { code: 'OAUTH_REVOKE_NOT_CONFIRMED', status: 502 },
  );
  assert.equal(
    (await f.tokens.get({ owner: 'adrien', connector_id: 'github' })).access_token,
    'access-secret',
  );
});

test('OAuth2 authorization hook receives only safe connector metadata', async () => {
  const seen = [];
  const f = fixture({
    onAuthorized: async input => seen.push(structuredClone(input)),
  });
  const oauth = createOAuth2(f.options);
  const begun = await oauth.begin({
    connector_id: 'github',
    optional_scopes: ['repo:write'],
  }, { owner: 'adrien' });
  const state = new URL(begun.authorization_url).searchParams.get('state');

  await oauth.callback({
    connector_id: 'github',
    state,
    code: 'code',
  }, { owner: 'adrien' });

  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].granted_scopes, ['repo:read', 'repo:write']);
  assert.equal(seen[0].connector_version, '1.0.0');
  const serialized = JSON.stringify(seen[0]);
  assert.equal(serialized.includes('access-secret'), false);
  assert.equal(serialized.includes('refresh-secret'), false);
  assert.equal(serialized.includes('code_verifier'), false);
});
