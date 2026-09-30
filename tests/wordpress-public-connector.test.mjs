import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WORDPRESS_PUBLIC_MEMORY_SCOPE,
  assertWordPressPublicContext,
  definition as wordpressDefinition,
  createConnector,
} from '../src/connectors/wordpress.js';
import { connectorDefinitions } from '../src/connectors/registry.js';

test('MEL-CONN-01 registers a public read-only WordPress connector', () => {
  assert.equal(wordpressDefinition.id, 'wordpress-verite-interdite-public');
  assert.equal(wordpressDefinition.provider, 'wordpress');
  assert.equal(wordpressDefinition.auth_type, 'NONE');
  assert.equal(wordpressDefinition.memory_scope, WORDPRESS_PUBLIC_MEMORY_SCOPE);
  assert.equal(wordpressDefinition.memory_scope, 'PUBLIC_ONLY');
  assert.deepEqual(wordpressDefinition.secret_references, []);
  assert.deepEqual(wordpressDefinition.capabilities, [
    'wordpress.public.posts.read',
    'wordpress.public.pages.read',
    'wordpress.public.search',
  ]);
  assert.ok(connectorDefinitions.some(row => row.id === wordpressDefinition.id));
  assert.equal(wordpressDefinition.capabilities.some(x => x.startsWith('memory.')), false);
});

test('WordPress public context rejects private owner/memory fields fail-closed', () => {
  for (const key of [
    'private_memory',
    'memory',
    'owner_profile',
    'owner_context',
    'saved_memories',
    'conversation_history',
    'account',
    'secrets',
    'credentials',
  ]) {
    assert.throws(
      () => assertWordPressPublicContext({ query: 'bonjour', [key]: { forbidden: true } }),
      /WORDPRESS_PRIVATE_CONTEXT_FORBIDDEN/,
      key,
    );
  }
});

test('WordPress public context only returns public bounded fields', () => {
  const result = assertWordPressPublicContext({
    locale: 'fr-FR',
    query: 'Que publie Vérité Interdite ?',
    public_context: { article_slug: 'exemple', excerpt: 'public' },
    arbitrary_public_hint: 'ignored',
  });

  assert.deepEqual(result, {
    site_origin: 'https://verite-interdite.fr',
    memory_scope: 'PUBLIC_ONLY',
    locale: 'fr-FR',
    query: 'Que publie Vérité Interdite ?',
    public_context: { article_slug: 'exemple', excerpt: 'public' },
  });
  assert.equal('arbitrary_public_hint' in result, false);
});


test('WordPress public adapter reads only the fixed public site without auth headers', async () => {
  const seen = [];
  const connector = createConnector({
    fetcher: async (url, options = {}) => {
      seen.push({ url: String(url), options });
      return Response.json([{ id: 1, slug: 'article-public' }]);
    },
  });

  const rows = await connector.execute('wordpress.public.posts.read', { page: 2, per_page: 99 });
  assert.deepEqual(rows, [{ id: 1, slug: 'article-public' }]);
  assert.equal(seen.length, 1);
  const url = new URL(seen[0].url);
  assert.equal(url.origin, 'https://verite-interdite.fr');
  assert.equal(url.pathname, '/wp-json/wp/v2/posts');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('per_page'), '20');
  const headers = seen[0].options.headers || {};
  assert.equal('authorization' in headers, false);
});

test('WordPress public adapter refuses undeclared/private capabilities', async () => {
  const connector = createConnector({
    fetcher: async () => { throw new Error('should not fetch'); },
  });
  await assert.rejects(
    () => connector.execute('memory.private.read', {}),
    /WORDPRESS_PUBLIC_CAPABILITY_NOT_ALLOWED/,
  );
  await assert.rejects(
    () => connector.execute('wordpress.admin.users.read', {}),
    /WORDPRESS_PUBLIC_CAPABILITY_NOT_ALLOWED/,
  );
});

test('WordPress public search is bounded and requires a query', async () => {
  let captured = null;
  const connector = createConnector({
    fetcher: async (url) => {
      captured = new URL(String(url));
      return Response.json([]);
    },
  });
  await assert.rejects(
    () => connector.execute('wordpress.public.search', { query: '   ' }),
    /WORDPRESS_PUBLIC_SEARCH_QUERY_REQUIRED/,
  );
  await connector.execute('wordpress.public.search', { query: 'histoire', per_page: 200 });
  assert.equal(captured.origin, 'https://verite-interdite.fr');
  assert.equal(captured.pathname, '/wp-json/wp/v2/search');
  assert.equal(captured.searchParams.get('search'), 'histoire');
  assert.equal(captured.searchParams.get('per_page'), '20');
});
