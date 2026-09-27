import test from 'node:test';import assert from 'node:assert/strict';
import {installBridge} from '../src/native.js';
let sequence=0;
const flush=()=>new Promise(r=>setImmediate(r));
async function environment(t,{delay=false,native=false,nativeError=false}={}){
 const original={Audio:globalThis.Audio,fetch:globalThis.fetch,native:globalThis.KotobaNative};
 const clips={first:'a'.repeat(24)+'.ogg',second:'b'.repeat(24)+'.ogg'},speechTexts={first:'ハ',second:'ヘ'};
 const manifest={version:3,complete:true,clips,speechTexts};let release;
 const gate=delay?new Promise(r=>release=r):Promise.resolve();
 globalThis.fetch=async()=>{await gate;return{ok:true,json:async()=>manifest};};
 const instances=[],messages=[];
 class MockAudio{
  constructor(url){this.src=String(url);this.paused=true;this.currentTime=0;instances.push(this);}
  play(){this.paused=false;return Promise.resolve();}
  pause(){this.paused=true;}
  start(){this.onplaying?.();}
  end(){this.paused=true;this.onended?.();}
 }
 globalThis.Audio=MockAudio;
 if(native){globalThis.KotobaNative={postMessage(raw){const q=JSON.parse(raw);messages.push(q);queueMicrotask(()=>globalThis.KotobaNative?.onmessage?.({data:JSON.stringify({id:q.id,...(nativeError&&q.type==='speechSpeak'?{error:'no offline voice'}:{result:{}})})}));}};installBridge();}
 else delete globalThis.KotobaNative;
 const audio=await import('../src/audio.js?case='+ ++sequence);
 t.after(async()=>{audio.stopAudio();await flush();globalThis.Audio=original.Audio;globalThis.fetch=original.fetch;if(original.native)globalThis.KotobaNative=original.native;else delete globalThis.KotobaNative;});
 return{audio,instances,messages,manifest,release};
}
test('starting playback alone never resolves the completed-listening promise',async t=>{
 const {audio,instances}=await environment(t);let completed=false,starts=0;
 const p=audio.speak('first',1,{onStart:()=>starts++}).then(()=>completed=true);await flush();
 assert.equal(instances.length,1);instances[0].start();instances[0].start();await flush();assert.equal(starts,1);assert.equal(completed,false);
 instances[0].end();await p;assert.equal(completed,true);
});
test('0.7 playback preserves pitch and points at an APK-local recording',async t=>{
 const {audio,instances}=await environment(t);const p=audio.speak('first',.7);await flush();assert.equal(instances[0].playbackRate,.7);assert.equal(instances[0].preservesPitch,true);assert.match(instances[0].src,/\/data\/audio\/a{24}\.ogg$/);instances[0].end();await p;
});
test('stopping while the manifest loads cannot play an old word later',async t=>{
 const {audio,instances,release}=await environment(t,{delay:true});const result=audio.speak('first').catch(e=>e.message);audio.stopAudio();release();assert.match(await result,/중단/);assert.equal(instances.length,0);
});
test('two rapid requests before the manifest arrives play only the latest word',async t=>{
 const {audio,instances,release}=await environment(t,{delay:true});const first=audio.speak('first').catch(e=>e.message),second=audio.speak('second');release();await flush();assert.match(await first,/중단/);assert.equal(instances.length,1);assert.match(instances[0].src,/b{24}/);instances[0].end();await second;
});
test('manual replay stops existing sound before creating another player',async t=>{
 const {audio,instances}=await environment(t);const first=audio.speak('first').catch(e=>e.message);await flush();const second=audio.speak('second');await flush();assert.match(await first,/중단/);assert.equal(instances[0].paused,true);assert.equal(instances.filter(a=>!a.paused).length,1);instances[1].end();await second;
});
test('media decode failure rejects rather than marking listening complete',async t=>{
 const {audio,instances}=await environment(t);const result=audio.speak('first').catch(e=>e.message);await flush();instances[0].onerror();assert.match(await result,/재생하지 못/);assert.equal(instances[0].paused,true);
});
test('native engine receives audited kana rather than a stale supplied reading',async t=>{
 const {audio,messages,instances}=await environment(t,{native:true});audio.configureAudio({audioEngine:'device'});await audio.speak('first',1,{text:'Uӣ[い'});assert.equal(messages.find(m=>m.type==='speechSpeak').payload.text,'ハ');assert.equal(instances.length,0);
});
test('missing device voice falls back to the correct bundled file once',async t=>{
 const {audio,instances}=await environment(t,{native:true,nativeError:true});audio.configureAudio({audioEngine:'device'});let notices=0;const p=audio.speak('second',1,{onFallback:()=>notices++});await flush();assert.equal(notices,1);assert.equal(instances.length,1);assert.match(instances[0].src,/b{24}/);instances[0].end();await p;
});
test('invalid audio mapping cannot become a remote URL or playback success',async t=>{
 const {audio,manifest,instances}=await environment(t);manifest.clips.first='https://evil.invalid/audio.ogg';await assert.rejects(audio.speak('first'),/누락/);assert.equal(instances.length,0);
});
test('each explicit playback/stop invalidates queued automatic playback tokens',async t=>{
 const {audio,instances}=await environment(t);const before=audio.audioGeneration(),p=audio.speak('first');assert.notEqual(before,audio.audioGeneration());await flush();instances[0].end();await p;const later=audio.audioGeneration();audio.stopAudio();assert.notEqual(later,audio.audioGeneration());
});
