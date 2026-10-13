import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyCompanionJwt} from '../src/devices/companion-mcp-oauth-jwt.js';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk=publicKey.export({format:'jwk'});Object.assign(jwk,{kid:'unit-test',use:'sig',alg:'RS256'});
const settings={issuer:'https://issuer.example.test',jwks:{keys:[jwk]},now:1770000000};
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const make=(claims={},header={})=>{
 const h=b64({alg:'RS256',typ:'JWT',kid:'unit-test',...header});
 const p=b64({iss:settings.issuer,aud:'mel-companion-mcp',sub:'owner1',iat:1769999900,exp:1770000300,scope:'companion:status:read',...claims});
 const sig=sign('RSA-SHA256',Buffer.from(h+'.'+p),privateKey).toString('base64url');
 return h+'.'+p+'.'+sig;
};
test('valid signed dedicated-scope JWT accepted',async()=>{
 const p=await verifyCompanionJwt(make(),settings);assert.equal(p.subject,'owner1');
});
test('wrong signature is denied',async()=>{
 const token=make();await assert.rejects(verifyCompanionJwt(token.slice(0,-4)+'AAAA',settings),/JWT_SIGNATURE_INVALID/);
});
test('wrong audience is denied',async()=>{
 await assert.rejects(verifyCompanionJwt(make({aud:'other'}),settings),/JWT_ISSUER_AUDIENCE/);
});
test('expired or missing scope denied',async()=>{
 await assert.rejects(verifyCompanionJwt(make({exp:1769999999}),settings),/JWT_CLAIMS_INVALID/);
 await assert.rejects(verifyCompanionJwt(make({scope:'other:read'}),settings),/JWT_SCOPE_DENIED/);
});
test('HS256 and unknown key are denied',async()=>{
 await assert.rejects(verifyCompanionJwt(make({}, {alg:'HS256'}),settings),/JWT_ALGORITHM_DENIED/);
 await assert.rejects(verifyCompanionJwt(make({}, {kid:'untrusted'}),settings),/JWT_KEY_UNAVAILABLE/);
});
