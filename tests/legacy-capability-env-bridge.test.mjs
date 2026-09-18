import test from 'node:test';
import assert from 'node:assert/strict';
import { setDefaultCapabilityEnvironment, createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';

test('compatibility env inspection does not retain request bindings globally', async () => {
  const fakeFetch=async url=>{
    const path=new URL(url).pathname;
    if(path.includes('/contents/src/router.js')){
      return new Response(JSON.stringify({content:Buffer.from('export default {}').toString('base64'),encoding:'base64',sha:'sha123'}),{status:200,headers:{'content-type':'application/json'}});
    }
    return new Response(JSON.stringify({items:[]}),{status:200,headers:{'content-type':'application/json'}});
  };
  const status=setDefaultCapabilityEnvironment({
    AI:{run:async()=>({response:'ok'})},
    DB:{},
    MELITURGOS_USER:'adrien',
    MELITURGOS_PASSWORD:'must-not-be-exposed',
    MEL_GITHUB_REPOSITORY:'owner/repo',
    MEL_GITHUB_BRANCH:'candidate/test',
    MEL_GITHUB_FETCH:fakeFetch,
  });
  assert.equal(status.ai,true);
  assert.equal(status.github_branch,'candidate/test');
  assert.equal(JSON.stringify(status).includes('must-not-be-exposed'),false);

  const emptyBus=createDefaultCapabilityBus();
  const emptyBindings=await emptyBus.execute('system.bindings',{}, {owner:'adrien',permissions:[],requestId:'no-inherit'});
  assert.equal(emptyBindings.github_repository,'adrienlopezcarreras-pixel/meliturgos-cloudflare');
  assert.equal(emptyBindings.github_branch,'candidate/mel-clean-autonomy');
  assert.equal(emptyBindings.ai,false);

  const explicitBus=createDefaultCapabilityBus({env:{
    AI:{run:async()=>({response:'ok'})},
    DB:{},
    MEL_GITHUB_REPOSITORY:'owner/repo',
    MEL_GITHUB_BRANCH:'candidate/test',
    MEL_GITHUB_FETCH:fakeFetch,
  }});
  const bindings=await explicitBus.execute('system.bindings',{}, {owner:'adrien',permissions:[],requestId:'explicit'});
  assert.equal(bindings.github_repository,'owner/repo');
  assert.equal(bindings.github_branch,'candidate/test');
  assert.equal(bindings.ai,true);
});
