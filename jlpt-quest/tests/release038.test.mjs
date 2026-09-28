import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {STARTERS,courses} from '../src/catalog.js';
import {fresh,createClass,current,validateState,schedule,keyOf} from '../src/course-engine.js';
import {enterReview,swapSession,restartSession,finishSession,startClassSession} from '../src/session-controls.js';
import {freshKana,startKana} from '../src/kana-engine.js';
import {speakSentence,stopAudio} from '../src/audio.js';
import {loadExamples,examplesFor,exampleBody} from '../src/examples.js';
const chapter=courses(STARTERS,'N5')[0],now=Date.UTC(2026,8,28,3),id=chapter.wordIds[0];
const setup=()=>{const s=fresh();s.session=createClass(s,chapter,STARTERS);return s;};
const due=s=>{s.memory[keyOf(id,'meaning')]=schedule(undefined,false,'prior',now-700000);return s;};
const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
test('038: review can park an unfinished class without resetting selections',()=>{
 const s=due(setup()),c=s.session;c.index=3;c.selection='a';c.assisted=true;c.showExample=true;c.exampleIndex=1;
 assert.equal(enterReview(s,STARTERS,'due',now),'started');assert.equal(s.suspendedSession,c);assert.equal(s.session.kind,'review');
 assert.equal(swapSession(s),true);assert.equal(s.session,c);assert.equal(c.index,3);assert.equal(c.selection,'a');assert.equal(c.assisted,true);assert.equal(c.exampleIndex,1);
 assert.equal(enterReview(s,STARTERS,'due',now),'resume');assert.equal(s.suspendedSession,c);
});
test('038: empty review cannot erase or park a class',()=>{const s=setup(),c=s.session;assert.equal(enterReview(s,STARTERS,'due',now),'empty');assert.equal(s.session,c);assert.equal(s.suspendedSession,null);});
test('038: saved active and parked lessons survive schema validation',()=>{
 const s=due(setup());s.session.index=2;s.session.assisted=true;s.session.exampleIndex=1;s.session.showExample=true;enterReview(s,STARTERS,'due',now);
 const r=validateState(JSON.parse(JSON.stringify(s)));assert.equal(r.session.kind,'review');assert.equal(r.suspendedSession.kind,'class');assert.equal(r.suspendedSession.index,2);assert.equal(r.suspendedSession.assisted,true);assert.equal(r.suspendedSession.exampleIndex,1);assert.equal(r.suspendedSession.showExample,true);
});
test('038: older backups without parked lessons remain valid',()=>{const s=setup();delete s.suspendedSession;assert.equal(validateState(s).suspendedSession,null);});
test('038: duplicate active/parked IDs are rejected',()=>{const s=setup();s.suspendedSession=structuredClone(s.session);assert.throws(()=>validateState(s),/중복/);});
test('038: completed review returns to the exact unfinished class',()=>{const s=due(setup()),c=s.session;enterReview(s,STARTERS,'due',now);s.session.finished=true;assert.equal(finishSession(s),true);assert.equal(s.session,c);assert.equal(s.suspendedSession,null);assert.equal(finishSession(s),false);assert.equal(s.session,c);});
test('038: class restart resets progress but retains SRS, XP and same-round identity',()=>{
 const s=due(setup()),round=s.session.id;s.session.index=7;s.session.feedback={correct:true};s.session.ink={anything:true};s.xp=25;s.known[id]=now;s.completed[chapter.id]=1;
 const saved=JSON.stringify([s.memory,s.xp,s.known,s.completed]);assert.equal(restartSession(s,STARTERS),true);
 assert.equal(s.session.id,round);assert.equal(s.session.index,0);assert.equal(s.session.feedback,null);assert.equal(s.session.ink,null);assert.equal(current(s.session).phase,'survey');assert.equal(s.session.course.id,chapter.id);assert.equal(JSON.stringify([s.memory,s.xp,s.known,s.completed]),saved);
});
test('038: review restart deduplicates retries, keeps schedules and preserves parked lesson',()=>{
 const s=due(setup()),c=s.session;enterReview(s,STARTERS,'due',now);const round=s.session.id,q=s.session.queue[0];s.session.queue.push({...q,id:'retry-038',attempt:1});s.session.index=1;s.session.assisted=true;s.session.ink={example:true};
 const memory=JSON.stringify(s.memory);assert.equal(restartSession(s,STARTERS),true);assert.equal(s.session.id,round);assert.equal(s.session.queue.length,1);assert.equal(s.session.queue[0].attempt,0);assert.equal(s.session.index,0);assert.equal(s.session.assisted,false);assert.equal(s.session.ink,null);assert.equal(s.suspendedSession,c);assert.equal(JSON.stringify(s.memory),memory);
});
test('038: beginning a different class preserves a review in either slot',()=>{
 const s=due(setup());enterReview(s,STARTERS,'due',now);const review=s.session;startClassSession(s,chapter,STARTERS);assert.equal(s.suspendedSession,review);assert.equal(s.session.kind,'class');
 startClassSession(s,chapter,STARTERS);assert.equal(s.suspendedSession,review);assert.equal(enterReview(s,STARTERS,'due',now),'resume');assert.equal(s.session,review);
});
test('038: restarting kana preserves its mastered progress and JLPT state',()=>{const s=setup();s.kana=freshKana();startKana(s.kana,'h-a');s.kana.progress['KANA-h3042']={passes:3,lastAt:now,due:now+86400000};s.kana.session.index=3;const c=s.session;startKana(s.kana,'h-a');assert.equal(s.kana.session.index,0);assert.equal(s.kana.progress['KANA-h3042'].passes,3);assert.equal(s.session,c);});
test('038: every writing flow has answer and hint controls',()=>{const app=read('../src/app.js'),kana=read('../src/kana-ui.js');assert.match(app,/btn\('hint'/);assert.match(app,/btn\('reveal-writing'/);assert.match(kana,/btn\('kana-hint'/);assert.match(kana,/btn\('kana-answer'/);assert.doesNotMatch(app,/!s\.ink\.hadError/);});
test('038: caches and Android sync contain new study assets',()=>{for(const text of [read('../sw.js'),read('../scripts/sync-android.mjs')])assert.ok(text.includes('learning.css'));for(const name of ['session-controls.js','examples-expanded.json'])assert.ok(read('../sw.js').includes(name));});
test('038: example lookup stays deterministic, escaped and one-card paginated',async()=>{
 const originalFetch=globalThis.fetch;
 const entries=[{id:'a',wordIds:[id],ja:'山に登った。',ko:'산에 올랐다.',reading:'やまにのぼった。'},{id:'b',wordIds:[id],ja:'<script>alert(1)</script>',ko:'검증용',sourceId:'javascript:bad'}];
 globalThis.fetch=async()=>({ok:true,json:async()=>({version:1,entries})});
 try{await loadExamples();await loadExamples();const w={id,word:'山',reading:'やま'};assert.equal(examplesFor(w).length,2);const first=exampleBody(w,true,0);assert.equal((first.match(/class="example-card"/g)||[]).length,1);assert.ok(first.includes('예문 듣기'));assert.ok(first.includes('0.7×'));const second=exampleBody(w,false,1);assert.ok(second.includes('&lt;script&gt;'));assert.ok(!second.includes('href="javascript:'));assert.ok(!second.includes('example-reading'));}finally{globalThis.fetch=originalFetch;}
});
test('038: sentence playback uses full Japanese and independent slow rate',async()=>{
 let spoken;const oldS=globalThis.speechSynthesis,oldU=globalThis.SpeechSynthesisUtterance;
 globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 globalThis.speechSynthesis={getVoices:()=>[{lang:'ja-JP',localService:true}],cancel(){},speak(u){spoken=u;queueMicrotask(()=>u.onend?.());}};
 try{assert.equal(await speakSentence('今日は山に登ります。',.7),true);assert.equal(spoken.text,'今日は山に登ります。');assert.equal(spoken.rate,.7);assert.equal(spoken.lang,'ja-JP');}finally{stopAudio();globalThis.speechSynthesis=oldS;globalThis.SpeechSynthesisUtterance=oldU;}
});
test('038: sentence playback rejects remote-only voices instead of substituting word audio',async()=>{
 const oldS=globalThis.speechSynthesis,oldU=globalThis.SpeechSynthesisUtterance;globalThis.SpeechSynthesisUtterance=class{};globalThis.speechSynthesis={getVoices:()=>[{lang:'ja-JP',localService:false}],cancel(){}};
 try{await assert.rejects(speakSentence('こんにちは。'),/オフライン|오프라인/);}finally{stopAudio();globalThis.speechSynthesis=oldS;globalThis.SpeechSynthesisUtterance=oldU;}
});
test('038: stop cancels pending sentence playback promptly',async()=>{
 let canceled=0;const oldS=globalThis.speechSynthesis,oldU=globalThis.SpeechSynthesisUtterance;globalThis.SpeechSynthesisUtterance=class{};globalThis.speechSynthesis={getVoices:()=>[{lang:'ja',localService:true}],speak(){},cancel(){canceled++;}};
 try{const p=speakSentence('長い例文です。');const rejection=assert.rejects(p,/중단/);stopAudio();await rejection;assert.ok(canceled>0);}finally{stopAudio();globalThis.speechSynthesis=oldS;globalThis.SpeechSynthesisUtterance=oldU;}
});
test('038: empty or oversized sentence input fails clearly',async()=>{await assert.rejects(speakSentence(''));await assert.rejects(speakSentence('あ'.repeat(501)));});
