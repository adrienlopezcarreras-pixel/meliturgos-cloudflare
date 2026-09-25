export const API_CURRENT_VERSION = 'v1';
export const API_SUPPORTED_VERSIONS = Object.freeze(['v1']);

const ROUTES = Object.freeze([
  { id:'chat', handler:'index', canonical:'/api/v1/chat', legacy:['/api/chat'], methods:['POST'] },
  { id:'readiness', handler:'index', canonical:'/api/v1/readiness', legacy:['/api/gen2/readiness'], methods:['GET'] },
  { id:'council.state-of-play', handler:'index', canonical:'/api/v1/council/state-of-play', legacy:['/api/gen2/council/state-of-play'], methods:['POST'] },
  { id:'evolution.preflight', handler:'index', canonical:'/api/v1/evolution/preflight', legacy:['/api/gen2/evolution/preflight'], methods:['POST'] },
  { id:'import.chatgpt-status', handler:'index', canonical:'/api/v1/import/chatgpt-status', legacy:['/api/gen2/import/chatgpt-status'], methods:['GET'] },
  { id:'import.chatgpt-coverage', handler:'index', canonical:'/api/v1/import/chatgpt-coverage', legacy:['/api/gen2/import/chatgpt-coverage'], methods:['POST'] },
  { id:'import.chatgpt-archive', handler:'index', canonical:'/api/v1/import/chatgpt-archive', legacy:['/api/gen2/import/chatgpt-archive','/api/import/chatgpt-context'], methods:['POST'] },
  { id:'memory.status', handler:'index', canonical:'/api/v1/memory/status', legacy:['/api/memory/status'], methods:['GET'] },
  { id:'memory.consolidate', handler:'index', canonical:'/api/v1/memory/consolidate', legacy:['/api/memory/consolidate'], methods:['GET'] },
  { id:'memory.export', handler:'index', canonical:'/api/v1/memory/export', legacy:['/api/export'], methods:['GET'] },
  { id:'work.health', handler:'index', canonical:'/api/v1/work/health', legacy:['/api/work/health'], methods:['GET'] },
  { id:'work.jobs', handler:'index', canonical:'/api/v1/work/jobs', legacy:['/api/work/jobs'], methods:['GET','POST'] },
  { id:'autonomy', handler:'index', canonical:'/api/v1/autonomy', legacy:['/api/gen2/autonomy'], methods:['GET','POST','PATCH','DELETE'], prefix:true },
  { id:'api.version', handler:'router', canonical:'/api/v1/version', legacy:['/api/gen2/version'], methods:['GET'], meta:true },
  { id:'roadmap.read', handler:'router', canonical:'/api/v1/roadmap', legacy:['/api/gen2/roadmap'], methods:['GET'] },
  { id:'code.self-check', handler:'router', canonical:'/api/v1/code/self-check', legacy:['/api/gen2/code/self-check'], methods:['GET'] },
  { id:'capabilities.list', handler:'router', canonical:'/api/v1/capabilities', legacy:['/api/gen2/capabilities'], methods:['GET'] },
  { id:'capabilities.execute', handler:'router', canonical:'/api/v1/capabilities/execute', legacy:['/api/gen2/capabilities/execute'], methods:['POST'] },
  { id:'dashboard.summary', handler:'router', canonical:'/api/v1/dashboard-summary', legacy:['/api/gen2/dashboard-summary'], methods:['GET'] },
  { id:'migration.gen1-status', handler:'router', canonical:'/api/v1/migration/gen1-status', legacy:['/api/gen2/migration/gen1-status'], methods:['GET'] },
  { id:'migration.gen1-backfill', handler:'router', canonical:'/api/v1/migration/gen1-backfill', legacy:['/api/gen2/migration/gen1-backfill'], methods:['POST'] },
  { id:'migration.chatgpt-memory-status', handler:'router', canonical:'/api/v1/migration/chatgpt-memory-status', legacy:['/api/gen2/migration/chatgpt-memory-status'], methods:['GET'] },
  { id:'migration.chatgpt-memory-backfill', handler:'router', canonical:'/api/v1/migration/chatgpt-memory-backfill', legacy:['/api/gen2/migration/chatgpt-memory-backfill'], methods:['POST'] },
  { id:'web.research', handler:'router', canonical:'/api/v1/web/research', legacy:['/api/gen2/web/research'], methods:['GET','POST'] },
  { id:'augmentio.fanout', handler:'router', canonical:'/api/v1/augmentio/fanout', legacy:['/api/gen2/augmentio/fanout'], methods:['POST'] },
  { id:'rag.search', handler:'router', canonical:'/api/v1/rag/search', legacy:['/api/gen2/rag/search'], methods:['POST'] },
  { id:'modules.run', handler:'router', canonical:'/api/v1/modules/run', legacy:['/api/gen2/modules/run'], methods:['POST'] },
  { id:'sync.read', handler:'router', canonical:'/api/v1/sync', legacy:['/api/gen2/sync'], methods:['GET'] },
  {
    id:'conversations.rest',
    handler:'router',
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

export function validateApiVersionRegistry() {
  const issues = [];
  const ids = new Set();
  const canonical = new Set();
  const legacy = new Map();
  const validHandlers = new Set(['index','router']);

  for (const route of ROUTES) {
    if (!route.id || ids.has(route.id)) issues.push({ type:'DUPLICATE_OR_EMPTY_ID', id:route.id || null });
    ids.add(route.id);
    if (!validHandlers.has(route.handler)) issues.push({ type:'INVALID_HANDLER', id:route.id, handler:route.handler || null });
    if (!route.canonical || canonical.has(route.canonical)) issues.push({ type:'DUPLICATE_OR_EMPTY_CANONICAL', id:route.id, path:route.canonical || null });
    canonical.add(route.canonical);
    if (!Array.isArray(route.methods) || route.methods.length === 0) issues.push({ type:'METHODS_REQUIRED', id:route.id });
    for (const alias of route.legacy || []) {
      const previous = legacy.get(alias);
      if (previous && previous !== route.id) issues.push({ type:'DUPLICATE_LEGACY_ALIAS', ids:[previous,route.id], path:alias });
      legacy.set(alias,route.id);
      if (alias === route.canonical) issues.push({ type:'ALIAS_EQUALS_CANONICAL', id:route.id, path:alias });
    }
  }

  return { ok: issues.length === 0, issues };
}

export function apiVersionRegistry() {
  return {
    schema: 'mel.api-version-registry',
    version: 1,
    current_version: API_CURRENT_VERSION,
    supported_versions: [...API_SUPPORTED_VERSIONS],
    compatibility_policy: 'LEGACY_ALIASES_REMAIN_FUNCTIONAL_AND_ARE_MARKED_DEPRECATED',
    validation: validateApiVersionRegistry(),
    routes: ROUTES.map(route => ({
      id: route.id,
      handler: route.handler,
      canonical: route.canonical,
      legacy: [...route.legacy],
      methods: [...route.methods],
      prefix: route.prefix === true,
      meta: route.meta === true,
    })),
  };
}

export function resolveApiVersionRequest(request, { handler = null } = {}) {
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
    if (handler && route.handler !== handler) continue;
    if (matchPath(route.canonical, pathname, route.prefix)) {
      if (!methodAllowed(route, method)) {
        return {
          matched: true,
          unsupported: false,
          method_not_allowed: true,
          request,
          route,
          status: 'canonical',
          canonical_path: pathname,
          legacy_path: route.legacy[0] || null,
        };
      }
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
      if (!methodAllowed(route, method)) {
        return {
          matched: true,
          unsupported: false,
          method_not_allowed: true,
          request,
          route,
          status: 'legacy',
          canonical_path: route.prefix ? substitutePrefix(pathname, legacy, route.canonical) : route.canonical,
          legacy_path: pathname,
        };
      }
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

export function apiMethodNotAllowedResponse(resolution) {
  const allow = (resolution?.route?.methods || []).join(', ');
  const response = Response.json({
    ok:false,
    error:'API_METHOD_NOT_ALLOWED',
    code:'API_METHOD_NOT_ALLOWED',
    route_id:resolution?.route?.id || null,
    canonical_path:resolution?.canonical_path || null,
    allowed_methods:[...(resolution?.route?.methods || [])],
  }, {
    status:405,
    headers:{
      'cache-control':'no-store',
      ...(allow ? { allow } : {}),
    },
  });
  return decorateApiVersionResponse(response,resolution);
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
