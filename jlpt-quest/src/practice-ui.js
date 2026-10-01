import {completedWord} from './learning-policy.js';
import {recordStroke} from './study-data.js';
import {btn,esc,icon,heading} from './view.js';
import {writingChars,writingPattern} from './catalog.js';
import {characterStrokes} from './stroke-bank.js';
import {attachStrokePad} from './stroke-pad.js';
import {practiceInk} from './word-practice.js';
const isHan=w=>/\p{Script=Han}/u.test(w.word);
export function practiceFooter(p,w){
 const q=p.ink,complete=q?.results.every(Boolean),activeDone=q?.results[q.active];
 return `<footer class="lesson-footer"><div class="lesson-footer-inner"><span class="footer-hint">${p.completed} / ${p.repeats}회 완료</span>${btn('practice-next',complete?(p.completed+1===p.repeats?'연습 완료':'다음 반복'):'다음 글자','primary',activeDone?'':'disabled')}</div></footer>`;
}
export function practiceView(state,w){
 const p=state.wordPractice;
 if(!p||!w)return `<main class="focus-shell">${heading('쓰기 연습')}${btn('practice-exit','단어장으로','primary')}</main>`;
 if(p.finished)return `<main class="focus-shell"><section class="result"><div class="result-emblem">${icon('check')}</div><h1>쓰기 연습 완료</h1><p lang="ja">${esc(w.word)}</p><p>${p.repeats}회 완료</p><p class="fine">단어장 연습은 수업 진도와 복습 일정에 영향을 주지 않습니다.</p>${btn('practice-options','다시 연습','primary wide',`data-id="${w.id}"`)}${btn('practice-exit','단어장으로','soft wide')}</section></main>`;
 const q=practiceInk(p,w),chars=writingChars(w),paths=characterStrokes(chars[q.active]);
 return `<div class="focus-shell practice-focus"><header class="focus-top"><button class="icon-btn" data-action="practice-exit" aria-label="쓰기 저장하고 단어장으로">${icon('close')}</button><div class="session-progress"><div class="line-progress"><i style="width:${p.completed/p.repeats*100}%"></i></div></div><b>${p.completed+1} / ${p.repeats}회</b></header><main class="question" id="main">${heading(isHan(w)?'한자 쓰기':'가나 쓰기')}<div class="ink-prompt"><div><strong>${esc(w.meaning)}</strong><p id="practice-word-progress" lang="ja" aria-live="polite">${esc(completedWord(w,q.results,p.guide))}</p>${state.settings.furigana?`<small lang="ja">${esc(w.reading)}</small>`:''}</div>${btn('practice-guide',p.guide?'가리고 쓰기':'따라 쓰기','text',`aria-pressed="${p.guide}"`)}</div><div class="character-tabs">${chars.map((c,i)=>btn('practice-character',q.results[i]?esc(c):p.guide?esc(c):String(i+1),i===q.active?'soft active':'text',`data-index="${i}" aria-label="${i+1}번째 글자"`)).join('')}<span id="practice-count">${q.characters[q.active].length} / ${paths.length}획</span><button type="button" class="writing-auto-toggle ${state.settings.writingAutoAdvance?'active':''}" data-action="writing-auto-advance" role="switch" aria-checked="${state.settings.writingAutoAdvance}" aria-label="글자 완성 후 자동 넘기기"><span>자동</span><b>${state.settings.writingAutoAdvance?'ON':'OFF'}</b></button></div><div class="ink-pad snap-pad"><div class="cross-lines"></div><canvas id="practice-canvas" aria-label="단어장 쓰기 필기장"></canvas></div><p class="grader-status" id="practice-status" role="status">${q.results[q.active]?'글자 완성':`${q.characters[q.active].length+1}번째 획`}</p><div class="ink-toolbar">${btn('practice-undo',icon('undo')+' 한 획 취소','text')}${btn('practice-clear','다시 쓰기','text')}</div><div class="writing-help">${btn('practice-hint','힌트 보기','soft')}${btn('practice-answer','정답 보기','soft')}${btn('word-audio',icon('sound')+' 듣기','text',`data-id="${w.id}"`)}</div></main></div>${practiceFooter(p,w)}`;
}
export function mountPractice(state,w,{save,render}){
 const p=state.wordPractice,canvas=document.querySelector('#practice-canvas');if(!p||p.finished||!canvas)return null;
 const q=practiceInk(p,w),chars=writingChars(w),paths=characterStrokes(chars[q.active]);
 return attachStrokePad(canvas,paths,q.characters[q.active],{guide:p.guide,motion:state.settings.motion,width:state.settings.penWidth,character:chars[q.active],onChange(){q.results[q.active]=q.characters[q.active].length===paths.length;},onAttempt(result,count,total){
  document.querySelector('#practice-status').textContent=result.accepted?(count===total?'글자 완성':`${count}획 완료 · ${count+1}번째 획`):result.reason;
  const target=document.querySelector('#practice-word-progress');if(target)target.textContent=completedWord(w,q.results,p.guide);const tab=document.querySelector(`[data-action="practice-character"][data-index="${q.active}"]`);if(q.results[q.active]&&tab)tab.textContent=chars[q.active];recordStroke(state,chars[q.active],result.accepted?count-1:count,result.accepted);
  document.querySelector('#practice-count').textContent=`${count} / ${total}획`;
  document.querySelector('.lesson-footer').outerHTML=practiceFooter(p,w);save();
  if(result.accepted&&count===total&&q.results[q.active]&&state.settings.writingAutoAdvance&&!q.results.every(Boolean)){
   const active=q.active,wordId=p.wordId;
   const status=document.querySelector('#practice-status');if(status)status.textContent='글자 완성. 다음 글자로 넘어갑니다.';
   setTimeout(async()=>{const live=state.wordPractice;if(!state.settings.writingAutoAdvance||!live||live.finished||live.wordId!==wordId)return;const ink=practiceInk(live,w);if(ink.active!==active||!ink.results[active])return;const nextIndex=ink.results.findIndex(v=>!v);if(nextIndex<0)return;ink.active=nextIndex;await save();render?.();},260);
  }
 }});
}
