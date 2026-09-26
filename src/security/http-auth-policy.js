import { requireAuth } from '../core/security.js';
import { authorizeDevBridge } from '../core/dev-bridge-auth.js';

const PUBLIC_GET_PREFIXES = Object.freeze(['/api/teacher/']);
const PUBLIC_GET_EXACT = Object.freeze(new Set(['/api/gen2/autonomy/control']));
const PUBLIC_POST_EXACT = Object.freeze(new Set(['/api/public/wordpress/chat']));
const PUBLIC_OPTIONS_EXACT = Object.freeze(new Set(['/api/public/wordpress/chat']));
const DELEGATED_PREFIXES = Object.freeze([
  '/api/device/v1/',
  '/api/computer/v1/',
  '/api/android/v1/',
]);
const DELEGATED_EXACT = Object.freeze(new Set([
  '/api/internal/release-launch-bootstrap',
]));

function methodOf(request) {
  return String(request?.method || 'GET').toUpperCase();
}

/**
 * Canonical HTTP authentication policy for the deployed Worker.
 *
 * Every /api route is owner-authenticated by default. The only exceptions are
 * explicit public read-only surfaces and protocols that enforce a stronger,
 * purpose-specific credential in their own handler (device/computer tokens and
 * the ephemeral release bootstrap secret). Dev Bridge uses its dedicated bearer
 * token here as defense in depth even though the outer Professor entrypoint also
 * gates it.
 */
export function classifyHttpAuthSurface(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = methodOf(request);

  if (!path.startsWith('/api/')) return Object.freeze({ kind: 'NON_API', path, method });

  if (
    (method === 'GET' && (PUBLIC_GET_EXACT.has(path) || PUBLIC_GET_PREFIXES.some(prefix => path.startsWith(prefix))))
    || (method === 'POST' && PUBLIC_POST_EXACT.has(path))
    || (method === 'OPTIONS' && PUBLIC_OPTIONS_EXACT.has(path))
  ) {
    return Object.freeze({ kind: 'PUBLIC_SANITIZED', path, method });
  }

  if (path.startsWith('/api/dev-bridge/')) {
    return Object.freeze({ kind: 'DEV_BRIDGE_TOKEN', path, method });
  }

  if (
    DELEGATED_EXACT.has(path)
    || DELEGATED_PREFIXES.some(prefix => path.startsWith(prefix))
  ) {
    return Object.freeze({ kind: 'DELEGATED_STRONG_AUTH', path, method });
  }

  return Object.freeze({ kind: 'OWNER_AUTH', path, method });
}

export function enforceHttpAuthPolicy(request, env) {
  const policy = classifyHttpAuthSurface(request);

  if (policy.kind === 'OWNER_AUTH') {
    const auth = requireAuth(request, env);
    return auth.ok ? null : auth.response;
  }

  if (policy.kind === 'DEV_BRIDGE_TOKEN') {
    return authorizeDevBridge(request, env);
  }

  return null;
}

export const HTTP_AUTH_POLICY = Object.freeze({
  public_get_prefixes: PUBLIC_GET_PREFIXES,
  public_get_exact: Object.freeze([...PUBLIC_GET_EXACT]),
  public_post_exact: Object.freeze([...PUBLIC_POST_EXACT]),
  public_options_exact: Object.freeze([...PUBLIC_OPTIONS_EXACT]),
  delegated_prefixes: DELEGATED_PREFIXES,
  delegated_exact: Object.freeze([...DELEGATED_EXACT]),
  default_api_policy: 'OWNER_AUTH',
});
