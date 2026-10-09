import test from 'node:test';
import assert from 'node:assert/strict';
import { runMelMedia02LiveProof } from '../src/media/media-roadmap-proof.js';

function artifact(id,mime){
  return {
    key:'generated/'+id,
    private:true,
    stored_encrypted:true,
    mime,
  };
}

test('MEL-MEDIA-02 retries a transient provider-capacity failure locally and completes 12/12', async()=>{
  let videoAnalyzeCalls=0;
  const ok=(extra={})=>({ok:true,provider:'test-zero-cost',zero_added_cost:true,...extra});
  const env={
    MELITURGOS_USER:'owner',
    MEL_MEDIA_CAPABILITIES:{
      'media.image.generate':async()=>ok({artifact:artifact('image-generate','image/png')}),
      'media.image.analyze':async()=>ok({analysis:'blue circle on ivory background'}),
      'media.image.process':async()=>ok({artifact:artifact('image-process','image/png')}),
      'media.audio.generate':async()=>ok({artifact:artifact('audio-generate','audio/wav')}),
      'media.audio.analyze':async()=>ok({rms:0.25}),
      'media.audio.synthesize':async()=>ok({artifact:artifact('speech','audio/mpeg')}),
      'media.audio.transcribe':async()=>ok({text:'Bonjour MEL'}),
      'media.music.generate':async()=>ok({artifact:artifact('music','audio/wav')}),
      'media.music.analyze':async()=>ok({estimated_bpm:96}),
      'media.video.generate':async()=>ok({artifact:artifact('video-generate','video/webm')}),
      'media.video.process':async()=>ok({artifact:artifact('video-process','video/webm')}),
      'media.video.analyze':async()=>{
        videoAnalyzeCalls+=1;
        if(videoAnalyzeCalls===1) throw new Error('3040: Capacity temporarily exceeded, please try again.');
        return ok({summary:'blue circle with minimal motion'});
      },
    },
  };
  const proof=await runMelMedia02LiveProof(env,{
    sourceSha:'a'.repeat(40),
    transientRetryDelayMs:0,
  });
  assert.equal(proof.status,'MEL_MEDIA_02_DONE_VERIFIED_ELIGIBLE');
  assert.equal(proof.done_verified_eligible,true);
  assert.equal(proof.capability_count,12);
  assert.equal(proof.executions.length,12);
  assert.equal(videoAnalyzeCalls,2);
});

test('MEL-MEDIA-02 does not retry deterministic capability failures', async()=>{
  let imageGenerateCalls=0;
  const env={
    MELITURGOS_USER:'owner',
    MEL_MEDIA_CAPABILITIES:{
      'media.image.generate':async()=>{
        imageGenerateCalls+=1;
        const error=new Error('MEDIA_PROMPT_REQUIRED');
        error.code='MEDIA_PROMPT_REQUIRED';
        error.status=400;
        throw error;
      },
      'media.image.analyze':async()=>({ok:true,provider:'test',zero_added_cost:true,analysis:'x'}),
      'media.image.process':async()=>({ok:true,provider:'test',zero_added_cost:true,artifact:artifact('x','image/png')}),
      'media.audio.generate':async()=>({ok:true,provider:'test',zero_added_cost:true,artifact:artifact('x2','audio/wav')}),
      'media.audio.analyze':async()=>({ok:true,provider:'test',zero_added_cost:true,rms:0.1}),
      'media.audio.synthesize':async()=>({ok:true,provider:'test',zero_added_cost:true,artifact:artifact('x3','audio/mpeg')}),
      'media.audio.transcribe':async()=>({ok:true,provider:'test',zero_added_cost:true,text:'x'}),
      'media.music.generate':async()=>({ok:true,provider:'test',zero_added_cost:true,artifact:artifact('x4','audio/wav')}),
      'media.music.analyze':async()=>({ok:true,provider:'test',zero_added_cost:true,estimated_bpm:90}),
      'media.video.generate':async()=>({ok:true,provider:'test',zero_added_cost:true,artifact:artifact('x5','video/webm')}),
      'media.video.process':async()=>({ok:true,provider:'test',zero_added_cost:true,artifact:artifact('x6','video/webm')}),
      'media.video.analyze':async()=>({ok:true,provider:'test',zero_added_cost:true,summary:'x'}),
    },
  };
  await assert.rejects(
    runMelMedia02LiveProof(env,{sourceSha:'b'.repeat(40),transientRetryDelayMs:0}),
    error=>error?.code==='MEDIA_PROMPT_REQUIRED',
  );
  assert.equal(imageGenerateCalls,1);
});
