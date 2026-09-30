/** Tutorial metadata only. Sample controls never modify learning/SRS records. */
import {esc,icon} from './view.js';
export const TUTORIAL_VERSION=1;
export const TUTORIAL_STEPS=Object.freeze([
 {title:'급수를 고르고 시작하세요',path:'홈 · 커리큘럼',text:'N5~N1 중 공부할 급수를 고르고 챕터를 엽니다. 먼저 아는 단어와 모르는 단어를 나눠 보세요.',note:'모르는 단어만 이어서 학습합니다. 아래 카드는 안내용 예시입니다.',visual:'survey'},
 {title:'듣고, 한 글자씩 써 보세요',path:'수업 · 단어 듣기 · 쓰기',text:'새 문제와 정답·예문 화면에서는 단어 발음을 한 번 들려줍니다. 쓰기를 마친 글자는 제자리에 남습니다.',note:'막히면 힌트나 정답 보기를 누르세요. 예문 전체는 ‘예문 듣기’로 재생합니다.',visual:'writing'},
 {title:'복습은 필요한 만큼',path:'복습 · 맞춤 학습 → 약점',text:'지금 복습하거나, 예정일 전에 미리 풀 수 있습니다. 5·10·20분 복습과 약한 유형만 풀기도 가능합니다.',note:'수업 위쪽 ×를 누르면 저장하고 나갈 수 있습니다. 나중에 이어서 하거나 같은 회차를 다시 시작하세요.',visual:'review'},
 {title:'단어장에서 바로 연습하세요',path:'단어장 · 맞춤 학습',text:'단어·예문 듣기와 쓰기를 바로 엽니다. 쓰기는 1~20회로 정하고, 여러 단어를 개인 폴더에 모을 수 있습니다.',note:'선택 단어 테스트, 연속 듣기, 급수별 어휘 미니시험도 ‘맞춤 학습’에서 이용하세요.',visual:'words'},
 {title:'강도와 기록은 설정에서',path:'설정 · 내 기록',text:'학습 강도는 매우 쉬움부터 어려움까지 네 단계입니다. 매우 쉬움은 듣기·쓰기 문제 없이 진행합니다.',note:'‘내 기록’에서 학습량과 약점을 확인하세요. 앱을 교체하거나 삭제하기 전에는 설정에서 기록을 백업해 주세요.',visual:'settings'}
]);
const clamp=v=>Number.isInteger(v)?Math.max(0,Math.min(TUTORIAL_STEPS.length-1,v)):0;
export function normalizeTutorial(v){
 const version=Number.isInteger(v?.version)&&v.version>=1&&v.version<=100?v.version:TUTORIAL_VERSION;
 const status=['started','completed','skipped'].includes(v?.status)?v.status:'pending';
 return {version,status,step:clamp(v?.step)};
}
export function needsTutorial(state){const t=normalizeTutorial(state?.tutorial);return t.version<=TUTORIAL_VERSION&&!['completed','skipped'].includes(t.status);}
export function tutorialProgress(status,step){return normalizeTutorial({version:TUTORIAL_VERSION,status,step});}
function visual(type){
 if(type==='survey')return `<div class="tour-word" lang="ja">山<small>やま</small></div><span class="tour-meaning">산</span><div class="tour-demo-actions"><button type="button" data-tour-demo="unknown">모르는 단어</button><button type="button" data-tour-demo="known">아는 단어</button></div><p id="tour-demo-status" role="status">버튼을 눌러 보세요. 학습 기록은 바뀌지 않습니다.</p>`;
 if(type==='writing')return `<div class="tour-glyphs" aria-label="완성 글자 표시: 빈칸 두 개, 학, 학교"><span lang="ja">□□</span><i aria-hidden="true">→</i><span lang="ja">学□</span><i aria-hidden="true">→</i><b lang="ja">学校</b></div><div class="tour-chips"><span>${icon('sound')}단어 발음 1회</span><span>${icon('pen')}힌트 · 정답 보기</span></div><p>쓰기를 마친 글자가 하나씩 채워집니다.</p>`;
 if(type==='review')return `<div class="tour-review-cards"><div>${icon('refresh')}<b>지금 복습</b><span>예정된 문제</span></div><div>${icon('book')}<b>미리 복습</b><span>먼저 확인하기</span></div></div><div class="tour-chips"><span>5분</span><span>10분</span><span>20분</span><span>약점만</span></div>`;
 if(type==='words')return `<div class="tour-mini-word"><b lang="ja">学校</b><span>がっこう · 학교</span></div><div class="tour-chips"><span>${icon('sound')}단어</span><span>${icon('book')}예문</span><span>${icon('pen')}쓰기</span></div><div class="tour-folder">${icon('library')}내 폴더 <b>시험 전날</b><span>선택 단어 테스트</span></div>`;
 return `<div class="tour-intensities"><span>매우 쉬움</span><span>쉬움</span><b>중간</b><span>어려움</span></div><div class="tour-chips"><span>${icon('chart')}학습 통계</span><span>${icon('download')}기록 백업</span></div><p>${icon('settings')}설정 → 기능 튜토리얼 다시 보기</p>`;
}
export function tutorialHTML(index=0,replay=false){
 const i=clamp(index),s=TUTORIAL_STEPS[i];
 return `<div class="tour-top"><span>코토바 사용법 <b>${i+1} / ${TUTORIAL_STEPS.length}</b></span><button type="button" data-tour-action="skip">${replay?'닫기':'건너뛰기'}</button></div><div class="tour-body"><p class="tour-path">${esc(s.path)}</p><h2 id="tour-title" tabindex="-1">${esc(s.title)}</h2><p id="tour-description">${esc(s.text)}</p><div class="tour-visual tour-${s.visual}">${visual(s.visual)}</div><p class="tour-note">${esc(s.note)}</p></div><div class="tour-bottom"><nav class="tour-dots" aria-label="안내 단계">${TUTORIAL_STEPS.map((step,n)=>`<button type="button" data-tour-step="${n}" aria-label="${n+1}단계: ${esc(step.title)}" ${n===i?'aria-current="step"':''}></button>`).join('')}</nav><div class="tour-actions"><button type="button" data-tour-action="prev" ${i===0?'disabled':''}>이전</button><button type="button" class="tour-primary" data-tour-action="next">${i===TUTORIAL_STEPS.length-1?(replay?'안내 마치기':'시작하기'):'다음'}</button></div><p class="tour-save-error" role="status" hidden></p></div>`;
}
