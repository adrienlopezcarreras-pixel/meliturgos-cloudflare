const encoder = new TextEncoder();

function constantTimeEqual(left, right) {
  const a = encoder.encode(String(left ?? ''));
  const b = encoder.encode(String(right ?? ''));
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return diff === 0;
}

function jsonError(code, status) {
  return Response.json(
    { error: code, code },
    {
      status,
      headers: {
        'cache-control': 'no-store, no-cache, must-revalidate',
      },
    },
  );
}

export function authorizeDevBridge(request, env = {}) {
  const secrets = [
    typeof env.MEL_DEV_BRIDGE_TOKEN === 'string' ? env.MEL_DEV_BRIDGE_TOKEN.trim() : '',
    typeof env.MEL_CLOUD_BRIDGE_TOKEN === 'string' ? env.MEL_CLOUD_BRIDGE_TOKEN.trim() : '',
  ].filter(Boolean);
  if (!secrets.length) return jsonError('BRIDGE_NOT_CONFIGURED', 503);

  const authorization = request.headers.get('authorization') || '';
  const prefix = 'Bearer ';
  const provided = authorization.startsWith(prefix) ? authorization.slice(prefix.length) : '';
  if (!provided) return jsonError('BRIDGE_AUTH_REQUIRED', 401);

  let authorized = false;
  for (const secret of secrets) {
    const matches = constantTimeEqual(provided, secret);
    authorized = matches || authorized;
  }
  if (!authorized) return jsonError('BRIDGE_AUTH_REQUIRED', 401);

  return null;
}
