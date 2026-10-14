import {verifyCompanionLocalConsent} from './companion-local-consent-proof.js';
// Fail-closed, persistent replay guard for verified desktop-consent challenges.
// Call only after verifyCompanionLocalConsent succeeds; DB transaction/uniqueness ensures single use.
export async function consumeVerifiedDesktopConsent(env,{session,device,proof,deviceKey,requestedScope='view',now=Date.now()}={}) {
  const verified=await verifyCompanionLocalConsent({session,device,proof,deviceKey,requestedScope,now});
  if (!verified.ok) return verified;
  if (!env?.DB) return {ok:false,code:'DESKTOP_CONSENT_DB_REQUIRED'};
  if (!session || !proof || session.session_id!==proof.session_id || session.challenge!==proof.challenge) {
    return {ok:false,code:'DESKTOP_CONSENT_PROOF_INVALID'};
  }
  if (!Number.isFinite(Number(session.expires_at)) || Number(session.expires_at)<=now) {
    return {ok:false,code:'DESKTOP_SESSION_EXPIRED_OR_UNBOUNDED'};
  }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS companion_desktop_consent_uses (
    session_id TEXT NOT NULL,challenge TEXT NOT NULL,device_id TEXT NOT NULL,used_at INTEGER NOT NULL,
    PRIMARY KEY(session_id,challenge)
  )`).run();
  const result=await env.DB.prepare(`INSERT OR IGNORE INTO companion_desktop_consent_uses
    (session_id,challenge,device_id,used_at) VALUES (?,?,?,?)`)
    .bind(session.session_id,session.challenge,session.device_id,now).run();
  if (Number(result?.meta?.changes)!==1) return {ok:false,code:'DESKTOP_CONSENT_REPLAY_OR_UNCONFIRMED'};
  return {ok:true,session_id:session.session_id,consumed_at:now};
}
