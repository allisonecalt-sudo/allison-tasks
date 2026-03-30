import {
  localDateStr,
  today,
  tomorrow,
  daysAgo,
  formatDate,
  formatDateLong,
  timeAgo,
  isOverdue,
  isToday,
  isTomorrow,
  daysFromToday,
  getWeekDates,
} from './dates';
import { sb, getTagIcon } from './config';
import {
  TABS, DASHBOARD_VIEWS, RECURRING, hasHebrew,
  tasks, tagDefs, currentTab, editingTaskId, qaEnergy, dayNowTimer,
  viewingDate, lowCapacity, dayFilter, currentDashboard, allFilters,
  focusSearch, globalSearch,
  setTasks, setTagDefs, setCurrentTab, setEditingTaskId, setQaEnergy,
  setDayNowTimer, setViewingDate, setLowCapacity, setDayFilter,
  setCurrentDashboard, setFocusSearch, setGlobalSearch, setAllFilters,
  resetAllFilters,
} from './state';
import { doLogin as _doLogin, doLogout, checkSession as _checkSession, updateHeader } from './auth';
import { esc, emptyState, showToast, toastUndo, matchesSearch, highlightSearch, buildSearchBar } from './ui';
import {
  buildWeeklyPlanning, buildEnergyBudget, buildWaitingTracker,
  buildStreamHealth, buildBacklogReview, buildDailyReview,
  buildTriageInbox, buildOverloadDetector, buildTagIntelligence,
  pickEnergyDash, filterFloaters, toggleWeekRow,
} from './dashboards';
import {
  getEventsData,
  saveEventsData,
  getRecurringEventsData,
  saveRecurringEventsData,
  loadRecurringEventsFromSupabase,
  addRecurringEventToSupabase,
  deleteRecurringEventFromSupabase,
  getEventsForDate,
  getRecurringData,
  saveRecurringItem,
  deleteRecurringItem,
  getRecurringOccurrences,
  getDaysUntilDue,
  getCountersData,
  saveCounter,
  deleteCounterById,
  isDoneForDate,
  clearRecurringEventsCache,
} from './events-data';
import { renderTaskCard, toggleCardExpand } from './task-card';
import {
  openEditModal, closeModal, saveTask, confirmCompleteTask, confirmDeleteTask,
  closeConfirm, toggleModalTag, pickModalEnergy, addSubtask, deleteSubtask,
  updateSubtaskDate, renderEditSubtasks, openBlockModal, closeBlockModal,
  saveNewBlock, hasUnsavedModalChanges, setModalsCallbacks, initModalListeners,
} from './modals';
import {
  navigateDay, jumpToDay, jumpToToday, renderDay, renderFocus, renderStreams,
  renderAll, toggleFilter, renderWaiting, renderFloating, renderLow, renderBacklog,
  renderDone, renderHistory, openAddNoteModal, saveHistoryNote, toggleStream,
  setTabViewsCallbacks, getRecurringForDate,
} from './tab-views';
import {
  renderCountersBar, addCounter, editCounter,
  renderEvents, addEvent, deleteEvent,
  addRecurringEvent, deleteRecurringEvent,
  renderRecurring, addRecurring, markRecurringDone, deleteRecurring,
  renderWeekTab, setTabEventsCallbacks,
} from './tab-events';

// State variables imported directly from ./state

function toggleLowCapacity() {
  setLowCapacity(!lowCapacity);
  const btn = document.getElementById('lowCapBtn');
  if (btn) {
    btn.innerHTML = lowCapacity ? '&#x1FAAB;' : '&#x1F50B;';
    btn.style.background = lowCapacity ? '#f59e0b22' : '';
    btn.style.borderColor = lowCapacity ? '#f59e0b' : '';
    btn.title = lowCapacity
      ? 'Low capacity ON — showing only low energy tasks'
      : 'Low capacity mode';
  }
  showToast(lowCapacity ? 'Low capacity mode — low energy tasks only' : 'Showing all tasks');
  renderCurrentTab();
}

