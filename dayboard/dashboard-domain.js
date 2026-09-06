import { DEFAULTS, dateKey, at, addDays, dayOfWeek, weekStart, leaves, descendants, newItem } from './core.js';
import { orderedTasks, remainingMinutes } from './task-order.js';
export { orderedTasks, remainingMinutes } from './task-order.js';
const DAY = 86400000, MINUTE = 60000;
export function effectiveTask(task, items) {
  const byId = new Map(items.map(i => [i.id, i]));
  let deadline = task.deadline || null, importance = Number(task.importance || 2), parent = byId.get(task.parentId);
  for (let depth = 0; parent && depth < 2; depth++, parent = byId.get(parent.parentId)) {
    if (parent.deadline && (!deadline || parent.deadline < deadline)) deadline = parent.deadline;
    importance = Math.max(importance, Number(parent.importance || 2));
  }
  return { ...task, deadline, importance };
}
export function dashboardTasks(state, date, filter = 'all', now = Date.now()) {
  const timed = new Set(state.blocks.filter(b => +new Date(b.end) > +at(date) && +new Date(b.start) < +at(addDays(date, 1))).map(b => b.taskId));
  const future = new Set(state.blocks.filter(b => +new Date(b.end) > Math.max(now, +at(date))).map(b => b.taskId));
  const raw = leaves(state.items).filter(i => i.status !== 'done').map(i => effectiveTask(i, state.items));
  const candidates = raw.filter(i => filter === 'unplaced' ? !future.has(i.id) : filter === 'today' ? timed.has(i.id) || (i.deadline && i.deadline <= date) : timed.has(i.id) || !future.has(i.id) || (i.deadline && i.deadline <= date));
  return orderedTasks(candidates, state.settings, date, { now });
}
export function projectSummary(project, state, date) {
  const ids = new Set(descendants(state.items, project.id));
  const tasks = leaves(state.items).filter(i => ids.has(i.id));
  const pending = tasks.filter(i => i.status !== 'done').map(i => effectiveTask(i, state.items));
  const next = orderedTasks(pending, state.settings, date)[0];
  return { project, next, total: tasks.length, remaining: pending.length, minutes: pending.reduce((n, i) => n + remainingMinutes(i), 0), progress: project.progress || 0 };
}
function unionLength(intervals) {
  let total = 0, end = -Infinity;
  for (const [a, b] of intervals.sort((a, b) => a[0] - b[0])) {
    if (b > end) { total += b - Math.max(a, end); end = b; }
  }
  return Math.max(0, total);
}
// Capacity is shared by all work due by the deadline, not counted per project.
export function availableMinutes(state, fromDate, throughDate, creditIds = new Set(), now = Date.now()) {
  const s = { ...DEFAULTS, ...state.settings };
  const count = Math.round((at(throughDate) - at(fromDate)) / DAY) + 1;
  let total = 0;
  for (let n = 0; n < Math.max(0, Math.min(366, count)); n++) {
    const d = addDays(fromDate, n), weekend = [0, 6].includes(dayOfWeek(d));
    const begin = Math.max(+at(d, weekend ? s.weekendStart : s.workStart), now);
    const end = +at(d, weekend ? s.weekendEnd : s.workEnd);
    if (begin >= end) continue;
    const buffer = Number(s.bufferMinutes || 0) * MINUTE;
    const intervals = [];
    const add = (a, b, pad = 0) => { const start = Math.max(begin, a - pad), finish = Math.min(end, b + pad); if (finish > start) intervals.push([start, finish]); };
    add(+at(d, s.lunchStart), +at(d, s.lunchEnd), buffer);
    for (const b of state.blocks) {
      // Already booked work for these deadlines is productive capacity; don't subtract it twice.
      if (b.source !== 'google' && creditIds.has(b.taskId)) continue;
      add(+new Date(b.start), +new Date(b.end), buffer);
    }
    total += (end - begin - unionLength(intervals)) / MINUTE;
  }
  return Math.max(0, Math.floor(total));
}
export function deadlineRisks(state, date, now = Date.now()) {
  const end = addDays(weekStart(date), 6), today = dateKey(now), from = date > today ? date : today;
  const atoms = leaves(state.items).filter(i => i.status !== 'done').map(i => effectiveTask(i, state.items));
  const capacityCache = new Map();
  const candidates = state.items.filter(i => i.deadline && i.deadline <= end && i.status !== 'done');
  return candidates.map(item => {
    const ids = new Set(descendants(state.items, item.id));
    const own = atoms.filter(i => ids.has(i.id));
    const remaining = own.reduce((n, i) => n + remainingMinutes(i), 0);
    const committed = atoms.filter(i => i.deadline && i.deadline <= item.deadline);
    const demand = committed.reduce((n, i) => n + remainingMinutes(i), 0);
    if (!capacityCache.has(item.deadline)) capacityCache.set(item.deadline, availableMinutes(state, from, item.deadline, new Set(committed.map(i => i.id)), now));
    const capacity = capacityCache.get(item.deadline);
    const overdue = item.deadline < today;
    const level = overdue || demand > capacity ? 'danger' : demand > 0 && demand >= capacity * .7 ? 'warn' : 'normal';
    return { item, remaining, demand, capacity, unknown: !own.length, overdue, level, label: overdue ? '지남' : level === 'danger' ? '위험' : level === 'warn' ? '주의' : '여유' };
  }).sort((a, b) => {
    const group = { danger: 0, warn: 1, normal: 2 };
    return group[a.level] - group[b.level] || a.item.deadline.localeCompare(b.item.deadline) || Number(b.item.importance) - Number(a.item.importance) || a.item.id.localeCompare(b.item.id);
  });
}
export function parseQuickTask(raw, state, today) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 1000) throw new Error('업무 한 개를 1,000자 이내로 입력하세요.');
  if (raw.trim().includes('\n')) throw new Error('한 번에 업무 한 개를 입력하세요. 여러 업무의 계획은 ChatGPT로 요청해 주세요.');
  let text = raw.trim(), deadline = null, estimatedMinutes = 30, parentId = null, importance = 2;
  const warnings = [], assumptions = [];
  function take(pattern, fn) { const match = text.match(pattern); if (match) { fn(match); text = text.replace(match[0], ' '); return true; } return false; }
  if (/오전|오후|\d\s*시(?!간)|\d{1,2}:\d{2}/.test(text)) warnings.push('시각 표현은 자동으로 배치하지 않았습니다. 다음 화면에서 ‘시간대도 함께 배치’를 선택하거나 ChatGPT로 계획하세요.');
  const explicit = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (explicit) {
    const d = new Date(explicit[1] + 'T12:00:00Z');
    if (!Number.isFinite(+d) || d.toISOString().slice(0, 10) !== explicit[1]) throw new Error('입력한 날짜가 올바르지 않습니다.');
    deadline = explicit[1]; text = text.replace(explicit[0], ' ');
  } else if (!take(/(모레|내일|오늘)(?:까지|에)?/, m => { deadline = addDays(today, { 오늘: 0, 내일: 1, 모레: 2 }[m[1]]); })) {
    take(/(?:(이번\s*주|다음\s*주)\s*)?([월화수목금토일])요일?(?:까지|에)?/, m => {
      const weekday = '월화수목금토일'.indexOf(m[2]);
      let result = addDays(weekStart(today), weekday + (m[1]?.replace(/\s/g, '') === '다음주' ? 7 : 0));
      if (!m[1] && result < today) result = addDays(result, 7);
      deadline = result;
    });
  }
  const gotHours = take(/(\d+(?:\.\d+)?)\s*(?:시간|h\b)(?:\s*(\d+)\s*분)?/i, m => { estimatedMinutes = Math.round(Number(m[1]) * 60 + Number(m[2] || 0)); });
  if (!gotHours) take(/(\d+)\s*(?:분|min\b)/i, m => { estimatedMinutes = Number(m[1]); });
  if (estimatedMinutes < 5 || estimatedMinutes > 4800) throw new Error('예상시간은 5분~80시간 사이로 입력하세요.');
  estimatedMinutes = Math.ceil(estimatedMinutes / 5) * 5;
  const projectNames = state.items.filter(i => i.kind === 'project').sort((a, b) => b.title.length - a.title.length);
  const projectMention = text.match(/(?:^|[,;]\s*|\s)([^,;]+?)\s*프로젝트(?:에|로)?/);
  if (projectMention) {
    const named = projectMention[1].trim();
    const matches = projectNames.filter(p => p.title.toLocaleLowerCase() === named.toLocaleLowerCase());
    if (matches.length === 1) { parentId = matches[0].id; text = text.replace(projectMention[0], ' '); }
    else warnings.push('프로젝트 이름을 정확히 찾지 못했습니다. 다음 화면에서 직접 선택하세요.');
  }
  take(/중요도\s*(높음|보통|낮음)/, m => { importance = { 높음: 3, 보통: 2, 낮음: 1 }[m[1]]; });
  text = text.replace(/(?:넣어\s*줘|추가해\s*줘|등록해\s*줘|해야\s*해|예상|마감)(?:요)?/g, ' ').replace(/(?:까지|에)\s*[,;]?\s*$/g, ' ').replace(/^[\s,;]+|[\s,;]+$/g, '').replace(/\s*[,;]\s*(?=[,;]|$)/g, '').replace(/\s{2,}/g, ' ').trim();
  if (!text || text.length > 200) throw new Error('날짜·시간 외에 200자 이하의 업무 제목을 적어 주세요.');
  if (deadline) assumptions.push(`날짜 표현을 마감일 ${deadline}로 해석했습니다.`);
  else assumptions.push('마감일은 미정으로 둡니다.');
  assumptions.push(`예상 소요시간 ${estimatedMinutes}분. 다음 화면에서 수정할 수 있습니다.`);
  return { item: newItem({ title: text, deadline, estimatedMinutes, parentId, importance, notes: `자연어 입력 원문: ${raw}` }), warnings, assumptions };
}
