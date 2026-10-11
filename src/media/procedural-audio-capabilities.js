import { mediaStorageReady, storePrivateArtifact, readPrivateArtifactBytes } from './workers-ai-media-capabilities.js';

const MAX_ANALYSIS_BYTES = 24_000_000;
const DEFAULT_SAMPLE_RATE = 22050;
const TWO_PI = Math.PI * 2;

function err(code, status = 400) {
  return Object.assign(new Error(code), { code, status });
}
function clean(v, max = 4000) { return String(v ?? '').trim().slice(0, max); }
function hashText(text) {
  let h = 2166136261 >>> 0;
  for (const ch of String(text || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function inputBytes(input = {}) {
  if (input.bytes instanceof Uint8Array) return input.bytes;
  if (input.bytes instanceof ArrayBuffer) return new Uint8Array(input.bytes);
  const b64 = clean(input.audio_base64 ?? input.audio ?? input.data, 34_000_000);
  if (!b64) return null;
  try {
    const raw = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64;
    const binary = atob(raw);
    return Uint8Array.from(binary, ch => ch.charCodeAt(0));
  } catch { throw err('AUDIO_BASE64_INVALID'); }
}
async function inputBytesForEnv(env, input = {}) {
  if (input?.artifact_key) {
    const artifact = await readPrivateArtifactBytes(env, input.artifact_key);
    if (!artifact.mime.startsWith('audio/')) throw err('AUDIO_ARTIFACT_REQUIRED', 415);
    return artifact.bytes;
  }
  return inputBytes(input);
}
function readAscii(view, offset, len) {
  let out=''; for(let i=0;i<len;i++) out+=String.fromCharCode(view.getUint8(offset+i)); return out;
}
function decodeWav(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 44 || bytes.byteLength > MAX_ANALYSIS_BYTES) throw err('WAV_PCM_REQUIRED', 415);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readAscii(view,0,4)!=='RIFF' || readAscii(view,8,4)!=='WAVE') throw err('WAV_PCM_REQUIRED',415);
  let offset=12, fmt=null, dataOffset=-1, dataSize=0;
  while(offset+8<=view.byteLength){
    const id=readAscii(view,offset,4), size=view.getUint32(offset+4,true), body=offset+8;
    if(body+size>view.byteLength) break;
    if(id==='fmt '){
      fmt={format:view.getUint16(body,true),channels:view.getUint16(body+2,true),sampleRate:view.getUint32(body+4,true),bits:view.getUint16(body+14,true)};
    } else if(id==='data'){dataOffset=body;dataSize=size;break;}
    offset=body+size+(size%2);
  }
  if(!fmt||fmt.format!==1||![8,16].includes(fmt.bits)||fmt.channels<1||fmt.channels>2||dataOffset<0) throw err('WAV_PCM_FORMAT_UNSUPPORTED',415);
  const bytesPerSample=fmt.bits/8, frameBytes=bytesPerSample*fmt.channels, frames=Math.floor(dataSize/frameBytes);
  if(frames<1) throw err('WAV_PCM_EMPTY',400);
  const mono=new Float32Array(frames);
  for(let i=0;i<frames;i++){
    let sum=0;
    for(let ch=0;ch<fmt.channels;ch++){
      const p=dataOffset+i*frameBytes+ch*bytesPerSample;
      sum += fmt.bits===16 ? view.getInt16(p,true)/32768 : (view.getUint8(p)-128)/128;
    }
    mono[i]=sum/fmt.channels;
  }
  return {samples:mono,sample_rate:fmt.sampleRate,channels:fmt.channels,bits_per_sample:fmt.bits,duration_seconds:frames/fmt.sampleRate};
}
function spectral(samples, sampleRate) {
  const n=Math.min(2048,samples.length);
  if(n<64) return {rms:0,peak:0,zero_crossing_rate:0,dominant_frequency_hz:null};
  let rms=0,peak=0,zc=0;
  for(let i=0;i<samples.length;i++){const x=samples[i];rms+=x*x;peak=Math.max(peak,Math.abs(x));if(i&&Math.sign(x)!==Math.sign(samples[i-1]))zc++;}
  rms=Math.sqrt(rms/samples.length);
  let bestFreq=null,bestPower=-1;
  const minBin=Math.max(1,Math.floor(40*n/sampleRate)),maxBin=Math.min(Math.floor(n/2),Math.ceil(4000*n/sampleRate));
  for(let k=minBin;k<=maxBin;k++){
    let re=0,im=0;
    for(let i=0;i<n;i++){const w=0.5-0.5*Math.cos(TWO_PI*i/(n-1));const a=TWO_PI*k*i/n;re+=samples[i]*w*Math.cos(a);im-=samples[i]*w*Math.sin(a);}
    const power=re*re+im*im;if(power>bestPower){bestPower=power;bestFreq=k*sampleRate/n;}
  }
  return {rms,peak,zero_crossing_rate:zc/Math.max(1,samples.length-1),dominant_frequency_hz:bestFreq};
}
function estimateTempo(samples,sampleRate){
  const hop=Math.max(128,Math.round(sampleRate*0.02)), energies=[];
  for(let o=0;o+hop<=samples.length&&energies.length<3000;o+=hop){let e=0;for(let i=o;i<o+hop;i++)e+=samples[i]*samples[i];energies.push(e/hop);}
  if(energies.length<30)return null;
  let mean=energies.reduce((a,b)=>a+b,0)/energies.length;const onset=energies.map((v,i)=>Math.max(0,v-(i?energies[i-1]:mean)));
  let best={bpm:null,score:-1};
  for(let bpm=60;bpm<=180;bpm++){const lag=Math.round((60/bpm)/(hop/sampleRate));if(lag<1||lag>=onset.length)continue;let score=0;for(let i=lag;i<onset.length;i++)score+=onset[i]*onset[i-lag];if(score>best.score)best={bpm,score};}
  return best.bpm;
}
function noteName(freq){
  if(!Number.isFinite(freq)||freq<=0)return null;
  const midi=Math.round(69+12*Math.log2(freq/440)),names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return names[((midi%12)+12)%12]+String(Math.floor(midi/12)-1);
}
function encodeWav(samples,sampleRate=DEFAULT_SAMPLE_RATE){
  const n=samples.length,buffer=new ArrayBuffer(44+n*2),v=new DataView(buffer);
  const write=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  write(0,'RIFF');v.setUint32(4,36+n*2,true);write(8,'WAVE');write(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);write(36,'data');v.setUint32(40,n*2,true);
  for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.max(-32768,Math.min(32767,Math.round(samples[i]*32767))),true);
  return new Uint8Array(buffer);
}
function envelope(t,d){return Math.min(1,t/0.02,Math.max(0,(d-t)/0.08));}
function generatedSound(prompt,duration=2,sr=DEFAULT_SAMPLE_RATE){
  const p=clean(prompt,2000).toLowerCase(),seed=hashText(p),n=Math.round(sr*duration),out=new Float32Array(n);
  const base=180+(seed%640),noise=/noise|bruit|vent|pluie/.test(p),chime=/chime|cloche|ding|notification/.test(p);
  let rng=seed||1;
  for(let i=0;i<n;i++){const t=i/sr,e=envelope(t,duration);rng=(Math.imul(rng,1664525)+1013904223)>>>0;const rnd=(rng/4294967295)*2-1;
    let x=noise?rnd*0.32:Math.sin(TWO_PI*base*t)*0.32;
    if(chime)x=(Math.sin(TWO_PI*base*t)+0.5*Math.sin(TWO_PI*base*2.01*t)+0.25*Math.sin(TWO_PI*base*3.98*t))*0.22*Math.exp(-2.4*t);
    out[i]=x*e;
  } return out;
}
function generatedMusic(prompt,duration=12,sr=DEFAULT_SAMPLE_RATE){
  const p=clean(prompt,2000).toLowerCase(),seed=hashText(p),n=Math.round(sr*duration),out=new Float32Array(n);
  const bpmMatch=p.match(/\b(\d{2,3})\s*bpm\b/),bpm=bpmMatch?Math.max(60,Math.min(180,Number(bpmMatch[1]))):80+(seed%61);
  const roots=[220,246.94,261.63,293.66,329.63,349.23,392,440],root=roots[seed%roots.length],beat=60/bpm;
  const progression=[0,7,9,5],scale=[0,2,4,7,9];
  for(let i=0;i<n;i++){const t=i/sr,bar=Math.floor(t/(beat*4)),beatIndex=Math.floor(t/beat),phase=(t%beat)/beat;
    const chordRoot=root*Math.pow(2,progression[bar%progression.length]/12),melNote=scale[(beatIndex+(seed%5))%scale.length],mel= root*Math.pow(2,melNote/12)*2;
    const e=Math.min(1,phase/0.08)*Math.max(0,1-phase);
    out[i]=0.12*Math.sin(TWO_PI*chordRoot*t)+0.08*Math.sin(TWO_PI*chordRoot*1.25*t)+0.08*Math.sin(TWO_PI*chordRoot*1.5*t)+0.18*e*Math.sin(TWO_PI*mel*t);
  }
  return {samples:out,bpm,root_hz:root};
}
async function audioAnalyze(env,input={}){
  const bytes=await inputBytesForEnv(env,input);if(!bytes?.byteLength)throw err('AUDIO_INPUT_REQUIRED');
  const wav=decodeWav(bytes),s=spectral(wav.samples,wav.sample_rate);
  return Object.freeze({ok:true,schema:'mel.dsp-audio/v1',capability:'media.audio.analyze',provider:'mel-dsp',zero_added_cost:true,...wav,...s,dominant_note:noteName(s.dominant_frequency_hz)});
}
async function musicAnalyze(env,input={}){
  const base=await audioAnalyze(env,input),bytes=await inputBytesForEnv(env,input),wav=decodeWav(bytes),bpm=estimateTempo(wav.samples,wav.sample_rate);
  return Object.freeze({...base,capability:'media.music.analyze',schema:'mel.dsp-music/v1',estimated_bpm:bpm});
}
async function audioGenerate(env,input={}){
  if(!mediaStorageReady(env))throw err('MEDIA_VAULT_UNAVAILABLE',503);
  const prompt=clean(input.prompt||input.description,2000);if(!prompt)throw err('MEDIA_PROMPT_REQUIRED');
  const duration=Math.min(10,Math.max(0.25,Number(input.duration_seconds)||2)),wav=encodeWav(generatedSound(prompt,duration));
  const artifact=await storePrivateArtifact(env,wav,{capability:'media.audio.generate',model:'mel-dsp-sound-v1',mime:'audio/wav',extension:'wav'});
  return Object.freeze({ok:true,schema:'mel.dsp-audio/v1',capability:'media.audio.generate',provider:'mel-dsp',zero_added_cost:true,duration_seconds:duration,artifact});
}
async function musicGenerate(env,input={}){
  if(!mediaStorageReady(env))throw err('MEDIA_VAULT_UNAVAILABLE',503);
  const prompt=clean(input.prompt||input.description,2000);if(!prompt)throw err('MEDIA_PROMPT_REQUIRED');
  const duration=Math.min(30,Math.max(4,Number(input.duration_seconds)||12)),music=generatedMusic(prompt,duration),wav=encodeWav(music.samples);
  const artifact=await storePrivateArtifact(env,wav,{capability:'media.music.generate',model:'mel-dsp-music-v1',mime:'audio/wav',extension:'wav'});
  return Object.freeze({ok:true,schema:'mel.dsp-music/v1',capability:'media.music.generate',provider:'mel-dsp',zero_added_cost:true,duration_seconds:duration,bpm:music.bpm,artifact});
}
export function createProceduralAudioCapabilities(env={}){
  const out={
    'media.audio.analyze': input=>audioAnalyze(env,input),
    'media.music.analyze': input=>musicAnalyze(env,input),
  };
  if(mediaStorageReady(env)){
    out['media.audio.generate']=input=>audioGenerate(env,input);
    out['media.music.generate']=input=>musicGenerate(env,input);
  }
  return Object.freeze(out);
}
