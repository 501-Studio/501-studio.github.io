// Shared preflight for local, cloud and imported changes. Never coerces or deletes data.
export class HierarchyError extends Error {
  constructor(code, item) {
    super(code);
    this.name = 'HierarchyError';
    this.itemId = item?.id || null;
    this.itemTitle = item?.title || '';
  }
}
export function assertHierarchy(items) {
  if (!Array.isArray(items)) throw new HierarchyError('INVALID_STATE');
  const byId = new Map();
  for (const item of items) {
    if (!item?.id || !['project', 'task', 'subtask'].includes(item.kind))
      throw new HierarchyError('INVALID_KIND_STATUS', item);
    if (byId.has(item.id)) throw new HierarchyError('DUPLICATE_ID', item);
    byId.set(item.id, item);
  }
  for (const item of items) {
    const parentId = item.parentId;
    if (parentId == null || parentId === '') {
      if (item.kind === 'subtask') throw new HierarchyError('SUBTASK_REQUIRES_PARENT', item);
      continue;
    }
    if (item.kind === 'project') throw new HierarchyError('PROJECT_CANNOT_HAVE_PARENT', item);
    const parent = byId.get(parentId);
    const expected = item.kind === 'subtask' ? 'task' : 'project';
    if (!parent || parent.kind !== expected) throw new HierarchyError('INVALID_PARENT', item);
  }
  return items;
}
