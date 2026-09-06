import { esc, newItem, upsert, leaves, dateKey } from './core.js';
import { dashboardTasks, parseQuickTask } from './dashboard-domain.js';
import { orderedTasks, moveTaskOrder } from './task-order.js';
import { btn, modalFrame } from './views.js';
export function dashboardPreferences() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('dayboard.dashboard-ui.v2') || '{}'); } catch { /* Recover invalid local UI preferences. */ }
  return { timeline: saved.timeline === 'detail' ? 'detail' : 'list', taskFilter: 'all', taskTools: null, allTasks: false, allProjects: false, allDeadlines: false };
}
export function createDashboardController(env) {
  const { store, dashboard, getState, getDate, render, notify, openModal, openItem, openChat } = env;
  function persistView() { localStorage.setItem('dayboard.dashboard-ui.v2', JSON.stringify({ timeline: dashboard.timeline })); }
  async function move(id, target = null, direction = 0) {
    const state = getState(), list = dashboardTasks(state,getDate(),dashboard.taskFilter);
    const updated = moveTaskOrder(list,id,target,direction);
    if (updated.every((i,n) => i.id === list[n]?.id)) { notify('이 방향으로 옮길 업무가 없습니다.'); return; }
    const activeIds = new Set(leaves(state.items).filter(i=>i.status!=='done').map(i=>i.id));
    const updatedIds = updated.map(i=>i.id);
    const otherIds = (Array.isArray(state.settings.taskOrder) ? state.settings.taskOrder : []).filter(x=>activeIds.has(x)&&!updatedIds.includes(x));
    await store.commit([{ collection:'settings',action:'merge',data:{ taskOrder:[...updatedIds,...otherIds] } }]);
    notify('순서를 저장했습니다. 핀 고정 위치는 유지됩니다.',true);
  }
  async function handle(action,id) {
    switch (action) {
      case 'timeline-detail': dashboard.timeline='detail'; persistView(); render(); return true;
      case 'timeline-list': dashboard.timeline='list'; persistView(); render(); return true;
      case 'task-filter': dashboard.taskFilter=['all','today','unplaced'].includes(id)?id:'all'; dashboard.allTasks=false; dashboard.taskTools=null; render(); return true;
      case 'toggle-tasks': dashboard.allTasks=!dashboard.allTasks; render(); return true;
      case 'toggle-projects': dashboard.allProjects=!dashboard.allProjects; render(); return true;
      case 'toggle-deadlines': dashboard.allDeadlines=!dashboard.allDeadlines; render(); return true;
      case 'task-tools': dashboard.taskTools=dashboard.taskTools===id?null:id; render(); return true;
      case 'task-up': await move(id,null,-1); return true;
      case 'task-down': await move(id,null,1); return true;
      case 'pin-task': {
        const state=getState(), task=state.items.find(i=>i.id===id);
        if (!task) throw new Error('업무가 변경되었습니다. 최신 목록을 확인하세요.');
        const index=dashboardTasks(state,getDate(),dashboard.taskFilter).findIndex(i=>i.id===id);
        await store.commit([upsert('items',{id,pinned:!task.pinned,pinIndex:task.pinned?null:Math.max(0,index)})]);
        notify(task.pinned?'순서 고정을 해제했습니다.':'이 순서를 고정했습니다. 시간표 고정과는 별개입니다.',true);
        return true;
      }
      case 'restore-order':
        await store.commit([{collection:'settings',action:'merge',data:{taskOrder:[]}}]);
        notify('추천순으로 복원했습니다. 핀 고정은 유지됩니다.',true); return true;
      case 'gpt-order':
        openChat('최신 업무와 남은 시간, 마감·중요도·긴급도·프로젝트 우선순위를 보고 실행 순서를 추천해줘. 각 미완료 최하위 업무에 recommendationRank(0부터), recommendationAt(현재 ISO 시각)를 제안해줘. pinned와 pinIndex는 변경하지 마. 기존 수동 순서를 추천순으로 복원할지 먼저 확인하고 승인받으면 settings.taskOrder=[]를 함께 적용해줘'); return true;
      case 'gpt-plan': openChat('최신 일정을 읽고 오늘과 이번 주 실행 계획을 제안해줘. 고정 순서(pinned, pinIndex)와 수동 순서(settings.taskOrder)를 존중하고, 시간 고정(locked)은 별개로 보호해줘. 먼저 제안하고 승인 후 적용해줘'); return true;
      case 'natural-input':
        openModal(modalFrame('자연어로 업무 추가',`<p class="small muted">날짜·예상시간·프로젝트를 한 줄로 적으세요. 다음 화면에서 확인하고 저장합니다.</p><label for="natural-text" class="space-top">추가할 업무 한 개</label><textarea id="natural-text" name="natural" maxlength="1000" rows="4" required placeholder="내일까지 결과 정리, 90분, 가을 발표 준비 프로젝트"></textarea><p class="hint">기본 문장 규칙으로 해석하며 AI API는 사용하지 않습니다. 여러 업무 분해나 복잡한 시간 배치는 ChatGPT로 요청하세요.</p>`,`<div class="actions">${btn('natural-chat','ChatGPT로 계획')}<button class="button primary" type="submit">내용 확인</button></div>`,'natural-form')); return true;
      case 'natural-chat': {
        const text=document.getElementById('natural-text')?.value.trim();
        openChat(text || '최신 일정을 보고 내 업무를 정리해줘'); return true;
      }
      default: return false;
    }
  }
  function natural(raw) {
    const result=parseQuickTask(raw,getState(),getDate());
    openItem(result.item,false,getDate(),[...result.assumptions,...result.warnings]);
  }
  return {handle,move,natural};
}
