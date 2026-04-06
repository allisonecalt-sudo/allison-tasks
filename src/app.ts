import { localDateStr, today, isOverdue, isToday, isTomorrow } from './dates';
import { sb } from './config';
import {
  TABS,
  DASHBOARD_VIEWS,
  tasks,
  tagDefs,
  currentTab,
  dayNowTimer,
  viewingDate,
  lowCapacity,
  currentDashboard,
  allFilters,
  focusSearch,
  globalSearch,
  setTasks,
  setTagDefs,
  setCurrentTab,
  setDayNowTimer,
  setViewingDate,
  setLowCapacity,
  setCurrentDashboard,
  setFocusSearch,
  setGlobalSearch,
  resetAllFilters,
} from './state';
import { doLogin as _doLogin, doLogout, checkSession as _checkSession, updateHeader } from './auth';
import { showToast, toastUndo, buildSearchBar } from './ui';
import {
  buildWeeklyPlanning,
  buildEnergyBudget,
  buildWaitingTracker,
  buildStreamHealth,
  buildBacklogReview,
  buildDailyReview,
  buildTriageInbox,
  buildOverloadDetector,
  buildTagIntelligence,
  pickEnergyDash,
  filterFloaters,
  toggleWeekRow,
} from './dashboards';
import {
  getEventsData,
  saveRecurringEventsData,
  loadRecurringEventsFromSupabase,
  getRecurringData,
  getDaysUntilDue,
} from './events-data';
import { toggleCardExpand } from './task-card';
import {
  openEditModal,
  closeModal,
  saveTask,
  confirmCompleteTask,
  confirmDeleteTask,
  closeConfirm,
  toggleModalTag,
  pickModalEnergy,
  addSubtask,
  deleteSubtask,
  updateSubtaskDate,
  renderEditSubtasks,
  reorderSubtask,
  openBlockModal,
  closeBlockModal,
  saveNewBlock,
  setModalsCallbacks,
  initModalListeners,
} from './modals';
import {
  navigateDay,
  jumpToDay,
  jumpToToday,
  renderDay,
  renderFocus,
  renderStreams,
  renderAll,
  toggleFilter,
  renderWaiting,
  renderFloating,
  renderLow,
  renderBacklog,
  renderSparks,
  renderDone,
  renderHistory,
  openAddNoteModal,
  saveHistoryNote,
  toggleStream,
  setTabViewsCallbacks,
  getRecurringForDate,
} from './tab-views';
import {
  renderCountersBar,
  addCounter,
  editCounter,
  renderEvents,
  addEvent,
  deleteEvent,
  addRecurringEvent,
  deleteRecurringEvent,
  renderRecurring,
  addRecurring,
  markRecurringDone,
  deleteRecurring,
  renderWeekTab,
  setTabEventsCallbacks,
} from './tab-events';
import { toggleDone, toggleChildDone, activateTask, setTaskActionsCallbacks } from './task-actions';
import {
  pickQAEnergy,
  setQADate,
  handleQADatePicker,
  quickAddTask,
  setQuickAddCallbacks,
  initQuickAddListeners,
} from './quick-add';

// ─── Low Capacity Toggle ───
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

// ─── Search Input Wiring ───
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

// ─── Auth Wiring ───
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
  } catch (_e) {}
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
    setTasks(
      (tasksRes.data || []).map((t) => (t.status === 'todo' ? { ...t, status: 'open' } : t)),
    );
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
    { label: 'Waiting', val: waitCount, cls: '', action: () => switchTab('focus') },
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
  (window as any)._ribbonActions = stats.map((s) => s.action);

  document.getElementById('ribbonGrid').innerHTML = stats
    .map(
      (s, i) => `<div class="ribbon-stat" onclick="ribbonStatClick(${i})" title="Click to view">
      <div class="ribbon-label">${s.label}</div>
      <div class="ribbon-val ${s.cls}">${s.val}</div>
    </div>`,
    )
    .join('');

  const todayCount = tasks.filter(
    (t) => t.due_date === today() && t.status !== 'done' && t.status !== 'backlog' && t.status !== 'spark',
  ).length;
  const summaryEl = document.getElementById('ribbonSummary');
  if (summaryEl) {
    let parts = [];
    if (todayCount > 0) parts.push(`${todayCount} today`);
    if (overdueCount > 0) parts.push(`${overdueCount} overdue`);
    if (waitCount > 0) parts.push(`${waitCount} waiting`);
    summaryEl.textContent = parts.length ? parts.join(' · ') : `${openCount} open`;
  }

  const ribbon = document.getElementById('ribbon');
  if (window.innerWidth <= 600 && !ribbon.dataset.userExpanded) {
    ribbon.classList.add('collapsed');
  }
}

function ribbonStatClick(i) {
  if ((window as any)._ribbonActions && (window as any)._ribbonActions[i])
    (window as any)._ribbonActions[i]();
}

// ─── Tab Bar ───
function renderTabBar() {
  const bar = document.getElementById('tabBar');
  const mainTabs = TABS.slice(0, 3);
  const moreTabs = TABS.slice(3);
  const moreActive = moreTabs.some((t) => t.id === currentTab);

  let html = mainTabs
    .map(
      (t) => `<button class="tab-btn ${t.id === currentTab ? 'active' : ''}"
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
          (
            t,
          ) => `<button class="${t.id === currentTab ? 'active' : ''}" data-tab="${t.id}" onclick="switchTab('${t.id}');closeTabMore();">
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
    .forEach((b: any) => b.classList.toggle('active', b.dataset.tab === id));
  const qa = document.getElementById('quickAdd');
  if (qa) qa.style.display = id === 'events' || id === 'recurring' ? 'none' : '';
  renderCurrentTab();
}

async function updateTabCounts() {
  const focusCount = tasks.filter((t) => {
    if (t.status === 'done' || t.status === 'backlog' || t.status === 'spark') return false;
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
        (t) => t.due_date === viewingDate && t.status !== 'done' && t.status !== 'backlog' && t.status !== 'spark',
      ).length + getRecurringForDate(viewingDate).length,
    focus: focusCount,
    all: tasks.filter((t) => t.status !== 'done' && t.status !== 'backlog' && t.status !== 'spark').length,
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
          (t) => t.status !== 'done' && t.status !== 'backlog' && t.status !== 'spark' && wk.includes(t.due_date),
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
    sparks: tasks.filter((t) => t.status === 'spark').length || '',
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
    case 'sparks':
      renderSparks(mc);
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

// ─── Dashboards Router ───
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

// ─── Global Keyboard Shortcuts ───
document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const searchInput = document.querySelector('.search-input') as HTMLInputElement;
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
  toggleDone,
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
  reorderSubtask,
  renderEditSubtasks,
  renderCurrentTab,
});

// ─── Init ───
setTabEventsCallbacks(renderCurrentTab, wireSearchInput);
setTabViewsCallbacks(renderCurrentTab, wireSearchInput);
setModalsCallbacks(renderCurrentTab);
setTaskActionsCallbacks(renderCurrentTab);
setQuickAddCallbacks(renderCurrentTab);
initModalListeners();
initQuickAddListeners();
checkSession();
