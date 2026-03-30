import { sb } from './config';
import { tasks } from './state';
import { showToast } from './ui';

// Late-bound callback
let _renderCurrentTab: () => void = () => {};

export function setTaskActionsCallbacks(renderCb: () => void) {
  _renderCurrentTab = renderCb;
}

export async function toggleDone(id, currentStatus) {
  const newStatus = currentStatus === 'done' ? 'open' : 'done';
  const now = new Date().toISOString();

  // Animate
  const card = document.getElementById('card_' + id);
  if (card && newStatus === 'done') {
    card.classList.add('done-anim');
  }

  const update: any = { status: newStatus, updated_at: now };
  if (newStatus === 'done') update.completed_at = now;
  else update.completed_at = null;

  const { error } = await sb.from('tasks').update(update).eq('id', id);
  if (error) {
    showToast('Error updating task');
    return;
  }

  // Log history
  await sb.from('task_history').insert({
    task_id: id,
    field_changed: 'status',
    old_value: currentStatus,
    new_value: newStatus,
    changed_at: now,
  });

  // Update local
  const task = tasks.find((t) => t.id === id);
  if (task) {
    Object.assign(task, update);
    localStorage.setItem('tasks_cache', JSON.stringify(tasks));
  }

  if (newStatus === 'done') {
    showToast('Done!', () => toggleDone(id, 'done'));
    setTimeout(() => _renderCurrentTab(), 350);
  } else {
    showToast('Reopened');
    _renderCurrentTab();
  }
}

export async function toggleChildDone(id, currentStatus) {
  await toggleDone(id, currentStatus);
}

export async function activateTask(event, id) {
  event.stopPropagation();
  const now = new Date().toISOString();
  const { error } = await sb.from('tasks').update({ status: 'open', updated_at: now }).eq('id', id);
  if (error) {
    showToast('Error activating task');
    return;
  }
  const task = tasks.find((t) => t.id === id);
  if (task) {
    task.status = 'open';
    task.updated_at = now;
    localStorage.setItem('tasks_cache', JSON.stringify(tasks));
  }
  showToast('Task activated');
  _renderCurrentTab();
}
