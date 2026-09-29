import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {speak,speakSentence,configureAudio,stopAudio} from '../src/audio.js';
import {fresh,validateState} from '../src/course-engine.js';
import {installBridge} from '../src/native.js';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
function browser(fn,voices=[{lang:'ja-JP',localService:true}]){
 const oldS=globalThis.speechSynthesis,oldU=globalThis.SpeechSynthesisUtterance;globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 const played=[];globalThis.speechSynthesis={getVoices:()=>voices,speak(u){played.push({text:u.text,rate:u.rate});queueMicrotask(()=>u.onend?.());},cancel(){}};
 return Promise.resolve().then(()=>fn(played)).finally(()=>{stopAudio();globalThis.speechSynthesis=oldS;globalThis.SpeechSynthesisUtterance=oldU;});
}
test('legacy bundled settings migrate to device-only and daily targets are removed',()=>{const s=fresh();s.settings.audioEngine='bundled';s.settings.goal=30;const v=validateState(s);assert.equal(v.settings.audioEngine,'device');assert.equal('goal'in v.settings,false);});
test('word, kana, sentence and slow playback all use device TTS (browser mock)',()=>browser(async played=>{configureAudio({audioEngine:'bundled'});await speak('N5-id',1,{text:'やま'});await speak('KANA-test',.7,{text:'あ'});await speakSentence('山に登ります。',.7);assert.deepEqual(played,[{text:'やま',rate:1},{text:'あ',rate:.7},{text:'山に登ります。',rate:.7}]);}));
test('missing Japanese voice rejects with installation guidance, never fallback',()=>browser(async played=>{await assert.rejects(speak('N5-id',1,{text:'やま'}),/日本|일본어/);assert.equal(played.length,0);},[{lang:'en-US',localService:true}]));
test('cloud-only Japanese voice is not misrepresented as offline',()=>browser(async played=>{await assert.rejects(speakSentence('山です。'),/오프라인/);assert.equal(played.length,0);},[{lang:'ja-JP',localService:false}]));
test('word IDs never get spoken when actual reading is absent',()=>browser(async played=>{await assert.rejects(speak('N5-id'));assert.equal(played.length,0);}));
test('successful native completion is required; no pre-generated audio dependency',async()=>{
 const messages=[];globalThis.KotobaNative={postMessage(raw){const m=JSON.parse(raw);messages.push(m);queueMicrotask(()=>globalThis.KotobaNative.onmessage({data:JSON.stringify({id:m.id,result:{}})}));}};installBridge();
 try{await speak('N5-id',.7,{text:'やま'});await speakSentence('山です。');assert.equal(messages.filter(m=>m.type==='speechSpeak').length,2);assert.equal(messages.find(m=>m.type==='speechSpeak').payload.rate,.7);}finally{stopAudio();delete globalThis.KotobaNative;}
 const audio=read('../src/audio.js'),sw=read('../sw.js');assert.doesNotMatch(audio,/new Audio\(|audio-manifest|data\/audio/);assert.doesNotMatch(sw,/audio-manifest|data\/audio/);
});
test('native speech errors are propagated rather than treated as completed listening',async()=>{
 globalThis.KotobaNative={postMessage(raw){const m=JSON.parse(raw);queueMicrotask(()=>globalThis.KotobaNative.onmessage({data:JSON.stringify({id:m.id,error:m.type==='speechSpeak'?'일본어 음성 없음':null,result:{}})}));}};installBridge();
 try{await assert.rejects(speak('N5-id',1,{text:'やま'}),/음성 없음/);}finally{stopAudio();delete globalThis.KotobaNative;}
});
test('no microphone permission; Android still declares the system TTS query',()=>{const m=read('../../kotoba-android/app/src/main/AndroidManifest.xml');assert.doesNotMatch(m,/RECORD_AUDIO/);assert.match(m,/TTS_SERVICE/);});
