import {LEVELS,STARTERS,EXPECTED,SOURCE_BASE,SOURCE_REV,parsePack,validateStoredPack} from './catalog.js';
import {loadPack,savePack} from './storage.js';
export const packs=new Map();
export function catalog(){return LEVELS.flatMap(level=>packs.get(level)?.words||STARTERS.filter(w=>w.level===level));}
export async function initializePacks(){
 for(const level of LEVELS){let cached=null;
  try{const value=await loadPack(level);if(value)cached=validateStoredPack(value);if(cached?.complete&&cached.sourceRevision===SOURCE_REV){packs.set(level,cached);continue;}}catch{}
  try{const r=await fetch(new URL(`../data/${level}.json`,import.meta.url));if(r.ok){const p=validateStoredPack(await r.json());if(p.level!==level)throw Error('급수 불일치');packs.set(level,p);try{await savePack(p);}catch{}continue;}}catch{}
  packs.set(level,cached||{level,words:STARTERS.filter(w=>w.level===level),complete:false,source:'kotoba-editorial',sourceRows:60});
 }
}
export async function installPack(level,signal){
 if(!LEVELS.includes(level))throw new Error('급수를 확인해 주세요.');
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
 try{const response=await fetch(`${SOURCE_BASE}${level.toLowerCase()}.json`,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw new Error('단어팩을 내려받지 못했습니다.');
 const text=await response.text();if(text.length>8e6)throw new Error('단어팩 크기가 허용 범위를 넘었습니다.');
 const p=parsePack(JSON.parse(text),level);const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));p.sha256=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');p.installedAt=Date.now();
 await savePack(p);packs.set(level,p);return p;
 }catch(e){if(e.name==='AbortError')throw new Error('다운로드가 중단됐습니다. 기존 단어와 기록은 유지됩니다.');throw e;}
 finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
export const packInfo=level=>({installed:packs.get(level)?.words.length||60,available:EXPECTED[level],complete:packs.get(level)?.complete===true,english:packs.get(level)?.words.filter(w=>w.language==='en').length||0,revision:SOURCE_REV});
