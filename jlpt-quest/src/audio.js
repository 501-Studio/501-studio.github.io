// Pronunciation is generated at build time and bundled. No network TTS endpoint.
import {isNative,callNative} from './native.js';
let current=null,manifestPromise=null,cancelPending=null,generation=0,nativeSpeaking=false,browserSpeaking=false,engine='bundled';
export function configureAudio(settings){engine=settings?.audioEngine==='device'?'device':'bundled';}
const manifestUrl=new URL('../data/audio-manifest.json',import.meta.url);
async function manifest(){
 if(!manifestPromise)manifestPromise=fetch(manifestUrl).then(r=>{if(!r.ok)throw new Error('오프라인 음성 목록을 읽지 못했어요.');return r.json();}).then(m=>{if(!m.complete||!m.clips)throw new Error('오프라인 음성팩이 완전하지 않아요.');return m;}).catch(e=>{manifestPromise=null;throw e;});return manifestPromise;
}
export async function hasSpeech(wordId){try{return !!(await manifest()).clips[wordId];}catch{return false;}}
export function stopAudio(){generation++;if(cancelPending){const fn=cancelPending;cancelPending=null;fn();}if(current){try{current.pause();current.currentTime=0;}catch{}current=null;}if(browserSpeaking){browserSpeaking=false;globalThis.speechSynthesis?.cancel();}if(nativeSpeaking){nativeSpeaking=false;callNative('speechStop',{},5000).catch(()=>{});}}
export async function speak(wordId,rate=1,{onStart=()=>{},text='',onFallback=()=>{}}={}){
 stopAudio();const mine=generation;rate=Math.max(.5,Math.min(1.2,rate));
 if(engine==='device'&&isNative()&&text){nativeSpeaking=true;try{await callNative('speechSpeak',{text,rate},35000);if(mine!==generation)throw new Error('재생이 중단되었어요.');onStart();return true;}catch(e){if(mine!==generation)throw new Error('재생이 중단되었어요.');onFallback('기기 일본어 음성이 없어 내장 음성으로 재생해요.');}finally{if(mine===generation)nativeSpeaking=false;}}
 const m=await manifest();if(mine!==generation)throw new Error('재생이 중단되었어요.');const file=m.clips[wordId];
 if(!file||!/^[a-zA-Z0-9_-]+\.ogg$/.test(file))throw new Error('이 글자의 오프라인 음성이 누락됐어요. 앱을 업데이트해 주세요.');
 const audio=new Audio(new URL('../data/audio/'+file,import.meta.url));current=audio;audio.preload='auto';audio.playbackRate=rate;audio.defaultPlaybackRate=rate;audio.preservesPitch=true;
 return new Promise((resolve,reject)=>{let done=false;const timer=setTimeout(()=>finish(new Error('음성을 재생하지 못했어요. 다시 눌러 주세요.')),30000);
 const finish=error=>{if(done)return;done=true;clearTimeout(timer);audio.onended=audio.onerror=audio.onplaying=null;if(current===audio){current=null;cancelPending=null;}if(error){try{audio.pause();}catch{}}error?reject(error):resolve(true);};
 cancelPending=()=>finish(new Error('재생이 중단되었어요.'));audio.onplaying=()=>onStart();audio.onended=()=>finish();audio.onerror=()=>finish(new Error('내장 발음 파일을 재생하지 못했어요.'));const p=audio.play();if(p?.catch)p.catch(()=>finish(new Error('듣기 버튼을 눌러 재생해 주세요.')));
 });
}

/** Full-sentence listening. Only installed Japanese voices; never substitute word audio. */
export async function speakSentence(text,rate=1){
 if(typeof text!=='string'||!text.trim()||text.length>500)throw new Error('예문 내용을 확인해 주세요.');
 stopAudio();const mine=generation;rate=Math.max(.5,Math.min(1.2,Number(rate)||1));
 if(isNative()){
  nativeSpeaking=true;
  try{await callNative('speechSpeak',{text,rate},95000);if(mine!==generation)throw new Error('재생이 중단되었어요.');return true;}
  finally{if(mine===generation)nativeSpeaking=false;}
 }
 const synth=globalThis.speechSynthesis;
 if(!synth||typeof globalThis.SpeechSynthesisUtterance!=='function')throw new Error('이 브라우저는 예문 듣기를 지원하지 않아요. 일본어 음성이 설치된 Android 앱에서 이용해 주세요.');
 let voices=synth.getVoices();
 if(!voices.length){
  await new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);synth.removeEventListener?.('voiceschanged',finish);resolve();};const timer=setTimeout(finish,800);synth.addEventListener?.('voiceschanged',finish,{once:true});});
  voices=synth.getVoices();
 }
 if(mine!==generation)throw new Error('재생이 중단되었어요.');
 const voice=voices.find(v=>/^ja(?:-|_|$)/i.test(v.lang)&&v.localService===true);
 if(!voice)throw new Error('설치된 오프라인 일본어 음성이 없어요. 기기에 일본어 TTS 음성을 추가해 주세요.');
 const utterance=new SpeechSynthesisUtterance(text);utterance.voice=voice;utterance.lang='ja-JP';utterance.rate=rate;
 browserSpeaking=true;
 return new Promise((resolve,reject)=>{
  let done=false;const timer=setTimeout(()=>finish(new Error('예문 재생 시간이 초과됐어요. 다시 눌러 주세요.')),90000);
  function finish(error){
   if(done)return;done=true;clearTimeout(timer);utterance.onend=utterance.onerror=null;
   if(mine===generation){cancelPending=null;browserSpeaking=false;}
   if(error){try{synth.cancel();}catch{}reject(error);}else resolve(true);
  }
  cancelPending=()=>finish(new Error('재생이 중단되었어요.'));
  utterance.onend=()=>finish();utterance.onerror=()=>finish(new Error('예문을 읽지 못했어요. 기기의 일본어 음성을 확인해 주세요.'));
  try{synth.speak(utterance);}catch{finish(new Error('예문을 읽지 못했어요. 다시 눌러 주세요.'));}
 });
}
