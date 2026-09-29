import {isNative,callNative} from './native.js';
import {examplesFor} from './examples.js';
if(typeof document!=='undefined')document.addEventListener('kotoba-single-speech',()=>{if(playing&&!isNative()){stopBrowser();error='단어 재생으로 연속 듣기를 일시정지했습니다.';}});
let entries=[],index=0,part=0,playing=false,error='',generation=0,current=null,options={},speechTimer=null;
export function makePlaylist(words,ids,settings={}){const map=new Map(words.map(w=>[w.id,w]));return ids.slice(0,200).map(id=>map.get(id)).filter(Boolean).map(w=>({wordId:w.id,word:w.word,reading:w.reading||w.word,meaning:w.meaning.slice(0,500),example:(examplesFor(w)[0]?.speechText||examplesFor(w)[0]?.ja||'').slice(0,500)}));}
export async function startPlaylist(words,ids,settings={}){
 const list=makePlaylist(words,ids,settings);if(!list.length)throw new Error('재생할 단어를 선택하세요.');
 if(isNative())return callNative('playlistStart',{entries:list,rate:settings.rate||1,includeMeaning:settings.includeMeaning!==false,includeExample:settings.includeExample!==false,repeat:settings.repeat===true,index:settings.index||0});
 stopBrowser();entries=list;options=settings;index=Math.max(0,Math.min(entries.length-1,settings.index||0));part=0;error='';
 const synth=globalThis.speechSynthesis;if(!synth)throw new Error('이 브라우저는 음성 재생을 지원하지 않습니다.');
 // Some engines publish installed voices asynchronously.
 if(!synth.getVoices().length)await new Promise(r=>setTimeout(r,1000));
 const voices=synth.getVoices().filter(v=>v.localService);
 if(!voices.some(v=>/^ja[-_]?/i.test(v.lang)))throw new Error('기기에 일본어 오프라인 음성을 설치하세요.');
 if(settings.includeMeaning!==false&&!voices.some(v=>/^ko[-_]?/i.test(v.lang)))throw new Error('한국어 음성이 없습니다. 뜻 듣기를 끄거나 한국어 음성을 설치하세요.');
 playing=true;run(generation);return playlistStatus();
}
function parts(){const e=entries[index];if(!e)return [];return [{text:e.reading,lang:'ja-JP'},...(options.includeMeaning!==false?[{text:e.meaning,lang:'ko-KR'}]:[]),...(options.includeExample!==false&&e.example?[{text:e.example,lang:'ja-JP'}]:[])];}
function run(token){
 if(token!==generation||!playing)return;const step=parts()[part];if(!step){part=0;index++;if(index>=entries.length){if(options.repeat)index=0;else {playing=false;index=entries.length-1;return;}}setTimeout(()=>run(token),600);return;}
 const u=new SpeechSynthesisUtterance(step.text);current=u;u.lang=step.lang;u.rate=options.rate||1;u.voice=speechSynthesis.getVoices().find(v=>v.localService&&v.lang.slice(0,2)===step.lang.slice(0,2));
 if(!u.voice){error='기기 음성을 사용할 수 없습니다.';playing=false;return;}
 const timeout=speechTimer=setTimeout(()=>{if(token===generation){error='음성 엔진의 응답 시간이 초과되었습니다.';stopBrowser();}},90000);
 u.onend=()=>{clearTimeout(timeout);if(token===generation){part++;run(token);}};
 u.onerror=()=>{clearTimeout(timeout);if(token===generation){stopBrowser();error='재생이 중단되었습니다. 다시 재생을 누르세요.';}};
 u.onstart=()=>{if('mediaSession'in navigator&&typeof MediaMetadata==='function'){navigator.mediaSession.metadata=new MediaMetadata({title:entries[index].word,artist:'코토바 연속 듣기'});}};
 speechSynthesis.speak(u);
 if('mediaSession'in navigator)for(const [name,action]of [['play','play'],['pause','pause'],['previoustrack','prev'],['nexttrack','next'],['stop','stop']])try{navigator.mediaSession.setActionHandler(name,()=>playlistAction(action));}catch{}
}
function stopBrowser(){clearTimeout(speechTimer);generation++;playing=false;if(current){current.onend=current.onerror=null;current=null;}globalThis.speechSynthesis?.cancel();}
export async function playlistAction(action){
 if(isNative())return callNative('playlistControl',{action});
 stopBrowser();if(action==='stop'){index=0;part=0;}else if(action==='pause'){}else{if(action==='next'){index=Math.min(entries.length-1,index+1);part=0;}if(action==='prev'){index=Math.max(0,index-1);part=0;}if(entries.length){playing=true;error='';run(generation);}}
 return playlistStatus();
}
export async function playlistStatus(){if(isNative())return callNative('playlistStatus');return {playing,index,total:entries.length,word:entries[index]?.word||'',part,error};}
if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(document.hidden&&!isNative()&&playing){stopBrowser();error='브라우저가 백그라운드로 이동하여 일시정지했습니다. 화면을 끄고 들으려면 Android 앱을 사용하세요.';}});
