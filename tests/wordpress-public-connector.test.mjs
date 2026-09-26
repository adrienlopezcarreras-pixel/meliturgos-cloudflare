import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WORDPRESS_PUBLIC_MEMORY_SCOPE,
  assertWordPressPublicContext,
  definition as wordpressDefinition,
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
