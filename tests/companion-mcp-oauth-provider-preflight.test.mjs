import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCompanionAuthorizationServerMetadata as check} from '../src/preview/companion-mcp-oauth-provider-preflight.js';
const issuer='https://issuer.example.test';
const metadata={issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',jwks_uri:issuer+'/keys',code_challenge_methods_supported:['S256'],response_types_supported:['code'],grant_types_supported:['authorization_code'],token_endpoint_auth_methods_supported:['none']};
test('accept reviewed issuer with HTTPS authorization code PKCE S256',()=>assert.equal(check(metadata,{issuer}).pkce,'S256'));
test('reject different issuer, HTTP token endpoint and missing PKCE',()=>{
 assert.throws(()=>check({...metadata,issuer:'https://other.example.test'},{issuer}),/MCP_ISSUER_MISMATCH/);
 assert.throws(()=>check({...metadata,token_endpoint:'http://issuer.example.test/token'},{issuer}),/MCP_OAUTH_ENDPOINT_INVALID/);
 assert.throws(()=>check({...metadata,token_endpoint_auth_methods_supported:['client_secret_basic']},{issuer}),/MCP_OAUTH_PUBLIC_CLIENT_REQUIRED/);
 assert.throws(()=>check({...metadata,grant_types_supported:['client_credentials']},{issuer}),/MCP_OAUTH_GRANT_REQUIRED/);
 assert.throws(()=>check({...metadata,code_challenge_methods_supported:['plain']},{issuer}),/MCP_OAUTH_PKCE_REQUIRED/);
});

test('provider rejects omitted public client support and missing grant metadata',()=>{
 assert.throws(()=>check({...metadata,token_endpoint_auth_methods_supported:undefined},{issuer}),/MCP_OAUTH_PUBLIC_CLIENT_REQUIRED/);
 assert.throws(()=>check({...metadata,grant_types_supported:undefined},{issuer}),/MCP_OAUTH_GRANT_REQUIRED/);
});

test('OAuth endpoint origin substitution is refused',()=>{
 assert.throws(()=>check({...metadata,token_endpoint:'https://attacker.example.test/token'},{issuer}),/MCP_OAUTH_ENDPOINT_ORIGIN_MISMATCH/);
 assert.throws(()=>check({...metadata,jwks_uri:'https://issuer.example.test@attacker.example.test/keys'},{issuer}),/MCP_OAUTH_ENDPOINT_ORIGIN_MISMATCH/);
});
