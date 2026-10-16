import {STARTER_ROWS} from '../data/starter.js';
export const LEVELS=['N5','N4','N3','N2','N1'];
export const EXPECTED={N5:662,N4:632,N3:1784,N2:1793,N1:3463};
export const CHAPTER_SIZE=30;
export const SOURCE_REV='c42fd9fa3777bfc1775446f7c418d549dfd6e4cf';
export const SOURCE_BASE=`https://raw.githubusercontent.com/evanclan/OpenJLPT/${SOURCE_REV}/data/json/vocab/`;
export const TITLES={N5:'기초 한자와 일상',N4:'일상에서 한 걸음 더',N3:'생각과 경험을 표현하기',N2:'사회와 논리를 읽기',N1:'정교한 개념과 표현'};
export const UNIT_TITLES={N5:['자연에서 시작하는 한자','학교에서 만나는 단어','하늘과 날씨','하루의 시간','읽고 쓰고 듣기','매일 하는 행동','우리 동네','가족 이야기','크기와 새로움','가격과 색깔','공부하는 하루','살아 있는 것들'],N4:['묻고 약속하기','배움을 준비하기','경험과 가치','연락과 일정','기억과 시작','스스로 고르기','함께하는 행동','몸과 건강','여행과 이동','문화와 생활','의견과 이유','가능성과 미래'],N3:['이유와 결과','상황과 방법','지식과 기술','노력과 변화','참여와 책임','사회 이해','자연과 자원','건강한 생활','마음의 표현','생각을 전하기','계획과 해결','구체적으로 표현하기'],N2:['판단의 시작','문제의 기준','자료를 분석하기','논리의 기초','기업과 시장','계약과 비용','운영과 개선','효과와 구조','변화를 관찰하기','주장과 비판','신중한 태도','행동을 다듬기'],N1:['개념을 정교하게','관찰과 인식','사건의 맥락','실천과 억제','상황을 조정하기','관계와 기여','정밀한 표현','크기와 영향','판단의 정확성','사회의 규범','이어지고 쌓이는 것','깊이 있는 동사']};
export function hash(text){let h=2166136261;for(const c of text){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
export function idFor(level,word,reading){return `${level}-${hash(word+'|'+reading)}`;}
export function hiragana(text){return String(text).normalize('NFKC').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));}
export function canonical(raw){const parts=String(raw).normalize('NFKC').split(/[\/／;,、]/).map(x=>x.replace(/\([^)]*\)|（[^）]*）/g,'').trim()).filter(Boolean);return parts.find(x=>/\p{Script=Han}/u.test(x))||parts[0]||'';}
export function makeWord(level,word,reading,meaning,extra={}){const form=canonical(word),r=canonical(reading)||(/\p{Script=Han}/u.test(form)?'':hiragana(form));return {id:idFor(level,form,r),level,word:form,reading:r,meaning,language:'ko',source:'kotoba-editorial',...extra};}
export const STARTERS=STARTER_ROWS.map(([l,w,r,m])=>makeWord(l,w,r,m));
const glossary=new Map(STARTERS.map(w=>[w.word+'|'+w.reading,w.meaning]));
export function parsePack(rows,level,{strict=true}={}){
 if(!LEVELS.includes(level)||!Array.isArray(rows)||rows.length>16000||rows.length<4)throw new Error('단어팩 형식이 올바르지 않습니다.');
 const map=new Map(),quarantine=[];let merged=0;
 for(const raw of rows){
  if(!raw||typeof raw.word!=='string'||raw.level!==level||typeof(raw.reading||'')!=='string'||!Array.isArray(raw.meanings)||!raw.meanings.some(x=>typeof x==='string'&&x.trim())){quarantine.push(raw?.word||'?');continue;}
  const form=canonical(raw.word),r=hiragana(canonical(raw.reading||'')||(/\p{Script=Han}/u.test(form)?'':form));
  if(!form||form.length>60){quarantine.push(raw.word);continue;}
  const ko=glossary.get(form+'|'+r);const sourceMeanings=raw.meanings.filter(x=>typeof x==='string'&&x.trim());
  const w=makeWord(level,form,r,ko||sourceMeanings.join('; '),{language:ko?'ko':'en',source:'openjlpt',sourceRevision:SOURCE_REV,rawWords:[raw.word],sourceMeanings});
  if(!writingChars(w).length||w.meaning.length>4000){quarantine.push(raw.word);continue;}
  if(map.has(w.id)){const prior=map.get(w.id);if(prior.word!==w.word||prior.reading!==w.reading)throw new Error('단어 ID 충돌: 콘텐츠를 확인해야 합니다.');prior.rawWords.push(raw.word);prior.sourceMeanings=[...new Set([...prior.sourceMeanings,...sourceMeanings])];if(prior.language==='en')prior.meaning=prior.sourceMeanings.join('; ');merged++;}
  else map.set(w.id,w);
 }
 if(strict&&(rows.length!==EXPECTED[level]||quarantine.length))throw new Error(`${level} 원본 검증 실패: ${rows.length}항목, 검토 필요 ${quarantine.length}항목. 설치하지 않았습니다.`);
 // Preserve the original 12 Korean starter lessons and their stable progress IDs on full-pack installation.
 const starter=STARTERS.filter(w=>w.level===level);let supplemental=0;
 for(const w of starter){if(!map.has(w.id)){map.set(w.id,w);supplemental++;}}
 const priority=new Map(starter.map((w,i)=>[w.id,i]));const words=[...map.values()].sort((a,b)=>(priority.get(a.id)??10000)-(priority.get(b.id)??10000)||a.word.localeCompare(b.word,'ja')||a.reading.localeCompare(b.reading,'ja'));
 return {level,words,quarantine,merged,supplemental,sourceRows:rows.length,sourceRevision:SOURCE_REV,complete:rows.length===EXPECTED[level]&&!quarantine.length};
}
export function writingChars(word){const chars=[...word.word],kanji=chars.filter(c=>/\p{Script=Han}/u.test(c));return kanji.length?kanji:chars.filter(c=>/[\p{Script=Hiragana}\p{Script=Katakana}ー]/u.test(c));}
export function writingPattern(word){return /\p{Script=Han}/u.test(word.word)?word.word.replace(/\p{Script=Han}/gu,'□'):word.word.replace(/[\p{Script=Hiragana}\p{Script=Katakana}ー]/gu,'□');}
export function courses(words,level){
 const list=words.filter(w=>w.level===level);
 return Array.from({length:Math.ceil(list.length/CHAPTER_SIZE)},(_,i)=>{
  const start=i*CHAPTER_SIZE,chunk=list.slice(start,start+CHAPTER_SIZE);
  return {id:`${level}-chapter-${i+1}`,level,index:i+1,title:UNIT_TITLES[level]?.[i]||TITLES[level],startNo:start+1,endNo:start+chunk.length,wordIds:chunk.map(w=>w.id)};
 });
}
export function validateStoredPack(pack){if(!pack||!LEVELS.includes(pack.level)||!Array.isArray(pack.words)||pack.words.length>16000)throw new Error('저장된 단어팩이 손상되었습니다.');const ids=new Set();for(const w of pack.words){if(!w||typeof w.word!=='string'||!w.word||typeof w.reading!=='string'||typeof w.meaning!=='string'||w.meaning.length>4000||w.level!==pack.level||w.id!==idFor(w.level,w.word,w.reading)||ids.has(w.id))throw new Error('저장된 단어팩에 잘못된 항목이 있습니다.');ids.add(w.id);}return pack;}
