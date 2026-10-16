// APK/PWA-local pronunciation audio. The Android build bundles every clip.
let current=null,manifestPromise=null,cancelPending=null;
const manifestUrl=new URL('../data/audio-manifest.json',import.meta.url);
async function manifest(){
 if(!manifestPromise)manifestPromise=fetch(manifestUrl).then(r=>{if(!r.ok)throw new Error('오프라인 음성 목록을 읽지 못했어요.');return r.json();}).then(m=>{if(!m.complete||!m.clips)throw new Error('오프라인 음성팩이 완전하지 않아요.');return m;});
 return manifestPromise;
}
export async function hasSpeech(wordId){try{const m=await manifest();return !!m.clips[wordId];}catch{return false;}}
export function stopAudio(){
 if(cancelPending){const fn=cancelPending;cancelPending=null;fn();}
 if(current){try{current.pause();current.currentTime=0;}catch{}current=null;}
}
export async function speak(wordId,rate=.85,{onStart=()=>{}}={}){
 stopAudio();
 const m=await manifest(),file=m.clips[wordId];
 if(!file)throw new Error('이 단어의 오프라인 음성이 누락됐어요. 앱을 업데이트해 주세요.');
 const audio=new Audio(new URL('../data/audio/'+file,import.meta.url));
 current=audio;audio.preload='auto';audio.playbackRate=Math.max(.5,Math.min(1.2,rate));audio.defaultPlaybackRate=audio.playbackRate;
 return new Promise((resolve,reject)=>{
  let done=false;
  const finish=error=>{if(done)return;done=true;audio.onended=audio.onerror=audio.onplaying=null;if(current===audio){current=null;cancelPending=null;}error?reject(error):resolve(true);};
  cancelPending=()=>finish(new Error('재생이 중단되었어요.'));
  audio.onplaying=()=>onStart();
  audio.onended=()=>finish();
  audio.onerror=()=>finish(new Error('내장 발음 파일을 재생하지 못했어요. 앱 파일을 다시 설치해 주세요.'));
  const promise=audio.play();
  if(promise?.catch)promise.catch(()=>finish(new Error('자동 재생이 차단됐어요. 듣기 버튼을 눌러 주세요.')));
 });
}
