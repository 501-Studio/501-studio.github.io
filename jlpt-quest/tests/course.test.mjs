import test from 'node:test';import assert from 'node:assert/strict';
import {LEVELS,STARTERS,courses,writingChars,writingPattern,parsePack,validateStoredPack,CHAPTER_SIZE} from '../src/catalog.js';
import {fresh,createClass,classifySurvey,current,submit,next,unresolved,remediate,levelStats,schedule,INTERVALS,MINUTE,DAY,validateState,keyOf,createReview,dayKey,streak,courseLaps} from '../src/course-engine.js';
const NOW=Date.UTC(2026,8,25,3),chapter=courses(STARTERS,'N5')[0];
const setup=()=>{const s=fresh();s.session=createClass(s,chapter,STARTERS);return s;};
function survey(s,unknownIds=[]){const unknown=new Set(unknownIds);while(current(s.session)?.phase==='survey'){const t=current(s.session);assert.equal(classifySurvey(s,t.id,!unknown.has(t.wordId),STARTERS,NOW+s.session.index),true);}return s;}
function answer(s,correct=true){const t=current(s.session);if(!t)return false;if(t.skill==='audio'||t.skill==='listening')s.session.heard=true;return submit(s,t.id,{correct,method:['trace','writing'].includes(t.skill)?'stroke-snap':'choice',status:correct?'correct':'wrong'},NOW+s.session.index*100);}
function run(s,fn=()=>true){let n=0;while(!s.session.finished&&n<500){const t=current(s.session);assert.notEqual(t.phase,'survey');assert.equal(answer(s,fn(t)),true);next(s,NOW+n);n++;}assert.ok(n<500);return n;}

