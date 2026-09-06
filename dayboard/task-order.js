// Pure ordering logic. A saved GPT recommendation is not a live model call.
const DAY = 86400000;
export const remainingMinutes = task => task.status === 'done' ? 0 : Math.max(0, Math.ceil(Number(task.estimatedMinutes || 30) * (100 - Number(task.progress || 0)) / 100));
export function recommendationScore(task, today) {
  const days = task.deadline ? (Date.parse(task.deadline) - Date.parse(today)) / DAY : Infinity;
  return Number(task.importance || 2) * 8 + Number(task.urgency || 2) * 4 + (days < 0 ? 35 : Math.max(0, 27 - days * 3));
}
export function hasGPTOrder(task, now = Date.now()) {
  const stamp = Date.parse(task.recommendationAt || '');
  return Number.isInteger(task.recommendationRank) && task.recommendationRank >= 0 && Number.isFinite(stamp) && stamp <= now + 300000 && now - stamp <= 7 * DAY;
}
export function orderedTasks(items, settings = {}, today, { recommended = false, now = Date.now() } = {}) {
  const manual = new Map((Array.isArray(settings.taskOrder) && !recommended ? settings.taskOrder : []).map((id, n) => [id, n]));
  const sorted = [...items].sort((a, b) => {
    const am = manual.get(a.id) ?? Infinity, bm = manual.get(b.id) ?? Infinity;
    if (am !== bm) return am - bm;
    const ag = hasGPTOrder(a, now) ? a.recommendationRank : Infinity, bg = hasGPTOrder(b, now) ? b.recommendationRank : Infinity;
    if (ag !== bg) return ag - bg;
    return recommendationScore(b, today) - recommendationScore(a, today) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || a.id.localeCompare(b.id);
  });
  const slots = Array(sorted.length).fill(null);
  const pinned = sorted.filter(i => i.pinned === true).sort((a, b) => (a.pinIndex ?? 0) - (b.pinIndex ?? 0) || a.id.localeCompare(b.id));
  for (const item of pinned) {
    let pos = Math.max(0, Math.min(slots.length - 1, Number.isInteger(item.pinIndex) ? item.pinIndex : 0));
    // Conflicting or out-of-range legacy pins get the nearest available slot.
    if (slots[pos]) pos = slots.findIndex((slot, n) => !slot && n >= pos);
    if (pos < 0) pos = slots.findIndex(slot => !slot);
    slots[pos] = item;
  }
  const free = sorted.filter(i => !i.pinned);
  return slots.map(slot => slot || free.shift());
}
export function moveTaskOrder(list, sourceId, targetId, direction = 0) {
  const source = list.find(i => i.id === sourceId);
  if (!source) return list;
  if (source.pinned) throw new Error('핀을 해제한 뒤 순서를 바꿔 주세요. 핀은 업무 순서만 보호합니다.');
  const free = list.filter(i => !i.pinned);
  const from = free.findIndex(i => i.id === sourceId);
  let to = direction ? from + direction : free.findIndex(i => i.id === targetId);
  if (to < 0 || to >= free.length || to === from) return list;
  free.splice(to, 0, free.splice(from, 1)[0]);
  return list.map(i => i.pinned ? i : free.shift());
}
