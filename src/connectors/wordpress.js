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


function boundedInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function publicEndpoint(capability, input = {}) {
  const base = new URL(definition.site_origin);
  if (capability === 'wordpress.public.posts.read') {
    const url = new URL('/wp-json/wp/v2/posts', base);
    url.searchParams.set('page', String(boundedInt(input.page, 1, 1, 1000)));
    url.searchParams.set('per_page', String(boundedInt(input.per_page, 10, 1, 20)));
    url.searchParams.set('_fields', 'id,date,modified,slug,link,title,excerpt,content');
    return url;
  }
  if (capability === 'wordpress.public.pages.read') {
    const url = new URL('/wp-json/wp/v2/pages', base);
    url.searchParams.set('page', String(boundedInt(input.page, 1, 1, 1000)));
    url.searchParams.set('per_page', String(boundedInt(input.per_page, 10, 1, 20)));
    url.searchParams.set('_fields', 'id,date,modified,slug,link,title,excerpt,content');
    return url;
  }
  if (capability === 'wordpress.public.search') {
    const query = typeof input.query === 'string' ? input.query.trim().slice(0, 300) : '';
    if (!query) throw new Error('WORDPRESS_PUBLIC_SEARCH_QUERY_REQUIRED');
    const url = new URL('/wp-json/wp/v2/search', base);
    url.searchParams.set('search', query);
    url.searchParams.set('per_page', String(boundedInt(input.per_page, 10, 1, 20)));
    return url;
  }
  throw new Error('WORDPRESS_PUBLIC_CAPABILITY_NOT_ALLOWED');
}

export class WordPressPublicConnector extends Connector {
  async execute(capability, input = {}) {
    if (!definition.capabilities.includes(String(capability || ''))) {
      throw new Error('WORDPRESS_PUBLIC_CAPABILITY_NOT_ALLOWED');
    }
    assertWordPressPublicContext({
      query: capability === 'wordpress.public.search' ? input.query : '',
      locale: input.locale,
      public_context: input.public_context,
    });
    const url = publicEndpoint(capability, input);
    const response = await this.fetcher(url, {
      method: 'GET',
      redirect: 'error',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const error = new Error(`WORDPRESS_PUBLIC_HTTP_${response.status}`);
      error.code = 'WORDPRESS_PUBLIC_HTTP_ERROR';
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error('WORDPRESS_PUBLIC_RESPONSE_INVALID');
    return structuredClone(payload.slice(0, 20));
  }
}

export const createConnector = options => new WordPressPublicConnector(definition, options);
