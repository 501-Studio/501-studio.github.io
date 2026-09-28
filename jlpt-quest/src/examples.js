import {esc,btn,icon} from './view.js';
let byWord=new Map(),byId=new Map();
/** Replace, do not append, when reloading packs. Publish maps only after validation. */
export async function loadExamples(){
 const nextWords=new Map(),nextIds=new Map();
 for(const file of ['examples.json','examples-expanded.json']){
  const response=await fetch(new URL('../data/'+file,import.meta.url));
  if(!response.ok)throw new Error('예문 자료를 읽지 못했어요.');
  const pack=await response.json();
  if(pack.version!==1||!Array.isArray(pack.entries))throw new Error('예문 형식이 맞지 않아요.');
  for(const e of pack.entries){
   if(typeof e.id!=='string'||typeof e.ja!=='string'||!e.ja.trim()||e.ja.length>500||typeof e.ko!=='string'||!e.ko.trim())throw new Error('예문 또는 번역 내용이 누락됐어요.');
   const add=(map,key)=>{if(!map.has(key))map.set(key,[]);if(!map.get(key).some(old=>old.ja===e.ja&&old.ko===e.ko))map.get(key).push(e);};
   for(const id of e.wordIds||[])if(/^N[1-5]-[a-z0-9]+$/.test(id))add(nextIds,id);
   for(const word of e.targets||[])if(typeof word==='string')add(nextWords,word);
  }
 }
 byWord=nextWords;byId=nextIds;
}
export function examplesFor(w){
 if(!w)return [];
 const specific=byId.get(w.id)||[],legacy=byWord.get(w.word)||[];
 const merged=[...specific,...legacy];return merged.filter((e,i)=>merged.findIndex(x=>x.ja===e.ja)===i);
}
export const exampleButton=w=>btn('examples',icon('book')+' 예문 보기','text example-button',`data-id="${esc(w.id)}" ${examplesFor(w).length?'':'disabled'}`);
export function exampleBody(w,showReading=true,index=0,{headword=true}={}){
 const list=examplesFor(w),i=Number.isInteger(index)?Math.max(0,Math.min(index,list.length-1)):0,e=list[i];
 const title=headword?`<div class="example-headword" lang="ja">${esc(w.word)}${showReading&&w.reading&&w.reading!==w.word?`<small lang="ja">(${esc(w.reading)})</small>`:''}</div>`:'';
 if(!e)return `${title}<p class="example-empty">이 단어의 예문을 준비하고 있어요.</p>`;
 const data=`data-id="${esc(w.id||'')}" data-index="${i}"`;
 const sourceUrl=/^\d+$/.test(e.sourceId||'')?`https://tatoeba.org/en/sentences/show/${e.sourceId}`:'';
 const source=sourceUrl?`<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">Tatoeba 예문 · 출처</a>`:'코토바 작성 예문';
 const note=(e.translationReview==='machine-draft'?' · 한국어 자동번역 초안':'')+(showReading&&e.readingReview?.startsWith('automated-')?' · 읽기 자동 생성':'')+(e.exampleReview==='assistant-adapted'?' · 예문 수정':'');
 // Never present unreviewed machine translation as a verified learning answer.
 const translation=e.translationReview==='machine-draft'?`<details class="example-translation-draft"><summary>한국어 번역 초안 보기 · 오역 주의</summary><p class="example-ko">${esc(e.ko)}</p></details>`:`<p class="example-ko">${esc(e.ko)}</p>`;
 return `${title}<section class="example-pane" aria-label="예문"><div class="example-nav"><b>문장 속에서 기억해요</b><span>${i+1} / ${list.length}</span></div><article class="example-card"><p lang="ja" class="example-ja">${esc(e.ja)}</p>${showReading&&e.reading?`<p class="example-reading" lang="ja">${esc(e.reading)}</p>`:''}${translation}</article><div class="example-controls">${btn('example-audio',icon('sound')+' 예문 듣기','soft',data)}${btn('example-audio','0.7×','soft',`${data} data-slow="true" aria-label="예문 천천히 듣기"`)}${btn('example-stop','정지','text','aria-label="예문 재생 정지"')}</div><p class="example-audio-status" role="status" aria-live="polite"></p>${list.length>1?`<div class="example-pages">${btn('example-page','이전 예문','text',`data-id="${esc(w.id||'')}" data-index="${i-1}" ${i===0?'disabled':''}`)}${btn('example-page','다음 예문','text',`data-id="${esc(w.id||'')}" data-index="${i+1}" ${i===list.length-1?'disabled':''}`)}</div>`:''}<p class="example-source">${source}${note}</p></section>`;
}
