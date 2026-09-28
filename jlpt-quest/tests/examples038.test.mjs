import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadExamples,examplesFor,exampleBody} from '../src/examples.js';
const root=new URL('../data/',import.meta.url);
const read=async name=>JSON.parse(await readFile(new URL(name,root),'utf8'));
const words=(await Promise.all(['N5','N4','N3','N2','N1'].map(l=>read(l+'.json')))).flatMap(p=>p.words);
const expanded=await read('examples-expanded.json'),coverage=await read('example-coverage.json');
const oldFetch=globalThis.fetch;
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(await readFile(url,'utf8'))});
await loadExamples();globalThis.fetch=oldFetch;
test('all 8451 vocabulary IDs have usable Japanese Korean contextual examples',()=>{
 assert.equal(words.length,8451);assert.equal(coverage.coveredWords,8451);assert.deepEqual(coverage.missingWordIds,[]);
 for(const w of words){const list=examplesFor(w);assert.ok(list.length,w.id+' '+w.word);for(const e of list){assert.match(e.ja,/[\u3040-\u30ff\u3400-\u9fff]/,e.id);assert.match(e.ko,/[가-힣]/,e.id);assert.ok(e.ja.length<=180,e.id);assert.ok(!e.ko.includes('<unk>'),e.id);}}
});
test('every level reports coverage and totals agree with actual IDs',()=>{
 for(const level of ['N5','N4','N3','N2','N1']){const expected=words.filter(w=>w.level===level).length;assert.deepEqual(coverage.byLevel[level],{total:expected,covered:expected});}
});
test('all examples render a single card with normal slow and stop controls',()=>{
 for(const w of words){const html=exampleBody(w,true,0);assert.equal((html.match(/class="example-card"/g)||[]).length,1,w.id);assert.match(html,/data-action="example-audio"/);assert.match(html,/data-slow="true"/);assert.match(html,/data-action="example-stop"/);assert.ok(!html.includes('예문을 준비하고'),'placeholder '+w.id);}
});
test('expanded example sources are attributable and draft status is not hidden',()=>{
 assert.equal(expanded.entries.length,coverage.newCorpusExampleRecords+coverage.newAuthoredExampleRecords);
 const ids=new Set();for(const e of expanded.entries){assert.ok(!ids.has(e.id));ids.add(e.id);assert.equal(e.independentNativeReview,false);assert.ok(e.wordIds.length);assert.deepEqual(e.targets,[]);assert.ok(e.source&&e.license&&e.translationReview);if(e.sourceId)assert.match(e.sourceId,/^\d+$/);}
 const e=expanded.entries.find(x=>x.translationReview==='machine-draft');assert.ok(e);const w=words.find(w=>w.id===e.wordIds[0]);const html=exampleBody(w);assert.match(html,/한국어 자동번역 초안/);assert.match(html,/<details class="example-translation-draft">/);assert.ok(!html.includes('<details open'));
 assert.equal(coverage.independentNativeReview,false);assert.equal(coverage.productionReleased,false);
});
test('kana toggle removes only reading text while retaining example listening',()=>{
 for(const w of words.slice(0,30)){const html=exampleBody(w,false);assert.ok(!html.includes('class="example-reading"'));assert.match(html,/data-action="example-audio"/);}
});
test('inspected telephone dialogue preserves greeting and does not invent gender',()=>{
 const e=expanded.entries.find(e=>e.id==='tatoeba-236422');assert.ok(e);
 assert.equal(e.ja,'「もしもし、ブラウンさんですか」「はい、そうです」');
 assert.equal(e.ko,'“여보세요, 브라운 씨인가요?” “네, 맞습니다.”');
 assert.equal(e.translationReview,'assistant-edited');
 for(const id of ['N5-13zaazx','N3-13zaazx'])assert.ok(examplesFor(words.find(w=>w.id===id)).some(x=>x.id===e.id));
});