test('five levels have 60 Korean starter words and 30-word chapters',()=>{
 assert.equal(STARTERS.length,300);assert.equal(new Set(STARTERS.map(w=>w.id)).size,300);assert.equal(CHAPTER_SIZE,30);
 for(const l of LEVELS){const list=courses(STARTERS,l);assert.equal(list.length,2);assert.deepEqual(list.map(c=>c.wordIds.length),[30,30]);assert.equal(list[0].startNo,1);assert.equal(list[0].endNo,30);assert.equal(list[1].startNo,31);assert.equal(list[1].endNo,60);}
});
test('kanji writing focuses on kanji while kana-only words remain writable',()=>{assert.deepEqual(writingChars({word:'食べる'}),['食']);assert.deepEqual(writingChars({word:'学校'}),['学','校']);assert.equal(writingPattern({word:'食べる'}),'□べる');assert.deepEqual(writingChars({word:'テレビ'}),['テ','レ','ビ']);});
test('a chapter starts as exactly thirty rapid-review cards',()=>{const s=setup().session;assert.equal(s.queue.length,30);assert.ok(s.queue.every(t=>t.phase==='survey'&&t.skill==='survey'));assert.equal(s.originalQuiz,0);});
test('known words are not added to the focused exam',()=>{
 const s=setup(),unknown=[chapter.wordIds[0],chapter.wordIds[1]];survey(s,unknown);
 assert.equal(s.session.knownIds.length,28);assert.equal(s.session.unknownIds.length,2);
 assert.equal(s.session.queue.length,30+2*2+2*3);assert.equal(s.session.originalQuiz,6);
 assert.ok(s.session.queue.slice(30,34).every(t=>t.phase==='learn'));
 assert.deepEqual(new Set(s.session.queue.slice(34).map(t=>t.wordId)),new Set(unknown));
});
test('all-known chapter completes immediately without fake SRS mastery',()=>{
 const s=setup();survey(s,[]);
 assert.equal(s.session.finished,true);assert.equal(s.session.completed,true);assert.equal(Object.keys(s.memory).length,0);
 assert.equal(Object.keys(s.known).length,30);assert.equal(levelStats(s,STARTERS,'N5').learned,30);assert.equal(levelStats(s,STARTERS,'N5').mastered,0);assert.equal(courseLaps(s,chapter.id),1);
});
test('marking a previously known word unknown removes the known shortcut',()=>{
 const s=fresh();s.known[chapter.wordIds[0]]=NOW;s.session=createClass(s,chapter,STARTERS);
 const t=current(s.session);assert.equal(t.wordId,chapter.wordIds[0]);assert.equal(classifySurvey(s,t.id,false,STARTERS,NOW),true);assert.equal(s.known[t.wordId],undefined);
});
test('unknown words receive audio and tracing before the three exam types',()=>{
 const s=setup(),id=chapter.wordIds[0];survey(s,[id]);
 assert.deepEqual(s.session.queue.slice(30,32).map(t=>t.skill),['audio','trace']);
 assert.deepEqual(new Set(s.session.queue.slice(32).map(t=>t.skill)),new Set(['meaning','listening','writing']));
});
test('one unknown word requires all three exam skills to complete chapter',()=>{
 const s=setup(),id=chapter.wordIds[0];survey(s,[id]);run(s);
 assert.equal(s.session.completed,true);assert.equal(s.learned[id],NOW+4);assert.equal(courseLaps(s,chapter.id),1);
 for(const skill of ['meaning','listening','writing'])assert.equal(s.session.passed[keyOf(id,skill)],true);
});
test('one failed writing skill blocks the whole chapter until remediation',()=>{
 const s=setup(),id=chapter.wordIds[0];survey(s,[id]);run(s,t=>t.skill!=='writing');
 assert.equal(s.session.completed,false);assert.deepEqual(unresolved(s.session),[keyOf(id,'writing')]);assert.equal(courseLaps(s,chapter.id),0);
 assert.equal(remediate(s),true);assert.equal(s.session.queue.length,1);run(s);assert.equal(s.session.completed,true);assert.equal(courseLaps(s,chapter.id),1);
});
test('reopening a completed chapter increments its lap count only after completion',()=>{
 const s=setup();survey(s,[]);assert.equal(courseLaps(s,chapter.id),1);
 s.session=createClass(s,chapter,STARTERS);assert.equal(courseLaps(s,chapter.id),1);survey(s,[]);assert.equal(courseLaps(s,chapter.id),2);
});
test('training alone never writes SRS memory or XP',()=>{
 const s=setup(),id=chapter.wordIds[0];survey(s,[id]);
 while(current(s.session)?.phase==='learn'){answer(s);next(s);}
 assert.equal(s.xp,0);assert.equal(Object.keys(s.memory).length,0);
});
test('audio completion is required before advancing audio or listening',()=>{
 const s=setup(),id=chapter.wordIds[0];survey(s,[id]);const t=current(s.session);assert.equal(t.skill,'audio');
 assert.equal(submit(s,t.id,{correct:true,method:'audio'}),false);s.session.heard=true;assert.equal(submit(s,t.id,{correct:true,method:'audio'}),true);
});
test('manual handwriting self-rating cannot pass writing',()=>{
 const s=setup(),id=chapter.wordIds[0];survey(s,[id]);while(current(s.session).skill!=='writing'){answer(s);next(s);}const t=current(s.session);
 assert.equal(submit(s,t.id,{correct:true,method:'self'}),false);assert.equal(submit(s,t.id,{correct:true}),false);assert.equal(submit(s,t.id,{correct:true,method:'stroke-snap'}),true);
});
test('hint-assisted handwriting is recorded as a miss and retried',()=>{
 const s=setup(),id=chapter.wordIds[0];survey(s,[id]);while(current(s.session).skill!=='writing'){answer(s);next(s);}const t=current(s.session);
 submit(s,t.id,{correct:true,method:'stroke-snap',assisted:true});assert.equal(s.session.passed[keyOf(id,'writing')],false);assert.equal(s.memory[keyOf(id,'writing')].stage,0);
});
test('meaning, listening and writing keep independent schedules',()=>{
 const s=setup(),id=chapter.wordIds[0];survey(s,[id]);while(current(s.session).phase==='learn'){answer(s);next(s);}answer(s);assert.equal(Object.keys(s.memory).length,1);
});
test('SRS progresses on time and early practice cannot postpone it',()=>{
 let now=NOW,r;for(let i=0;i<6;i++){r=schedule(r,true,'s'+i,now);assert.equal(r.due,now+INTERVALS[i]);assert.equal(r.stage,i);const early=schedule(r,true,'early',now+100);assert.equal(early.due,r.due);const same=schedule(r,true,'s'+i,r.due+100);assert.equal(same.stage,i);now=r.due+1;}
});
test('wrong answer resets to ten-minute schedule',()=>{const r=schedule({stage:5,due:NOW,lapses:2,successes:8,consecutive:3},false,'error',NOW);assert.equal(r.stage,0);assert.equal(r.due,NOW+10*MINUTE);assert.equal(r.lapses,3);assert.equal(r.consecutive,0);});
test('review queue only includes scheduled problems, never self-declared known words',()=>{
 const s=setup();survey(s,[]);assert.equal(createReview(s,STARTERS,'due',NOW+DAY),null);
 const x=setup(),id=chapter.wordIds[0];survey(x,[id]);run(x);assert.equal(createReview(x,STARTERS,'due',NOW),null);assert.ok(createReview(x,STARTERS,'due',NOW+11*MINUTE));
});
test('choice questions always contain the answer and unique visible options',()=>{
 const s=setup(),ids=chapter.wordIds.slice(0,2);survey(s,ids);
 for(const t of s.session.queue.filter(t=>t.phase==='quiz'&&t.skill!=='writing')){assert.equal(t.options.length,4);assert.equal(new Set(t.options).size,4);const w=STARTERS.find(w=>w.id===t.wordId);assert.ok(t.options.includes(t.skill==='listening'?w.word:w.meaning));}
});
test('state round-trip preserves survey classification and chapter round data',()=>{
 const s=setup();classifySurvey(s,current(s.session).id,true,STARTERS,NOW);s.session.surveyReading=true;s.session.surveyMeaning=true;const r=validateState(JSON.parse(JSON.stringify(s)));
 assert.equal(r.session.knownIds.length,1);assert.equal(r.session.surveyReading,true);assert.equal(r.session.surveyMeaning,true);assert.equal(r.known[chapter.wordIds[0]],NOW);
});
test('live sessions may contain thirty words and expanded retry queues',()=>{
 const s=setup();survey(s,chapter.wordIds);assert.equal(s.session.wordIds.length,30);s.session.queue.push(...s.session.queue.slice(30,120));assert.doesNotThrow(()=>validateState(s));
});
test('malformed survey question is rejected on import',()=>{const s=setup();s.session.queue[0].phase='quiz';assert.throws(()=>validateState(s));});
test('Japanese pack HTML stays data and malformed packs are rejected',()=>{assert.throws(()=>parsePack([{word:'x'}],'N5'));assert.throws(()=>validateStoredPack({level:'N5',words:[{id:'x',word:'<img>',reading:'a',meaning:'b',level:'N5'}]}));});
test('streak uses local calendar days',()=>{const s=fresh(),d=new Date(2026,8,25,12);for(let i=0;i<3;i++){const x=new Date(d);x.setDate(x.getDate()-i);s.daily[dayKey(x)]={keys:['one'],words:[],xp:10};}assert.equal(streak(s,d),3);});
