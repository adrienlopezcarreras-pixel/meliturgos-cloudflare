import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createImages,
  createImageAdapters,
  createImageVisionRuntime,
} from '../../src/media/images.js';

const encoder = new TextEncoder();

function freeVisionProvider({
  id='free-vision',
  priority=10,
  failAnalyze=false,
  failProcess=false,
}={}) {
  return {
    capability: {
      id,
      actions:['ANALYZE','PROCESS'],
      paid:false,
      enabled:true,
      priority,
      model:'vision-free-v1',
    },
    async analyze(input) {
      if (failAnalyze) throw new Error('VISION_DOWN');
      return {
        model:'vision-free-v1',
        analysis:{
          description:'A blue square on a white background.',
          labels:['square','blue'],
          input_has_bytes:input.bytes instanceof Uint8Array,
        },
      };
    },
    async process(input) {
      if (failProcess) throw new Error('PROCESS_DOWN');
      return {
        model:'vision-free-v1',
        outputs:[{
          id:'processed-1',
          url:'https://cdn.example.test/processed.png',
          mime:'image/png',
          width:512,
          height:512,
          metadata:{operation:input.operation},
        }],
      };
    },
  };
}

function freeGenerator({
  id='free-generator',
  priority=20,
  fail=false,
}={}) {
  return {
    capability() {
      return {
        id,
        kinds:['IMAGE'],
        paid:false,
        enabled:true,
        priority,
        model:'free-image-v1',
      };
    },
    async generate(input) {
      if (fail) throw new Error('GENERATION_DOWN');
      assert.equal(input.kind,'IMAGE');
      return {
        model:'free-image-v1',
        outputs:[{
          url:'https://cdn.example.test/generated.png',
          size:input.size || '1024x1024',
        }],
      };
    },
  };
}

function paidGenerator({
  id='paid-generator',
  priority=1,
  cost=0.04,
}={}) {
  return {
    capability() {
      return {
        id,
        kinds:['IMAGE'],
        paid:true,
        enabled:true,
        priority,
        model:'paid-image-v1',
      };
    },
    async estimateCostUsd() {
      return cost;
    },
    async generate() {
      return {
        model:'paid-image-v1',
        outputs:[{url:'https://paid.example.test/out.png'}],
      };
    },
  };
}

test('GEN2-21 analysis uses free provider and returns checksum-bound provenance', async()=>{
  const runtime=createImageVisionRuntime({
    providers:[freeVisionProvider()],
    now:()=> '2026-09-25T14:30:00.000Z',
  });

  const result=await runtime.analyze({
    bytes:encoder.encode('fake-image-bytes'),
    mime:'image/png',
  });

  assert.equal(result.schema,'mel.image-runtime/v1');
  assert.equal(result.action,'ANALYZE');
  assert.equal(result.provider,'free-vision');
  assert.equal(result.analysis.description,'A blue square on a white background.');
  assert.deepEqual(result.analysis.labels,['square','blue']);
  assert.match(result.provenance.request.source_sha256,/^[0-9a-f]{64}$/);
  assert.equal(result.provenance.paid,false);
  assert.equal(result.provenance.estimated_cost_usd,0);
  assert.equal(JSON.stringify(result.provenance).includes('fake-image-bytes'),false);
  assert.deepEqual(result.attempts,[{provider:'free-vision',status:'success'}]);
});

test('GEN2-21 free provider is preferred over lower-priority paid provider', async()=>{
  let paidCalls=0;
  const paid=paidGenerator({priority:0});
  const originalGenerate=paid.generate;
  paid.generate=async input=>{
    paidCalls+=1;
    return originalGenerate(input);
  };

  const runtime=createImageVisionRuntime({
    providers:[paid,freeGenerator({priority:100})],
  });

  const result=await runtime.generate({
    prompt:'A calm geometric landscape',
    size:'1024x1024',
  });

  assert.equal(result.provider,'free-generator');
  assert.equal(result.provenance.paid,false);
  assert.equal(paidCalls,0);
});

test('GEN2-21 paid provider stays blocked without explicit call approval', async()=>{
  const runtime=createImageVisionRuntime({
    providers:[paidGenerator()],
  });

  await assert.rejects(
    ()=>runtime.generate(
      {prompt:'Paid image attempt'},
      {maxCostUsd:1},
    ),
    error=>{
      assert.match(error?.code || error?.message,/IMAGE_NO_PROVIDER:GENERATE/);
      assert.match(error?.code || error?.message,/paid_call_not_approved/);
      return true;
    },
  );
});

test('GEN2-21 paid provider also requires bounded budget and known cost', async()=>{
  const runtime=createImageVisionRuntime({
    providers:[paidGenerator({cost:0.25})],
  });

  await assert.rejects(
    ()=>runtime.generate(
      {prompt:'Approved but too expensive',approvedPaidCall:true},
      {maxCostUsd:0.10},
    ),
    error=>{
      assert.match(error?.code || error?.message,/cost_guard/);
      return true;
    },
  );

  const unknownCost={
    capability(){
      return {id:'paid-unknown',kinds:['IMAGE'],paid:true,enabled:true};
    },
    async generate(){
      return {outputs:[{url:'https://paid.example.test/unknown.png'}]};
    },
  };
  const unknown=createImageVisionRuntime({providers:[unknownCost]});
  await assert.rejects(
    ()=>unknown.generate(
      {prompt:'Unknown cost',approvedPaidCall:true},
      {maxCostUsd:100},
    ),
    error=>{
      assert.match(error?.code || error?.message,/cost_unknown/);
      return true;
    },
  );
});

