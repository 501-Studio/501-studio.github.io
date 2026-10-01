import {btn,esc,icon} from './view.js';
import {TUTORIAL_STEPS} from './tutorial-state.js';
export const TUTORIAL_COPY=Object.freeze([
 {title:'아는 단어는 넘기세요',body:'홈에서 급수와 챕터를 고른 뒤, 아는 단어와 모르는 단어를 나눕니다. 모르는 단어만 이어서 학습합니다.',note:'빠른 확인에서는 자동 발음 없이, 필요할 때 발음 듣기·읽기·뜻을 직접 확인할 수 있습니다.',kind:'survey'},
 {title:'듣고, 한 글자씩 쓰세요',body:'학습 화면에 들어가면 단어 발음이 한 번 나옵니다. 글자를 완성하면 원래 자리에 남고, 다음 글자로 이어집니다.',note:'힌트와 정답 보기를 사용할 수 있습니다. 예문 전체는 듣기 버튼을 누르세요.',kind:'writing'},
 {title:'중단한 수업은 이어서',body:'수업의 × 버튼으로 나가면 진행과 필기가 저장됩니다. 본수업을 보관한 채 복습하거나, 예정일 전에 미리 복습할 수도 있습니다.',note:'복습 탭 → 지금 복습 / 미리 복습',kind:'review'},
 {title:'단어장에서 골라 연습',body:'단어별 듣기·예문·반복 쓰기를 바로 엽니다. 여러 단어를 선택해 폴더에 담거나, 원하는 유형만 테스트할 수 있습니다.',note:'맞춤 학습 → 약점·개인 폴더·미니시험·연속 듣기',kind:'wordbook'},
 {title:'내 기록과 설정도 확인하세요',body:'내 기록에서 학습량과 유형별 약점을 확인합니다. 설정에서는 학습 강도와 음성을 바꾸고, 기록을 백업할 수 있습니다.',note:'일본어 오프라인 음성이 필요합니다. 이 안내는 설정에서 다시 볼 수 있습니다.',kind:'settings'}
]);
function preview(kind){
 if(kind==='survey')return '<div class="tour-word" lang="ja">山<small>やま</small></div><div class="tour-demo-chips"><span>'+icon('sound')+' 발음 듣기</span><span>모르는 단어</span><span class="picked">✓ 아는 단어</span></div>';
 if(kind==='writing')return '<div class="tour-writing" lang="ja"><span>□□</span><i>→</i><span>学□</span><i>→</i><span class="picked">学校</span></div><div class="tour-demo-chips"><span>'+icon('sound')+' 단어 발음</span><span>'+icon('pen')+' 힌트 보기</span></div>';
 if(kind==='review')return '<div class="tour-resume">'+icon('book')+'<div><b>N5 · 진행 중</b><small>문제 위치와 필기 저장</small></div><span>이어서 하기</span></div><div class="tour-demo-chips"><span>'+icon('refresh')+' 지금 복습</span><span class="picked">미리 복습</span></div>';
 if(kind==='wordbook')return '<div class="tour-book-word"><b lang="ja">学校</b><span>학교</span><small>선택 1개</small></div><div class="tour-demo-chips"><span>'+icon('sound')+' 듣기</span><span>'+icon('book')+' 예문</span><span>'+icon('pen')+' 쓰기</span></div><div class="tour-folder">시험 전날 <span>폴더에 추가</span></div>';
 return '<div class="tour-tools"><div>'+icon('chart')+'<span>내 기록<small>학습량 · 약점</small></span></div><div>'+icon('settings')+'<span>설정<small>강도 · 음성 · 백업</small></span></div></div><div class="tour-demo-chips"><span>매우 쉬움</span><span>쉬움</span><span class="picked">중간</span><span>어려움</span></div>';
}
export function tutorialView(step,{replay=false}={}){
 const i=Math.min(TUTORIAL_STEPS-1,Math.max(0,Number.isInteger(step)?step:0)),s=TUTORIAL_COPY[i];
 return `<div class="tutorial" data-step="${i}" data-replay="${replay}"><div class="tour-top"><span>코토바 사용법</span>${btn('tutorial-skip',replay?'닫기':'건너뛰기','text')}</div><div class="tour-progress" aria-label="${i+1} / ${TUTORIAL_STEPS}단계"><span>${i+1} / ${TUTORIAL_STEPS}</span><div aria-hidden="true">${TUTORIAL_COPY.map((_,n)=>`<i class="${n<=i?'filled':''}"></i>`).join('')}</div></div><div class="tour-content"><h2 id="sheet-title" tabindex="-1">${esc(s.title)}</h2><p id="tour-description">${esc(s.body)}</p><div class="tour-preview" aria-hidden="true">${preview(s.kind)}</div><p class="tour-note">${esc(s.note)}</p></div><footer class="tour-footer">${btn('tutorial-previous','이전','soft',i===0?'disabled':'')}${btn(i===TUTORIAL_STEPS-1?'tutorial-finish':'tutorial-next',i===TUTORIAL_STEPS-1?(replay?'안내 마치기':'시작하기'):'다음','primary')}</footer><p class="tour-storage-status" role="status" aria-live="polite"></p></div>`;
}
