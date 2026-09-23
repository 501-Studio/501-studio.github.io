// Resolve only on complete playback, not merely on a start event. Audio stays user-initiated.
const synth=globalThis.speechSynthesis;let current=null,cancelPending=null;
export const voices=()=>synth?synth.getVoices().filter(v=>/^ja(?:[-_]|$)/i.test(v.lang)):[];
export const hasSpeech=()=>!!synth;
export function stopAudio(){if(cancelPending){const cancel=cancelPending;cancelPending=null;cancel();}synth?.cancel();current=null;}
export async function speak(text,rate=.9,{onStart=()=>{}}={}) {
 if(!synth)throw new Error('이 브라우저에서는 음성을 재생할 수 없어요. Chrome 또는 Safari에서 열어 주세요.');
 stopAudio();let list=voices();
 if(!list.length){await new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);synth.removeEventListener('voiceschanged',done);resolve();};synth.addEventListener('voiceschanged',done);timer=setTimeout(done,900);});list=voices();}
 if(!list.length)throw new Error('일본어 음성이 없어요. 기기 음성 설정에서 일본어를 추가한 뒤 다시 눌러 주세요.');
 return new Promise((resolve,reject)=>{const u=new SpeechSynthesisUtterance(text);current=u;u.lang='ja-JP';u.voice=list.find(v=>v.localService)||list[0];u.rate=rate;let ended=false;
 const done=error=>{if(ended)return;ended=true;clearTimeout(timer);if(current===u){current=null;cancelPending=null;}error?reject(error):resolve(true);};
 const timer=setTimeout(()=>{done(new Error('음성 재생을 완료하지 못했어요. 다시 재생하거나 기기 음성 설정을 확인해 주세요.'));synth.cancel();},15000);
 cancelPending=()=>done(new Error('재생이 중단되었어요.'));
 u.onstart=onStart;u.onend=()=>done();u.onerror=()=>done(new Error('음성 재생에 실패했어요. 기기의 일본어 음성과 볼륨을 확인해 주세요.'));synth.speak(u);
 });
}
