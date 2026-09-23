import test from 'node:test';
import assert from 'node:assert/strict';
import {WORDS,WORD_MAP,UNITS,STEPS} from '../src/content.js';
import {defaults,validateState,normalizeJapanese,isCorrect,choicesFor,schedule,INTERVALS,MINUTE,DAY,isWeak,createSession,answerTask,advance,skipTask,currentTask,unitUnlocked,unitProgress,recordKey,reviews,dayKey,streak} from '../src/engine.js';
const NOW=Date.UTC(2026,8,23,3);
function session(config={skill:'meaning',unit:'n4-1'}){const s=defaults();s.session=createSession(s,config);return s;}
test('48 unique editorial words; 8 words per unit; four unique options',()=>{
 assert.equal(WORDS.length,48);assert.equal(new Set(WORDS.map(w=>w.id)).size,48);
 for(const u of UNITS)assert.equal(WORDS.filter(w=>w.unit===u.id).length,8);
 for(const w of WORDS){const c=choicesFor(w);assert.equal(new Set(c).size,4);assert.ok(c.includes(w.meaning));assert.ok(w.reading&&w.example&&w.translation);}
});
test('Japanese normalization accepts IME variants but not near-miss spelling',()=>{
 const w=WORDS.find(w=>w.word==='復習');
 for(const a of ['復習','ふくしゅう','フクシュウ','ﾌｸｼｭｳ',' ふくしゅう '])assert.equal(isCorrect(w,a),true,a);
 for(const a of ['ふくしゆう','ふくしゅ','fukushuu','', '復習です'])assert.equal(isCorrect(w,a),false,a);
 assert.equal(normalizeJapanese('ガッコウ'),'がっこう');
});
test('SRS progression is 10 minutes, 1/3/7/14/30 days',()=>{
 let r,now=NOW;for(let i=0;i<INTERVALS.length;i++){r=schedule(r,true,`s${i}`,now);assert.equal(r.stage,i);assert.equal(r.due,now+INTERVALS[i]);now=r.due+1;}
 r=schedule(r,true,'last',now);assert.equal(r.stage,5);assert.equal(r.due,now+30*DAY);
});
test('early voluntary practice never postpones a review',()=>{
 let r=schedule(undefined,true,'a',NOW);const oldDue=r.due;r=schedule(r,true,'b',NOW+MINUTE);assert.equal(r.stage,0);assert.equal(r.due,oldDue);
});
test('wrong answer and hint reset spacing; same-session rescue does not promote',()=>{
 const old={stage:4,due:NOW,lapses:0,successes:20,consecutive:20,lastAt:NOW-DAY,lastSession:'old'};
 for(const hinted of [false,true]){let r=schedule(old,hinted,'a',NOW,hinted);assert.equal(r.stage,0);assert.equal(r.due,NOW+10*MINUTE);assert.equal(r.lapses,1);r=schedule(r,true,'a',NOW+MINUTE);assert.equal(r.stage,0);assert.equal(r.due,NOW+10*MINUTE);assert.ok(isWeak(r));}
});
test('weak record needs two later successful scheduled reviews',()=>{
 let r=schedule(undefined,false,'a',NOW);r=schedule(r,true,'b',r.due+1);assert.ok(isWeak(r));r=schedule(r,true,'c',r.due+1);assert.equal(isWeak(r),false);
});
test('meaning, writing, listening and self-rated reading have independent records',()=>{
 const s=session();const id=currentTask(s.session).wordId;answerTask(s,true,{now:NOW});assert.ok(s.memory[recordKey(id,'meaning')]);assert.equal(s.memory[recordKey(id,'writing')],undefined);assert.equal(s.memory[recordKey(id,'listening')],undefined);
 const read=session({skill:'read'});const rid=currentTask(read.session).wordId;answerTask(read,true,{now:NOW});assert.ok(read.memory[recordKey(rid,'read')]);assert.equal(read.memory[recordKey(rid,'meaning')],undefined);
});
test('double submission is idempotent and replays cannot farm XP',()=>{
 const s=session();const task=currentTask(s.session);answerTask(s,true,{now:NOW});const xp=s.xp,keys=Object.keys(s.memory);assert.equal(answerTask(s,false,{now:NOW}),null);assert.equal(s.xp,xp);assert.deepEqual(Object.keys(s.memory),keys);
 s.session=createSession(s,{skill:'meaning',unit:'n4-1'});s.session.queue[0]=structuredClone(task);answerTask(s,true,{now:NOW+MINUTE});assert.equal(s.xp,xp);
});
test('mistakes return after three other tasks and stop after two rescue attempts',()=>{
 const s=session();const t=currentTask(s.session);answerTask(s,false,{now:NOW});assert.equal(s.session.queue[4].wordId,t.wordId);assert.equal(s.session.queue[4].retry,true);
 let steps=0;while(!s.session.finished&&steps<100){if(!s.session.feedback)answerTask(s,false,{now:NOW+steps*1000});advance(s);steps++;}
 assert.ok(steps<=24);assert.equal(s.session.finished,true);assert.equal(s.session.queue.length,24);assert.equal(s.session.initialCorrect,0);
});
test('skip makes no memory, XP or false lesson completion',()=>{
 const s=session({skill:'listening',unit:'n4-1',lesson:true});while(!s.session.finished){skipTask(s);advance(s);}
 assert.equal(Object.keys(s.memory).length,0);assert.equal(s.xp,0);assert.equal(s.session.passed,false);assert.equal(s.session.skipped,8);assert.deepEqual(unitProgress(s,'n4-1').completed,[]);
});
test('boss requires 70% first-attempt accuracy; rescues do not inflate it',()=>{
 const s=session({skill:'boss',unit:'n4-1',lesson:true});assert.equal(s.session.total,12);assert.deepEqual(new Set(s.session.queue.map(t=>t.skill)),new Set(['meaning','writing','listening']));
 let i=0;while(!s.session.finished){answerTask(s,i>=4,{now:NOW+i*1000});advance(s);i++;}
 assert.equal(s.session.initialCorrect,8);assert.equal(s.session.passed,false);
});
test('a lap needs all five stages; replaying boss cannot farm laps',()=>{
 const s=defaults();function finish(skill){s.session=createSession(s,{unit:'n4-1',skill,lesson:true});while(!s.session.finished){answerTask(s,true,{now:NOW});advance(s);}}
 finish('boss');finish('boss');assert.equal(unitProgress(s,'n4-1').laps,0);
 for(const step of STEPS)finish(step.id);assert.equal(unitProgress(s,'n4-1').laps,1);assert.ok(unitUnlocked(s,'n4-2'));assert.equal(unitUnlocked(s,'n4-3'),false);
 finish('boss');assert.equal(unitProgress(s,'n4-1').laps,1);
});
test('review queues isolate level and select overdue before future items',()=>{
 const s=defaults();s.memory={'w25:writing':schedule(undefined,false,'a',NOW),'w26:meaning':schedule(undefined,true,'b',NOW+DAY),'w1:meaning':schedule(undefined,true,'b',NOW)};
 assert.equal(reviews(s,'due',NOW+11*MINUTE).length,1);assert.equal(reviews(s,'due',NOW+11*MINUTE)[0].wordId,'w25');assert.equal(reviews(s,'all',NOW).length,2);
});
test('streak uses local calendar dates, not rolling 24-hour deltas',()=>{
 const s=defaults(),now=new Date(2026,8,23,12).getTime();for(let offset=0;offset<3;offset++){const d=new Date(now);d.setDate(d.getDate()-offset);s.daily[dayKey(d)]={count:1};}assert.equal(streak(s,now),3);delete s.daily[dayKey(now)];assert.equal(streak(s,now),2);assert.equal(streak(s,now+3*DAY),0);
});
test('backups round trip live session and strip unknown fields',()=>{
 const s=session();s.session.draft='ふくしゅう';answerTask(s,false,{now:NOW});s.session.strokes=[[[.2,.3],[.4,.5]]];s.fake='<script>';const restored=validateState(JSON.parse(JSON.stringify(s)));assert.equal(restored.fake,undefined);assert.equal(restored.session.draft,'ふくしゅう');assert.deepEqual(restored.memory,s.memory);assert.deepEqual(restored.session.strokes,s.session.strokes);
});
test('malformed imports rejected without mutating current state',()=>{
 for(const bad of [null,{},[],{...defaults(),xp:-1},{...defaults(),settings:{level:'N1',goal:10}},{...defaults(),memory:{'w25:meaning':{stage:99}}}])assert.throws(()=>validateState(bad));
 const s=defaults();s.session={bad:true};assert.equal(validateState(s).session,null);
 const read=defaults();read.memory['__proto__:bad']={};assert.deepEqual(validateState(read).memory,{});
});
