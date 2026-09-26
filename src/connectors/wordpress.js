import { Connector } from './sdk.js';

export const WORDPRESS_PUBLIC_MEMORY_SCOPE = 'PUBLIC_ONLY';

export const definition = Object.freeze({
  id: 'wordpress-verite-interdite-public',
  provider: 'wordpress',
  auth_type: 'NONE',
  probe: 'https://verite-interdite.fr/wp-json/wp/v2/types',
  secret_references: [],
  capabilities: [
    'wordpress.public.posts.read',
    'wordpress.public.pages.read',
    'wordpress.public.search',
  ],
  memory_scope: WORDPRESS_PUBLIC_MEMORY_SCOPE,
  site_origin: 'https://verite-interdite.fr',
});

const PRIVATE_CONTEXT_KEYS = new Set([
  'private_memory',
  'memory',
  'owner_profile',
  'owner_context',
  'saved_memories',
  'conversation_history',
  'account',
  'secrets',
  'credentials',
]);

export function assertWordPressPublicContext(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('WORDPRESS_PUBLIC_CONTEXT_INVALID');
  }
  for (const key of Object.keys(input)) {
    if (PRIVATE_CONTEXT_KEYS.has(String(key).toLowerCase())) {
      throw new Error('WORDPRESS_PRIVATE_CONTEXT_FORBIDDEN');
    }
  }
  return Object.freeze({
    site_origin: definition.site_origin,
    memory_scope: WORDPRESS_PUBLIC_MEMORY_SCOPE,
    locale: typeof input.locale === 'string' ? input.locale.slice(0, 32) : 'fr-FR',
    query: typeof input.query === 'string' ? input.query.slice(0, 4000) : '',
    public_context: input.public_context && typeof input.public_context === 'object' && !Array.isArray(input.public_context)
      ? structuredClone(input.public_context)
      : {},
  });
}

export const createConnector = options => new Connector(definition, options);
