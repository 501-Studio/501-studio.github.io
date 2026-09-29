import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as E from '../src/course-engine.js';
import {restartSession} from '../src/session-controls.js';
const words=(await Promise.all(['N5','N4','N3','N2','N1'].map(async l=>JSON.parse(await readFile(new URL('../data/'+l+'.json',import.meta.url),'utf8')).words))).flat();
const school=words.find(w=>w.word==='学校'&&w.level==='N5');

test('041 new survey and targeted tasks start with no auto-pronunciation marker',()=>{
 const s=E.fresh(),course={id:'N5-chapter-1',level:'N5',title:'x',index:1,startNo:1,endNo:1,wordIds:[school.id]};
 const c=E.createClass(s,course,words),r=E.createTargetReview(s,words,[{wordId:school.id,skill:'meaning'},{wordId:school.id,skill:'writing'}]);
 assert.ok(c.queue.every(t=>t.autoSpeech===0));
 assert.ok(r.queue.every(t=>t.autoSpeech===0));
});

test('041 auto-pronunciation stage bits survive backup validation',()=>{
 const s=E.fresh();s.session=E.createTargetReview(s,words,[{wordId:school.id,skill:'meaning'}]);
 s.session.queue[0].autoSpeech=7;
 const restored=E.validateState(JSON.parse(JSON.stringify(s)));
 assert.equal(restored.session.queue[0].autoSpeech,7);
});

test('041 failed retry receives a fresh prompt pronunciation allowance',()=>{
 const s=E.fresh();s.session=E.createTargetReview(s,words,[{wordId:school.id,skill:'meaning'}]);
 const t=E.current(s.session);t.autoSpeech=1;s.session.selection='wrong';
 assert.equal(E.submit(s,t.id,{correct:false,method:'choice'}),true);
 const retry=s.session.queue.find(x=>x.id!==t.id&&x.wordId===school.id&&x.skill==='meaning');
 assert.ok(retry);assert.equal(retry.autoSpeech,0);
});

test('041 restarting a review resets automatic pronunciation markers',()=>{
 const s=E.fresh();s.session=E.createTargetReview(s,words,[{wordId:school.id,skill:'meaning'},{wordId:school.id,skill:'writing'}]);
 for(const t of s.session.queue)t.autoSpeech=7;
 assert.equal(restartSession(s,words),true);
 assert.ok(s.session.queue.every(t=>t.autoSpeech===0));
});
