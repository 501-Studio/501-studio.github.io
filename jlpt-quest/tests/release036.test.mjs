import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {fresh,createClass,classifySurvey,current,submit,next,validateState,unresolved,createReview} from '../src/course-engine.js';
import {STARTERS,courses,validateStoredPack} from '../src/catalog.js';
import {PLANS,mergeProducts} from '../src/commerce.js';
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const pack=JSON.parse(read('../data/N5.json'));
test('reported policeman gloss is concise and not a mistranslated source explanation',()=>{const w=pack.words.find(w=>w.word==='おまわりさん');assert.equal(w.meaning,'경찰관, 순경');});
test('critical dictionary confusions are keyed to Japanese words, not global Korean replacements',()=>{
 for(const [word,meaning] of [['時計','시계'],['机','책상'],['せっけん','비누'],['スカート','치마, 스커트']]){const w=pack.words.find(w=>w.word===word);assert.ok(w.meaning.includes(meaning.split(',')[0]),word+': '+w.meaning);}
 const all=['N5','N4','N3','N2','N1'].flatMap(l=>JSON.parse(read(`../data/${l}.json`)).words);
 assert.ok(all.find(w=>w.word==='経済').meaning.includes('경제'));assert.equal(all.length,8451);
});
test('corrected dictionary glosses remain tied to their stable Japanese word IDs',()=>{
 const words=['N1','N2'].flatMap(l=>JSON.parse(read(`../data/${l}.json`)).words),glosses=JSON.parse(read('../data/korean-glosses.json')).glosses;
 for(const [id,word,reading,meaning] of [
  ['N1-11crmnn','臍','へそ','배꼽'],
  ['N1-13ouzrm','茹でる','ゆでる','삶다, 데치다'],
  ['N1-1jblqnz','鋏','はさみ','가위'],
  ['N1-spyjc9','鼾','いびき','코골이'],
  ['N1-15qiijg','躓く','つまずく','발이 걸리다, 넘어지다'],
  ['N1-1yvfp9z','躾','しつけ','훈육, 예절 교육'],
  ['N1-3svmyf','黴菌','ばいきん','세균, 병균'],
  ['N2-tlqi7v','ええと','ええと','음, 어, 어디 보자']
 ]){const w=words.find(w=>w.id===id);assert.ok(w,id);assert.equal(w.word,word);assert.equal(w.reading,reading);assert.equal(w.meaning,meaning,word);assert.equal(glosses[id],meaning,word);assert.equal(w.glossReview,'assistant-reviewed',word);}
});
test('every definition has comma separators and no translation boilerplate or English',()=>{
 for(const l of ['N5','N4','N3','N2','N1'])for(const w of JSON.parse(read(`../data/${l}.json`)).words){assert.ok(w.meaning.trim());assert.doesNotMatch(w.meaning,/[A-Za-z·•;]|경찰관을 위한 친절한 시간|단어 의미|원래 제목|곡 영어/,w.word);}
});
test('corrupted Japanese readings are corrected without changing saved vocabulary IDs',()=>{
 const pack=JSON.parse(read('../data/N3.json')),words=pack.words;assert.equal(validateStoredPack(pack),pack);
 for(const [id,word,reading,original] of [['N3-1b97nrt','とん','とん','(1000'],['N3-1d6ofkx','賛成','さんせい','Uӣ[い']]){
  const entry=words.find(w=>w.id===id);assert.ok(entry);assert.equal(entry.word,word);assert.equal(entry.reading,reading);assert.equal(entry.pre036Reading,original);
 }
 const tampered=structuredClone(pack);tampered.words.find(w=>w.id==='N3-1d6ofkx').reading='さんせん';assert.throws(()=>validateStoredPack(tampered));
});
test('editorial audit distinguishes reviewed meanings from punctuation-only changes',()=>{const a=JSON.parse(read('../editorial/audit.json'));assert.equal(a.total,8451);assert.ok(a.semanticReviewed>=2404);assert.equal(a.semanticReviewed+a.remainingSemanticReview,a.total);assert.equal(a.semanticReviewComplete,false);assert.equal(a.levels.N5.semanticReviewed,669);assert.equal(a.levels.N4.semanticReviewed,655);});
test('unknown words receive three writing repetitions before the actual exam',()=>{
 const state=fresh(),c=courses(STARTERS,'N5')[0];state.session=createClass(state,c,STARTERS);const id=c.wordIds[0];while(current(state.session)?.phase==='survey')classifySurvey(state,current(state.session).id,current(state.session).wordId!==id,STARTERS);
 const training=state.session.queue.filter(t=>t.phase==='learn'&&t.wordId===id);assert.deepEqual(training.map(t=>t.skill),['study','audio','trace','trace','trace']);assert.deepEqual(training.filter(t=>t.skill==='trace').map(t=>[t.practiceIndex,t.practiceTotal,t.guided]),[[1,3,true],[2,3,true],[3,3,false]]);
 const restored=validateState(JSON.parse(JSON.stringify(state)));assert.equal(restored.session.queue.find(t=>t.practiceIndex===3).guided,false);
});
test('selected review type is not blocked by unrelated skills',()=>{
 const state=fresh(),id=STARTERS[0].id;state.memory[id+':meaning']={stage:0,due:0,lastAt:0,lapses:0,successes:1,consecutive:1};state.session=createReview(state,STARTERS,'due',Date.now());assert.equal(unresolved(state.session).length,1);submit(state,current(state.session).id,{correct:true,method:'choice'});next(state);assert.equal(state.session.completed,true);
});
test('prices are planned values until Play supplies real available product details',()=>{
 assert.equal(PLANS.monthly.price,'₩1,800');assert.equal(PLANS.annual.price,'₩9,000');assert.equal(PLANS.lifetime.price,'₩14,000');assert.ok(mergeProducts([]).every(x=>!x.available));
 const a=mergeProducts([{plan:'annual',productId:'kotoba_premium',price:'₩9,000',available:true}]);assert.equal(a.find(x=>x.plan==='annual').available,true);
});
test('consumer learning interface has no download, engine badge, or autoplay success paragraphs',()=>{const source=read('../src/app.js');assert.doesNotMatch(source,/1회 자동재생 완료|내장 · 오프라인|단어팩 설치|단어팩 받기|내장 데이터/);assert.match(source,/class="audio-status sr-only"/);assert.doesNotMatch(source,/function packsModal/);});
test('fitted headwords preserve complete text without wrapping or ellipsis',()=>{assert.match(read('../release.css'),/white-space:nowrap!important/);assert.match(read('../src/fit-text.js'),/scrollWidth/);assert.doesNotMatch(read('../src/fit-text.js'),/textContent\s*=/);});
test('purchase state is native/server-backed, not localStorage premium toggles',()=>{const s=read('../src/commerce.js');assert.doesNotMatch(s,/localStorage|premium\s*=\s*true/);assert.match(s,/commerceBuy/);assert.match(read('../../kotoba-android/app/src/main/java/com/studio501/kotoba/PlayCommerce.java'),/SHA256withRSA/);});
