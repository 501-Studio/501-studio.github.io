import {LEVELS,STARTERS,EXPECTED,SOURCE_REV,validateStoredPack} from './catalog.js';
import {loadPack,savePack} from './storage.js';
export const packs=new Map();
export function catalog(){return LEVELS.flatMap(level=>packs.get(level)?.words||STARTERS.filter(w=>w.level===level));}
export async function initializePacks(){
 for(const level of LEVELS){
  const response=await fetch(new URL(`../data/${level}.json`,import.meta.url));
  if(!response.ok)throw new Error(`${level} 단어를 불러오지 못했어요.`);
  const pack=validateStoredPack(await response.json());
  if(!pack.complete||pack.words.some(w=>w.language!=='ko'))throw new Error(`${level} 단어를 확인해 주세요.`);
  packs.set(level,pack);
 }
}
export async function installPack(level){
 if(!LEVELS.includes(level))throw new Error('급수를 확인해 주세요.');
 const pack=packs.get(level);if(!pack)throw new Error('내장 단어팩을 읽지 못했어요.');
 return pack;
}
export const packInfo=level=>({installed:packs.get(level)?.words.length||STARTERS.filter(w=>w.level===level).length,available:EXPECTED[level],complete:packs.get(level)?.complete===true,english:0,korean:packs.get(level)?.words.length||0,revision:SOURCE_REV});
