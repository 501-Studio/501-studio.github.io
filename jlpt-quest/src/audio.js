// Japanese-only TTS. No fallback to a non-Japanese default voice, and no synthetic success on failure.
const synth=globalThis.speechSynthesis;
let utterance=null;
export function voices() {return synth?synth.getVoices().filter(v=>/^ja(?:[-_]|$)/i.test(v.lang)):[];}
export function stopAudio() {if(synth)synth.cancel();utterance=null;}
export function hasSpeech() {return !!synth;}
export async function speak(text,rate=0.9) {
  if(!synth)throw new Error('이 브라우저는 음성 재생을 지원하지 않아요. Chrome 또는 Safari에서 열어 주세요.');
  stopAudio();
  let list=voices();
  if(!list.length) {
    await new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);synth.removeEventListener('voiceschanged',done);resolve();};synth.addEventListener('voiceschanged',done);timer=setTimeout(done,900);});
    list=voices();
  }
  if(!list.length)throw new Error('일본어 음성을 찾지 못했어요. 기기 설정에서 일본어 음성을 설치하거나 다른 브라우저를 사용해 주세요.');
  return new Promise((resolve,reject)=>{
    utterance=new SpeechSynthesisUtterance(text);utterance.lang='ja-JP';utterance.voice=list.find(v=>v.localService)||list[0];utterance.rate=rate;
    const timer=setTimeout(()=>{stopAudio();reject(new Error('음성을 시작하지 못했어요. 재생 버튼을 다시 눌러 주세요.'));},5000);
    utterance.onstart=()=>{clearTimeout(timer);resolve(true);};
    utterance.onerror=e=>{clearTimeout(timer);if(!['canceled','interrupted'].includes(e.error))reject(new Error('음성 재생이 실패했어요. 음성 설정과 네트워크를 확인해 주세요.'));else reject(new Error('재생이 취소되었어요.'));};
    synth.speak(utterance);
  });
}
