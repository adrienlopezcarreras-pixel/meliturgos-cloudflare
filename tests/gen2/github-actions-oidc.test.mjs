import test from 'node:test';
import assert from 'node:assert/strict';

import {
  authorizeGitHubActionsOidcRequest,
  verifyGitHubActionsOidcToken,
} from '../../src/security/github-actions-oidc.js';

const ISSUER='https://token.actions.githubusercontent.com';
const REPOSITORY='adrienlopezcarreras-pixel/meliturgos-cloudflare';
const AUDIENCE='meliturgos-worker';

function b64urlBytes(bytes){
  return Buffer.from(bytes).toString('base64').replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
function b64urlJson(value){
  return b64urlBytes(Buffer.from(JSON.stringify(value),'utf8'));
}
async function signedJwt(privateKey,{workflow='github-action-relay.yml',event='schedule',aud=AUDIENCE,expOffset=300,branch='main'}={}){
  const now=Math.floor(Date.now()/1000);
  const header={alg:'RS256',typ:'JWT',kid:'test-kid'};
  const claims={
    iss:ISSUER,
    aud,
    sub:`repo:${REPOSITORY}:ref:refs/heads/${branch}`,
    repository:REPOSITORY,
    repository_owner:'adrienlopezcarreras-pixel',
    workflow_ref:`${REPOSITORY}/.github/workflows/${workflow}@refs/heads/${branch}`,
    event_name:event,
    ref:`refs/heads/${branch}`,
    sha:'a'.repeat(40),
    actor:'adrienlopezcarreras-pixel',
    run_id:'1234',
    run_number:'7',
    iat:now-5,
    nbf:now-5,
    exp:now+expOffset,
  };
  const encodedHeader=b64urlJson(header);
  const encodedClaims=b64urlJson(claims);
  const signingInput=new TextEncoder().encode(encodedHeader+'.'+encodedClaims);
  const signature=await crypto.subtle.sign(
    {name:'RSASSA-PKCS1-v1_5'},
    privateKey,
    signingInput,
  );
  return encodedHeader+'.'+encodedClaims+'.'+b64urlBytes(new Uint8Array(signature));
}

test('GitHub Actions OIDC verifier accepts only the scoped repository/workflow/event/audience token',async()=>{
  const keys=await crypto.subtle.generateKey({
    name:'RSASSA-PKCS1-v1_5',
    modulusLength:2048,
    publicExponent:new Uint8Array([1,0,1]),
    hash:'SHA-256',
  },true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);
  Object.assign(jwk,{kid:'test-kid',alg:'RS256',use:'sig'});

  const fetchImpl=async url=>{
    const target=String(url);
    if(target===ISSUER+'/.well-known/openid-configuration'){
      return Response.json({
        issuer:ISSUER,
        jwks_uri:ISSUER+'/.well-known/jwks',
      });
    }
    if(target===ISSUER+'/.well-known/jwks'){
      return Response.json({keys:[jwk]});
    }
    return new Response('not found',{status:404});
  };
  const env={MEL_GITHUB_REPOSITORY:REPOSITORY};

  const relayToken=await signedJwt(keys.privateKey,{workflow:'github-action-relay.yml',event:'schedule'});
  const verified=await verifyGitHubActionsOidcToken(relayToken,{
    env,
    fetchImpl,
    allowedWorkflows:['github-action-relay.yml'],
    allowedEvents:['schedule','workflow_dispatch'],
  });
  assert.equal(verified.ok,true);
  assert.equal(verified.repository,REPOSITORY);
  assert.equal(verified.event_name,'schedule');
  assert.equal(verified.run_id,1234);

  await assert.rejects(
    ()=>verifyGitHubActionsOidcToken(relayToken,{
      env,
      fetchImpl,
      allowedWorkflows:['gen2-42-runtime-tick.yml'],
      allowedEvents:['schedule'],
    }),
    error=>error?.code==='GITHUB_OIDC_WORKFLOW_DENIED' && error?.status===403,
  );

  const releaseBranchToken=await signedJwt(keys.privateKey,{
    workflow:'deploy-cloudflare-release.yml',
    event:'push',
    branch:'release/mel-hardware-v0.1.0',
  });
  await assert.rejects(
    ()=>verifyGitHubActionsOidcToken(releaseBranchToken,{
      env,
      fetchImpl,
      allowedWorkflows:['deploy-cloudflare-release.yml'],
      allowedEvents:['push'],
    }),
    error=>error?.code==='GITHUB_OIDC_WORKFLOW_DENIED' && error?.status===403,
  );
  const releaseVerified=await verifyGitHubActionsOidcToken(releaseBranchToken,{
    env,
    fetchImpl,
    allowedWorkflows:['deploy-cloudflare-release.yml'],
    allowedWorkflowBranches:['main','release/mel-hardware-v0.1.0'],
    allowedEvents:['push'],
  });
  assert.equal(releaseVerified.ok,true);
  assert.equal(releaseVerified.workflow_ref,`${REPOSITORY}/.github/workflows/deploy-cloudflare-release.yml@refs/heads/release/mel-hardware-v0.1.0`);

  const wrongAudience=await signedJwt(keys.privateKey,{aud:'wrong-audience'});
  await assert.rejects(
    ()=>verifyGitHubActionsOidcToken(wrongAudience,{
      env,
      fetchImpl,
      allowedWorkflows:['github-action-relay.yml'],
      allowedEvents:['schedule'],
    }),
    error=>error?.code==='GITHUB_OIDC_AUDIENCE_INVALID',
  );

  const wrongEvent=await signedJwt(keys.privateKey,{event:'pull_request'});
  await assert.rejects(
    ()=>verifyGitHubActionsOidcToken(wrongEvent,{
      env,
      fetchImpl,
      allowedWorkflows:['github-action-relay.yml'],
      allowedEvents:['schedule','workflow_dispatch'],
    }),
    error=>error?.code==='GITHUB_OIDC_EVENT_DENIED' && error?.status===403,
  );

  const expired=await signedJwt(keys.privateKey,{expOffset:-120});
  await assert.rejects(
    ()=>verifyGitHubActionsOidcToken(expired,{
      env,
      fetchImpl,
      allowedWorkflows:['github-action-relay.yml'],
      allowedEvents:['schedule'],
    }),
    error=>error?.code==='GITHUB_OIDC_EXPIRED',
  );

  const request=new Request('https://mel.test/internal',{
    headers:{'x-mel-github-oidc':relayToken},
  });
  const authorized=await authorizeGitHubActionsOidcRequest(request,env,{
    fetchImpl,
    allowedWorkflows:['github-action-relay.yml'],
    allowedEvents:['schedule'],
  });
  assert.equal(authorized.ok,true);
  assert.equal(authorized.identity.workflow_ref,`${REPOSITORY}/.github/workflows/github-action-relay.yml@refs/heads/main`);
});