test('GEN2-21 authorized paid provider can run only within explicit budget', async()=>{
  const runtime=createImageVisionRuntime({
    providers:[paidGenerator({cost:0.04})],
    authorization:{
      async isAllowed({provider,action}){
        return provider==='paid-generator' && action==='GENERATE';
      },
    },
  });

  const result=await runtime.generate(
    {prompt:'Explicit paid generation',approvedPaidCall:true},
    {maxCostUsd:0.05},
    {owner:'adrien'},
  );

  assert.equal(result.provider,'paid-generator');
  assert.equal(result.provenance.paid,true);
  assert.equal(result.provenance.estimated_cost_usd,0.04);
});

test('GEN2-21 provider failure falls through to next free provider with evidence', async()=>{
  const runtime=createImageVisionRuntime({
    providers:[
      freeVisionProvider({id:'vision-a',priority:1,failAnalyze:true}),
      freeVisionProvider({id:'vision-b',priority:2}),
    ],
  });

  const result=await runtime.analyze({
    bytes:encoder.encode('fake-image'),
    mime:'image/jpeg',
  });

  assert.equal(result.provider,'vision-b');
  assert.deepEqual(result.attempts,[
    {provider:'vision-a',status:'failed',reason:'VISION_DOWN'},
    {provider:'vision-b',status:'success'},
  ]);
});

test('GEN2-21 generation supports existing multimodal provider contract with kinds IMAGE', async()=>{
  const runtime=createImageVisionRuntime({
    providers:[freeGenerator()],
  });

  const result=await runtime.generate({
    prompt:'A minimal bee icon',
    referenceImages:['https://assets.example.test/reference.png'],
    size:'1024x1024',
    watermark:false,
  });

  assert.equal(result.action,'GENERATE');
  assert.equal(result.outputs.length,1);
  assert.equal(result.outputs[0].url,'https://cdn.example.test/generated.png');
  assert.match(result.provenance.request.prompt_sha256,/^[0-9a-f]{64}$/);
  assert.equal(result.provenance.request.reference_count,1);
  assert.equal('prompt' in result.provenance.request,false);
});

test('GEN2-21 process normalizes output and public provenance', async()=>{
  const runtime=createImageVisionRuntime({
    providers:[freeVisionProvider()],
  });

  const result=await runtime.process({
    bytes:encoder.encode('fake-image'),
    mime:'image/png',
    operation:'resize',
    params:{width:512,height:512,access_token:'must-not-leak'},
  });

  assert.equal(result.action,'PROCESS');
  assert.equal(result.outputs[0].id,'processed-1');
  assert.equal(result.outputs[0].metadata.operation,'resize');
  assert.equal(JSON.stringify(result).includes('must-not-leak'),false);
});

test('GEN2-21 authorization can deny free provider and fail closed', async()=>{
  const runtime=createImageVisionRuntime({
    providers:[freeVisionProvider()],
    authorization:{
      async isAllowed(){ return false; },
    },
  });

  await assert.rejects(
    ()=>runtime.analyze({
      bytes:encoder.encode('fake-image'),
      mime:'image/png',
    }),
    error=>{
      assert.match(error?.code || error?.message,/not_authorized/);
      return true;
    },
  );
});

test('GEN2-21 listProviders is free-first and action-aware', ()=>{
  const runtime=createImageVisionRuntime({
    providers:[
      paidGenerator({id:'paid-z',priority:0}),
      freeGenerator({id:'free-z',priority:50}),
      freeVisionProvider({id:'vision-a',priority:1}),
    ],
  });

  assert.deepEqual(
    runtime.listProviders('GENERATE').map(row=>row.id),
    ['free-z','paid-z'],
  );
  assert.deepEqual(
    runtime.listProviders('ANALYZE').map(row=>row.id),
    ['vision-a'],
  );
});

test('GEN2-21 stable image port remains fail-closed without adapters', async()=>{
  const port=createImages();
  await assert.rejects(
    ()=>port.analyze({}),
    error=>error?.code==='NOT_IMPLEMENTED:media/images.analyze',
  );
});

test('GEN2-21 createImageAdapters exposes unified runtime behind stable port', async()=>{
  const port=createImages(createImageAdapters({
    providers:[freeVisionProvider(),freeGenerator()],
  }));

  const analysis=await port.analyze({
    bytes:encoder.encode('fake-image'),
    mime:'image/png',
  },{owner:'test'});
  assert.equal(analysis.provider,'free-vision');

  const generated=await port.generate({
    prompt:'A simple visual',
  },{owner:'test'});
  assert.equal(generated.provider,'free-generator');
});