// matchesSearch, highlightSearch, buildSearchBar → imported from ./ui

let _searchTimer = null;
function wireSearchInput(container, varName) {
  const el = container.querySelector('.search-input[data-search-var="' + varName + '"]');
  if (!el) return;
  const val =
    varName === 'allFilters.search'
      ? allFilters.search
      : varName === 'focusSearch'
        ? focusSearch
        : globalSearch;
  if (val) {
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }
  el.addEventListener('input', function () {
    const v = this.value;
    if (varName === 'allFilters.search') allFilters.search = v;
    else if (varName === 'focusSearch') setFocusSearch(v);
    else setGlobalSearch(v);
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(renderCurrentTab, 150);
  });
  el.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (varName === 'allFilters.search') allFilters.search = '';
      else if (varName === 'focusSearch') setFocusSearch('');
      else setGlobalSearch('');
      clearTimeout(_searchTimer);
      renderCurrentTab();
    }
  });
}

// ─── Auth (wiring) ───
function doLogin() {
  return _doLogin(showApp);
}
function checkSession() {
  return _checkSession(showApp);
}

async function showApp() {
  document.getElementById('authScreen')!.style.display = 'none';
  document.getElementById('app')!.classList.add('visible');
  updateHeader();
  renderTabBar();
  await renderCountersBar();
  loadCached();
  await refreshData();
}

// ─── Data ───
function loadCached() {
  try {
    const c = localStorage.getItem('tasks_cache');
    if (c) {
      setTasks(JSON.parse(c));
      renderCurrentTab();
    }
    const t = localStorage.getItem('tags_cache');
    if (t) {
      setTagDefs(JSON.parse(t));
    }
  } catch (e) {}
}

async function refreshData() {
  try {
    const [tasksRes, tagsRes] = await Promise.all([
      sb.from('tasks').select('*').order('sort_order', { ascending: true, nullsFirst: false }),
      sb.from('tag_definitions').select('*'),
      loadRecurringEventsFromSupabase(),
    ]);
    if (tasksRes.error) throw tasksRes.error;
    if (tagsRes.error) throw tagsRes.error;
    setTasks((tasksRes.data || []).map((t) => (t.status === 'todo' ? { ...t, status: 'open' } : t)));
    setTagDefs(tagsRes.data || []);
    localStorage.setItem('tasks_cache', JSON.stringify(tasks));
    localStorage.setItem('tags_cache', JSON.stringify(tagDefs));
  } catch (e) {
    console.error('Refresh error:', e);
    showToast('Error loading tasks');
  }
  renderRibbon();
  await renderCountersBar();
  renderCurrentTab();
}

