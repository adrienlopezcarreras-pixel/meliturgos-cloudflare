// Pure, fail-closed OAuth JWT verifier. Issuer configuration is operator-owned.
// Requires a pinned issuer, audience, JWKS and expected scope. No network fetching.
const encoder=new TextEncoder();
function base64url(s){if(typeof s!=='string'||!/^[A-Za-z0-9_-]+$/.test(s))throw Error('JWT_ENCODING');const x=s.replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(x+'='.repeat((4-x.length%4)%4)),c=>c.charCodeAt(0));}
function jsonPart(s){return JSON.parse(new TextDecoder().decode(base64url(s)));}
export async function verifyCompanionJwt(jwt,{issuer,audience='mel-companion-mcp',jwks,now=Math.floor(Date.now()/1000)}={}){
 if(typeof jwt!=='string'||jwt.length>8192||!issuer||!Array.isArray(jwks?.keys))throw Error('OAUTH_CONFIG_INVALID');
 const parts=jwt.split('.');if(parts.length!==3)throw Error('JWT_FORMAT');
 const [h,p,signature]=parts;const header=jsonPart(h),claims=jsonPart(p);
 if(header.alg!=='RS256'||header.typ!=='JWT'||typeof header.kid!=='string')throw Error('JWT_ALGORITHM_DENIED');
 const matches=jwks.keys.filter(k=>k.kid===header.kid&&k.kty==='RSA'&&k.use==='sig'&&k.alg==='RS256');
 if(matches.length!==1)throw Error('JWT_KEY_UNAVAILABLE');
 const key=await crypto.subtle.importKey('jwk',matches[0],{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,base64url(signature),encoder.encode(h+'.'+p));
 if(!valid)throw Error('JWT_SIGNATURE_INVALID');
 if(claims.iss!==issuer||!Array.isArray(claims.aud)&&claims.aud!==audience||Array.isArray(claims.aud)&&!claims.aud.includes(audience))throw Error('JWT_ISSUER_AUDIENCE');
 if(typeof claims.sub!=='string'||!claims.sub||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+60)throw Error('JWT_CLAIMS_INVALID');
 if(claims.iat>now||claims.exp<=claims.iat||claims.exp-claims.iat>900)throw Error('JWT_LIFETIME_INVALID');
 if(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>now+60))throw Error('JWT_NOT_YET_VALID');
 const scopes=String(claims.scope||'').split(/\s+/);
 if(!scopes.includes('companion:status:read'))throw Error('JWT_SCOPE_DENIED');
 return {subject:claims.sub,audience,scope:'companion:status:read',expires_at:claims.exp};
}
