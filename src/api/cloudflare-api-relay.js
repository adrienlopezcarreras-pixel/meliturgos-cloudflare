import { authorizeGitHubActionsOidcRequest } from '../security/github-actions-oidc.js';

async function ensureState(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS cloudflare_api_relay_state (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    last_seen_at INTEGER NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}'
  )`).run();
}

function clean(value,max=300){
  return String(value??'').trim().slice(0,max);
}

function sanitizeWorker(row={}){
  return {
    id:clean(row.id,160),
    created_on:clean(row.created_on,80),
    modified_on:clean(row.modified_on,80),
    compatibility_date:clean(row.compatibility_date,32),
    usage_model:clean(row.usage_model,80),
    last_deployed_from:clean(row.last_deployed_from,120),
  };
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
    if (request.method !== 'POST') return Response.json({ok:false,code:'METHOD_NOT_ALLOWED'},{status:405});

    const body = await request.json().catch(()=>({}));
    const now = Date.now();
    await ensureState(env.DB);

    if (url.pathname === '/api/internal/cloudflare-api-relay/heartbeat') {
      await env.DB.prepare(`INSERT INTO cloudflare_api_relay_state(id,status,last_seen_at,metadata_json)
        VALUES('primary','ONLINE',?,?)
        ON CONFLICT(id) DO UPDATE SET status='ONLINE',last_seen_at=excluded.last_seen_at,metadata_json=excluded.metadata_json`)
        .bind(now, JSON.stringify({
          run_id:Number(body?.run_id || auth.identity?.run_id || 0) || null,
          repository:String(auth.identity?.repository || '').slice(0,200),
          workflow_ref:String(auth.identity?.workflow_ref || '').slice(0,300),
        })).run();
      return Response.json({ok:true,relay:'cloudflare-api',status:'ONLINE',last_seen_at:now},
        {headers:{'cache-control':'no-store'}});
    }

    if (url.pathname === '/api/internal/cloudflare-api-relay/workers-snapshot') {
      if (!Array.isArray(body?.workers) || body.workers.length > 100) {
        return Response.json({ok:false,code:'CLOUDFLARE_WORKERS_SNAPSHOT_INVALID'},{status:400});
      }
      const workers=body.workers.map(sanitizeWorker).filter(row=>row.id);
      const collectedAt=Number(body?.collected_at||0)||now;
      const metadata={
        workers,
        count:workers.length,
        collected_at:collectedAt,
        run_id:Number(body?.run_id || auth.identity?.run_id || 0) || null,
      };
      await env.DB.prepare(`INSERT INTO cloudflare_api_relay_state(id,status,last_seen_at,metadata_json)
        VALUES('workers-snapshot','FRESH',?,?)
        ON CONFLICT(id) DO UPDATE SET status='FRESH',last_seen_at=excluded.last_seen_at,metadata_json=excluded.metadata_json`)
        .bind(collectedAt,JSON.stringify(metadata)).run();
      return Response.json({ok:true,relay:'cloudflare-api',snapshot:'workers',count:workers.length,collected_at:collectedAt},
        {headers:{'cache-control':'no-store'}});
    }

    return Response.json({ok:false,code:'NOT_FOUND'},{status:404});
  })();
}
