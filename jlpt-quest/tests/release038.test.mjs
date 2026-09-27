import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {validateStoredPack,idFor} from '../src/catalog.js';
import {READING_CORRECTIONS,applyReadingCorrection,isCorrectedStableId} from '../src/reading-corrections.js';
import {optionsFor} from '../src/course-engine.js';
import {ALL_KANA} from '../src/kana-engine.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../data/'+name,import.meta.url),'utf8'));
const packs=['N5','N4','N3','N2','N1'].map(l=>read(l+'.json')),words=packs.flatMap(p=>p.words);
const manifest=read('audio-manifest.json'),coverage=read('audio-coverage.json'),summary=read('audio-audit-summary.json');
const records=coverage.records;
test('0.3.8 manifest has a validated pronunciation for all 8613 word and kana IDs',()=>{
 assert.equal(manifest.version,3);assert.equal(manifest.audioRevision,'038-phonetic-audit-v1');assert.equal(manifest.words,8613);assert.equal(Object.keys(manifest.speechTexts).length,8613);
 for(const w of [...words,...ALL_KANA]){assert.ok(manifest.clips[w.id],w.id);assert.match(manifest.speechTexts[w.id],/^[ァ-ヶー]+$/,w.id);}
});
test('all 7050 before and after waveforms were decoded; no hash or clipping error is hidden',()=>{
 assert.equal(records.length,7050);assert.equal(summary.oldFilesDecoded,7050);assert.equal(summary.newFilesDecoded,7050);
 assert.equal(summary.missingFiles,0);assert.equal(summary.hashErrors,0);assert.equal(summary.clippedFiles,0);
 const names=new Set();for(const r of records){names.add(r.file);assert.equal(r.after.sampleRate,24000);assert.equal(r.after.clippedSamples,0);assert.ok(r.after.truePeakDb<-.5);assert.ok(r.after.leadSeconds>=.055);assert.ok(r.after.tailSeconds>=.085);assert.ok(r.after.seconds>.15&&r.after.seconds<15);const bytes=fs.readFileSync(new URL('../data/audio/'+r.file,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256);assert.notEqual(r.file,r.oldFile);}
 assert.equal(names.size,7050);
});
test('ASR diagnostic results exist for every old/new recording without claiming native approval',()=>{
 for(const r of records){assert.equal(typeof r.asrBefore.text,'string');assert.equal(typeof r.asrAfter.text,'string');assert.equal(typeof r.asrAfter.phoneticMatch,'boolean');assert.equal(r.pronunciationReviewRequired,!r.asrAfter.phoneticMatch);}
 assert.equal(summary.independentNativeReview,false);assert.equal(summary.pronunciationReviewRequired,records.filter(r=>r.pronunciationReviewRequired).length);
});
test('ha/he isolated kana and teeth/leaf nouns do not use particle wa/e pronunciations',()=>{
 const ha=records.find(r=>r.reading==='は'),he=records.find(r=>r.reading==='へ');assert.ok(ha&&he);
 assert.equal(ha.phonemes,'ha.');assert.equal(he.phonemes,'he.');assert.ok(!ha.phonemes.includes('β'));
 for(const w of words.filter(w=>w.reading==='は'))assert.equal(manifest.speechTexts[w.id],'ハ');
 assert.equal(manifest.speechTexts['KANA-h306f'],'ハ');assert.equal(manifest.speechTexts['KANA-k30d8'],'ヘ');
});
test('za does not acquire an extra nasal; suits does not lose its last syllables',()=>{
 assert.equal(records.find(r=>r.reading==='ざ').phonemes,'ʣa.');
 const suits=records.find(r=>r.reading==='すーつ');assert.match(suits.phonemes,/s[ɯɨ]ːʦ[ɯɨ]\./);assert.ok(suits.frontendChanged);
});
test('fixed greetings keep conventional wa, while haha remains ha-ha',()=>{
 for(const [reading,spoken]of [['こんにちは','こんにちわ'],['こんばんは','こんばんわ']]){const r=records.find(x=>x.reading===reading);assert.ok(r);assert.equal(r.spokenText,spoken);assert.match(r.phonemes,/βa\.$/);}
 const mother=records.find(r=>r.reading==='はは');assert.equal(mother.spokenText,'はは');assert.equal(mother.phonemes,'haha.');
});
test('three repaired readings remain linked to the same vocabulary/progress IDs',()=>{
 for(const [id,c]of Object.entries(READING_CORRECTIONS)){
  const w=words.find(w=>w.id===id);assert.ok(w);assert.equal(w.word,c.word);assert.equal(w.reading,c.reading);assert.equal(w.sourceReading,c.oldReading);assert.equal(w.id,idFor(c.level,c.word,c.oldReading));assert.ok(isCorrectedStableId(w));assert.deepEqual(w.alternateReadings,c.alternatives);assert.doesNotThrow(()=>validateStoredPack({level:c.level,words:[w]}));
 }
 for(const w of words)assert.match(w.reading,/^[ぁ-ゖァ-ヶー]+$/,w.word);
});
test('stable-ID correction exception cannot be used for unrelated or tampered words',()=>{
 const c=words.find(w=>w.id==='N3-1d6ofkx');for(const bad of [{...c,reading:'あ'},{...c,word:'山'},{...c,sourceReading:'x'},{...c,readingRevision:2}])assert.throws(()=>validateStoredPack({level:'N3',words:[bad]}));
 const repaired=applyReadingCorrection({...c,reading:'Uӣ[い'});assert.equal(repaired.reading,'さんせい');assert.equal(repaired.id,c.id);assert.throws(()=>applyReadingCorrection({...c,word:'異なる語'}));
});
test('listening distractors cannot be distinguished only by identical readings',()=>{
 const target={id:'a',level:'N5',language:'ko',word:'橋',reading:'はし',meaning:'다리'},other=[target,{...target,id:'b',word:'箸',meaning:'젓가락'},...['山','水','空','犬'].map((word,i)=>({...target,id:'c'+i,word,reading:'あ'+i,meaning:'뜻'+i}))];
 for(let i=0;i<100;i++){const options=optionsFor(target,other,'listening');assert.equal(options.length,4);assert.ok(options.includes('橋'));assert.ok(!options.includes('箸'));}
});
