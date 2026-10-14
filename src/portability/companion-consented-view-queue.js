import {authorizeDesktopCompanionSession} from './companion-desktop-authorization-gate.js';

// Deliberately read-only and explicitly non-executable by existing source-control relay.
// Future Windows client must independently enforce local STOP and expiry at claim time.
export async function queueConsentedDesktopView(env,{session,proof,deviceKey,now=Date.now()}={}) {
  if (!env?.DB) return {ok:false,code:'DESKTOP_CONSENT_DB_REQUIRED'};
  const result=await authorizeDesktopCompanionSession(env,{session,proof,deviceKey,requestedScope:'view',now});
  if (!result.ok) return result;
  const commandId=crypto.randomUUID();
  const plan={schema:'mel.companion.desktop-view-request/v1',action:'desktop.view.request',
    session_id:session.session_id,device_id:session.device_id,expires_at:session.expires_at,
    requires_local_stop:true,screen_capture_only:true};
  const write=await env.DB.prepare(`INSERT INTO computer_commands
    (id,device_id,session_id,plan_json,status,created_at)
    VALUES (?,?,?,?,?,?)`).bind(commandId,session.device_id,session.session_id,JSON.stringify(plan),'PENDING',now).run();
  if (!write || write.success===false || Number(write.meta?.changes)!==1) {
    return {ok:false,code:'DESKTOP_VIEW_QUEUE_WRITE_UNCONFIRMED'};
  }
  return {ok:true,status:'PENDING',command_id:commandId,device_id:session.device_id,expires_at:session.expires_at};
}
