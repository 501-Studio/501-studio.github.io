// Device Japanese TTS only. Never fetch or fall back to pre-generated audio.
import {isNative,callNative} from './native.js';
let generation=0,cancelPending=null,nativeSpeaking=false,browserSpeaking=false;
export function configureAudio(){} // Older settings are intentionally ignored.
const cancelled=()=>new Error('재생이 중단되었습니다.');
export function stopAudio(){
 generation++;
 const stop=cancelPending;cancelPending=null;stop?.();
 if(browserSpeaking){browserSpeaking=false;globalThis.speechSynthesis?.cancel();}
 if(nativeSpeaking){nativeSpeaking=false;callNative('speechStop',{},5000).catch(()=>{});}
}
async function japaneseVoice(mine){
 const synth=globalThis.speechSynthesis;
 if(!synth||typeof globalThis.SpeechSynthesisUtterance!=='function')throw new Error('일본어 음성을 사용할 수 없습니다. 기기 음성 설정을 확인하세요.');
 let voices=synth.getVoices();
 if(!voices.length)await new Promise(resolve=>{
  let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);synth.removeEventListener?.('voiceschanged',finish);if(cancelPending===finish)cancelPending=null;resolve();};
  const timer=setTimeout(finish,1200);cancelPending=finish;synth.addEventListener?.('voiceschanged',finish,{once:true});
 });
 if(mine!==generation)throw cancelled();
 voices=synth.getVoices();
 const voice=voices.find(v=>/^ja(?:-|_|$)/i.test(v.lang)&&v.localService===true);
 if(!voice)throw new Error('기기에 일본어 오프라인 음성이 없습니다. 음성 설정에서 일본어를 설치하세요.');
 return {synth,voice};
}
export async function hasSpeech(){
 if(isNative())return false; // Availability is confirmed by actual playback, not assumed.
 return !!globalThis.speechSynthesis?.getVoices().some(v=>/^ja(?:-|_|$)/i.test(v.lang)&&v.localService===true);
}
async function playText(text,rate,onStart=()=>{}){
 if(typeof text!=='string'||!text.trim()||text.length>500)throw new Error('읽을 일본어 문장이 없습니다.');
 stopAudio();const mine=generation;rate=Math.max(.5,Math.min(1.2,Number(rate)||1));
 if(isNative()){
  nativeSpeaking=true;
  try{await callNative('speechSpeak',{text,rate},95000);if(mine!==generation)throw cancelled();return true;}
  finally{if(mine===generation)nativeSpeaking=false;}
 }
 const {synth,voice}=await japaneseVoice(mine);
 if(mine!==generation)throw cancelled();
 const u=new SpeechSynthesisUtterance(text);u.voice=voice;u.lang='ja-JP';u.rate=rate;browserSpeaking=true;
 return new Promise((resolve,reject)=>{
  let done=false;
  const timer=setTimeout(()=>finish(new Error('음성 재생 시간이 초과되었습니다. 다시 시도하세요.')),90000);
  function finish(error){
   if(done)return;done=true;clearTimeout(timer);u.onstart=u.onend=u.onerror=null;
   if(mine===generation){cancelPending=null;browserSpeaking=false;}
   if(error){try{synth.cancel();}catch{}reject(error);}else resolve(true);
  }
  cancelPending=()=>finish(cancelled());u.onstart=onStart;u.onend=()=>finish();
  u.onerror=()=>finish(new Error('일본어 음성을 재생하지 못했습니다. 기기 음성 설정을 확인하세요.'));
  try{synth.speak(u);}catch{finish(new Error('음성을 재생하지 못했습니다. 다시 시도하세요.'));}
 });
}
export function speak(wordId,rate=1,{text='',onStart=()=>{}}={}){
 // IDs are not pronunciations: callers must provide the actual kana/text.
 return playText(text,rate,onStart);
}
export function speakSentence(text,rate=1){return playText(text,rate);}
