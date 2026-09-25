export const API_CURRENT_VERSION = 'v1';
export const API_SUPPORTED_VERSIONS = Object.freeze(['v1']);

const ROUTES = Object.freeze([
  { id:'api.version', canonical:'/api/v1/version', legacy:['/api/gen2/version'], methods:['GET'], meta:true },
  { id:'roadmap.read', canonical:'/api/v1/roadmap', legacy:['/api/gen2/roadmap'], methods:['GET'] },
  { id:'code.self-check', canonical:'/api/v1/code/self-check', legacy:['/api/gen2/code/self-check'], methods:['GET'] },
  { id:'capabilities.list', canonical:'/api/v1/capabilities', legacy:['/api/gen2/capabilities'], methods:['GET'] },
  { id:'capabilities.execute', canonical:'/api/v1/capabilities/execute', legacy:['/api/gen2/capabilities/execute'], methods:['POST'] },
  { id:'dashboard.summary', canonical:'/api/v1/dashboard-summary', legacy:['/api/gen2/dashboard-summary'], methods:['GET'] },
  { id:'migration.gen1-status', canonical:'/api/v1/migration/gen1-status', legacy:['/api/gen2/migration/gen1-status'], methods:['GET'] },
  { id:'migration.gen1-backfill', canonical:'/api/v1/migration/gen1-backfill', legacy:['/api/gen2/migration/gen1-backfill'], methods:['POST'] },
  { id:'migration.chatgpt-memory-status', canonical:'/api/v1/migration/chatgpt-memory-status', legacy:['/api/gen2/migration/chatgpt-memory-status'], methods:['GET'] },
  { id:'migration.chatgpt-memory-backfill', canonical:'/api/v1/migration/chatgpt-memory-backfill', legacy:['/api/gen2/migration/chatgpt-memory-backfill'], methods:['POST'] },
  { id:'web.research', canonical:'/api/v1/web/research', legacy:['/api/gen2/web/research'], methods:['GET','POST'] },
  { id:'augmentio.fanout', canonical:'/api/v1/augmentio/fanout', legacy:['/api/gen2/augmentio/fanout'], methods:['POST'] },
  { id:'rag.search', canonical:'/api/v1/rag/search', legacy:['/api/gen2/rag/search'], methods:['POST'] },
  { id:'modules.run', canonical:'/api/v1/modules/run', legacy:['/api/gen2/modules/run'], methods:['POST'] },
  { id:'sync.read', canonical:'/api/v1/sync', legacy:['/api/gen2/sync'], methods:['GET'] },
  {
    id:'conversations.rest',
    canonical:'/api/v1/conversations',
    legacy:['/api/conversations'],
    methods:['GET','POST','PATCH','DELETE'],
    prefix:true,
  },
]);

function boundedPath(value) {
  return String(value || '').slice(0, 500);
}

function methodAllowed(route, method) {
  return route.methods.includes(String(method || 'GET').toUpperCase());
}

function matchPath(base, pathname, prefix) {
  if (!prefix) return pathname === base;
  return pathname === base || pathname.startsWith(`${base}/`);
}

function substitutePrefix(pathname, from, to) {
  if (pathname === from) return to;
  return `${to}${pathname.slice(from.length)}`;
}

export function apiVersionRegistry() {
  return {
    schema: 'mel.api-version-registry',
    version: 1,
    current_version: API_CURRENT_VERSION,
    supported_versions: [...API_SUPPORTED_VERSIONS],
    compatibility_policy: 'LEGACY_ALIASES_REMAIN_FUNCTIONAL_AND_ARE_MARKED_DEPRECATED',
    routes: ROUTES.map(route => ({
      id: route.id,
      canonical: route.canonical,
      legacy: [...route.legacy],
      methods: [...route.methods],
      prefix: route.prefix === true,
      meta: route.meta === true,
    })),
  };
}

export function resolveApiVersionRequest(request) {
  const url = new URL(request.url);
  const pathname = boundedPath(url.pathname);
  const method = String(request.method || 'GET').toUpperCase();

  const unsupported = pathname.match(/^\/api\/(v\d+)(?:\/|$)/);
  if (unsupported && !API_SUPPORTED_VERSIONS.includes(unsupported[1])) {
    return {
      matched: true,
      unsupported: true,
      requested_version: unsupported[1],
      request,
      route: null,
      status: 'unsupported',
      canonical_path: null,
      legacy_path: null,
    };
  }

  for (const route of ROUTES) {
    if (matchPath(route.canonical, pathname, route.prefix)) {
      if (!methodAllowed(route, method)) continue;
      const target = route.prefix
        ? substitutePrefix(pathname, route.canonical, route.legacy[0] || route.canonical)
        : (route.legacy[0] || route.canonical);
      const rewritten = target === pathname ? request : new Request(new URL(target + url.search, url.origin), request);
      return {
        matched: true,
        unsupported: false,
        request: rewritten,
        route,
        status: 'canonical',
        canonical_path: pathname,
        legacy_path: target,
      };
    }

    for (const legacy of route.legacy) {
      if (!matchPath(legacy, pathname, route.prefix)) continue;
      if (!methodAllowed(route, method)) continue;
      const canonicalPath = route.prefix
        ? substitutePrefix(pathname, legacy, route.canonical)
        : route.canonical;
      return {
        matched: true,
        unsupported: false,
        request,
        route,
        status: 'legacy',
        canonical_path: canonicalPath,
        legacy_path: pathname,
      };
    }
  }

  return {
    matched: false,
    unsupported: false,
    request,
    route: null,
    status: 'unregistered',
    canonical_path: null,
    legacy_path: null,
  };
}

export function unsupportedApiVersionResponse(resolution) {
  return Response.json({
    ok: false,
    error: 'API_VERSION_UNSUPPORTED',
    code: 'API_VERSION_UNSUPPORTED',
    requested_version: resolution?.requested_version || null,
    current_version: API_CURRENT_VERSION,
    supported_versions: [...API_SUPPORTED_VERSIONS],
  }, {
    status: 400,
    headers: {
      'cache-control': 'no-store',
      'x-mel-api-version': API_CURRENT_VERSION,
    },
  });
}

export function apiVersionMetadataResponse() {
  return Response.json(apiVersionRegistry(), {
    headers: {
      'cache-control': 'no-store',
      'x-mel-api-version': API_CURRENT_VERSION,
      'x-mel-api-route-status': 'canonical',
    },
  });
}

export function decorateApiVersionResponse(response, resolution) {
  if (!(response instanceof Response) || !resolution?.matched || resolution.unsupported) return response;
  const headers = new Headers(response.headers);
  headers.set('x-mel-api-version', API_CURRENT_VERSION);
  headers.set('x-mel-api-route-id', resolution.route?.id || 'unknown');
  headers.set('x-mel-api-route-status', resolution.status);
  if (resolution.canonical_path) headers.set('x-mel-api-canonical-path', resolution.canonical_path);

  if (resolution.status === 'legacy') {
    headers.set('deprecation', 'true');
    if (resolution.canonical_path) {
      const previous = headers.get('link');
      const successor = `<${resolution.canonical_path}>; rel="successor-version"`;
      headers.set('link', previous ? `${previous}, ${successor}` : successor);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
