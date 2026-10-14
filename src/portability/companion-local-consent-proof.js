// Server-side verification contract only; no remote-control endpoint is exposed.
// A trusted enrollment process must provision a unique per-device HMAC key.
import {evaluateDesktopSession} from './companion-desktop-session-policy.js';
const encoder=new TextEncoder();
const codeError=code=>({ok:false,code});
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{16,128}$/.test(x);
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);

export async function verifyCompanionLocalConsent({session,device,proof,deviceKey,now=Date.now(),requestedScope='view'}={}){
  const policy=evaluateDesktopSession({session,device,now,requestedScope});
  if(!policy.ok)return policy;
  if(!validId(session.session_id)||!validId(session.challenge)||!proof||
    proof.schema!=='mel.companion.local-consent-proof/v1'||
    proof.session_id!==session.session_id||proof.challenge!==session.challenge||
    proof.device_id!==device.id||proof.scope!==session.scope||
    proof.expires_at!==session.expires_at||!hex(proof.mac))return codeError('DESKTOP_CONSENT_PROOF_INVALID');
  if(!(deviceKey instanceof Uint8Array)||deviceKey.length<32)return codeError('DESKTOP_DEVICE_KEY_REQUIRED');
  const message=[proof.schema,proof.session_id,proof.challenge,proof.device_id,proof.scope,String(proof.expires_at)].join('\\n');
  const key=await crypto.subtle.importKey('raw',deviceKey,{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const mac=Uint8Array.from(proof.mac.match(/.{2}/g),b=>parseInt(b,16));
  if(!await crypto.subtle.verify('HMAC',key,mac,encoder.encode(message)))return codeError('DESKTOP_CONSENT_PROOF_INVALID');
  return {...policy,authenticated_local_proof:true};
}