// ─── Ribbon ───
function renderRibbon() {
  const openCount = tasks.filter((t) => t.status === 'open' || t.status === 'in_progress').length;
  const waitCount = tasks.filter((t) => t.status === 'waiting').length;
  const decideCount = tasks.filter((t) => t.status === 'decide' || t.status === 'maybe').length;
  const overdueCount = tasks.filter((t) => isOverdue(t)).length;
  const floatCount = tasks.filter((t) => !t.due_date && t.status === 'open').length;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const doneWeek = tasks.filter(
    (t) => t.status === 'done' && t.completed_at && new Date(t.completed_at) >= sevenDaysAgo,
  ).length;

  const stats = [
    { label: 'Open', val: openCount, cls: '', action: () => switchTab('all') },
    {
      label: 'Waiting',
      val: waitCount,
      cls: '',
      action: () => {
        switchTab('focus');
      },
    },
    {
      label: 'Decisions',
      val: decideCount,
      cls: decideCount > 0 ? 'blue' : '',
      action: () => switchTab('focus'),
    },
    {
      label: 'Need Attention',
      val: overdueCount,
      cls: overdueCount > 0 ? 'amber' : '',
      action: () => switchTab('focus'),
    },
    {
      label: 'Floating',
      val: floatCount,
      cls: '',
      action: () => {
        switchTab('all');
        allFilters.noDate = true;
        setTimeout(renderCurrentTab, 0);
      },
    },
    { label: 'Done (7d)', val: doneWeek, cls: '', action: () => switchTab('done') },
  ];
  window._ribbonActions = stats.map((s) => s.action);

  document.getElementById('ribbonGrid').innerHTML = stats
    .map(
      (s, i) =>
        `<div class="ribbon-stat" onclick="ribbonStatClick(${i})" title="Click to view">
      <div class="ribbon-label">${s.label}</div>
      <div class="ribbon-val ${s.cls}">${s.val}</div>
    </div>`,
    )
    .join('');

  // Update ribbon summary for mobile collapsed state
  const todayCount = tasks.filter(
    (t) => t.due_date === today() && t.status !== 'done' && t.status !== 'backlog',
  ).length;
  const summaryEl = document.getElementById('ribbonSummary');
  if (summaryEl) {
    let parts = [];
    if (todayCount > 0) parts.push(`${todayCount} today`);
    if (overdueCount > 0) parts.push(`${overdueCount} overdue`);
    if (waitCount > 0) parts.push(`${waitCount} waiting`);
    summaryEl.textContent = parts.length ? parts.join(' · ') : `${openCount} open`;
  }

  // Collapse ribbon by default on mobile
  const ribbon = document.getElementById('ribbon');
  if (window.innerWidth <= 600 && !ribbon.dataset.userExpanded) {
    ribbon.classList.add('collapsed');
  }
}

function ribbonStatClick(i) {
  if (window._ribbonActions && window._ribbonActions[i]) window._ribbonActions[i]();
}

// ─── Tab Bar ───
function renderTabBar() {
  const bar = document.getElementById('tabBar');
  const mainTabs = TABS.slice(0, 3);
  const moreTabs = TABS.slice(3);
  const moreActive = moreTabs.some((t) => t.id === currentTab);

  let html = mainTabs
    .map(
      (t) =>
        `<button class="tab-btn ${t.id === currentTab ? 'active' : ''}"
      onclick="switchTab('${t.id}')" data-tab="${t.id}">
      ${t.label}<span class="tab-count" id="tabCount_${t.id}"></span>
    </button>`,
    )
    .join('');

  html += `<div class="tab-more-wrap">
    <button class="tab-more-btn ${moreActive ? 'has-active' : ''}" onclick="toggleTabMore(event)">···</button>
    <div class="tab-more-menu" id="tabMoreMenu">
      ${moreTabs
        .map(
          (t) =>
            `<button class="${t.id === currentTab ? 'active' : ''}" data-tab="${t.id}" onclick="switchTab('${t.id}');closeTabMore();">
          ${t.label}<span class="tab-count" id="tabCount_${t.id}"></span>
        </button>`,
        )
        .join('')}
    </div>
  </div>`;

  bar.innerHTML = html;
}

function toggleTabMore(e) {
  e.stopPropagation();
  document.getElementById('tabMoreMenu').classList.toggle('open');
}
function closeTabMore() {
  document.getElementById('tabMoreMenu')?.classList.remove('open');
}
document.addEventListener('click', closeTabMore);

async function switchTab(id) {
  setCurrentTab(id);
  resetAllFilters();
  setFocusSearch('');
  setGlobalSearch('');
  if (id !== 'day' && dayNowTimer) {
    clearInterval(dayNowTimer);
    setDayNowTimer(null);
  }
  if (id === 'day') setViewingDate(today());
  document
    .querySelectorAll('.tab-btn')
    .forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
  const qa = document.getElementById('quickAdd');
  if (qa) qa.style.display = id === 'events' || id === 'recurring' ? 'none' : '';
  renderCurrentTab();
}

