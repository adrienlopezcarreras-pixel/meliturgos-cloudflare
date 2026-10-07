import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { creativeMediaCapabilityIds } from '../src/capabilities/creative-media-capabilities.js';

const context={ owner:'owner', permissions:[], requestId:'media-truth-audit' };

test('all twelve canonical media capabilities exist exactly once', () => {
  const bus=createDefaultCapabilityBus({ env:{} });
  const ids=creativeMediaCapabilityIds();
  assert.equal(ids.length,12);
  assert.equal(new Set(ids).size,12);
  const registered=bus.list().filter(row=>row.category==='creative-media').map(row=>row.id);
  assert.deepEqual(new Set(registered),new Set(ids));
});

test('all unconfigured media capabilities are truthfully unavailable and fail closed', async () => {
  const bus=createDefaultCapabilityBus({ env:{} });
  for(const id of creativeMediaCapabilityIds()){
    const descriptor=bus.describe(id);
    assert.equal(descriptor.enabled,true,id);
    assert.equal(descriptor.health,'UNAVAILABLE',id);
    await assert.rejects(
      () => bus.execute(id, sampleInput(id), context),
      error => ['CAPABILITY_UNAVAILABLE','MEDIA_CAPABILITY_UNAVAILABLE'].includes(error?.code)
        || /UNAVAILABLE/.test(String(error?.code||error?.message||'')),
      id+' must fail closed when no real provider exists',
    );
  }
});

test('a real injected adapter makes only its exact capability healthy and executable', async () => {
  const calls=[];
  const bus=createDefaultCapabilityBus({
    env:{
      MEL_MEDIA_CAPABILITIES:{
        'media.video.analyze': async input => {
          calls.push(input);
          return { ok:true, provider:'fixture-real-adapter', frames:3 };
        },
      },
    },
  });

  assert.equal(bus.describe('media.video.analyze').health,'HEALTHY');
  assert.equal(bus.describe('media.video.process').health,'UNAVAILABLE');
  assert.equal(bus.describe('media.video.generate').health,'UNAVAILABLE');

  const result=await bus.execute('media.video.analyze',{ url:'https://example.com/video.mp4' },context);
  assert.equal(result.ok,true);
  assert.equal(result.provider,'fixture-real-adapter');
  assert.equal(calls.length,1);
});

test('media health cannot claim healthy merely because the capability is registered', () => {
  const bus=createDefaultCapabilityBus({ env:{} });
  const rows=creativeMediaCapabilityIds().map(id=>bus.describe(id));
  assert.ok(rows.every(row=>row.enabled===true));
  assert.ok(rows.every(row=>row.health!=='HEALTHY'));
});

function sampleInput(id){
  if(id==='media.image.generate'||id==='media.audio.generate'||id==='media.music.generate'||id==='media.video.generate'){
    return { prompt:'bounded test' };
  }
  if(id==='media.audio.synthesize') return { text:'test' };
  if(id==='media.audio.transcribe') return { audio_base64:Buffer.from('audio').toString('base64') };
  if(id.startsWith('media.image.')) return { url:'https://example.com/image.jpg', operation:'resize' };
  if(id.startsWith('media.video.')) return { url:'https://example.com/video.mp4', operation:'trim' };
  return { url:'https://example.com/audio.mp3' };
}
