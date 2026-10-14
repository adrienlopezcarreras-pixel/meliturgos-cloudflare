import {consumeVerifiedDesktopConsent} from './companion-desktop-consent-replay.js';
import {selectOnlineSovereigntyCompanion} from './companion-sovereignty-command-bridge.js';

// A server-side authorization gate; intentionally does NOT enqueue desktop actions.
// The credential must come from a trusted paired-device enrollment path, never an API caller.
export async function authorizeDesktopCompanionSession(env,{
  session,proof,deviceKey,requestedScope='view',now=Date.now(),
}={}) {
  if (!session || !session.device_id) return {ok:false,code:'DESKTOP_SESSION_INVALID'};
  if (!(deviceKey instanceof Uint8Array) || deviceKey.length<32) {
    return {ok:false,code:'DESKTOP_DEVICE_KEY_REQUIRED'};
  }
  let device;
  try {
    device=await selectOnlineSovereigntyCompanion(env,{deviceId:session.device_id,now});
  } catch(e) {
    return {ok:false,code:e.code||'DESKTOP_DEVICE_UNAVAILABLE'};
  }
  return consumeVerifiedDesktopConsent(env,{
    session,device,proof,deviceKey,requestedScope,now,
  });
}