async function updateTabCounts() {
  const focusCount = tasks.filter((t) => {
    if (t.status === 'done' || t.status === 'backlog') return false;
    return (
      isToday(t) ||
      isOverdue(t) ||
      isTomorrow(t) ||
      t.status === 'waiting' ||
      t.status === 'decide' ||
      (!t.due_date && t.status === 'open')
    );
  }).length;
  const eventsData = getEventsData();
  const recurringData = await getRecurringData();
  const overdueRecurring = recurringData.filter((r) => getDaysUntilDue(r) <= 0).length;
  const counts = {
    day:
      tasks.filter(
        (t) => t.due_date === viewingDate && t.status !== 'done' && t.status !== 'backlog',
      ).length + getRecurringForDate(viewingDate).length,
    focus: focusCount,
    all: tasks.filter((t) => t.status !== 'done' && t.status !== 'backlog').length,
    streams: '',
    week:
      (() => {
        const wk = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date();
          d.setDate(d.getDate() + i);
          wk.push(localDateStr(d));
        }
        return tasks.filter(
          (t) => t.status !== 'done' && t.status !== 'backlog' && wk.includes(t.due_date),
        ).length;
      })() || '',
    events: eventsData.filter((e) => e.date >= today()).length || '',
    recurring: overdueRecurring || '',
    done: (() => {
      const a = new Date();
      a.setDate(a.getDate() - 30);
      return tasks.filter(
        (t) => t.status === 'done' && t.completed_at && new Date(t.completed_at) >= a,
      ).length;
    })(),
    dashboards: '',
  };
  TABS.forEach((t) => {
    const el = document.getElementById(`tabCount_${t.id}`);
    if (!el) return;
    if (t.id === 'all') {
      const allFilterActive =
        allFilters.search ||
        allFilters.tags.length ||
        allFilters.energy ||
        allFilters.status ||
        allFilters.noDate;
      el.textContent = allFilterActive ? counts[t.id] : '';
    } else {
      el.textContent = counts[t.id] !== '' && counts[t.id] > 0 ? counts[t.id] : '';
    }
  });
}

// ─── Render Router ───
async function renderCurrentTab() {
  await updateTabCounts();
  renderRibbon();
  const mc = document.getElementById('mainContent');
  switch (currentTab) {
    case 'day':
      renderDay(mc);
      break;
    case 'focus':
      renderFocus(mc);
      break;
    case 'all':
      renderAll(mc);
      break;
    case 'streams':
      renderStreams(mc);
      break;
    case 'week':
      renderWeekTab(mc);
      break;
    case 'events':
      renderEvents(mc);
      break;
    case 'recurring':
      renderRecurring(mc);
      break;
    case 'done':
      renderDone(mc);
      break;
    case 'history':
      renderHistory(mc);
      break;
    case 'dashboards':
      renderDashboards(mc);
      break;
  }
}

// ─── Day Navigation Helpers ───
// ─── Toggle Done ───
async function toggleDone(id, currentStatus) {
  const newStatus = currentStatus === 'done' ? 'open' : 'done';
  const now = new Date().toISOString();

  // Animate
  const card = document.getElementById('card_' + id);
  if (card && newStatus === 'done') {
    card.classList.add('done-anim');
  }

  const update = { status: newStatus, updated_at: now };
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
    setTimeout(() => renderCurrentTab(), 350);
  } else {
    showToast('Reopened');
    renderCurrentTab();
  }
}

async function toggleChildDone(id, currentStatus) {
  await toggleDone(id, currentStatus);
}

async function activateTask(event, id) {
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
  renderCurrentTab();
}

// ─── Quick Add ───
function pickQAEnergy(btn) {
  const wasActive = btn.classList.contains('active');
  document.querySelectorAll('.energy-pick').forEach((b) => b.classList.remove('active'));
  if (wasActive) {
    setQaEnergy(null);
  } else {
    btn.classList.add('active');
    setQaEnergy(btn.dataset.e);
  }
}

let qaDate = null;

