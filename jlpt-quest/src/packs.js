import {LEVELS,STARTERS,EXPECTED,SOURCE_REV,validateStoredPack} from './catalog.js';
import {loadPack,savePack} from './storage.js';
export const packs=new Map();
export function catalog(){return LEVELS.flatMap(level=>packs.get(level)?.words||STARTERS.filter(w=>w.level===level));}
export async function initializePacks(){
 for(const level of LEVELS){
  let bundled=null,cached=null;
  try{const r=await fetch(new URL(`../data/${level}.json`,import.meta.url));if(!r.ok)throw Error('bundled pack missing');bundled=validateStoredPack(await r.json());if(!bundled.complete||bundled.words.some(w=>w.language!=='ko'))throw Error(`${level} 한국어 단어팩이 완전하지 않습니다.`);}catch(e){throw new Error(`${level} 내장 한국어 단어팩을 읽지 못했어요. 앱을 다시 설치해 주세요.`);}
  try{const value=await loadPack(level);if(value)cached=validateStoredPack(value);}catch{}
  // Never let an older English cache override the bundled Korean pack.
  if(cached?.sourceRevision===SOURCE_REV&&cached.complete&&cached.words.every(w=>w.language==='ko')&&cached.words.length===bundled.words.length)packs.set(level,cached);
  else {packs.set(level,bundled);try{await savePack(bundled);}catch{}}
 }
}
export async function installPack(level){
 if(!LEVELS.includes(level))throw new Error('급수를 확인해 주세요.');
 const pack=packs.get(level);if(!pack)throw new Error('내장 단어팩을 읽지 못했어요.');
 return pack;
}
export const packInfo=level=>({installed:packs.get(level)?.words.length||STARTERS.filter(w=>w.level===level).length,available:EXPECTED[level],complete:packs.get(level)?.complete===true,english:0,korean:packs.get(level)?.words.length||0,revision:SOURCE_REV});
