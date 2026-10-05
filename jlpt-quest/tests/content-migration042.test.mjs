import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fresh,createTargetReview} from '../src/course-engine.js';
import {refreshSessionContent} from '../src/content-migration.js';
import {CONTENT_REVISION} from '../src/reviewed-identities.js';
const words=['N5','N4','N3','N2','N1'].flatMap(level=>JSON.parse(readFileSync(new URL('../data/'+level+'.json',import.meta.url),'utf8')).words);
const corrected=words.find(w=>w.id==='N1-n4ma0k');

test('editorial migration updates active, suspended and parked prompts without changing progress',()=>{
 const state=fresh();state.settings.level='N1';state.xp=123;
 state.memory[corrected.id+':meaning']={stage:2,due:123456,successes:7};
 state.starred=[corrected.id];state.learned[corrected.id]=12345;
 const progress=structuredClone({xp:state.xp,memory:state.memory,starred:state.starred,learned:state.learned});
 const session=()=>{
  const s=createTargetReview(state,words,[{wordId:corrected.id,skill:'meaning'},{wordId:corrected.id,skill:'listening'}]);
  s.contentRevision='036-editorial';s.selection='legacy answer';s.heard=true;s.autoPlayedTask=s.queue[0].id;
  s.queue[0].autoSpeech=1;
  for(const task of s.queue)task.options=['legacy answer','legacy distractor 1','legacy distractor 2','legacy distractor 3'];
  s.wordSnapshots=s.wordSnapshots.map(w=>({...w,word:'legacy headword',meaning:'legacy answer'}));return s;
 };
 state.session=session();state.suspendedSession=session();state.parkedSessions=[session(),session()];
 const positions=[state.session,state.suspendedSession,...state.parkedSessions].map(s=>({id:s.id,index:s.index,wordIds:[...s.wordIds],passed:structuredClone(s.passed)}));
 refreshSessionContent(state,words);
 const sessions=[state.session,state.suspendedSession,...state.parkedSessions];
 assert.deepEqual(sessions.map(s=>({id:s.id,index:s.index,wordIds:s.wordIds,passed:s.passed})),positions);
 assert.deepEqual({xp:state.xp,memory:state.memory,starred:state.starred,learned:state.learned},progress);
 for(const s of sessions){
  assert.equal(s.contentRevision,CONTENT_REVISION);assert.equal(s.selection,null);assert.equal(s.heard,false);assert.equal(s.autoPlayedTask,null);assert.equal(s.queue[0].autoSpeech,0);
  assert.equal(s.wordSnapshots[0].word,corrected.word);assert.equal(s.wordSnapshots[0].meaning,corrected.meaning);
  for(const t of s.queue){assert.equal(t.options.length,4);assert.equal(new Set(t.options).size,4);assert.ok(t.options.includes(t.skill==='meaning'?corrected.meaning:corrected.word));assert.ok(t.options.every(x=>!x.startsWith('legacy')));}
 }
});

test('current content does not shuffle answers or clear a current selection on a second refresh',()=>{
 const state=fresh();state.session=createTargetReview(state,words,[{wordId:corrected.id,skill:'meaning'}]);
 refreshSessionContent(state,words);state.session.selection=corrected.meaning;state.session.heard=true;
 const before=structuredClone(state.session);refreshSessionContent(state,words);
 assert.deepEqual(state.session,before);
});
