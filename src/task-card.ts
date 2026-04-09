import { tasks, tagDefs, hasHebrew } from './state';
import { isOverdue, isToday, formatDate, timeAgo, daysAgo } from './dates';
import { getTagIcon } from './config';
import { esc, highlightSearch } from './ui';

export function renderTaskCard(
  t,
  compact = false,
  extraHTML = '',
  showActivate = false,
  isDoneCard = false,
) {
  const children = tasks
    .filter((c) => c.parent_id === t.id)
    .sort(
      (a, b) =>
        (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity) ||
        (a.created_at || '').localeCompare(b.created_at || ''),
    );
  const doneChildren = children.filter((c) => c.status === 'done').length;
  const hasChildren = children.length > 0;

  let dueHTML = '';
  if (t.due_date) {
    let cls = '';
    if (isOverdue(t) && t.status !== 'done') cls = 'overdue';
    else if (isToday(t)) cls = 'today';
    dueHTML = `<span class="task-due ${cls}">${formatDate(t.due_date)}${t.due_time ? ' ' + t.due_time : ''}</span>`;
  } else if (t.due_date_start || t.due_date_end) {
    // Date range — flexible window
    const todayStr = new Date().toISOString().slice(0, 10);
    let cls = '';
    if (t.due_date_end && t.due_date_end < todayStr && t.status !== 'done') cls = 'overdue';
    else if (
      (t.due_date_start && t.due_date_start <= todayStr && t.status !== 'done') ||
      (t.due_date_end && t.due_date_end >= todayStr)
    )
      cls = 'today';
    const startStr = t.due_date_start ? formatDate(t.due_date_start) : '?';
    const endStr = t.due_date_end ? formatDate(t.due_date_end) : '?';
    dueHTML = `<span class="task-due ${cls}" title="Flexible window">${startStr} → ${endStr}</span>`;
  }

  const tagHTML = (t.tags || [])
    .map((tag) => {
      const def = tagDefs.find((d) => d.name === tag);
      const bgColor = def?.color ? def.color + '18' : '';
      const textColor = def?.color || '';
      const style = bgColor ? `style="background:${bgColor};color:${textColor}"` : '';
      return `<span class="tag-pill" ${style}>${getTagIcon(tag)} ${esc(tag)}</span>`;
    })
    .join('');

  const checked = t.status === 'done' ? 'checked' : '';

  let childrenHTML = '';
  if (hasChildren && !compact) {
    childrenHTML = `<div class="task-children">
      <span class="child-progress">${doneChildren}/${children.length} done</span>
      <div class="child-progress-bar" style="max-width:120px"><div class="fill" style="width:${Math.round((doneChildren / children.length) * 100)}%"></div></div>
      ${children
        .map(
          (c) => `
        <div class="task-child">
          <div class="task-child-check ${c.status === 'done' ? 'checked' : ''}"
               onclick="event.stopPropagation();toggleChildDone('${c.id}','${c.status}')"></div>
          <span class="task-child-title ${c.status === 'done' ? 'done' : ''}">${esc(c.title)}</span>
        </div>
      `,
        )
        .join('')}
    </div>`;
  }

  const createdHTML =
    t.created_at && !compact
      ? `<span class="task-created">Added ${formatDate(t.created_at.slice(0, 10))}</span>`
      : '';

  const editedHTML =
    t.updated_at && !compact && t.updated_at !== t.created_at
      ? `<span class="task-edited">Edited ${timeAgo(t.updated_at)}</span>`
      : '';

  const notesPreview =
    t.notes && !compact ? `<div class="task-notes-preview">${highlightSearch(t.notes)}</div>` : '';

  const agingDays = t.created_at && t.status !== 'done' ? daysAgo(t.created_at.slice(0, 10)) : 0;
  const isAging =
    agingDays >= 14 &&
    t.status !== 'done' &&
    t.status !== 'waiting' &&
    t.status !== 'backlog' &&
    t.status !== 'spark';

  return `<div class="task-card${isAging ? ' aging' : ''}" id="card_${t.id}" ${isAging ? 'title="Added ' + agingDays + ' days ago"' : ''}>
    <div class="task-top">
      <div class="task-check ${checked}" onclick="event.stopPropagation();toggleDone('${t.id}','${t.status}')"></div>
      <div class="task-body" onclick="toggleCardExpand(event, '${t.id}')" ondblclick="event.stopPropagation();openEditModal('${t.id}')">
        <div class="task-title-row">
          ${t.energy ? `<span class="energy-dot ${t.energy}"></span>` : ''}
          <span class="task-title"${hasHebrew(t.title) ? ' dir="rtl"' : ''}>${highlightSearch(t.title)}</span>
          ${hasChildren ? `<span class="child-progress-wrap"><span class="child-progress">${doneChildren}/${children.length}</span><div class="child-progress-bar"><div class="fill" style="width:${Math.round((doneChildren / children.length) * 100)}%"></div></div></span>` : ''}
        </div>
        <div class="task-meta">
          ${dueHTML}${tagHTML}${createdHTML}${editedHTML}
        </div>
        ${notesPreview}
        ${extraHTML}
      </div>
      ${showActivate ? '' : ''}
    </div>
    ${childrenHTML}
  </div>`;
}

export function toggleCardExpand(event, id) {
  event.stopPropagation();
  const card = document.getElementById('card_' + id);
  if (card) card.classList.toggle('expanded');
}
