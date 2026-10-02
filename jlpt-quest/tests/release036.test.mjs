import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fresh,createClass,classifySurvey,current,submit,next,validateState,unresolved,createReview} from '../src/course-engine.js';
import {STARTERS,courses,validateStoredPack} from '../src/catalog.js';
import {PLANS,mergeProducts} from '../src/commerce.js';
import {CONTENT_REVISION,REVIEWED_IDENTITIES} from '../src/reviewed-identities.js';
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
const reviewedCounts={N5:669,N4:655,N3:1798,N2:1844,N1:3485};
const allReviewedWords=()=>Object.keys(reviewedCounts).flatMap(level=>JSON.parse(read(`../data/${level}.json`)).words);
const displayGloss=text=>[...new Set(text.replace(/\s*[·•;]\s*/g,', ').split(',').map(x=>x.trim()).filter(Boolean))].join(', ');
test('full editorial review preserves exact counts and stable IDs with evidence for every approval',()=>{
 const audit=JSON.parse(read('../editorial/audit.json')),coverage=JSON.parse(read('../data/coverage.json')),
  layer=JSON.parse(read('../data/korean-glosses.json')),overrides=JSON.parse(read('../editorial/overrides036.json')),words=allReviewedWords();
 assert.equal(words.length,8451);assert.equal(new Set(words.map(w=>w.id)).size,8451);
 const stableIdsHash=createHash('sha256').update(words.map(w=>w.id).join('\n')).digest('hex');
 assert.equal(stableIdsHash,'d4f8851d628c4b9b367b571bf38766dd323d1dce87049edc8069472d06a7faa6');
 assert.equal(overrides.baseVocabularyIdsSha256,stableIdsHash);
 for(const report of [audit,coverage,layer]){
  assert.equal(report.contentRevision,'042-editorial-1');assert.equal(report.semanticReviewComplete,true);assert.equal(report.semanticReviewed,8451);
 }
 assert.equal(audit.total,8451);assert.equal(audit.remainingSemanticReview,0);assert.equal(audit.remainingAutomaticFlags,0);
 assert.equal(audit.englishDisplay,0);assert.deepEqual(JSON.parse(read('../editorial/remaining-flags.json')),[]);
 assert.equal(audit.reviewer,'assistant; not external human review');assert.match(audit.note,/Formatting-only changes are NOT counted/);
 assert.equal(overrides.corrections.length,8396);assert.equal(audit.propagatedSameLexeme,55);
 const explicit=new Map(),sameLexeme=new Map();
 for(const [index,meaning] of overrides.corrections){
  assert.ok(Number.isInteger(index)&&index>=0&&index<words.length);assert.ok(!explicit.has(index),'duplicate editorial index '+index);
  explicit.set(index,displayGloss(meaning));const w=words[index],key=w.word+'|'+w.reading;
  if(!sameLexeme.has(key))sameLexeme.set(key,displayGloss(meaning));
 }
 for(const [index,w] of words.entries()){
  const direct=explicit.has(index),expected=direct?explicit.get(index):sameLexeme.get(w.word+'|'+w.reading);
  assert.ok(expected,'no semantic evidence for '+w.id);assert.equal(w.meaning,expected,w.id);
  assert.equal(w.glossReview,direct?'assistant-reviewed':'assistant-reviewed-same-lexeme',w.id);
  assert.equal(w.language,'ko',w.id);assert.equal(w.contentRevision,'042-editorial-1',w.id);assert.equal(layer.glosses[w.id],w.meaning,w.id);
 }
 assert.equal(Object.keys(layer.glosses).length,8451);
 for(const [level,count] of Object.entries(reviewedCounts)){
  const p=JSON.parse(read(`../data/${level}.json`));assert.equal(validateStoredPack(p),p);
  assert.equal(p.words.length,count);assert.equal(p.semanticReviewComplete,true);
  assert.equal(audit.levels[level].words,count);assert.equal(audit.levels[level].semanticReviewed,count);
  assert.equal(coverage.levels[level].words,count);assert.equal(coverage.levels[level].korean,count);assert.equal(coverage.levels[level].english,0);
  assert.equal(coverage.levels[level].semanticReviewed,count);
 }
});
test('new review artifacts cover all 6037 assigned cards without unresolved or silently replaced meanings',()=>{
 const words=new Map(allReviewedWords().map(w=>[w.id,w])),seen=new Set();
 for(const [file,count] of [['n3-semantic-review.json',1528],['n2-semantic-review.json',1554],['n1-first-semantic-review.json',1500],['n1-second-semantic-review.json',1455]]){
  const review=JSON.parse(read('../editorial/review042/'+file));assert.equal(review.reviewed.length,count,file);assert.deepEqual(review.unresolved,[],file);
  assert.ok(review.sources.length>0,file);
  for(const entry of review.reviewed){
   assert.ok(!seen.has(entry.id),'duplicate review '+entry.id);seen.add(entry.id);
   const w=words.get(entry.id);assert.ok(w,'missing reviewed card '+entry.id);
   assert.equal(w.word,entry.word,entry.id);assert.equal(w.reading,entry.reading,entry.id);assert.equal(w.meaning,displayGloss(entry.meaning),entry.id);
   assert.equal(w.glossReview,'assistant-reviewed',entry.id);
  }
 }
 assert.equal(seen.size,6037);
 const kana=words.get('N1-1lrtn57');assert.equal(kana.word,'し');assert.equal(kana.reading,'し');assert.equal(kana.meaning,'자(10^24의 수 단위)');
});
test('generated identity aliases accept only the 35 explicit corrections and retain legacy progress IDs',()=>{
 const overrides=JSON.parse(read('../editorial/overrides036.json')),words=new Map(allReviewedWords().map(w=>[w.id,w]));
 assert.equal(overrides.lexicalCorrections.length,33);assert.equal(overrides.readingCorrections.length,2);assert.equal(CONTENT_REVISION,overrides.revision);
 const expected=Object.fromEntries([...overrides.readingCorrections,...overrides.lexicalCorrections].map(e=>[e.id,[e.word,e.reading]]));
 assert.equal(Object.keys(expected).length,35);assert.deepEqual(REVIEWED_IDENTITIES,expected);assert.ok(!('N1-1lrtn57' in REVIEWED_IDENTITIES));
 for(const [id,[word,reading]] of Object.entries(expected)){
  const w=words.get(id);assert.ok(w,id);assert.equal(w.word,word,id);assert.equal(w.reading,reading,id);
  const valid={level:w.level,words:[w]};assert.equal(validateStoredPack(valid),valid);
  assert.throws(()=>validateStoredPack({level:w.level,words:[{...w,reading:reading+'あ'}]}),id+' must reject an unreviewed reading');
  assert.throws(()=>validateStoredPack({level:w.level,words:[{...w,word:word+'あ'}]}),id+' must reject an unreviewed headword');
 }
 for(const change of overrides.lexicalCorrections){
  const entry=JSON.parse(read('../editorial/'+change.evidence.split(':')[0])).reviewed.find(w=>w.id===change.id);
  assert.ok(entry,'missing lexical evidence '+change.id);assert.equal(entry.word,change.word);assert.equal(entry.reading,change.reading);
 }
 const lowerGrade=words.get('N1-141w1w3');assert.equal(lowerGrade.reading,'げひん');assert.equal(lowerGrade.meaning,'천함, 품위 없음');
});
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