function setQADate(which) {
  const todayStr = today();
  const tomorrowStr = tomorrow();
  const btnToday = document.getElementById('qaBtnToday');
  const btnTomorrow = document.getElementById('qaBtnTomorrow');
  const pickerEl = document.getElementById('qaDate');
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

function handleQADatePicker() {
  const val = document.getElementById('qaDate').value;
  const pickerEl = document.getElementById('qaDate');
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

function resetQADate() {
  qaDate = null;
  const btnToday = document.getElementById('qaBtnToday');
  const btnTomorrow = document.getElementById('qaBtnTomorrow');
  const pickerEl = document.getElementById('qaDate');
  if (btnToday) btnToday.classList.remove('active');
  if (btnTomorrow) btnTomorrow.classList.remove('active');
  if (pickerEl) {
    pickerEl.value = '';
    pickerEl.classList.remove('active');
  }
}

async function quickAddTask() {
  const input = document.getElementById('qaInput');
  const title = input.value.trim();
  if (!title) return;

  const btn = document.getElementById('qaBtn');
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
  renderCurrentTab();
}

// Enter key to add
document.getElementById('qaInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') quickAddTask();
});

// ─── Edit Modal ───
// ══════════════════════════════════════════════════════════════
// ─── DASHBOARDS ───
// ══════════════════════════════════════════════════════════════

function renderDashboards(mc) {
  let html = `<div class="dash-subnav">`;
  DASHBOARD_VIEWS.forEach((d) => {
    html += `<button class="dash-pill ${d.id === currentDashboard ? 'active' : ''}"
      onclick="switchDashboard('${d.id}')">${d.label}</button>`;
  });
  html += `</div>`;
  html += buildSearchBar('globalSearch', 'Search dashboards...');

  switch (currentDashboard) {
    case 'triage':
      html += buildTriageInbox();
      break;
    case 'overload':
      html += buildOverloadDetector();
      break;
    case 'weekly':
      html += buildWeeklyPlanning();
      break;
    case 'energy':
      html += buildEnergyBudget();
      break;
    case 'waiting':
      html += buildWaitingTracker();
      break;
    case 'health':
      html += buildStreamHealth();
      break;
    case 'backlog':
      html += buildBacklogReview();
      break;
    case 'review':
      html += buildDailyReview();
      break;
  }

  mc.innerHTML = html;
  wireSearchInput(mc, 'globalSearch');
}

function switchDashboard(id) {
  setCurrentDashboard(id);
  renderCurrentTab();
}


// ─── Keyboard: Add block modal ───
document.getElementById('blockTitle').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveNewBlock();
});

// ─── Global Keyboard Shortcuts ───
document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }
});

// ─── Expose functions to HTML onclick handlers ───
Object.assign(window, {
  doLogin,
  doLogout,
  toggleLowCapacity,
  refreshData,
  pickQAEnergy,
  quickAddTask,
  setQADate,
  handleQADatePicker,
  pickModalEnergy,
  addSubtask,
  saveTask,
  confirmCompleteTask,
  closeModal,
  confirmDeleteTask,
  closeConfirm,
  saveNewBlock,
  closeBlockModal,
  activateTask,
  addCounter,
  addEvent,
  addRecurring,
  addRecurringEvent,
  deleteRecurring,
  deleteRecurringEvent,
  editCounter,
  filterFloaters,
  jumpToDay,
  jumpToToday,
  markRecurringDone,
  navigateDay,
  openAddNoteModal,
  openBlockModal,
  openEditModal,
  pickEnergyDash,
  ribbonStatClick,
  saveHistoryNote,
  switchDashboard,
  switchTab,
  toastUndo,
  toggleCardExpand,
  toggleChildDone,
  toggleFilter,
  toggleModalTag,
  toggleStream,
  toggleTabMore,
  toggleWeekRow,
  updateSubtaskDate,
  deleteSubtask,
  saveRecurringEventsData,
  deleteEvent,
  renderWaiting,
  renderFloating,
  renderLow,
  renderBacklog,
  buildTagIntelligence,
  addRecurringEvent,
});

// ─── Init ───
setTabEventsCallbacks(renderCurrentTab, wireSearchInput);
setTabViewsCallbacks(renderCurrentTab, wireSearchInput);
setModalsCallbacks(renderCurrentTab);
initModalListeners();
checkSession();
