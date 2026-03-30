import { sb, getTagIcon } from './config';
import {
  tasks,
  tagDefs,
  editingTaskId,
  viewingDate,
  setEditingTaskId,
  setTasks,
  setViewingDate,
} from './state';
import { today, formatDate } from './dates';
import { esc, showToast } from './ui';

// Late-bound callback — set by app.ts
let _renderCurrentTab: () => void = () => {};

export function setModalsCallbacks(renderCb: () => void) {
  _renderCurrentTab = renderCb;
}

// ─── Edit Modal ───

export function openEditModal(id) {
  setEditingTaskId(id);
  const t = tasks.find((x) => x.id === id);
  if (!t) return;

  (document.getElementById('editTitle') as HTMLInputElement).value = t.title || '';
  (document.getElementById('editNotes') as HTMLTextAreaElement).value = t.notes || '';
  (document.getElementById('editStatus') as HTMLSelectElement).value = t.status || 'open';
  (document.getElementById('editDueDate') as HTMLInputElement).value = t.due_date || '';
  (document.getElementById('editDueTime') as HTMLInputElement).value = t.due_time || '';
  (document.getElementById('editWaitingOn') as HTMLInputElement).value = t.waiting_on || '';
  (document.getElementById('editWaitingFollowup') as HTMLInputElement).value =
    t.waiting_followup || '';

  // Energy
  document
    .querySelectorAll('.modal-energy-btn')
    .forEach((b: any) => b.classList.toggle('active', b.dataset.e === t.energy));

  // Waiting section visibility
  toggleWaitingSection();
  document.getElementById('editStatus').addEventListener('change', toggleWaitingSection);

  // Tags
  renderModalTags(t.tags || []);

  // Subtasks
  renderEditSubtasks(id);

  document.getElementById('editModal').classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function toggleWaitingSection() {
  const isWaiting =
    (document.getElementById('editStatus') as HTMLSelectElement).value === 'waiting';
  document.getElementById('editWaitingSection').style.display = isWaiting ? 'block' : 'none';
}

export function renderEditSubtasks(parentId) {
  const container = document.getElementById('editSubtasks');
  const children = tasks.filter((c) => c.parent_id === parentId);
  if (children.length === 0) {
    container.innerHTML =
      '<div style="font-size:.78rem;color:var(--dim);padding:.2rem 0">No subtasks yet</div>';
    return;
  }
  container.innerHTML = children
    .map((c) => {
      const duePart = c.due_date
        ? `<span style="font-size:.7rem;color:${c.due_date < today() && c.status !== 'done' ? '#c0392b' : 'var(--dim)'};white-space:nowrap">${formatDate(c.due_date)}</span>`
        : '';
      return `
    <div style="display:flex;align-items:center;gap:.4rem;padding:.3rem 0;border-bottom:1px solid var(--surface2)">
      <div class="task-child-check ${c.status === 'done' ? 'checked' : ''}"
           onclick="event.stopPropagation();toggleChildDone('${c.id}','${c.status}');setTimeout(()=>renderEditSubtasks('${parentId}'),300)"></div>
      <span style="flex:1;font-size:.82rem;${c.status === 'done' ? 'text-decoration:line-through;color:var(--dim)' : ''}">${esc(c.title)}</span>
      ${duePart}
      <input type="date" value="${c.due_date || ''}" style="font-size:.7rem;width:auto;padding:0 .2rem;border:1px solid var(--border);border-radius:4px;background:var(--surface)" onchange="updateSubtaskDate('${c.id}','${parentId}',this.value)">
      <button onclick="event.stopPropagation();deleteSubtask('${c.id}','${parentId}')" style="background:none;border:none;color:var(--dim);cursor:pointer;font-size:.75rem;padding:.2rem" title="Remove">✕</button>
    </div>`;
    })
    .join('');
}

export async function updateSubtaskDate(id, parentId, dateVal) {
  const { error } = await sb
    .from('tasks')
    .update({ due_date: dateVal || null })
    .eq('id', id);
  if (error) {
    showToast('Error updating date');
    return;
  }
  const t = tasks.find((x) => x.id === id);
  if (t) t.due_date = dateVal || null;
  renderEditSubtasks(parentId);
  _renderCurrentTab();
}

export async function addSubtask() {
  const input = document.getElementById('newSubtaskInput') as HTMLInputElement;
  const dateInput = document.getElementById('newSubtaskDate') as HTMLInputElement;
  const title = input.value.trim();
  if (!title || !editingTaskId) return;
  input.value = '';
  const dueDate = dateInput.value || null;
  dateInput.value = '';
  const { data, error } = await sb
    .from('tasks')
    .insert({
      title: title,
      parent_id: editingTaskId,
      status: 'open',
      due_date: dueDate,
      created_by: 'claude',
    })
    .select();
  if (error) {
    showToast('Error adding subtask');
    return;
  }
  if (data && data[0]) tasks.push(data[0]);
  renderEditSubtasks(editingTaskId);
  _renderCurrentTab();
  showToast('Subtask added');
}

export async function deleteSubtask(id, parentId) {
  const { error } = await sb.from('tasks').delete().eq('id', id);
  if (error) {
    showToast('Error deleting subtask');
    return;
  }
  setTasks(tasks.filter((t) => t.id !== id));
  renderEditSubtasks(parentId);
  _renderCurrentTab();
}

function renderModalTags(selectedTags) {
  const wrap = document.getElementById('editTagsWrap');
  const allTags = tagDefs.map((d) => d.name);
  const extraTags = selectedTags.filter((t) => !allTags.includes(t));
  const allNames = [...allTags, ...extraTags];

  wrap.innerHTML = allNames
    .map((name) => {
      const active = selectedTags.includes(name);
      return `<button class="modal-tag ${active ? 'active' : ''}" data-tag="${esc(name)}" onclick="toggleModalTag(this)">
      ${getTagIcon(name)} ${esc(name)}
    </button>`;
    })
    .join('');

  if (allNames.length === 0) {
    wrap.innerHTML = '<span style="font-size:.75rem;color:var(--dim)">No tags defined yet</span>';
  }
}

export function toggleModalTag(btn) {
  btn.classList.toggle('active');
}

export function pickModalEnergy(btn) {
  const wasActive = btn.classList.contains('active');
  document.querySelectorAll('.modal-energy-btn').forEach((b) => b.classList.remove('active'));
  if (!wasActive) btn.classList.add('active');
}

export function closeModal() {
  document.getElementById('editModal').classList.remove('visible');
  document.body.style.overflow = '';
  setEditingTaskId(null);
}

export function hasUnsavedModalChanges() {
  if (!editingTaskId) return false;
  const t = tasks.find((x) => x.id === editingTaskId);
  if (!t) return false;
  if ((document.getElementById('editTitle') as HTMLInputElement).value !== (t.title || ''))
    return true;
  if ((document.getElementById('editNotes') as HTMLTextAreaElement).value !== (t.notes || ''))
    return true;
  if ((document.getElementById('editStatus') as HTMLSelectElement).value !== (t.status || 'open'))
    return true;
  if ((document.getElementById('editDueDate') as HTMLInputElement).value !== (t.due_date || ''))
    return true;
  if ((document.getElementById('editDueTime') as HTMLInputElement).value !== (t.due_time || ''))
    return true;
  return false;
}

export async function saveTask() {
  if (!editingTaskId) return;
  const now = new Date().toISOString();

  const title = (document.getElementById('editTitle') as HTMLInputElement).value.trim();
  const notes = (document.getElementById('editNotes') as HTMLTextAreaElement).value.trim() || null;
  const status = (document.getElementById('editStatus') as HTMLSelectElement).value;
  const dueDate = (document.getElementById('editDueDate') as HTMLInputElement).value || null;
  const dueTime = (document.getElementById('editDueTime') as HTMLInputElement).value || null;
  const waitingOn =
    (document.getElementById('editWaitingOn') as HTMLInputElement).value.trim() || null;
  const waitingFollowup =
    (document.getElementById('editWaitingFollowup') as HTMLInputElement).value || null;

  const activeEnergy = document.querySelector('.modal-energy-btn.active') as HTMLElement;
  const energy = activeEnergy ? activeEnergy.dataset.e : null;

  const selectedTags = Array.from(document.querySelectorAll('.modal-tag.active')).map(
    (b: any) => b.dataset.tag,
  );

  if (!title) {
    showToast('Title is required');
    return;
  }

  const update: any = {
    title,
    notes,
    status,
    energy,
    due_date: dueDate,
    due_time: dueTime,
    waiting_on: waitingOn,
    waiting_followup: waitingFollowup,
    tags: selectedTags,
    updated_at: now,
  };

  const oldTask = tasks.find((t) => t.id === editingTaskId);
  if (status === 'done' && oldTask?.status !== 'done') update.completed_at = now;
  if (status !== 'done') update.completed_at = null;

  const { error } = await sb.from('tasks').update(update).eq('id', editingTaskId);
  if (error) {
    showToast('Error saving: ' + error.message);
    return;
  }

  if (oldTask) {
    const fields = [
      'title',
      'notes',
      'status',
      'energy',
      'due_date',
      'due_time',
      'waiting_on',
      'waiting_followup',
    ];
    for (const f of fields) {
      const oldVal = oldTask[f] || '';
      const newVal = update[f] || '';
      if (String(oldVal) !== String(newVal)) {
        await sb.from('task_history').insert({
          task_id: editingTaskId,
          field_changed: f,
          old_value: String(oldVal),
          new_value: String(newVal),
          changed_at: now,
        });
      }
    }
    const oldTags = (oldTask.tags || []).sort().join(',');
    const newTags = selectedTags.sort().join(',');
    if (oldTags !== newTags) {
      await sb.from('task_history').insert({
        task_id: editingTaskId,
        field_changed: 'tags',
        old_value: oldTags,
        new_value: newTags,
        changed_at: now,
      });
    }
  }

  if (oldTask) {
    Object.assign(oldTask, update);
    localStorage.setItem('tasks_cache', JSON.stringify(tasks));
  }

  showToast('Task saved');
  closeModal();
  _renderCurrentTab();
}

export function confirmCompleteTask() {
  document.getElementById('confirmText').textContent = 'Mark this task as done?';
  document.getElementById('confirmDialog').classList.add('visible');
  document.getElementById('confirmYes').onclick = async () => {
    closeConfirm();
    if (!editingTaskId) return;
    const now = new Date().toISOString();
    await sb
      .from('tasks')
      .update({ status: 'done', completed_at: now, updated_at: now })
      .eq('id', editingTaskId);
    const task = tasks.find((t) => t.id === editingTaskId);
    if (task) {
      task.status = 'done';
      task.completed_at = now;
      task.updated_at = now;
      localStorage.setItem('tasks_cache', JSON.stringify(tasks));
    }
    showToast('Task completed');
    closeModal();
    _renderCurrentTab();
  };
}

export function closeConfirm() {
  document.getElementById('confirmDialog').classList.remove('visible');
}

export function confirmDeleteTask() {
  if (!editingTaskId) return;
  const taskToDelete = tasks.find((t) => t.id === editingTaskId);
  if (!taskToDelete) return;
  const deletingId = editingTaskId;

  setTasks(tasks.filter((t) => t.id !== deletingId));
  localStorage.setItem('tasks_cache', JSON.stringify(tasks));
  closeModal();
  _renderCurrentTab();

  let undone = false;
  let deleteTimer = setTimeout(async () => {
    if (undone) return;
    const { error } = await sb.from('tasks').delete().eq('id', deletingId);
    if (error) {
      tasks.push(taskToDelete);
      localStorage.setItem('tasks_cache', JSON.stringify(tasks));
      _renderCurrentTab();
      showToast('Error deleting task');
    }
  }, 5000);

  showToast('Task deleted', () => {
    undone = true;
    clearTimeout(deleteTimer);
    tasks.push(taskToDelete);
    localStorage.setItem('tasks_cache', JSON.stringify(tasks));
    _renderCurrentTab();
    showToast('Delete undone');
  });
}

// ─── Block Modal ───

export function openBlockModal() {
  (document.getElementById('blockTitle') as HTMLInputElement).value = '';
  (document.getElementById('blockDate') as HTMLInputElement).value = viewingDate;
  (document.getElementById('blockStartTime') as HTMLInputElement).value = '09:00';
  (document.getElementById('blockEndTime') as HTMLInputElement).value = '10:00';
  document.getElementById('addBlockModal').classList.add('visible');
  document.body.style.overflow = 'hidden';
  setTimeout(() => (document.getElementById('blockTitle') as HTMLInputElement).focus(), 100);
}

export function closeBlockModal() {
  document.getElementById('addBlockModal').classList.remove('visible');
  document.body.style.overflow = '';
}

export async function saveNewBlock() {
  const title = (document.getElementById('blockTitle') as HTMLInputElement).value.trim();
  const blockDate = (document.getElementById('blockDate') as HTMLInputElement).value;
  const startTime = (document.getElementById('blockStartTime') as HTMLInputElement).value;
  const endTime = (document.getElementById('blockEndTime') as HTMLInputElement).value;
  const btn = document.getElementById('blockSaveBtn') as HTMLButtonElement;

  if (!title) {
    showToast('Please enter a title');
    return;
  }
  if (!blockDate) {
    showToast('Please set a date');
    return;
  }
  if (!startTime || !endTime) {
    showToast('Please set start and end times');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving...';

  const dueTime = startTime + '-' + endTime;
  const now = new Date().toISOString();

  const newTask = {
    title,
    status: 'open',
    energy: null,
    due_date: blockDate,
    due_time: dueTime,
    created_at: now,
    updated_at: now,
    created_by: 'user',
    tags: [],
    notes: null,
    parent_id: null,
    waiting_on: null,
    waiting_followup: null,
    sort_order: tasks.length,
  };

  try {
    const { data, error } = await sb.from('tasks').insert(newTask).select().single();
    btn.disabled = false;
    btn.textContent = 'Add Block';
    if (error) {
      showToast('Error: ' + error.message);
      console.error('Block save error:', error);
      return;
    }

    tasks.push(data);
    localStorage.setItem('tasks_cache', JSON.stringify(tasks));
    setViewingDate(blockDate);

    showToast('Time block added');
    closeBlockModal();
    _renderCurrentTab();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Add Block';
    showToast('Error: ' + e.message);
    console.error('Block save exception:', e);
  }
}

// ─── Wire event listeners (call once from app.ts) ───

export function initModalListeners() {
  document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('editModal')) {
      if (hasUnsavedModalChanges()) {
        if (!confirm('Discard unsaved changes?')) return;
      }
      closeModal();
    }
  });

  document.getElementById('addBlockModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('addBlockModal')) closeBlockModal();
  });

  document.getElementById('blockTitle').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveNewBlock();
  });
}
