import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreSolo,scorePair,encodeAnswers,decodeAnswers,validAnswers,optionOrder,normalizeLocale,safeReferrer} from '../src/core.mjs';
import {TESTS,RESULT_KEYS} from '../src/definitions.mjs';
import {track,configureAnalytics,EVENTS} from '../src/integrations/analytics.mjs';

test('all 65,536 answer vectors round-trip and all six outcomes are reachable',()=>{
 const found=new Set();
 for(let bits=0;bits<=65535;bits++){
  const a=Array.from({length:8},(_,i)=>(bits>>(i*2))&3),result=scoreSolo(a);
  found.add(result.index);assert.equal(result.metrics.length,4);assert.ok(result.metrics.every(v=>Number.isInteger(v)&&v>=0&&v<=100));
  const token=encodeAnswers(26,a);assert.deepEqual(decodeAnswers(token,26),a);assert.ok(token.length<=16);
  assert.deepEqual(scoreSolo(a),result);
 }
 assert.deepEqual([...found].sort(),[0,1,2,3,4,5]);
});
test('expected dominant and hybrid results',()=>{
 for(let i=0;i<4;i++){assert.equal(scoreSolo(Array(8).fill(i)).index,i);assert.equal(scoreSolo(Array(8).fill(i)).metrics[i],100);}
 assert.equal(scoreSolo([0,0,0,0,1,1,1,1]).index,4);
 assert.equal(scoreSolo([2,2,2,2,3,3,3,3]).index,5);
});
test('malformed, cross-quiz and stale payloads are rejected',()=>{
 const a=[0,1,2,3,0,1,2,3],token=encodeAnswers(45,a);
 assert.equal(decodeAnswers(token,46),null);
 for(const bad of ['',null,'../../',token+'x',token.replace(/^1/,'2'),'1.19.zzzz.0','<script>','1.19.0000.0','x'.repeat(200)])assert.equal(decodeAnswers(bad,45),null);
 assert.throws(()=>scoreSolo([0]));assert.throws(()=>encodeAnswers(50,a));assert.throws(()=>encodeAnswers(1,Array(8).fill(4)));
 assert.equal(validAnswers(Array(8).fill(-1)),false);assert.equal(validAnswers(Array(8).fill('0')),false);
});
test('two-player scoring is symmetric, deterministic and recognizes identical answers',()=>{
 const a=[0,1,2,3,0,1,2,3],b=[3,2,1,0,3,2,1,0];
 assert.deepEqual(scorePair(a,b),scorePair(b,a));assert.equal(scorePair(a,a).score,100);assert.equal(scorePair(a,a).matches,8);
 const types=new Set();for(let k=0;k<=8;k++){const x=Array(8).fill(1),y=Array.from({length:8},(_,i)=>i<k?3:1);types.add(scorePair(x,y).index);}
 assert.equal(types.size,6);
});
test('display rotation preserves semantic option identities',()=>{
 for(const t of TESTS)for(let i=0;i<8;i++)assert.deepEqual([...optionOrder(t.id,i)].sort(),[0,1,2,3]);
});
test('locale negotiation is explicit and referrers are stripped to origins',()=>{
 assert.equal(normalizeLocale('pt-PT'),'pt-BR');assert.equal(normalizeLocale('zh-Hant-TW'),'zh-CN');assert.equal(normalizeLocale('ar-SA'),'ar');assert.equal(normalizeLocale('xx-XX'),'en');
 assert.equal(safeReferrer('https://example.org/private?name=person#answers'),'https://example.org');assert.equal(safeReferrer('not a URL'),'');
});
test('analytics excludes answers, identifiers and full URLs',()=>{
 const received=[];configureAnalytics(x=>received.push(x));
 assert.equal(track('quiz_complete',{locale:'ko',quizSlug:'rpg-class',resultType:'strategist',referrer:'https://example.org/user?email=secret',answers:[0,1],email:'secret',nickname:'secret'}),true);
 assert.deepEqual(received,[{event:'quiz_complete',locale:'ko',quizSlug:'rpg-class',resultType:'strategist',referrer:'https://example.org'}]);
 assert.equal(track('unknown',{}),false);assert.equal(EVENTS.length,14);configureAnalytics(null);
});
