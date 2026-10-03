import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {LEVELS,EXPECTED,STARTERS,SOURCE_REV,validateStoredPack,courses,parsePack,writingChars,CHAPTER_SIZE} from '../src/catalog.js';
import {fresh,createClass,classifySurvey,validateState,current} from '../src/course-engine.js';
const loaded=[];for(const l of LEVELS){try{loaded.push(validateStoredPack(JSON.parse(await readFile(new URL(`../data/${l}.json`,import.meta.url),'utf8'))));}catch{}}
const available=loaded.length===5;
test('full source packs present for all N1-N5 levels',()=>assert.equal(available,true));
test('all 8334 raw source rows preserved through merge + editorial additions',()=>{assert.equal(loaded.reduce((n,p)=>n+p.sourceRows,0),8334);assert.equal(loaded.reduce((n,p)=>n+p.words.length,0),8451);for(const p of loaded){assert.equal(p.words.length,p.sourceRows-p.merged+p.supplemental);assert.equal(p.sourceRevision,SOURCE_REV);assert.equal(p.complete,true);}});
test('every installed word belongs to exactly one 30-word chapter in its level',()=>{assert.equal(CHAPTER_SIZE,30);for(const p of loaded){const list=courses(p.words,p.level),ids=list.flatMap(c=>c.wordIds);assert.equal(ids.length,p.words.length);assert.equal(new Set(ids).size,p.words.length);assert.ok(list.every((c,i)=>c.wordIds.length===(i===list.length-1?p.words.length-i*30:30)));assert.equal(list[0].startNo,1);assert.equal(list[0].endNo,30);}});
test('chapter IDs are stable by level and ordinal',()=>{for(const p of loaded){const list=courses(p.words,p.level);assert.equal(list[0].id,`${p.level}-chapter-1`);assert.equal(list.at(-1).id,`${p.level}-chapter-${list.length}`);}});
test('starter words remain at the front of full pack chapters',()=>{for(const p of loaded){const a=STARTERS.filter(w=>w.level===p.level).map(w=>w.id),b=p.words.slice(0,a.length).map(w=>w.id);assert.deepEqual(b,a);}});
test('every installed word has Korean display meaning and a writing target',()=>{const words=loaded.flatMap(p=>p.words);for(const w of words){assert.ok(w.meaning.trim());assert.ok(writingChars(w).length>0);assert.equal(w.language,'ko',w.word);assert.ok(/[가-힣]/.test(w.meaning)||!/[A-Za-z]{2,}/.test(w.meaning),`${w.word}: ${w.meaning}`);}for(const p of loaded){const c=courses(words,p.level)[0],state=fresh();state.session=createClass(state,c,words);assert.equal(state.session.queue.length,c.wordIds.length);while(current(state.session)?.phase==='survey')assert.equal(classifySurvey(state,current(state.session).id,true,words),true);assert.equal(state.session.completed,true);}});
test('duplicate canonical source rows merge senses without silently losing words',()=>{const rows=[{word:'水',reading:'みず',meanings:['water'],level:'N5'},{word:'水',reading:'みず',meanings:['fluid'],level:'N5'},{word:'山',reading:'やま',meanings:['mountain'],level:'N5'},{word:'火',reading:'ひ',meanings:['fire'],level:'N5'}];const p=parsePack(rows,'N5',{strict:false});assert.equal(p.merged,1);assert.equal(p.sourceRows,4);assert.equal(p.quarantine.length,0);assert.equal(p.complete,false);assert.deepEqual(p.words.find(w=>w.word==='水').sourceMeanings,['water','fluid']);});
test('import cannot turn a survey card into a final exam question',()=>{const s=fresh();s.session=createClass(s,courses(STARTERS,'N5')[0],STARTERS);s.session.queue[0].phase='quiz';assert.throws(()=>validateState(s));});
test('missing chapter metadata is rejected instead of crashing at finish',()=>{const s=fresh();s.session=createClass(s,courses(STARTERS,'N5')[0],STARTERS);s.session.course=null;assert.throws(()=>validateState(s));});

test('previously visible English screenshot meanings are explicitly Korean',()=>{
 const words=loaded.flatMap(p=>p.words),expect=new Map([
  ['あさって|あさって','모레'],['あそこ|あそこ','저기 · 저곳'],['あちら|あちら','저쪽 · 저곳'],['あっち|あっち','저쪽']
 ]);
 for(const [pair,ko] of expect){const [word,reading]=pair.split('|'),rows=words.filter(w=>w.word===word&&w.reading===reading);assert.ok(rows.length,pair);for(const w of rows)assert.equal(w.meaning,ko,pair);}
});
test('coverage reports zero English display meanings for every level',async()=>{
 const coverage=JSON.parse(await readFile(new URL('../data/coverage.json',import.meta.url),'utf8'));
 assert.equal(coverage.koreanOnly,true);
 for(const [level,row] of Object.entries(coverage.levels)){assert.equal(row.english,0,level);assert.equal(row.korean,row.words,level);}
});
