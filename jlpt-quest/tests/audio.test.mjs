import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {speak,speakSentence,configureAudio,stopAudio} from '../src/audio.js';
import {fresh,validateState} from '../src/course-engine.js';
import {installBridge} from '../src/native.js';
import {speechSetupGuide} from '../src/speech-guide.js';
import {kanaPractice,mountKana,handleKanaAction} from '../src/kana-ui.js';
import {startKana} from '../src/kana-engine.js';
import {loadStrokeBank,characterStrokes} from '../src/stroke-bank.js';
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
test('voice recovery guides explain installation without offering cloud or automatic playback',()=>{
 const guide=speechSetupGuide({error:'설치된 오프라인 일본어 음성이 없어요.',native:true});
 assert.match(guide,/일본어 오프라인 음성/);assert.match(guide,/data-action="speech-settings"/);assert.match(guide,/앱으로 돌아와 다시 듣기/);
 assert.doesNotMatch(guide,/한국어 오프라인 음성|data-action="speech-test"|Cloud|API/);
});
test('meaning playback guidance keeps Korean optional and setup test Japanese',()=>{
 const guide=speechSetupGuide({includeMeaning:true,settings:true,native:true});
 assert.match(guide,/한국어 뜻 듣기를 켜면/);assert.match(guide,/뜻 듣기를 끄면 일본어 음성만/);assert.match(guide,/일본어 음성 테스트/);
 assert.match(guide,/음성 데이터 설치 메뉴에서 일본어와 한국어 오프라인 음성을 설치/);assert.match(guide,/이 테스트는 일본어만 확인/);
 assert.match(guide,/연속 듣기의 목록 설정에서 <b>한국어 뜻<\/b>을 켜고/);assert.match(guide,/일본어와 한국어 뜻이 모두 들리는지 확인/);
 assert.doesNotMatch(speechSetupGuide({includeMeaning:false,native:true}),/한국어 오프라인 음성/);
 const playlistGuide=speechSetupGuide({includeMeaning:true,settings:true,test:false,native:true}),errorGuide=speechSetupGuide({includeMeaning:true,error:'한국어 음성이 없어요.',native:true});
 for(const text of [playlistGuide,errorGuide]){assert.match(text,/일본어와 한국어 오프라인 음성을 설치/);assert.match(text,/한국어 뜻<\/b>을 켜고/);assert.doesNotMatch(text,/data-action="speech-test"/);}
});
test('voice errors are escaped and browser help does not promise to open Android settings',()=>{
 const guide=speechSetupGuide({error:'<img src=x onerror=alert(1)>',native:false});
 assert.match(guide,/&lt;img/);assert.doesNotMatch(guide,/<img|data-action="speech-settings"/);assert.match(guide,/Android 앱에서/);
});
async function kanaDom(fn){
 const names=['document','fetch','ResizeObserver','devicePixelRatio','requestAnimationFrame','cancelAnimationFrame','scrollTo','KotobaNative'],old=new Map(names.map(n=>[n,{present:Object.hasOwn(globalThis,n),value:globalThis[n]}]));
 let guide={dataset:{},innerHTML:'',isConnected:true,closest:()=>null};const ctx=new Proxy({},{get:()=>()=>{}}),canvas={dataset:{},getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:100,height:100}),addEventListener(){},removeEventListener(){}};
 globalThis.document={dispatchEvent(){},querySelector:q=>q==='#kana-speech-guide'?guide:q==='#kana-canvas'?canvas:null};
 globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.devicePixelRatio=1;globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};globalThis.scrollTo=()=>{};
 globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(url,'utf8'))});
 try{await loadStrokeBank();await fn(guide,()=>{const previous=guide;guide={...previous,dataset:{...previous.dataset}};previous.isConnected=false;return guide;});}finally{stopAudio();for(const[n,v]of old)v.present?globalThis[n]=v.value:delete globalThis[n];}
}
function kanaNative(onSpeech){
 const reply=(m,error='')=>globalThis.KotobaNative.onmessage({data:JSON.stringify({id:m.id,...(error?{error}:{result:{}})})});
 globalThis.KotobaNative={postMessage(raw){const m=JSON.parse(raw);if(m.type==='speechSpeak')onSpeech(m,reply);else queueMicrotask(()=>reply(m));}};installBridge();
}
test('kana failure keeps the shared settings guide through rerender, clearing only after completed retry',()=>kanaDom(async(guide,rerenderGuide)=>{
 const state=fresh();startKana(state.kana,'h-a');state.kana.session.autoPlayed=true;const toasts=[];let fail=true,pending;
 kanaNative((m,reply)=>fail?queueMicrotask(()=>reply(m,'일본어 음성 없음')):pending=()=>reply(m));
 const actions={save:()=>{},render:()=>{},toast:m=>toasts.push(m),go:()=>{}};
 let mounted=mountKana(state,actions);const before=JSON.stringify(state);
 await handleKanaAction('kana-listen',{},state,actions);
 assert.match(guide.innerHTML,/speech-error-guide/);assert.match(guide.innerHTML,/data-action="speech-settings"/);assert.deepEqual(toasts,['일본어 음성 없음']);
 assert.match(kanaPractice(state),/id="kana-speech-guide"><section class="speech-guide speech-error-guide/);
 assert.equal(JSON.stringify(state),before);
 fail=false;const retry=handleKanaAction('kana-listen',{},state,actions);assert.equal(typeof pending,'function');assert.match(guide.innerHTML,/speech-error-guide/);
 mounted.destroy();const currentGuide=rerenderGuide();mounted=mountKana(state,actions);pending();await retry;assert.equal(currentGuide.innerHTML,'');assert.doesNotMatch(kanaPractice(state),/speech-error-guide/);assert.equal(JSON.stringify(state),before);mounted.destroy();
}));
test('automatic kana failure keeps guidance, while a destroyed mount cannot report late audio errors',()=>kanaDom(async guide=>{
 const state=fresh();startKana(state.kana,'h-a');const toasts=[];let replySpeech,requests=0;
 kanaNative((m,reply)=>{requests++;replySpeech=message=>reply(m,message);});
 const hooks={save:()=>{},toast:m=>toasts.push(m)};const mounted=mountKana(state,hooks);
 await new Promise(resolve=>setTimeout(resolve,130));assert.equal(requests,1);replySpeech('일본어 자동 재생 실패');await new Promise(resolve=>setImmediate(resolve));
 assert.match(guide.innerHTML,/일본어 자동 재생 실패/);assert.match(kanaPractice(state),/speech-error-guide/);assert.equal(state.kana.session.autoPlayed,true);assert.deepEqual(state.kana.progress,{});
 mounted.destroy();state.kana.session.autoPlayed=false;const later=mountKana(state,hooks);await new Promise(resolve=>setTimeout(resolve,130));later.destroy();
 replySpeech('이미 떠난 화면의 오류');await new Promise(resolve=>setImmediate(resolve));assert.doesNotMatch(guide.innerHTML,/이미 떠난 화면/);assert.deepEqual(toasts,['일본어 자동 재생 실패']);
}));
test('a late kana playback error never attaches to the next letter or an inert modal background',()=>kanaDom(async(guide,rerenderGuide)=>{
 const state=fresh();startKana(state.kana,'h-a');state.kana.session.autoPlayed=true;const toasts=[];let fail;
 kanaNative((m,reply)=>{fail=()=>reply(m,'늦은 음성 오류');});const actions={save:()=>{},render:()=>{},toast:m=>toasts.push(m),go:()=>{}};
 let mounted=mountKana(state,actions);const first=handleKanaAction('kana-listen',{},state,actions);state.kana.session.index=1;fail();await first;
 assert.equal(guide.innerHTML,'');assert.doesNotMatch(kanaPractice(state),/늦은 음성 오류/);
 mounted.destroy();const currentGuide=rerenderGuide();mounted=mountKana(state,actions);const second=handleKanaAction('kana-listen',{},state,actions);currentGuide.closest=()=>({inert:true});fail();await second;assert.equal(currentGuide.innerHTML,'');assert.deepEqual(toasts,[]);mounted.destroy();
}));
test('kana pause cancellation during save leaves no installation guide on the still-active screen',()=>kanaDom(async guide=>{
 const state=fresh();startKana(state.kana,'h-a');state.kana.session.autoPlayed=true;const toasts=[];let complete;
 kanaNative((m,reply)=>{complete=()=>reply(m);});const hooks={save:()=>{},toast:m=>toasts.push(m)},mounted=mountKana(state,hooks);
 const before=JSON.stringify(state),playback=handleKanaAction('kana-listen',{},state,{...hooks,render:()=>{},go:()=>{}});
 // app.js kana-pause stops audio before its awaited save and before making the modal inert.
 stopAudio();let finishSave;const save=new Promise(resolve=>{finishSave=resolve;});assert.equal(guide.isConnected,true);assert.equal(guide.closest('[inert]'),null);
 complete();await playback;assert.equal(guide.innerHTML,'');assert.doesNotMatch(kanaPractice(state),/speech-error-guide/);assert.deepEqual(toasts,[]);assert.equal(JSON.stringify(state),before);
 finishSave();await save;mounted.destroy();
}));
test('kana pause ignores a late native missing-voice rejection after stopAudio during save',()=>kanaDom(async guide=>{
 const state=fresh();startKana(state.kana,'h-a');state.kana.session.autoPlayed=true;const toasts=[];let rejectSpeech;
 kanaNative((m,reply)=>{rejectSpeech=()=>reply(m,'설치된 오프라인 일본어 음성이 없어요.');});const hooks={save:()=>{},toast:m=>toasts.push(m)},mounted=mountKana(state,hooks);
 const before=JSON.stringify(state),actions={...hooks,render:()=>{},go:()=>{}},playback=handleKanaAction('kana-listen',{},state,actions);
 stopAudio();let finishSave;const save=new Promise(resolve=>{finishSave=resolve;});assert.equal(guide.isConnected,true);assert.equal(guide.closest('[inert]'),null);
 // Unlike the fulfilled completion case, this native rejection originally bypassed generation cancellation.
 rejectSpeech();await playback;assert.equal(guide.innerHTML,'');assert.doesNotMatch(kanaPractice(state),/speech-error-guide/);assert.deepEqual(toasts,[]);assert.equal(JSON.stringify(state),before);
 finishSave();await save;
 const current=handleKanaAction('kana-listen',{},state,actions);rejectSpeech();await current;assert.match(guide.innerHTML,/설치된 오프라인 일본어 음성/);assert.deepEqual(toasts,['설치된 오프라인 일본어 음성이 없어요.']);mounted.destroy();
}));
test('kana next native cancellation during save does not persist an installation error for the same letter',()=>kanaDom(async guide=>{
 const state=fresh();startKana(state.kana,'h-a');state.kana.session.autoPlayed=true;const toasts=[];let cancel,finishSave;
 kanaNative((m,reply)=>{cancel=()=>reply(m,'재생이 중단되었어요.');});const mounted=mountKana(state,{save:()=>{},toast:m=>toasts.push(m)});
 state.kana.session.strokes=structuredClone(characterStrokes('あ'));
 const playback=handleKanaAction('kana-listen',{},state,{save:()=>{},render:()=>{},toast:m=>toasts.push(m),go:()=>{}});
 const next=handleKanaAction('kana-next',{},state,{save:()=>new Promise(resolve=>{finishSave=resolve;}),render:()=>{},toast:m=>toasts.push(m),go:()=>{}});
 assert.equal(state.kana.session.index,0);assert.equal(state.kana.session.stage,1);assert.equal(guide.closest('[inert]'),null);
 cancel();await playback;assert.equal(guide.innerHTML,'');assert.doesNotMatch(kanaPractice(state),/speech-error-guide/);assert.deepEqual(toasts,[]);assert.deepEqual(state.kana.progress,{});
 finishSave();await next;mounted.destroy();
}));
test('same-letter rerender during automatic speech retains a genuine late voice error on the active guide',async()=>{
 for(const action of ['kana-undo','kana-clear','kana-hint','kana-answer'])await kanaDom(async(guide,rerenderGuide)=>{
  const state=fresh();startKana(state.kana,'h-a');const toasts=[];let rejectSpeech,requests=0,currentGuide=guide;
  kanaNative((m,reply)=>{requests++;rejectSpeech=()=>reply(m,'설치된 오프라인 일본어 음성이 없어요.');});const hooks={save:()=>{},toast:m=>toasts.push(m)};let mounted=mountKana(state,hooks);
  await new Promise(resolve=>setTimeout(resolve,130));assert.equal(requests,1);
  await handleKanaAction(action,{},state,{...hooks,go:()=>{},render:()=>{mounted.destroy();currentGuide=rerenderGuide();mounted=mountKana(state,hooks);}});
  const before=JSON.stringify(state);rejectSpeech();await new Promise(resolve=>setImmediate(resolve));
  assert.match(currentGuide.innerHTML,/설치된 오프라인 일본어 음성/,action);assert.match(currentGuide.innerHTML,/data-action="speech-settings"/,action);assert.match(kanaPractice(state),/speech-error-guide/,action);
  assert.equal(guide.isConnected,false);assert.equal(guide.innerHTML,'');assert.equal(state.kana.session.autoPlayed,true);assert.equal(requests,1);assert.equal(JSON.stringify(state),before);
  assert.equal(toasts.filter(m=>m==='설치된 오프라인 일본어 음성이 없어요.').length,1);mounted.destroy();
 });
});
test('superseded kana requests and replaced sessions cannot attach old errors to a current guide',()=>kanaDom(async(guide,rerenderGuide)=>{
 const state=fresh();startKana(state.kana,'h-a');state.kana.session.autoPlayed=true;const toasts=[],replies=[];
 kanaNative((m,reply)=>replies.push(message=>reply(m,message)));const actions={save:()=>{},render:()=>{},toast:m=>toasts.push(m),go:()=>{}};let mounted=mountKana(state,actions);
 const first=handleKanaAction('kana-listen',{},state,actions),latest=handleKanaAction('kana-listen',{},state,actions);
 replies[0]('이전 요청 오류');await first;assert.equal(guide.innerHTML,'');
 replies[1]('현재 요청 음성 없음');await latest;assert.match(guide.innerHTML,/현재 요청 음성 없음/);assert.doesNotMatch(guide.innerHTML,/이전 요청 오류/);
 const oldSession=handleKanaAction('kana-listen',{},state,actions);startKana(state.kana,'h-a');state.kana.session.autoPlayed=true;mounted.destroy();const currentGuide=rerenderGuide();currentGuide.innerHTML='';currentGuide.dataset={};mounted=mountKana(state,actions);
 replies[2]('이전 세션 오류');await oldSession;assert.equal(currentGuide.innerHTML,'');assert.doesNotMatch(kanaPractice(state),/speech-error-guide/);assert.deepEqual(toasts,['현재 요청 음성 없음']);mounted.destroy();
}));
test('no microphone permission; Android still declares the system TTS query',()=>{const m=read('../../kotoba-android/app/src/main/AndroidManifest.xml');assert.doesNotMatch(m,/RECORD_AUDIO/);assert.match(m,/TTS_SERVICE/);});
