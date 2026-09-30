import { authorizeGitHubActionsOidcRequest } from '../security/github-actions-oidc.js';

async function ensureState(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS cloudflare_api_relay_state (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    last_seen_at INTEGER NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}'
  )`).run();
}

export function cloudflareApiRelay(request, env = {}) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/internal/cloudflare-api-relay/')) return null;

  return (async () => {
    const auth = await authorizeGitHubActionsOidcRequest(request, env, {
      allowedWorkflows: ['cloudflare-api-relay.yml'],
      allowedEvents: ['workflow_run', 'workflow_dispatch', 'schedule'],
    });
    if (!auth.ok) {
      return Response.json({ ok:false, code:auth.code || 'CLOUDFLARE_RELAY_AUTH_REQUIRED' }, {
        status:auth.status || 401,
        headers:{'cache-control':'no-store'},
      });
    }
    if (!env?.DB) return Response.json({ok:false,code:'CLOUDFLARE_RELAY_DB_REQUIRED'},{status:503});
    if (url.pathname !== '/api/internal/cloudflare-api-relay/heartbeat' || request.method !== 'POST') {
      return Response.json({ok:false,code:'NOT_FOUND'},{status:404});
    }

    const body = await request.json().catch(()=>({}));
    const now = Date.now();
    await ensureState(env.DB);
    await env.DB.prepare(`INSERT INTO cloudflare_api_relay_state(id,status,last_seen_at,metadata_json)
      VALUES('primary','ONLINE',?,?)
      ON CONFLICT(id) DO UPDATE SET status='ONLINE',last_seen_at=excluded.last_seen_at,metadata_json=excluded.metadata_json`)
      .bind(now, JSON.stringify({
        run_id:Number(body?.run_id || auth.identity?.run_id || 0) || null,
        repository:String(auth.identity?.repository || '').slice(0,200),
        workflow_ref:String(auth.identity?.workflow_ref || '').slice(0,300),
      })).run();

    return Response.json({
      ok:true,
      relay:'cloudflare-api',
      status:'ONLINE',
      last_seen_at:now,
    }, {headers:{'cache-control':'no-store'}});
  })();
}
