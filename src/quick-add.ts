import { sb } from './config';
import { tasks, qaEnergy, setQaEnergy } from './state';
import { today, tomorrow } from './dates';
import { showToast } from './ui';

// Late-bound callback
let _renderCurrentTab: () => void = () => {};

export function setQuickAddCallbacks(renderCb: () => void) {
  _renderCurrentTab = renderCb;
}

let qaDate: string | null = null;

export function pickQAEnergy(btn) {
  const wasActive = btn.classList.contains('active');
  document.querySelectorAll('.energy-pick').forEach((b) => b.classList.remove('active'));
  if (wasActive) {
    setQaEnergy(null);
  } else {
    btn.classList.add('active');
    setQaEnergy(btn.dataset.e);
  }
}

export function setQADate(which) {
  const todayStr = today();
  const tomorrowStr = tomorrow();
  const btnToday = document.getElementById('qaBtnToday');
  const btnTomorrow = document.getElementById('qaBtnTomorrow');
  const pickerEl = document.getElementById('qaDate') as HTMLInputElement;
  if (which === 'today') {
    if (qaDate === todayStr) {
      qaDate = null;
      btnToday.classList.remove('active');
    } else {
      qaDate = todayStr;
      btnToday.classList.add('active');
      btnTomorrow.classList.remove('active');
      pickerEl.value = '';
      pickerEl.classList.remove('active');
    }
  } else if (which === 'tomorrow') {
    if (qaDate === tomorrowStr) {
      qaDate = null;
      btnTomorrow.classList.remove('active');
    } else {
      qaDate = tomorrowStr;
      btnTomorrow.classList.add('active');
      btnToday.classList.remove('active');
      pickerEl.value = '';
      pickerEl.classList.remove('active');
    }
  }
}

export function handleQADatePicker() {
  const pickerEl = document.getElementById('qaDate') as HTMLInputElement;
  const val = pickerEl.value;
  const btnToday = document.getElementById('qaBtnToday');
  const btnTomorrow = document.getElementById('qaBtnTomorrow');
  if (val) {
    qaDate = val;
    btnToday.classList.remove('active');
    btnTomorrow.classList.remove('active');
    pickerEl.classList.add('active');
  } else {
    qaDate = null;
    pickerEl.classList.remove('active');
  }
}

export function resetQADate() {
  qaDate = null;
  const btnToday = document.getElementById('qaBtnToday');
  const btnTomorrow = document.getElementById('qaBtnTomorrow');
  const pickerEl = document.getElementById('qaDate') as HTMLInputElement;
  if (btnToday) btnToday.classList.remove('active');
  if (btnTomorrow) btnTomorrow.classList.remove('active');
  if (pickerEl) {
    pickerEl.value = '';
    pickerEl.classList.remove('active');
  }
}

export async function quickAddTask() {
  const input = document.getElementById('qaInput') as HTMLInputElement;
  const title = input.value.trim();
  if (!title) return;

  const btn = document.getElementById('qaBtn') as HTMLButtonElement;
  btn.disabled = true;

  const dateVal = qaDate || null;
  const now = new Date().toISOString();

  const newTask = {
    title,
    status: 'open',
    energy: qaEnergy,
    due_date: dateVal,
    created_at: now,
    updated_at: now,
    created_by: 'user',
    tags: [],
    notes: null,
    due_time: null,
    parent_id: null,
    waiting_on: null,
    waiting_followup: null,
    sort_order: tasks.length,
  };

  const { data, error } = await sb.from('tasks').insert(newTask).select().single();
  btn.disabled = false;
  if (error) {
    showToast('Error adding task: ' + error.message);
    return;
  }

  tasks.push(data);
  localStorage.setItem('tasks_cache', JSON.stringify(tasks));

  // Reset
  input.value = '';
  resetQADate();
  document.querySelectorAll('.energy-pick').forEach((b) => b.classList.remove('active'));
  setQaEnergy(null);

  showToast('Task added');
  _renderCurrentTab();
}

export function initQuickAddListeners() {
  document.getElementById('qaInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') quickAddTask();
  });
}
