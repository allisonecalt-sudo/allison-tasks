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
} from './dates';
import { sb, getTagIcon } from './config';
import * as State from './state';
import { TABS, DASHBOARD_VIEWS, RECURRING, hasHebrew } from './state';
import { doLogin as _doLogin, doLogout, checkSession as _checkSession, updateHeader } from './auth';
import { esc, emptyState, showToast, toastUndo } from './ui';

// ─��─ State (local aliases — will be replaced with direct State.x access over time) ───
let tasks = State.tasks;
let tagDefs = State.tagDefs;
let currentTab = State.currentTab;
let editingTaskId = State.editingTaskId;
let qaEnergy = State.qaEnergy;
let dayNowTimer = State.dayNowTimer;
let viewingDate = State.viewingDate;
let lowCapacity = State.lowCapacity;
let dayFilter = State.dayFilter;

function toggleLowCapacity() {
  lowCapacity = !lowCapacity;
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

let currentDashboard = State.currentDashboard;
let allFilters = State.allFilters;
let focusSearch = State.focusSearch;
let globalSearch = State.globalSearch;

function matchesSearch(task, query) {
  if (!query) return true;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = [task.title || '', task.notes || '', ...(task.tags || [])].join(' ').toLowerCase();
  return words.every((w) => text.includes(w));
}

function highlightSearch(text) {
  const q = allFilters.search || focusSearch || globalSearch;
  if (!q || !text) return esc(text);
  const escaped = esc(text);
  const words = q.toLowerCase().split(/s+/).filter(Boolean);
  let result = escaped;
  words.forEach((w) => {
    const re = new RegExp(
      '(' + w.replace(/[.*+?^${}()|[]\]/g, '\function buildSearchBar(') + ')',
      'gi',
    );
    result = result.replace(re, '<mark class="search-hl">$1</mark>');
  });
  return result;
}

function buildSearchBar(varName, placeholder) {
  const val =
    varName === 'allFilters.search'
      ? allFilters.search
      : varName === 'focusSearch'
        ? focusSearch
        : globalSearch;
  return `<div class="search-bar">
    <span class="search-icon">&#x1F50D;</span>
    <input type="text" class="search-input" data-search-var="${varName}" placeholder="${placeholder}" value="${esc(val)}">
    ${val ? `<button class="search-clear" onclick="${varName}='';renderCurrentTab();">&times;</button>` : ''}
  </div>`;
}

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
    else if (varName === 'focusSearch') focusSearch = v;
    else globalSearch = v;
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(renderCurrentTab, 150);
  });
  el.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (varName === 'allFilters.search') allFilters.search = '';
      else if (varName === 'focusSearch') focusSearch = '';
      else globalSearch = '';
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
      tasks = JSON.parse(c);
      renderCurrentTab();
    }
    const t = localStorage.getItem('tags_cache');
    if (t) {
      tagDefs = JSON.parse(t);
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
    tasks = (tasksRes.data || []).map((t) => (t.status === 'todo' ? { ...t, status: 'open' } : t));
    tagDefs = tagsRes.data || [];
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
  currentTab = id;
  allFilters = { search: '', tags: [], energy: null, status: null, noDate: false };
  focusSearch = '';
  globalSearch = '';
  if (id !== 'day' && dayNowTimer) {
    clearInterval(dayNowTimer);
    dayNowTimer = null;
  }
  if (id === 'day') viewingDate = today();
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
function navigateDay(offset) {
  const d = new Date(viewingDate + 'T00:00:00');
  d.setDate(d.getDate() + offset);
  viewingDate = localDateStr(d);
  renderCurrentTab();
}
function jumpToDay(dateStr) {
  if (dateStr) {
    viewingDate = dateStr;
    renderCurrentTab();
  }
}
function jumpToToday() {
  viewingDate = today();
  renderCurrentTab();
}

function formatDateNav(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${dayNames[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
}

function getWeekDates(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = d.getDay(); // 0=Sun
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - dayOfWeek);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const wd = new Date(sunday);
    wd.setDate(sunday.getDate() + i);
    dates.push(localDateStr(wd));
  }
  return dates;
}

function getRecurringForDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  return RECURRING.filter((r) => r.days.includes(dow));
}

function getBlockCountForDate(dateStr) {
  const dayTasks = tasks.filter(
    (t) =>
      t.due_date === dateStr &&
      t.status !== 'done' &&
      t.status !== 'backlog' &&
      !t.parent_id &&
      t.due_time &&
      t.due_time.includes('-'),
  );
  const recurring = getRecurringForDate(dateStr);
  const recurringEvents = getEventsForDate(dateStr).filter((e) => e.isRecurringEvent);
  return dayTasks.length + recurring.length + recurringEvents.length;
}

// ─── Render: My Day ───
async function renderDay(mc) {
  // Stop any existing now-line timer
  if (dayNowTimer) {
    clearInterval(dayNowTimer);
    dayNowTimer = null;
  }

  // Fetch Supabase recurring items
  const recurringItems = await getRecurringData();

  const isViewingToday = viewingDate === today();
  const viewStr = viewingDate;
  let dayTasks = tasks.filter(
    (t) => t.due_date === viewStr && t.status !== 'done' && t.status !== 'backlog' && !t.parent_id,
  );
  // Only show overdue tasks when viewing today
  const overdueTasks = isViewingToday
    ? tasks.filter(
        (t) => isOverdue(t) && t.status !== 'done' && t.status !== 'backlog' && !t.parent_id,
      )
    : [];

  // Low-capacity filter: only show low energy tasks
  if (lowCapacity) {
    dayTasks = dayTasks.filter((t) => t.energy === 'low');
  }

  // Category filter
  if (dayFilter) {
    dayTasks = dayTasks.filter((t) => (t.tags || []).includes(dayFilter));
  }

  // Get recurring events for this day
  const recurringToday = getRecurringForDate(viewStr);

  // Get Supabase recurring items due today or overdue
  const recurringDueToday = [];
  recurringItems.forEach((r) => {
    const occs = getRecurringOccurrences(r);
    occs.forEach((occ) => {
      const occDateStr = occ.date.toISOString().slice(0, 10);
      if (occDateStr === viewStr || (isViewingToday && occ.overdue)) {
        recurringDueToday.push({ item: r, occ, occDateStr });
      }
    });
  });

  // Split habits (daily) vs other recurring
  const habits = recurringDueToday.filter((rd) => rd.item.frequency_days === 1);
  const otherRecurring = recurringDueToday.filter((rd) => rd.item.frequency_days !== 1);

  // Split into time-blocked vs flexible
  const timeBlocked = [];
  const timedFlexible = [];
  const flexible = [];

  dayTasks.forEach((t) => {
    if (t.due_time && t.due_time.includes('-')) {
      timeBlocked.push(t);
    } else if (t.due_time) {
      timedFlexible.push(t);
    } else {
      flexible.push(t);
    }
  });

  // Parse time blocks from tasks
  const blocks = timeBlocked.map((t) => {
    const parts = t.due_time.split('-');
    const startParts = parts[0].trim().split(':');
    const endParts = parts[1].trim().split(':');
    return {
      task: t,
      startHour: parseInt(startParts[0]),
      startMin: parseInt(startParts[1] || 0),
      endHour: parseInt(endParts[0]),
      endMin: parseInt(endParts[1] || 0),
      isRecurring: false,
    };
  });

  // Add recurring blocks
  recurringToday.forEach((r) => {
    const startParts = r.start.split(':');
    const endParts = r.end.split(':');
    blocks.push({
      task: { title: r.title, due_time: r.start + '-' + r.end, tags: [], id: null },
      startHour: parseInt(startParts[0]),
      startMin: parseInt(startParts[1] || 0),
      endHour: parseInt(endParts[0]),
      endMin: parseInt(endParts[1] || 0),
      isRecurring: true,
      color: r.color,
    });
  });

  // Add event blocks from localStorage
  const dayEvents = getEventsForDate(viewStr);
  dayEvents.forEach((ev) => {
    const timeParts = ev.time.split(':');
    const startH = parseInt(timeParts[0]);
    const startM = parseInt(timeParts[1] || 0);
    let endH = startH + 1,
      endM = startM;
    if (ev.end_time) {
      const ep = ev.end_time.split(':');
      endH = parseInt(ep[0]);
      endM = parseInt(ep[1] || 0);
    }
    blocks.push({
      task: {
        title: ev.title,
        due_time: ev.time + (ev.end_time ? '-' + ev.end_time : ''),
        tags: [],
        id: null,
      },
      startHour: startH,
      startMin: startM,
      endHour: endH,
      endMin: endM,
      isEvent: true,
      eventData: ev,
    });
  });

  blocks.sort((a, b) => a.startHour * 60 + a.startMin - (b.startHour * 60 + b.startMin));

  // Calculate timeline range
  let rangeStart = 7,
    rangeEnd = 20;
  if (blocks.length > 0) {
    const earliest = Math.min(...blocks.map((b) => b.startHour));
    const latest = Math.max(...blocks.map((b) => b.endHour + (b.endMin > 0 ? 1 : 0)));
    rangeStart = earliest - 1;
    rangeEnd = Math.max(rangeEnd, latest + 1);
  }
  // Include current hour in range only when viewing today
  const nowDate = new Date();
  const nowHour = nowDate.getHours();
  const nowMin = nowDate.getMinutes();
  if (isViewingToday && nowHour >= rangeStart - 1 && nowHour <= rangeEnd + 1) {
    rangeStart = Math.min(rangeStart, nowHour);
    rangeEnd = Math.max(rangeEnd, nowHour + 1);
  }
  rangeStart = Math.max(0, rangeStart);
  rangeEnd = Math.min(24, rangeEnd);

  const totalHours = rangeEnd - rangeStart;
  const hourHeight = 60; // px per hour

  // ─── Day Navigation Header ───
  let html = '<div class="day-view">';

  const todayBtnClass = isViewingToday ? 'day-nav-today hidden' : 'day-nav-today';
  html += `<div class="day-nav">
    <button class="day-nav-arrow" onclick="navigateDay(-1)" title="Previous day">&#x2039;</button>
    <button class="${todayBtnClass}" onclick="jumpToToday()">Today</button>
    <div class="day-nav-center">
      <div class="day-nav-date">${formatDateNav(viewStr)}</div>
      ${isViewingToday ? '<div class="day-nav-sub">Today</div>' : `<div class="day-nav-sub">${daysFromToday(viewStr)}</div>`}
      <input type="date" value="${viewStr}" onchange="jumpToDay(this.value)">
    </div>
    <button class="day-nav-add" onclick="openBlockModal()" title="Add time block">+</button>
    <button class="day-nav-arrow" onclick="navigateDay(1)" title="Next day">&#x203A;</button>
  </div>`;

  // ─── Week Overview ───
  const weekDates = getWeekDates(viewStr);
  const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  html += '<div class="week-overview">';
  weekDates.forEach((wd, i) => {
    const blockCount = getBlockCountForDate(wd);
    const isActive = wd === viewStr;
    const isTodayDot = wd === today();
    let cls = 'week-dot';
    if (isActive) cls += ' active';
    if (isTodayDot) cls += ' today';
    if (blockCount > 0) cls += ' has-blocks';
    html += `<div class="${cls}" onclick="jumpToDay('${wd}')">
      <div class="week-dot-label">${shortDays[i]}</div>
      <div class="week-dot-bar"></div>
      ${blockCount > 0 ? `<div class="week-dot-count">${blockCount}</div>` : `<div class="week-dot-count">&nbsp;</div>`}
    </div>`;
  });
  html += '</div>';

  // ─── Category Filter Pills ───
  const filterTags = [
    { tag: 'work-clalit', label: 'Clalit' },
    { tag: 'work-petachya', label: 'Petachya' },
    { tag: 'personal', label: 'Personal' },
    { tag: 'finance', label: 'Finance' },
  ];
  html += '<div style="display:flex;gap:.4rem;padding:.3rem .8rem;flex-wrap:wrap">';
  filterTags.forEach((f) => {
    const active = dayFilter === f.tag;
    const icon = getTagIcon(f.tag) || '';
    html += `<button onclick="dayFilter=${active ? 'null' : "'" + f.tag + "'"};renderCurrentTab()" style="
      padding:.25rem .6rem;border-radius:999px;border:1px solid ${active ? 'var(--accent)' : 'var(--border)'};
      background:${active ? 'var(--accent)' : 'var(--card-bg)'};color:${active ? '#fff' : 'var(--muted)'};
      font-size:.72rem;cursor:pointer;font-family:inherit">${icon} ${f.label}</button>`;
  });
  html += '</div>';

  // ─── Daily Habits Strip ───
  if (habits.length > 0) {
    html +=
      '<div style="display:flex;gap:.4rem;padding:.4rem .8rem;flex-wrap:wrap;align-items:center">';
    html += '<span style="font-size:.7rem;color:var(--muted);font-weight:600">Habits</span>';
    habits.forEach((h) => {
      const done = h.occ.overdue === false && isDoneForDate(h.item, h.occ.date);
      const titleDir = hasHebrew(h.item.title) ? ' dir="rtl"' : '';
      html += `<label style="display:flex;align-items:center;gap:.3rem;padding:.25rem .55rem;
        border-radius:999px;background:${done ? '#22c55e22' : 'var(--card-bg)'};border:1px solid ${done ? '#22c55e' : 'var(--border)'};
        font-size:.72rem;cursor:pointer;white-space:nowrap">
        <input type="checkbox" ${done ? 'checked disabled' : ''} onchange="markRecurringDone('${h.item.id}','${h.occDateStr}')"
          style="width:14px;height:14px;accent-color:#22c55e">
        <span${titleDir}>${esc(h.item.title)}</span>
      </label>`;
    });
    html += '</div>';
  }

  // Summary chips
  const taskBlocks = blocks.filter((b) => !b.isRecurring);
  const recBlocks = blocks.filter((b) => b.isRecurring);
  const totalBlocked = blocks.reduce((sum, b) => {
    return sum + (b.endHour * 60 + b.endMin) - (b.startHour * 60 + b.startMin);
  }, 0);
  const blockedHrs = Math.floor(totalBlocked / 60);
  const blockedMins = totalBlocked % 60;

  html += '<div class="day-summary">';
  html += `<div class="day-summary-chip"><span class="num">${blocks.length}</span> block${blocks.length !== 1 ? 's' : ''}</div>`;
  html += `<div class="day-summary-chip"><span class="num">${blockedHrs > 0 ? blockedHrs + 'h' : ''}${blockedMins > 0 ? blockedMins + 'm' : blockedHrs === 0 ? '0m' : ''}</span> scheduled</div>`;
  html += `<div class="day-summary-chip"><span class="num">${flexible.length}</span> flexible</div>`;
  if (timedFlexible.length > 0)
    html += `<div class="day-summary-chip"><span class="num">${timedFlexible.length}</span> timed</div>`;
  html += '</div>';

  // Timeline
  if (blocks.length > 0 || (isViewingToday && nowHour >= rangeStart && nowHour < rangeEnd)) {
    html += '<div class="day-section-label">Timeline</div>';
    html += `<div class="day-timeline" id="dayTimeline" style="height:${totalHours * hourHeight}px">`;

    // Hour rows
    for (let h = rangeStart; h < rangeEnd; h++) {
      const top = (h - rangeStart) * hourHeight;
      const label = h === 0 ? '12am' : h < 12 ? h + 'am' : h === 12 ? '12pm' : h - 12 + 'pm';
      html += `<div class="day-hour-row" style="position:absolute;top:${top}px;left:0;right:0;height:${hourHeight}px">
        <div class="day-hour-label">${label}</div>
        <div class="day-hour-track"></div>
      </div>`;
    }

    // Render all blocks (tasks + recurring)
    blocks.forEach((b) => {
      const startOffset = (b.startHour - rangeStart) * hourHeight + (b.startMin / 60) * hourHeight;
      const duration =
        ((b.endHour * 60 + b.endMin - (b.startHour * 60 + b.startMin)) / 60) * hourHeight;
      const blockHeight = Math.max(duration, 28);
      const t = b.task;
      const timeStr = t.due_time;

      if (b.isEvent) {
        const recurIcon = b.eventData.isRecurringEvent ? '&#x21bb; ' : '&#x1F5D3; ';
        html += `<div class="day-block event-block" style="top:${startOffset}px;height:${blockHeight}px;left:56px;right:8px${b.eventData.isRecurringEvent ? ';border-style:dashed' : ''}" onclick="switchTab('events')">
          <div class="day-block-time">${recurIcon}${esc(timeStr)}</div>
          <div class="day-block-title">${esc(t.title)}</div>
          ${b.eventData.with_person ? `<div style="font-size:.68rem;color:#7c3aed;opacity:.8">with ${esc(b.eventData.with_person)}</div>` : ''}
        </div>`;
      } else if (b.isRecurring) {
        // Recurring block styling
        const bgColor = b.color || 'var(--accent)';
        html += `<div class="day-block recurring" style="top:${startOffset}px;height:${blockHeight}px;left:56px;right:8px;border-color:${bgColor}40;border-inline-start-color:${bgColor}">
          <div class="day-block-time"><span class="recurring-icon">&#x21bb;</span>${esc(timeStr)}</div>
          <div class="day-block-title" style="color:${bgColor}">${esc(t.title)}</div>
        </div>`;
      } else {
        const tagHTML = (t.tags || [])
          .slice(0, 2)
          .map((tag) => {
            const def = tagDefs.find((d) => d.name === tag);
            const bgColor = def?.color ? def.color + '18' : '';
            const textColor = def?.color || '';
            const style = bgColor ? `style="background:${bgColor};color:${textColor}"` : '';
            return `<span class="tag-pill" ${style}>${getTagIcon(tag)} ${esc(tag)}</span>`;
          })
          .join('');

        html += `<div class="day-block" style="top:${startOffset}px;height:${blockHeight}px;left:56px;right:8px"
                      onclick="openEditModal('${t.id}')">
          <div class="day-block-time">${esc(timeStr)}</div>
          <div class="day-block-title">${esc(t.title)}</div>
          ${tagHTML ? '<div class="day-block-tags">' + tagHTML + '</div>' : ''}
        </div>`;
      }
    });

    // Current time line — only when viewing today
    if (isViewingToday && nowHour >= rangeStart && nowHour < rangeEnd) {
      const nowOffset = (nowHour - rangeStart) * hourHeight + (nowMin / 60) * hourHeight;
      const nowLabel = formatNowTime(nowHour, nowMin);
      html += `<div class="day-now-line" id="dayNowLine" style="top:${nowOffset}px">
        <div class="day-now-label">${nowLabel}</div>
        <div class="day-now-dot"></div>
      </div>`;
    }

    html += '</div>'; // close day-timeline
  } else if (blocks.length === 0) {
    html += '<div class="day-section-label">Timeline</div>';
    html += `<div class="day-empty">No time blocks for this day. Tap <strong>+</strong> to add one.</div>`;
  }

  // Timed flexible tasks
  if (timedFlexible.length > 0) {
    timedFlexible.sort((a, b) => (a.due_time || '').localeCompare(b.due_time || ''));
    html += `<div class="day-flexible">`;
    html += `<div class="day-flexible-header">
      <div class="day-flexible-label">Timed Tasks</div>
      <div class="day-flexible-count">${timedFlexible.length}</div>
    </div>`;
    html += timedFlexible
      .map((t) => {
        const extra = `<span class="day-timed-badge">${esc(t.due_time)}</span>`;
        return renderTaskCard(t, false, extra);
      })
      .join('');
    html += '</div>';
  }

  // Flexible tasks (no time)
  if (flexible.length > 0) {
    html += `<div class="day-flexible">`;
    html += `<div class="day-flexible-header">
      <div class="day-flexible-label">Flexible</div>
      <div class="day-flexible-count">${flexible.length}</div>
    </div>`;
    html += flexible.map((t) => renderTaskCard(t)).join('');
    html += '</div>';
  }

  // ─── Recurring Tasks Due Today / Overdue ───
  if (otherRecurring.length > 0) {
    html += `<div class="day-flexible">`;
    html += `<div class="day-flexible-header">
      <div class="day-flexible-label">🔁 Recurring</div>
      <div class="day-flexible-count">${otherRecurring.length}</div>
    </div>`;
    otherRecurring.forEach((rd) => {
      const r = rd.item;
      const titleDir = hasHebrew(r.title) ? ' dir="rtl"' : '';
      const overdueTag = rd.occ.overdue
        ? '<span style="color:#ef4444;font-size:.7rem;font-weight:600;margin-inline-start:.4rem">OVERDUE</span>'
        : '';
      html += `<div class="task-card" style="border-inline-start:3px solid var(--accent)">
        <div class="task-top">
          <div class="task-body" style="flex:1">
            <div class="task-title-row">
              <span style="font-size:.8rem">🔁</span>
              <span class="task-title"${titleDir}>${esc(r.title)}</span>
              ${overdueTag}
            </div>
            <div class="task-meta">
              <span class="tag-pill" style="background:var(--accent-bg);color:var(--accent)">Every ${r.frequency_days}d</span>
            </div>
          </div>
          <button onclick="markRecurringDone('${r.id}','${rd.occDateStr}')" style="
            background:#22c55e;color:#fff;border:none;border-radius:var(--r);padding:.3rem .7rem;
            font-size:.75rem;font-weight:600;cursor:pointer;white-space:nowrap">Done</button>
        </div>
      </div>`;
    });
    html += '</div>';
  }

  // No tasks at all for this day
  if (dayTasks.length === 0 && otherRecurring.length === 0) {
    html += emptyState(
      'Day is open',
      isViewingToday ? 'No tasks scheduled for today' : 'No tasks scheduled for this day',
    );
  }

  html += '</div>'; // close day-view
  mc.innerHTML = html;

  // Update now line every minute — only when viewing today
  if (isViewingToday) {
    dayNowTimer = setInterval(updateDayNowLine, 60000);
  }
}

function formatNowTime(h, m) {
  const ampm = h >= 12 ? 'pm' : 'am';
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return hr + ':' + String(m).padStart(2, '0') + ampm;
}

function updateDayNowLine() {
  const line = document.getElementById('dayNowLine');
  const timeline = document.getElementById('dayTimeline');
  if (!line || !timeline) return;

  const nowDate = new Date();
  const nowHour = nowDate.getHours();
  const nowMin = nowDate.getMinutes();

  // Recalculate range from the timeline's current height
  const hourHeight = 60;
  const timelineHeight = parseInt(timeline.style.height);
  const totalHours = timelineHeight / hourHeight;

  // Get rangeStart from the first hour label
  const firstLabel = timeline.querySelector('.day-hour-label');
  if (!firstLabel) return;
  const labelText = firstLabel.textContent.trim();
  let rangeStart = 7;
  if (labelText.endsWith('am')) {
    rangeStart = labelText === '12am' ? 0 : parseInt(labelText);
  } else if (labelText.endsWith('pm')) {
    rangeStart = labelText === '12pm' ? 12 : parseInt(labelText) + 12;
  }

  if (nowHour >= rangeStart && nowHour < rangeStart + totalHours) {
    const nowOffset = (nowHour - rangeStart) * hourHeight + (nowMin / 60) * hourHeight;
    line.style.top = nowOffset + 'px';
    line.style.display = '';
    const nowLabel = line.querySelector('.day-now-label');
    if (nowLabel) nowLabel.textContent = formatNowTime(nowHour, nowMin);
  } else {
    line.style.display = 'none';
  }
}

// ─── Render: Focus (merges Today + Waiting + Floating + Decide) ───
function renderFocus(mc) {
  let active = tasks.filter((t) => t.status !== 'done' && t.status !== 'backlog' && !t.parent_id);

  // Search filter
  if (focusSearch) {
    active = active.filter((t) => matchesSearch(t, focusSearch));
  }

  const overdue = active
    .filter((t) => isOverdue(t))
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  const tod = active.filter((t) => isToday(t) && !isOverdue(t));
  const tom = active.filter((t) => isTomorrow(t));
  const decide = active.filter((t) => t.status === 'decide');
  const waiting = active.filter((t) => t.status === 'waiting');
  const floating = active.filter((t) => !t.due_date && t.status === 'open');

  let html = buildSearchBar('focusSearch', 'Search focus items...');

  function focusSection(hdrHTML, items, renderFn) {
    if (items.length === 0) return '';
    const collapsed = items.length > 5;
    const sectionId = 'fs_' + Math.random().toString(36).slice(2, 8);
    let s = `<div id="${sectionId}"${collapsed ? ' class="section-collapsed"' : ''}>`;
    s += hdrHTML;
    s += items.map(renderFn || ((t) => renderTaskCard(t))).join('');
    if (collapsed) {
      s += `<button class="show-more-btn" onclick="document.getElementById('${sectionId}').classList.remove('section-collapsed');this.remove()">Show ${items.length - 5} more</button>`;
    }
    s += '</div>';
    return s;
  }

  // Need Attention (overdue)
  html += focusSection(
    `<div class="section-hdr overdue">${overdue.length} need${overdue.length === 1 ? 's' : ''} attention</div>`,
    overdue,
  );

  // Today
  html += focusSection(`<div class="section-hdr">Today</div>`, tod);

  // Tomorrow
  html += focusSection(`<div class="section-hdr">Tomorrow</div>`, tom);

  // Decisions
  html += focusSection(
    `<div class="section-hdr" style="color:var(--blue)">Decisions to make</div>`,
    decide,
  );

  // Waiting On
  if (waiting.length > 0) {
    waiting.sort((a, b) => {
      const aOver = a.waiting_followup && a.waiting_followup < today();
      const bOver = b.waiting_followup && b.waiting_followup < today();
      if (aOver && !bOver) return -1;
      if (!aOver && bOver) return 1;
      return (a.waiting_followup || 'z').localeCompare(b.waiting_followup || 'z');
    });
    html += focusSection(`<div class="section-hdr">Waiting on others</div>`, waiting, (t) => {
      const daysSinceCreated = t.created_at ? daysAgo(t.created_at.slice(0, 10)) : 0;
      const followupOverdue = t.waiting_followup && t.waiting_followup < today();
      let extra = `<div class="task-waiting">&#x23F3; ${esc(t.waiting_on || 'someone')} &middot; ${daysSinceCreated}d`;
      if (t.waiting_followup) {
        extra += ` &middot; Follow up: <span style="${followupOverdue ? 'color:var(--red);font-weight:600' : ''}">${formatDate(t.waiting_followup)}</span>`;
        if (followupOverdue) extra += ` <span style="color:var(--red)">(overdue)</span>`;
      }
      extra += `</div>`;
      return renderTaskCard(t, false, extra);
    });
  }

  // Floating (no date)
  if (floating.length > 0) {
    floating.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    html += focusSection(`<div class="section-hdr">Floating (no date)</div>`, floating, (t) => {
      const age = t.created_at ? daysAgo(t.created_at.slice(0, 10)) : 0;
      const stale = age > 14;
      const extra = `<div class="task-age ${stale ? 'stale' : ''}">Added ${age}d ago${stale ? ' — needs a date or backlog' : ''}</div>`;
      return renderTaskCard(t, false, extra);
    });
  }

  if (
    !overdue.length &&
    !tod.length &&
    !tom.length &&
    !decide.length &&
    !waiting.length &&
    !floating.length
  ) {
    html = emptyState('All clear', 'Nothing needs your attention right now');
  }
  mc.innerHTML = html;
  wireSearchInput(mc, 'focusSearch');
}

// ─── Render: Streams ───
function renderStreams(mc) {
  let active = tasks.filter((t) => t.status !== 'backlog' && !t.parent_id);
  if (globalSearch) active = active.filter((t) => matchesSearch(t, globalSearch));
  const streams = {};
  active.forEach((t) => {
    const areaTags = (t.tags || []).filter((tag) => {
      const def = tagDefs.find((d) => d.name === tag);
      return def ? def.category === 'area' : false;
    });
    const stream = areaTags.length > 0 ? areaTags[0] : 'untagged';
    if (!streams[stream]) streams[stream] = [];
    streams[stream].push(t);
  });

  if (Object.keys(streams).length === 0) {
    mc.innerHTML =
      buildSearchBar('globalSearch', 'Search streams...') +
      emptyState(
        'No streams',
        globalSearch ? 'Try a different search' : 'Tasks with area tags will appear as streams',
      );
    wireSearchInput(mc, 'globalSearch');
    return;
  }

  let html = buildSearchBar('globalSearch', 'Search streams...');
  const sortedStreams = Object.entries(streams).sort((a, b) => b[1].length - a[1].length);
  for (const [name, sTasks] of sortedStreams) {
    const done = sTasks.filter((t) => t.status === 'done').length;
    const open = sTasks.filter((t) => t.status === 'open' || t.status === 'in_progress').length;
    const waiting = sTasks.filter((t) => t.status === 'waiting').length;
    const total = sTasks.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const def = tagDefs.find((d) => d.name === name);
    const color = def?.color || '';
    const icon = getTagIcon(name);
    const displayName = name === 'untagged' ? 'Untagged' : name;

    html += `<div class="stream-card" onclick="toggleStream(this)" data-stream="${esc(name)}">
      <div class="stream-top">
        <div class="stream-name">
          ${icon ? `<span>${icon}</span>` : ''}
          <span style="${color ? 'color:' + color : ''}">${esc(displayName)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:.5rem">
          <span class="stream-count">${total} task${total !== 1 ? 's' : ''}</span>
          <span class="stream-chevron">&#x25B6;</span>
        </div>
      </div>
      <div class="stream-stats">
        <span>${open} open</span>
        <span>${waiting} waiting</span>
        <span>${done} done</span>
      </div>
      <div class="stream-bar"><div class="stream-bar-fill" style="width:${pct}%"></div></div>
      <div class="stream-tasks">
        ${(() => {
          const seen = new Set();
          return sTasks
            .filter((t) => t.status !== 'done' && !seen.has(t.id) && seen.add(t.id))
            .map((t) => renderTaskCard(t, true))
            .join('');
        })()}
      </div>
    </div>`;
  }
  mc.innerHTML = html;
  wireSearchInput(mc, 'globalSearch');
}

function toggleStream(el) {
  if (
    event.target.closest('.task-card') ||
    event.target.closest('.task-check') ||
    event.target.closest('.activate-btn')
  )
    return;
  el.classList.toggle('expanded');
}

// ─── Render: All Tasks ───
function renderAll(mc) {
  let filtered = tasks.filter((t) => t.status !== 'done' && !t.parent_id);

  // Build search + filter UI
  let html = buildSearchBar('allFilters.search', 'Search tasks...');

  // Filter chips
  const energies = ['low', 'medium', 'high'];
  const statuses = ['open', 'in_progress', 'waiting', 'decide', 'maybe', 'backlog'];
  const activeTags = [...new Set(tasks.flatMap((t) => t.tags || []))].sort();

  html += `<div class="filter-row">`;
  energies.forEach((e) => {
    const active = allFilters.energy === e;
    html += `<button class="filter-chip ${active ? 'active' : ''}" onclick="toggleFilter('energy','${e}')">${e}</button>`;
  });
  statuses.forEach((s) => {
    const active = allFilters.status === s;
    const label = s.replace('_', ' ');
    html += `<button class="filter-chip ${active ? 'active' : ''}" onclick="toggleFilter('status','${s}')">${label}</button>`;
  });
  activeTags.forEach((tag) => {
    const active = allFilters.tags.includes(tag);
    html += `<button class="filter-chip ${active ? 'active' : ''}" onclick="toggleFilter('tag','${esc(tag)}')">${esc(tag)}</button>`;
  });
  html += `</div>`;

  // Sort toggle (click same = reverse direction)
  const arrow = allFilters.sortDir === 'asc' ? '\u2191' : '\u2193';
  html += `<div style="display:flex;gap:.5rem;margin-bottom:.5rem;align-items:center;flex-wrap:wrap">
    <span style="font-size:.72rem;color:var(--dim)">Sort:</span>
    <button class="filter-chip ${allFilters.sort === 'due' ? 'active' : ''}" onclick="toggleFilter('sort','due')">Due date${allFilters.sort === 'due' ? ' ' + arrow : ''}</button>
    <button class="filter-chip ${allFilters.sort === 'created' ? 'active' : ''}" onclick="toggleFilter('sort','created')">Date added${allFilters.sort === 'created' ? ' ' + arrow : ''}</button>
    <button class="filter-chip ${allFilters.sort === 'edited' ? 'active' : ''}" onclick="toggleFilter('sort','edited')">Last edited${allFilters.sort === 'edited' ? ' ' + arrow : ''}</button>
  </div>`;
  // Time range filter
  html += `<div style="display:flex;gap:.5rem;margin-bottom:.5rem;align-items:center">
    <span style="font-size:.72rem;color:var(--dim)">Show:</span>
    <button class="filter-chip ${allFilters.timeRange === 'day' ? 'active' : ''}" onclick="toggleFilter('timeRange','day')">Today</button>
    <button class="filter-chip ${allFilters.timeRange === 'week' ? 'active' : ''}" onclick="toggleFilter('timeRange','week')">This week</button>
    <button class="filter-chip ${allFilters.timeRange === 'month' ? 'active' : ''}" onclick="toggleFilter('timeRange','month')">This month</button>
  </div>`;

  // Apply filters
  if (allFilters.search) {
    filtered = filtered.filter((t) => matchesSearch(t, allFilters.search));
  }
  if (allFilters.energy) filtered = filtered.filter((t) => t.energy === allFilters.energy);
  if (allFilters.noDate) {
    filtered = filtered.filter((t) => !t.due_date);
  }
  if (allFilters.status) filtered = filtered.filter((t) => t.status === allFilters.status);
  if (allFilters.tags.length)
    filtered = filtered.filter((t) => allFilters.tags.some((ft) => (t.tags || []).includes(ft)));

  // Time range filter
  if (allFilters.timeRange) {
    const now = new Date(today() + 'T00:00:00');
    let rangeEnd;
    if (allFilters.timeRange === 'day') {
      rangeEnd = new Date(now);
      rangeEnd.setDate(rangeEnd.getDate() + 1);
    } else if (allFilters.timeRange === 'week') {
      rangeEnd = new Date(now);
      rangeEnd.setDate(rangeEnd.getDate() + 7);
    } else if (allFilters.timeRange === 'month') {
      rangeEnd = new Date(now);
      rangeEnd.setMonth(rangeEnd.getMonth() + 1);
    }
    const endStr = rangeEnd.toISOString().slice(0, 10);
    filtered = filtered.filter((t) => t.due_date && t.due_date >= today() && t.due_date <= endStr);
  }

  // Sort
  const dir = allFilters.sortDir === 'desc' ? -1 : 1;
  if (allFilters.sort === 'edited') {
    filtered.sort((a, b) => dir * (a.updated_at || '').localeCompare(b.updated_at || ''));
  } else if (allFilters.sort === 'created') {
    filtered.sort((a, b) => dir * (a.created_at || '').localeCompare(b.created_at || ''));
  } else {
    filtered.sort((a, b) => {
      if (a.due_date && b.due_date) return dir * a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return dir * (a.created_at || '').localeCompare(b.created_at || '');
    });
  }

  if (filtered.length === 0) {
    html += emptyState('No tasks found', 'Try adjusting your filters');
  } else {
    html += filtered.map((t) => renderTaskCard(t)).join('');
  }
  mc.innerHTML = html;
  wireSearchInput(mc, 'allFilters.search');
}

function toggleFilter(type, val) {
  if (type === 'energy') allFilters.energy = allFilters.energy === val ? null : val;
  else if (type === 'status') allFilters.status = allFilters.status === val ? null : val;
  else if (type === 'sort') {
    if (allFilters.sort === val) {
      allFilters.sortDir = allFilters.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      allFilters.sort = val;
      allFilters.sortDir = 'asc';
    }
  } else if (type === 'timeRange') allFilters.timeRange = allFilters.timeRange === val ? null : val;
  else if (type === 'tag') {
    const idx = allFilters.tags.indexOf(val);
    if (idx >= 0) allFilters.tags.splice(idx, 1);
    else allFilters.tags.push(val);
  }
  renderCurrentTab();
}

// ─── Render: Waiting ───
function renderWaiting(mc) {
  const waiting = tasks.filter((t) => t.status === 'waiting' && !t.parent_id);
  waiting.sort((a, b) => {
    const aOver = a.waiting_followup && a.waiting_followup < today();
    const bOver = b.waiting_followup && b.waiting_followup < today();
    if (aOver && !bOver) return -1;
    if (!aOver && bOver) return 1;
    return (a.waiting_followup || 'z').localeCompare(b.waiting_followup || 'z');
  });
  if (waiting.length === 0) {
    mc.innerHTML = emptyState('Nothing waiting', 'No tasks are waiting on someone else');
    return;
  }
  mc.innerHTML = waiting
    .map((t) => {
      const daysSinceCreated = t.created_at ? daysAgo(t.created_at.slice(0, 10)) : 0;
      const followupOverdue = t.waiting_followup && t.waiting_followup < today();
      let extra = `<div class="task-waiting">
      &#x23F3; Waiting on: ${esc(t.waiting_on || 'someone')}
      &middot; ${daysSinceCreated}d`;
      if (t.waiting_followup) {
        extra += ` &middot; Follow up: <span style="${followupOverdue ? 'color:var(--red);font-weight:600' : ''}">${formatDate(t.waiting_followup)}</span>`;
        if (followupOverdue) extra += ` <span style="color:var(--red)">(overdue)</span>`;
      }
      extra += `</div>`;
      return renderTaskCard(t, false, extra);
    })
    .join('');
}

// ─── Render: Floating ───
function renderFloating(mc) {
  let floating = tasks.filter((t) => !t.due_date && t.status === 'open' && !t.parent_id);
  if (globalSearch) floating = floating.filter((t) => matchesSearch(t, globalSearch));
  floating.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  if (floating.length === 0) {
    mc.innerHTML = emptyState('Nothing floating', 'All open tasks have due dates');
    return;
  }
  mc.innerHTML = floating
    .map((t) => {
      const age = t.created_at ? daysAgo(t.created_at.slice(0, 10)) : 0;
      const stale = age > 14;
      const extra = `<div class="task-age ${stale ? 'stale' : ''}">
      Added ${age} day${age !== 1 ? 's' : ''} ago${stale ? ' — consider setting a date or moving to backlog' : ''}
    </div>`;
      return renderTaskCard(t, false, extra);
    })
    .join('');
}

// ─── Render: Low Energy ───
function renderLow(mc) {
  const low = tasks.filter(
    (t) =>
      t.energy === 'low' && (t.status === 'open' || t.status === 'in_progress') && !t.parent_id,
  );
  low.sort((a, b) => {
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return 0;
  });
  if (low.length === 0) {
    mc.innerHTML = emptyState('No low-energy tasks', 'Tag tasks as "low energy" for easy days');
    return;
  }
  mc.innerHTML =
    `<div class="section-hdr">Things you can do on a low day</div>` +
    low.map((t) => renderTaskCard(t)).join('');
}

// ─── Render: Backlog ───
function renderBacklog(mc) {
  const backlog = tasks.filter((t) => t.status === 'backlog' && !t.parent_id);
  if (backlog.length === 0) {
    mc.innerHTML = emptyState('Backlog empty', 'Move tasks here that are not active right now');
    return;
  }
  // Group by first area tag
  const groups = {};
  backlog.forEach((t) => {
    const areaTags = (t.tags || []).filter((tag) => {
      const def = tagDefs.find((d) => d.name === tag);
      return def ? def.category === 'area' : false;
    });
    const group = areaTags.length > 0 ? areaTags[0] : 'untagged';
    if (!groups[group]) groups[group] = [];
    groups[group].push(t);
  });
  let html = '';
  for (const [name, gTasks] of Object.entries(groups).sort()) {
    const displayName = name === 'untagged' ? 'Untagged' : name;
    html += `<div class="section-hdr">${esc(displayName)}</div>`;
    html += gTasks
      .map((t) => {
        const extra = `<button class="activate-btn" onclick="activateTask(event,'${t.id}')">Activate</button>`;
        return renderTaskCard(t, false, extra, true);
      })
      .join('');
  }
  mc.innerHTML = html;
}

// ─── Render: Done ───
function renderDone(mc) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  let done = tasks.filter(
    (t) =>
      t.status === 'done' &&
      t.completed_at &&
      new Date(t.completed_at) >= thirtyDaysAgo &&
      !t.parent_id,
  );
  done.sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
  if (globalSearch) done = done.filter((t) => matchesSearch(t, globalSearch));
  let html = buildSearchBar('globalSearch', 'Search completed tasks...');
  if (done.length === 0) {
    html += emptyState(
      'No completed tasks',
      globalSearch ? 'Try a different search' : 'Mark tasks done and they will appear here',
    );
  } else {
    html +=
      `<div class="section-hdr">Last 30 days</div>` +
      done
        .map((t) => {
          const extra = `<div class="task-age">Completed ${t.completed_at ? formatDateLong(t.completed_at.slice(0, 10)) : ''}</div>`;
          return renderTaskCard(t, false, extra, false, true);
        })
        .join('');
  }
  mc.innerHTML = html;
  wireSearchInput(mc, 'globalSearch');
}

// ─── History Tab ───
// WHY THIS EXISTS:
// Claude (the AI assistant) reads this at session start to know what Allison
// has done without her re-explaining. Every status/title/tag change is auto-logged
// by a Postgres trigger. Allison can also tap 📎 to add a free-text note on any
// entry — "did this offline", "talked to Reuven", "cancelled — changed plans".
// Notes written on task CARDS (the Notes field in the edit modal) are also logged.
//
// HOW CLAUDE READS IT — run this SQL at session start (50 rows = cheap on tokens):
//   SELECT h.changed_at, h.field_changed, h.old_value, h.new_value, h.note, t.title
//   FROM task_history h LEFT JOIN tasks t ON t.id = h.task_id
//   ORDER BY h.changed_at DESC LIMIT 50;
//
// That single query tells Claude the last 50 moves + any context notes.
// No need to ask Allison "what did you do?" — just read the log.

let historyData = [];
let historyLoaded = false;

async function renderHistory(mc) {
  mc.innerHTML =
    buildSearchBar('globalSearch', 'Search history...') +
    '<div class="section-hdr">Activity Log</div>' +
    '<div id="historyList"><div style="padding:2rem;text-align:center;color:var(--text2)">Loading…</div></div>' +
    '<div style="padding:1rem"><button class="btn-primary" onclick="openAddNoteModal(null)" style="width:100%">+ Add Note for Claude</button></div>';

  if (!historyLoaded) {
    const { data, error } = await sb
      .from('task_history')
      .select('*, tasks(title)')
      .order('changed_at', { ascending: false })
      .limit(100);
    if (!error) {
      historyData = data || [];
      historyLoaded = true;
    }
  }

  const list = document.getElementById('historyList');
  if (!historyData.length) {
    list.innerHTML =
      '<div style="padding:2rem;text-align:center;color:var(--text2)">No history yet — actions appear here automatically.</div>';
    return;
  }

  const fmt = (iso) => {
    const d = new Date(iso);
    return (
      d.toLocaleDateString('en-IL', { weekday: 'short', month: 'short', day: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString('en-IL', { hour: '2-digit', minute: '2-digit' })
    );
  };

  const icon = (f) =>
    ({ status: '✅', title: '✏️', tags: '🏷️', notes: '📝', due_date: '📅', note: '📎' })[f] || '📌';

  const formatChange = (h) => {
    if (h.field_changed === 'status') {
      const L = { open: 'Open', done: 'Done ✓', waiting: 'Waiting', backlog: 'Backlog' };
      const ov = L[h.old_value] || h.old_value || '—';
      const nv = L[h.new_value] || h.new_value || '—';
      return '<span style="color:var(--text2)">' + ov + ' → <strong>' + nv + '</strong></span>';
    }
    if (h.field_changed === 'note')
      return '<span style="color:var(--text2)">Standalone note</span>';
    return '<span style="color:var(--text2)">' + esc(h.field_changed) + ' changed</span>';
  };

  let filtered = historyData;
  if (globalSearch) {
    const words = globalSearch.toLowerCase().split(/s+/).filter(Boolean);
    filtered = filtered.filter((h) => {
      const text = [
        (h.tasks && h.tasks.title) || '',
        h.note || '',
        h.field_changed || '',
        h.new_value || '',
      ]
        .join(' ')
        .toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }
  wireSearchInput(mc, 'globalSearch');
  if (!filtered.length) {
    list.innerHTML =
      '<div style="padding:2rem;text-align:center;color:var(--text2)">No matching history</div>';
    return;
  }
  list.innerHTML = filtered
    .map((h) => {
      const title = esc((h.tasks && h.tasks.title) || '(standalone note)');
      const noteHtml = h.note
        ? '<div style="font-size:.85rem;margin-top:.3rem;background:var(--surface2);padding:.4rem .6rem;border-radius:.4rem;color:var(--text)">📎 ' +
          esc(h.note) +
          '</div>'
        : '';
      return (
        '<div style="padding:.75rem 1rem;border-bottom:1px solid var(--border);display:flex;gap:.75rem;align-items:flex-start">' +
        '<div style="font-size:1.2rem;padding-top:.1rem">' +
        icon(h.field_changed) +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
        '<div style="font-weight:600;font-size:.9rem">' +
        title +
        '</div>' +
        '<div style="font-size:.85rem;margin-top:.15rem">' +
        formatChange(h) +
        '</div>' +
        noteHtml +
        '<div style="font-size:.75rem;color:var(--text3);margin-top:.25rem">' +
        fmt(h.changed_at) +
        '</div>' +
        '</div>' +
        '<button onclick="openAddNoteModal(&#39;' +
        h.id +
        '&#39;)" style="background:none;border:none;cursor:pointer;color:var(--text3);font-size:.8rem;padding:.2rem .4rem;border-radius:.3rem" title="Add note">📎</button>' +
        '</div>'
      );
    })
    .join('');
}

function openAddNoteModal(historyId) {
  const modal = document.createElement('div');
  modal.className = 'history-note-modal';
  modal.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem';
  modal.innerHTML =
    '<div style="background:var(--surface);border-radius:.75rem;padding:1.5rem;width:100%;max-width:420px">' +
    '<div style="font-weight:700;margin-bottom:.5rem">Note for Claude</div>' +
    '<div style="font-size:.8rem;color:var(--text2);margin-bottom:.75rem">Claude reads these at session start — context, decisions, what happened offline.</div>' +
    '<textarea id="histNoteInput" style="width:100%;min-height:80px;background:var(--surface2);border:1px solid var(--border);border-radius:.5rem;padding:.6rem;color:var(--text);font-size:.9rem;resize:vertical;box-sizing:border-box" placeholder="e.g. did this offline, talked to Reuven about this, cancelled because..." dir="auto"></textarea>' +
    '<div style="display:flex;gap:.75rem;margin-top:1rem">' +
    '<button onclick="document.querySelector(&#39;.history-note-modal&#39;).remove()" style="flex:1;padding:.6rem;background:var(--surface2);border:none;border-radius:.5rem;cursor:pointer;color:var(--text)">Cancel</button>' +
    '<button onclick="saveHistoryNote(&#39;' +
    historyId +
    '&#39;, this)" style="flex:1;padding:.6rem;background:var(--accent);border:none;border-radius:.5rem;cursor:pointer;color:#fff;font-weight:600">Save</button>' +
    '</div>' +
    '</div>';
  document.body.appendChild(modal);
  setTimeout(() => modal.querySelector('#histNoteInput').focus(), 50);
}

async function saveHistoryNote(historyId, btn) {
  const note = document.getElementById('histNoteInput').value.trim();
  if (!note) return;
  btn.textContent = 'Saving…';
  const now = new Date().toISOString();

  if (historyId && historyId !== 'null') {
    await sb.from('task_history').update({ note }).eq('id', historyId);
    const entry = historyData.find((h) => h.id === historyId);
    if (entry) entry.note = note;
  } else {
    const { data } = await sb
      .from('task_history')
      .insert({
        task_id: null,
        field_changed: 'note',
        old_value: null,
        new_value: note,
        changed_at: now,
        changed_by: 'allison',
        note,
      })
      .select()
      .single();
    if (data) historyData.unshift(data);
  }

  document.querySelector('.history-note-modal').remove();
  historyLoaded = false;
  if (currentTab === 'history') renderHistory(document.getElementById('mainContent'));
  showToast('Note saved ✓');
}

// ─── Task Card Renderer ───
function renderTaskCard(
  t,
  compact = false,
  extraHTML = '',
  showActivate = false,
  isDoneCard = false,
) {
  const children = tasks.filter((c) => c.parent_id === t.id);
  const doneChildren = children.filter((c) => c.status === 'done').length;
  const hasChildren = children.length > 0;

  let dueHTML = '';
  if (t.due_date) {
    let cls = '';
    if (isOverdue(t) && t.status !== 'done') cls = 'overdue';
    else if (isToday(t)) cls = 'today';
    dueHTML = `<span class="task-due ${cls}">${formatDate(t.due_date)}${t.due_time ? ' ' + t.due_time : ''}</span>`;
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
    agingDays >= 14 && t.status !== 'done' && t.status !== 'waiting' && t.status !== 'backlog';

  return `<div class="task-card${isAging ? ' aging' : ''}" id="card_${t.id}" ${isAging ? 'title="Added ' + agingDays + ' days ago"' : ''}>
    <div class="task-top">
      <div class="task-check ${checked}" onclick="event.stopPropagation();toggleDone('${t.id}','${t.status}')"></div>
      <div class="task-body" onclick="toggleCardExpand(event, '${t.id}')" ondblclick="event.stopPropagation();openEditModal('${t.id}')">
        <div class="task-title-row">
          ${t.energy ? `<span class="energy-dot ${t.energy}"></span>` : ''}
          <span class="task-title"${hasHebrew(t.title) ? ' dir="rtl"' : ''}>${highlightSearch(t.title)}</span>
          ${hasChildren ? `<span class="child-progress">${doneChildren}/${children.length}</span>` : ''}
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

// ─── Toggle Card Expand ───
function toggleCardExpand(event, id) {
  event.stopPropagation();
  const card = document.getElementById('card_' + id);
  if (card) card.classList.toggle('expanded');
}

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
    qaEnergy = null;
  } else {
    btn.classList.add('active');
    qaEnergy = btn.dataset.e;
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
  qaEnergy = null;

  showToast('Task added');
  renderCurrentTab();
}

// Enter key to add
document.getElementById('qaInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') quickAddTask();
});

// ─── Edit Modal ───
function openEditModal(id) {
  editingTaskId = id;
  const t = tasks.find((x) => x.id === id);
  if (!t) return;

  document.getElementById('editTitle').value = t.title || '';
  document.getElementById('editNotes').value = t.notes || '';
  document.getElementById('editStatus').value = t.status || 'open';
  document.getElementById('editDueDate').value = t.due_date || '';
  document.getElementById('editDueTime').value = t.due_time || '';
  document.getElementById('editWaitingOn').value = t.waiting_on || '';
  document.getElementById('editWaitingFollowup').value = t.waiting_followup || '';

  // Energy
  document
    .querySelectorAll('.modal-energy-btn')
    .forEach((b) => b.classList.toggle('active', b.dataset.e === t.energy));

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
  const isWaiting = document.getElementById('editStatus').value === 'waiting';
  document.getElementById('editWaitingSection').style.display = isWaiting ? 'block' : 'none';
}

function renderEditSubtasks(parentId) {
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

async function updateSubtaskDate(id, parentId, dateVal) {
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
  renderCurrentTab();
}

async function addSubtask() {
  const input = document.getElementById('newSubtaskInput');
  const dateInput = document.getElementById('newSubtaskDate');
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
  renderCurrentTab();
  showToast('Subtask added');
}

async function deleteSubtask(id, parentId) {
  const { error } = await sb.from('tasks').delete().eq('id', id);
  if (error) {
    showToast('Error deleting subtask');
    return;
  }
  tasks = tasks.filter((t) => t.id !== id);
  renderEditSubtasks(parentId);
  renderCurrentTab();
}

function renderModalTags(selectedTags) {
  const wrap = document.getElementById('editTagsWrap');
  const allTags = tagDefs.map((d) => d.name);
  // Also include any tags on the task that might not be in definitions
  const extraTags = selectedTags.filter((t) => !allTags.includes(t));
  const allNames = [...allTags, ...extraTags];

  wrap.innerHTML = allNames
    .map((name) => {
      const active = selectedTags.includes(name);
      const def = tagDefs.find((d) => d.name === name);
      return `<button class="modal-tag ${active ? 'active' : ''}" data-tag="${esc(name)}" onclick="toggleModalTag(this)">
      ${getTagIcon(name)} ${esc(name)}
    </button>`;
    })
    .join('');

  if (allNames.length === 0) {
    wrap.innerHTML = '<span style="font-size:.75rem;color:var(--dim)">No tags defined yet</span>';
  }
}

function toggleModalTag(btn) {
  btn.classList.toggle('active');
}

function pickModalEnergy(btn) {
  const wasActive = btn.classList.contains('active');
  document.querySelectorAll('.modal-energy-btn').forEach((b) => b.classList.remove('active'));
  if (!wasActive) btn.classList.add('active');
}

function closeModal() {
  document.getElementById('editModal').classList.remove('visible');
  document.body.style.overflow = '';
  editingTaskId = null;
}

// Close modal on overlay click
document.getElementById('editModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('editModal')) {
    if (hasUnsavedModalChanges()) {
      if (!confirm('Discard unsaved changes?')) return;
    }
    closeModal();
  }
});

function hasUnsavedModalChanges() {
  if (!editingTaskId) return false;
  const t = tasks.find((x) => x.id === editingTaskId);
  if (!t) return false;
  if (document.getElementById('editTitle').value !== (t.title || '')) return true;
  if (document.getElementById('editNotes').value !== (t.notes || '')) return true;
  if (document.getElementById('editStatus').value !== (t.status || 'open')) return true;
  if (document.getElementById('editDueDate').value !== (t.due_date || '')) return true;
  if (document.getElementById('editDueTime').value !== (t.due_time || '')) return true;
  return false;
}

async function saveTask() {
  if (!editingTaskId) return;
  const now = new Date().toISOString();

  // Gather values
  const title = document.getElementById('editTitle').value.trim();
  const notes = document.getElementById('editNotes').value.trim() || null;
  const status = document.getElementById('editStatus').value;
  const dueDate = document.getElementById('editDueDate').value || null;
  const dueTime = document.getElementById('editDueTime').value || null;
  const waitingOn = document.getElementById('editWaitingOn').value.trim() || null;
  const waitingFollowup = document.getElementById('editWaitingFollowup').value || null;

  // Energy
  const activeEnergy = document.querySelector('.modal-energy-btn.active');
  const energy = activeEnergy ? activeEnergy.dataset.e : null;

  // Tags
  const selectedTags = Array.from(document.querySelectorAll('.modal-tag.active')).map(
    (b) => b.dataset.tag,
  );

  if (!title) {
    showToast('Title is required');
    return;
  }

  const update = {
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

  // If changing to done, set completed_at
  const oldTask = tasks.find((t) => t.id === editingTaskId);
  if (status === 'done' && oldTask?.status !== 'done') update.completed_at = now;
  if (status !== 'done') update.completed_at = null;

  const { error } = await sb.from('tasks').update(update).eq('id', editingTaskId);
  if (error) {
    showToast('Error saving: ' + error.message);
    return;
  }

  // Log changes to history
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
    // Tags comparison
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

  // Update local
  if (oldTask) {
    Object.assign(oldTask, update);
    localStorage.setItem('tasks_cache', JSON.stringify(tasks));
  }

  showToast('Task saved');
  closeModal();
  renderCurrentTab();
}

function confirmCompleteTask() {
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
    renderCurrentTab();
  };
}

function closeConfirm() {
  document.getElementById('confirmDialog').classList.remove('visible');
}

function confirmDeleteTask() {
  if (!editingTaskId) return;
  const taskToDelete = tasks.find((t) => t.id === editingTaskId);
  if (!taskToDelete) return;
  const deletingId = editingTaskId;
  const originalStatus = taskToDelete.status;

  // Optimistically remove from local state and close modal
  tasks = tasks.filter((t) => t.id !== deletingId);
  localStorage.setItem('tasks_cache', JSON.stringify(tasks));
  closeModal();
  renderCurrentTab();

  let undone = false;
  let deleteTimer = setTimeout(async () => {
    if (undone) return;
    const { error } = await sb.from('tasks').delete().eq('id', deletingId);
    if (error) {
      // Restore on error
      tasks.push(taskToDelete);
      localStorage.setItem('tasks_cache', JSON.stringify(tasks));
      renderCurrentTab();
      showToast('Error deleting task');
    }
  }, 5000);

  showToast('Task deleted', () => {
    undone = true;
    clearTimeout(deleteTimer);
    // Restore task locally
    tasks.push(taskToDelete);
    localStorage.setItem('tasks_cache', JSON.stringify(tasks));
    renderCurrentTab();
    showToast('Delete undone');
  });
}

// ─── Helpers ───
// esc, emptyState, showToast, toastUndo → imported from ./ui

// ─── Add Block Modal ───
function openBlockModal() {
  document.getElementById('blockTitle').value = '';
  document.getElementById('blockDate').value = viewingDate;
  document.getElementById('blockStartTime').value = '09:00';
  document.getElementById('blockEndTime').value = '10:00';
  document.getElementById('addBlockModal').classList.add('visible');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('blockTitle').focus(), 100);
}

function closeBlockModal() {
  document.getElementById('addBlockModal').classList.remove('visible');
  document.body.style.overflow = '';
}

// Close on overlay click
document.getElementById('addBlockModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('addBlockModal')) closeBlockModal();
});

async function saveNewBlock() {
  const title = document.getElementById('blockTitle').value.trim();
  const blockDate = document.getElementById('blockDate').value;
  const startTime = document.getElementById('blockStartTime').value;
  const endTime = document.getElementById('blockEndTime').value;
  const btn = document.getElementById('blockSaveBtn');

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
    viewingDate = blockDate;

    showToast('Time block added');
    closeBlockModal();
    renderCurrentTab();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Add Block';
    showToast('Error: ' + e.message);
    console.error('Block save exception:', e);
  }
}

// ─── Keyboard: Add block modal ───
document.getElementById('blockTitle').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveNewBlock();
});

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
  currentDashboard = id;
  renderCurrentTab();
}

// ── Dashboard 1: Weekly Planning ──
function buildWeeklyPlanning() {
  const todayStr = today();
  const weekDates = getWeekDates(todayStr);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Week stats
  const sevenAgo = new Date();
  sevenAgo.setDate(sevenAgo.getDate() - 7);
  const createdThisWeek = tasks.filter(
    (t) =>
      t.created_at && new Date(t.created_at) >= sevenAgo && new Date(t.created_at) <= new Date(),
  ).length;
  const completedThisWeek = tasks.filter(
    (t) => t.status === 'done' && t.completed_at && new Date(t.completed_at) >= sevenAgo,
  ).length;
  const floatingCount = tasks.filter((t) => !t.due_date && t.status === 'open').length;

  let html = `<div class="dash-stat-row">
    <div class="dash-stat"><div class="dash-stat-num green">${completedThisWeek}</div><div class="dash-stat-lbl">Done this week</div></div>
    <div class="dash-stat"><div class="dash-stat-num">${createdThisWeek}</div><div class="dash-stat-lbl">Added this week</div></div>
    <div class="dash-stat"><div class="dash-stat-num amber">${floatingCount}</div><div class="dash-stat-lbl">Floating</div></div>
  </div>`;

  html += `<div class="dash-card" style="padding:.5rem .75rem">`;
  weekDates.forEach((wd, i) => {
    let dayTasks = tasks.filter(
      (t) => t.due_date === wd && t.status !== 'done' && t.status !== 'backlog',
    );
    if (globalSearch) dayTasks = dayTasks.filter((t) => matchesSearch(t, globalSearch));
    const count = dayTasks.length;
    const isToday = wd === todayStr;
    const overloaded = count >= 5;
    const empty = count === 0;

    const lowC = dayTasks.filter((t) => t.energy === 'low').length;
    const medC = dayTasks.filter((t) => t.energy === 'medium').length;
    const hiC = dayTasks.filter((t) => t.energy === 'high').length;

    let rowCls = 'dash-week-row';
    if (overloaded) rowCls += ' overloaded';
    if (empty) rowCls += ' empty-day';

    const rowId = 'weekrow_' + wd;
    const tasksId = 'weektasks_' + wd;

    html += `<div class="${rowCls}" id="${rowId}" onclick="toggleWeekRow('${wd}')">
      <div class="dash-week-day ${isToday ? 'today' : ''}">${dayNames[i]}${isToday ? '·' : ''}</div>
      <div class="dash-week-count">${count > 0 ? count : '—'}</div>
      <div class="dash-week-dots">
        ${Array(lowC).fill(`<span class="energy-dot low" style="width:7px;height:7px"></span>`).join('')}
        ${Array(medC).fill(`<span class="energy-dot medium" style="width:7px;height:7px"></span>`).join('')}
        ${Array(hiC).fill(`<span class="energy-dot high" style="width:7px;height:7px"></span>`).join('')}
        ${overloaded ? `<span class="dash-badge amber">heavy</span>` : ''}
        ${empty ? `<span style="font-size:.65rem;color:var(--dim)">open</span>` : ''}
      </div>
      ${count > 0 ? `<span class="dash-week-chevron">&#x25B6;</span>` : ''}
    </div>
    <div class="dash-week-tasks" id="${tasksId}">
      ${dayTasks
        .map(
          (t) => `<div class="dash-inline-task" onclick="openEditModal('${t.id}')">
        ${t.energy ? `<span class="energy-dot ${t.energy}"></span>` : ''}
        <span>${esc(t.title)}</span>
        ${(t.tags || [])
          .slice(0, 2)
          .map((tg) => `<span class="tag-pill">${esc(tg)}</span>`)
          .join('')}
      </div>`,
        )
        .join('')}
    </div>`;
  });
  html += `</div>`;

  // Floating tasks
  const floaters = tasks.filter((t) => !t.due_date && t.status === 'open');
  if (floaters.length > 0) {
    html += `<div class="dash-section-hdr">Floating tasks — no date set (${floaters.length})</div>
    <div class="dash-card" style="padding:.35rem .5rem">`;
    const energyFilter = ['low', 'medium', 'high', null];
    html += `<div style="display:flex;gap:.3rem;margin-bottom:.5rem;flex-wrap:wrap">`;
    html += `<button class="filter-chip" id="floatFilter_all" onclick="filterFloaters('all')" style="font-size:.65rem">All</button>`;
    energyFilter.filter(Boolean).forEach((e) => {
      html += `<button class="filter-chip" id="floatFilter_${e}" onclick="filterFloaters('${e}')" style="font-size:.65rem">
        <span class="energy-dot ${e}" style="display:inline-block;margin-right:3px"></span>${e}
      </button>`;
    });
    html += `</div>`;
    html += `<div id="floatersContainer">`;
    floaters
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
      .forEach((t) => {
        html += `<div class="dash-inline-task" onclick="openEditModal('${t.id}')">
        ${t.energy ? `<span class="energy-dot ${t.energy}"></span>` : ''}
        <span>${esc(t.title)}</span>
        ${(t.tags || [])
          .slice(0, 2)
          .map((tg) => `<span class="tag-pill">${esc(tg)}</span>`)
          .join('')}
      </div>`;
      });
    html += `</div></div>`;
  }

  return html;
}

function toggleWeekRow(wd) {
  const row = document.getElementById('weekrow_' + wd);
  const tasks = document.getElementById('weektasks_' + wd);
  if (!row || !tasks) return;
  const expanded = row.classList.toggle('expanded');
  tasks.style.display = expanded ? 'block' : 'none';
}

function filterFloaters(energy) {
  const floaters = window._allFloaters || tasks.filter((t) => !t.due_date && t.status === 'open');
  window._allFloaters = floaters;
  document.querySelectorAll('[id^="floatFilter_"]').forEach((b) => b.classList.remove('active'));
  const btn = document.getElementById('floatFilter_' + energy);
  if (btn) btn.classList.add('active');
  const container = document.getElementById('floatersContainer');
  if (!container) return;
  const filtered = energy === 'all' ? floaters : floaters.filter((t) => t.energy === energy);
  container.innerHTML = filtered
    .map(
      (t) => `<div class="dash-inline-task" onclick="openEditModal('${t.id}')">
    ${t.energy ? `<span class="energy-dot ${t.energy}"></span>` : ''}
    <span>${esc(t.title)}</span>
    ${(t.tags || [])
      .slice(0, 2)
      .map((tg) => `<span class="tag-pill">${esc(tg)}</span>`)
      .join('')}
  </div>`,
    )
    .join('');
}

// ── Dashboard 2: Energy Budget ──
let selectedEnergy = null;

function buildEnergyBudget() {
  const active = tasks.filter((t) => t.status !== 'done' && t.status !== 'backlog');
  const todayTasks = active.filter((t) => t.due_date === today());

  const lowC = active.filter((t) => t.energy === 'low').length;
  const medC = active.filter((t) => t.energy === 'medium').length;
  const hiC = active.filter((t) => t.energy === 'high').length;
  const total = lowC + medC + hiC || 1;

  const lowPct = Math.round((lowC / total) * 100);
  const medPct = Math.round((medC / total) * 100);
  const hiPct = 100 - lowPct - medPct;

  // Today summary
  const tLow = todayTasks.filter((t) => t.energy === 'low').length;
  const tMed = todayTasks.filter((t) => t.energy === 'medium').length;
  const tHi = todayTasks.filter((t) => t.energy === 'high').length;

  let html = `<div class="dash-card">
    <div class="dash-card-title">Today's Energy Mix (${todayTasks.length} task${todayTasks.length !== 1 ? 's' : ''})</div>
    <div class="dash-energy-legend">
      <div class="dash-energy-legend-item"><span class="energy-dot low"></span> Low: ${tLow}</div>
      <div class="dash-energy-legend-item"><span class="energy-dot medium"></span> Med: ${tMed}</div>
      <div class="dash-energy-legend-item"><span class="energy-dot high"></span> High: ${tHi}</div>
    </div>
    ${
      todayTasks.length > 0
        ? todayTasks
            .map(
              (t) =>
                `<div class="dash-inline-task" onclick="openEditModal('${t.id}')">
        ${t.energy ? `<span class="energy-dot ${t.energy}"></span>` : '<span style="width:8px;height:8px;display:inline-block;border-radius:50%;background:var(--border)"></span>'}
        <span>${esc(t.title)}</span>
      </div>`,
            )
            .join('')
        : `<div style="font-size:.8rem;color:var(--dim);padding:.3rem 0">No tasks scheduled for today</div>`
    }
  </div>`;

  html += `<div class="dash-card">
    <div class="dash-card-title">All open tasks — energy distribution</div>
    <div class="dash-energy-bar">
      <div class="dash-energy-seg low" style="width:${lowPct}%"></div>
      <div class="dash-energy-seg med" style="width:${medPct}%"></div>
      <div class="dash-energy-seg high" style="width:${hiPct}%"></div>
    </div>
    <div class="dash-energy-legend">
      <div class="dash-energy-legend-item"><span class="energy-dot low"></span> Low: ${lowC}</div>
      <div class="dash-energy-legend-item"><span class="energy-dot medium"></span> Med: ${medC}</div>
      <div class="dash-energy-legend-item"><span class="energy-dot high"></span> High: ${hiC}</div>
    </div>
  </div>`;

  html += `<div class="dash-card">
    <div class="dash-card-title">Match your energy — pick your level</div>
    <div class="dash-energy-pick-row">
      <button class="dash-energy-pick-btn ${selectedEnergy === 'low' ? 'active' : ''}" data-e="low" onclick="pickEnergyDash('low')">
        <span class="energy-dot low"></span> Low
      </button>
      <button class="dash-energy-pick-btn ${selectedEnergy === 'medium' ? 'active' : ''}" data-e="medium" onclick="pickEnergyDash('medium')">
        <span class="energy-dot medium"></span> Medium
      </button>
      <button class="dash-energy-pick-btn ${selectedEnergy === 'high' ? 'active' : ''}" data-e="high" onclick="pickEnergyDash('high')">
        <span class="energy-dot high"></span> High
      </button>
    </div>`;

  ['low', 'medium', 'high'].forEach((e) => {
    const matching = active.filter((t) => t.energy === e).slice(0, 5);
    html += `<div class="dash-energy-section ${selectedEnergy === e ? 'visible' : ''}" id="energySec_${e}">
      <div class="dash-section-hdr" style="color:var(--energy-${e === 'medium' ? 'med' : e})">${e.charAt(0).toUpperCase() + e.slice(1)} energy tasks</div>
      ${
        matching.length > 0
          ? matching
              .map(
                (t) =>
                  `<div class="dash-inline-task" onclick="openEditModal('${t.id}')">
          <span class="energy-dot ${e}"></span>
          <span>${esc(t.title)}</span>
          ${t.due_date ? `<span class="task-due ${isOverdue(t) ? 'overdue' : isToday(t) ? 'today' : ''}" style="font-size:.65rem">${formatDate(t.due_date)}</span>` : ''}
        </div>`,
              )
              .join('')
          : `<div class="dash-review-empty">No ${e} energy tasks</div>`
      }
    </div>`;
  });

  html += `</div>`;
  return html;
}

function pickEnergyDash(e) {
  selectedEnergy = selectedEnergy === e ? null : e;
  // Re-render without full re-render — just toggle sections
  document.querySelectorAll('.dash-energy-pick-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.e === selectedEnergy);
  });
  ['low', 'medium', 'high'].forEach((lev) => {
    const sec = document.getElementById('energySec_' + lev);
    if (sec) sec.classList.toggle('visible', lev === selectedEnergy);
  });
}

// ── Dashboard 3: Waiting-On Tracker ──
function buildWaitingTracker() {
  const waiting = tasks.filter((t) => t.status === 'waiting');
  const todayStr = today();

  const overdue = waiting.filter((t) => t.waiting_followup && t.waiting_followup < todayStr);
  const dueToday = waiting.filter((t) => t.waiting_followup === todayStr);
  const thisWeek = waiting.filter((t) => {
    if (!t.waiting_followup || t.waiting_followup < todayStr) return false;
    const d = new Date(t.waiting_followup + 'T00:00:00');
    const diff = Math.round((d - new Date(todayStr + 'T00:00:00')) / 86400000);
    return diff > 0 && diff <= 7;
  });

  let html = `<div class="dash-stat-row">
    <div class="dash-stat"><div class="dash-stat-num ${overdue.length > 0 ? 'red' : ''}">${overdue.length}</div><div class="dash-stat-lbl">Overdue</div></div>
    <div class="dash-stat"><div class="dash-stat-num ${dueToday.length > 0 ? 'amber' : ''}">${dueToday.length}</div><div class="dash-stat-lbl">Due today</div></div>
    <div class="dash-stat"><div class="dash-stat-num">${thisWeek.length}</div><div class="dash-stat-lbl">This week</div></div>
    <div class="dash-stat"><div class="dash-stat-num">${waiting.length}</div><div class="dash-stat-lbl">Total</div></div>
  </div>`;

  if (waiting.length === 0) {
    html += emptyState('Nothing waiting', 'No tasks with waiting status');
    return html;
  }

  // Group by person
  const byPerson = {};
  waiting.forEach((t) => {
    const person = t.waiting_on || 'Unknown';
    if (!byPerson[person]) byPerson[person] = [];
    byPerson[person].push(t);
  });

  // Sort persons: those with overdue items first
  const sortedPersons = Object.entries(byPerson).sort((a, b) => {
    const aHasOverdue = a[1].some((t) => t.waiting_followup && t.waiting_followup < todayStr);
    const bHasOverdue = b[1].some((t) => t.waiting_followup && t.waiting_followup < todayStr);
    if (aHasOverdue && !bHasOverdue) return -1;
    if (!aHasOverdue && bHasOverdue) return 1;
    return 0;
  });

  for (const [person, pTasks] of sortedPersons) {
    const sorted = pTasks.sort((a, b) =>
      (a.waiting_followup || 'z').localeCompare(b.waiting_followup || 'z'),
    );
    html += `<div class="dash-person-group">
      <div class="dash-person-hdr">
        <div class="dash-person-name">&#x23F3; ${esc(person)}</div>
        <div class="dash-person-count">${pTasks.length} item${pTasks.length !== 1 ? 's' : ''}</div>
      </div>`;
    sorted.forEach((t) => {
      let followCls = '';
      let followLabel = '';
      let badge = '';
      if (t.waiting_followup) {
        if (t.waiting_followup < todayStr) {
          followCls = 'overdue';
          badge = `<span class="dash-badge red">OVERDUE</span>`;
          followLabel = formatDate(t.waiting_followup);
        } else if (t.waiting_followup === todayStr) {
          followCls = 'today';
          badge = `<span class="dash-badge amber">TODAY</span>`;
          followLabel = 'Today';
        } else {
          followLabel = formatDate(t.waiting_followup);
        }
      } else {
        followLabel = 'No follow-up set';
      }
      html += `<div class="dash-waiting-item" onclick="openEditModal('${t.id}')" style="cursor:pointer">
        <div class="dash-waiting-title">${esc(t.title)}</div>
        ${badge}
        <div class="dash-waiting-follow ${followCls}">${esc(followLabel)}</div>
      </div>`;
    });
    html += `</div>`;
  }

  return html;
}

// ── Dashboard 4: Stream Health ──
function buildStreamHealth() {
  const allT = tasks.filter((t) => t.status !== 'backlog');
  const streams = {};
  allT.forEach((t) => {
    const areaTags = (t.tags || []).filter((tag) => {
      const def = tagDefs.find((d) => d.name === tag);
      return def ? def.category === 'area' : false;
    });
    const stream = areaTags.length > 0 ? areaTags[0] : null;
    if (!stream) return;
    if (!streams[stream]) streams[stream] = [];
    streams[stream].push(t);
  });

  const todayStr = today();
  const sevenAgo = new Date();
  sevenAgo.setDate(sevenAgo.getDate() - 7);

  if (Object.keys(streams).length === 0) {
    return emptyState('No streams found', 'Tag tasks with area tags to see stream health');
  }

  const sortedStreams = Object.entries(streams).sort((a, b) => b[1].length - a[1].length);

  let html = '';
  for (const [name, sTasks] of sortedStreams) {
    const done = sTasks.filter((t) => t.status === 'done').length;
    const open = sTasks.filter((t) => t.status === 'open' || t.status === 'in_progress').length;
    const waitingCount = sTasks.filter((t) => t.status === 'waiting').length;
    const total = sTasks.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    const recentDone = sTasks.filter(
      (t) => t.status === 'done' && t.completed_at && new Date(t.completed_at) >= sevenAgo,
    ).length;
    const allWaiting = open === 0 && waitingCount > 0;
    const neglected = done === 0 && open >= 3;

    let statusDot = '🟢';
    let statusText = 'Healthy';
    if (allWaiting) {
      statusDot = '🔴';
      statusText = 'Blocked';
    } else if (recentDone === 0 && open > 0) {
      statusDot = '🟡';
      statusText = 'Stalling';
    }

    const def = tagDefs.find((d) => d.name === name);
    const color = def?.color || '';
    const icon = getTagIcon(name);

    html += `<div class="dash-stream-health">
      <div class="dash-stream-hdr">
        <div class="dash-stream-name" style="${color ? 'color:' + color : ''}">
          ${icon ? `${icon} ` : ''}${esc(name)}
        </div>
        <span style="font-size:.8rem">${statusDot}</span>
        <span style="font-size:.68rem;color:var(--muted)">${statusText}</span>
        ${neglected ? `<span class="dash-badge amber">neglected</span>` : ''}
      </div>
      <div class="dash-stream-body">
        <div class="dash-stream-stats">
          <span>${open} open</span>
          <span>${waitingCount} waiting</span>
          <span>${done} done</span>
          <span>${total} total</span>
        </div>
        <div class="dash-progress-bar">
          <div class="dash-progress-fill ${pct > 60 ? 'green' : pct > 30 ? 'amber' : 'red'}" style="width:${pct}%"></div>
        </div>
        <div style="font-size:.65rem;color:var(--dim);margin-top:.2rem">${pct}% complete${recentDone > 0 ? ` · ${recentDone} done this week` : ''}</div>
      </div>
    </div>`;
  }

  // Tag co-occurrence (merged from Tags)
  const openTagged = tasks.filter((t) => t.status !== 'done' && t.status !== 'backlog');
  const tagPairs = {};
  openTagged.forEach((t) => {
    const tgs = t.tags || [];
    for (let i = 0; i < tgs.length; i++)
      for (let j = i + 1; j < tgs.length; j++) {
        const key = [tgs[i], tgs[j]].sort().join(' + ');
        tagPairs[key] = (tagPairs[key] || 0) + 1;
      }
  });
  const topPairs = Object.entries(tagPairs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (topPairs.length > 0) {
    html += '<div class="dash-card"><div class="dash-card-title">Top tag pairs</div>';
    topPairs.forEach(([pair, cnt]) => {
      const parts = pair.split(' + ');
      html +=
        '<div class="dash-pair"><span class="tag-pill">' +
        esc(parts[0]) +
        '</span>' +
        '<span style="color:var(--dim);font-size:.7rem">+</span>' +
        '<span class="tag-pill">' +
        esc(parts[1]) +
        '</span>' +
        '<span class="dash-pair-count">' +
        cnt +
        '</span></div>';
    });
    html += '</div>';
  }
  return html;
}

// ── Dashboard 5: Backlog Review ──
function buildBacklogReview() {
  const backlogTasks = tasks.filter(
    (t) => t.status === 'backlog' || (t.status === 'open' && !t.due_date),
  );
  const todayStr = today();

  if (backlogTasks.length === 0) {
    return emptyState('Backlog clear', 'No tasks in backlog or floating without dates');
  }

  backlogTasks.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));

  const old30 = backlogTasks.filter(
    (t) => t.created_at && daysAgo(t.created_at.slice(0, 10)) >= 30,
  ).length;
  const old60 = backlogTasks.filter(
    (t) => t.created_at && daysAgo(t.created_at.slice(0, 10)) >= 60,
  ).length;

  // Count by tag
  const tagCounts = {};
  backlogTasks.forEach((t) => {
    const areaTags = (t.tags || []).filter((tag) => {
      const def = tagDefs.find((d) => d.name === tag);
      return def ? def.category === 'area' : false;
    });
    const area = areaTags.length > 0 ? areaTags[0] : 'untagged';
    tagCounts[area] = (tagCounts[area] || 0) + 1;
  });

  let html = `<div class="dash-stat-row">
    <div class="dash-stat"><div class="dash-stat-num">${backlogTasks.length}</div><div class="dash-stat-lbl">Total</div></div>
    <div class="dash-stat"><div class="dash-stat-num ${old30 > 0 ? 'amber' : ''}">${old30}</div><div class="dash-stat-lbl">30+ days</div></div>
    <div class="dash-stat"><div class="dash-stat-num ${old60 > 0 ? 'red' : ''}">${old60}</div><div class="dash-stat-lbl">60+ days</div></div>
  </div>`;

  html += `<div class="dash-card" style="padding:.4rem .6rem;margin-bottom:.5rem">
    <div class="dash-card-title">Breakdown by area</div>`;
  Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([tag, cnt]) => {
      const icon = getTagIcon(tag);
      html += `<div class="dash-tag-intel-row">
      <div class="dash-tag-intel-name">${icon ? icon + ' ' : ''}${esc(tag)}</div>
      <div class="dash-tag-intel-count">${cnt}</div>
    </div>`;
    });
  html += `</div>`;

  html += `<div class="dash-card" style="padding:.4rem .5rem">`;
  backlogTasks.forEach((t) => {
    const age = t.created_at ? daysAgo(t.created_at.slice(0, 10)) : 0;
    const aging = age >= 60 ? 'red' : age >= 30 ? 'amber' : '';
    html += `<div class="dash-aging-row" onclick="openEditModal('${t.id}')" style="cursor:pointer">
      ${t.energy ? `<span class="energy-dot ${t.energy}"></span>` : ''}
      <span class="dash-aging-title">${esc(t.title)}</span>
      ${(t.tags || [])
        .slice(0, 1)
        .map((tg) => `<span class="tag-pill">${esc(tg)}</span>`)
        .join('')}
      ${aging ? `<span class="dash-badge ${aging}">${age}d</span>` : `<span class="dash-aging-days">${age}d</span>`}
    </div>`;
  });
  html += `</div>`;

  return html;
}

// ── Dashboard 6: Daily Review ──
function buildDailyReview() {
  const todayStr = today();
  const yesterdayStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return localDateStr(d);
  })();
  const tomorrowStr = tomorrow();

  const completedToday = tasks.filter(
    (t) => t.status === 'done' && t.completed_at && t.completed_at.slice(0, 10) === todayStr,
  );
  const rolledOver = tasks.filter(
    (t) => t.due_date === yesterdayStr && t.status !== 'done' && t.status !== 'backlog',
  );
  const tomorrowPlate = tasks.filter(
    (t) => t.due_date === tomorrowStr && t.status !== 'done' && t.status !== 'backlog',
  );

  // Momentum: completed last 7d vs created last 7d
  const sevenAgo = new Date();
  sevenAgo.setDate(sevenAgo.getDate() - 7);
  const created7 = tasks.filter((t) => t.created_at && new Date(t.created_at) >= sevenAgo).length;
  const done7 = tasks.filter(
    (t) => t.status === 'done' && t.completed_at && new Date(t.completed_at) >= sevenAgo,
  ).length;
  const momentumPct = created7 > 0 ? Math.round((done7 / created7) * 100) : 100;
  const momentumLabel =
    momentumPct >= 70 ? 'keeping up' : momentumPct >= 40 ? 'falling behind' : 'backlog growing';
  const momentumColor = momentumPct >= 70 ? 'green' : momentumPct >= 40 ? 'amber' : 'red';

  // Streak: days in a row with at least 1 completion
  let streak = 0;
  const completedByDate = {};
  tasks
    .filter((t) => t.status === 'done' && t.completed_at)
    .forEach((t) => {
      const d = t.completed_at.slice(0, 10);
      completedByDate[d] = true;
    });
  let checkDate = new Date(todayStr + 'T00:00:00');
  // If nothing done today yet, start from yesterday
  if (!completedByDate[todayStr]) checkDate.setDate(checkDate.getDate() - 1);
  for (let i = 0; i < 90; i++) {
    const ds = localDateStr(checkDate);
    if (completedByDate[ds]) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else break;
  }

  let html = `<div class="dash-momentum">
    <div class="dash-momentum-pct" style="color:var(--${momentumColor === 'green' ? 'green' : momentumColor === 'amber' ? 'amber' : 'red'})">${momentumPct}%</div>
    <div class="dash-momentum-label">
      <strong>${momentumLabel}</strong><br>
      <span style="font-size:.68rem;color:var(--muted)">${done7} done / ${created7} created (last 7 days)</span>
    </div>
  </div>`;

  html += `<div class="dash-streak">
    <span class="dash-streak-num">${streak}</span>
    <span>day${streak !== 1 ? 's' : ''} in a row with at least 1 completion</span>
  </div>`;

  // Velocity sparkline - last 14 days
  const sparkDays = [];
  for (let i = 13; i >= 0; i--) {
    const sd = new Date();
    sd.setDate(sd.getDate() - i);
    const ds = localDateStr(sd);
    const cnt = tasks.filter(
      (t) => t.status === 'done' && t.completed_at && t.completed_at.slice(0, 10) === ds,
    ).length;
    sparkDays.push({ date: ds, count: cnt });
  }
  const sparkMax = Math.max(...sparkDays.map((d) => d.count), 1);
  html += '<div class="dash-card" style="padding:.5rem .6rem">';
  html +=
    '<div class="dash-card-title" style="margin-bottom:.3rem">Velocity \u2014 last 14 days</div>';
  html += '<div style="display:flex;align-items:flex-end;gap:2px;height:40px">';
  sparkDays.forEach((d) => {
    const h = Math.max((d.count / sparkMax) * 36, d.count > 0 ? 4 : 1);
    const isTd = d.date === todayStr;
    html +=
      '<div title="' +
      d.date +
      ': ' +
      d.count +
      ' done" style="' +
      'flex:1;height:' +
      h +
      'px;border-radius:2px;' +
      'background:' +
      (isTd ? 'var(--accent)' : d.count > 0 ? 'var(--abright)' : 'var(--surface3)') +
      ';' +
      'opacity:' +
      (isTd ? 1 : 0.7) +
      ';' +
      '"></div>';
  });
  html += '</div>';
  html +=
    '<div style="display:flex;justify-content:space-between;font-size:.55rem;color:var(--dim);margin-top:.2rem">';
  html += '<span>14d ago</span><span>today</span></div></div>';
  // Completed today
  html += `<div class="dash-review-section">
    <div class="dash-section-hdr">Completed today (${completedToday.length})</div>`;
  if (completedToday.length === 0) {
    html += `<div class="dash-review-empty">Nothing completed yet today</div>`;
  } else {
    html += `<div class="dash-card" style="padding:.3rem .5rem">`;
    completedToday.forEach((t) => {
      html += `<div class="dash-inline-task" onclick="openEditModal('${t.id}')">
        <span style="color:var(--green)">✓</span>
        <span style="text-decoration:line-through;color:var(--dim)">${esc(t.title)}</span>
      </div>`;
    });
    html += `</div>`;
  }
  html += `</div>`;

  // Rolled over
  html += `<div class="dash-review-section">
    <div class="dash-section-hdr">Rolled over from yesterday (${rolledOver.length})</div>`;
  if (rolledOver.length === 0) {
    html += `<div class="dash-review-empty">Nothing rolled over — clean slate!</div>`;
  } else {
    html += `<div class="dash-card" style="padding:.3rem .5rem">`;
    rolledOver.forEach((t) => {
      html += `<div class="dash-inline-task" onclick="openEditModal('${t.id}')">
        <span style="color:var(--amber)">↩</span>
        ${t.energy ? `<span class="energy-dot ${t.energy}"></span>` : ''}
        <span>${esc(t.title)}</span>
      </div>`;
    });
    html += `</div>`;
  }
  html += `</div>`;

  // Tomorrow
  html += `<div class="dash-review-section">
    <div class="dash-section-hdr">Tomorrow's plate (${tomorrowPlate.length})</div>`;
  if (tomorrowPlate.length === 0) {
    html += `<div class="dash-review-empty">Nothing scheduled for tomorrow yet</div>`;
  } else {
    html += `<div class="dash-card" style="padding:.3rem .5rem">`;
    tomorrowPlate.forEach((t) => {
      html += `<div class="dash-inline-task" onclick="openEditModal('${t.id}')">
        ${t.energy ? `<span class="energy-dot ${t.energy}"></span>` : ''}
        <span>${esc(t.title)}</span>
        ${(t.tags || [])
          .slice(0, 2)
          .map((tg) => `<span class="tag-pill">${esc(tg)}</span>`)
          .join('')}
      </div>`;
    });
    html += `</div>`;
  }
  html += `</div>`;

  return html;
}

// ── Dashboard: Triage Inbox ──
function buildTriageInbox() {
  const unsorted = tasks.filter(
    (t) => t.status === 'open' && !t.due_date && !(t.tags || []).length && !t.energy,
  );
  const needsEnergy = tasks.filter(
    (t) => t.status !== 'done' && t.status !== 'backlog' && !t.energy,
  );
  const noTags = tasks.filter(
    (t) => t.status !== 'done' && t.status !== 'backlog' && !(t.tags || []).length,
  );

  let html =
    '<div class="dash-card"><div class="dash-card-title">Fully unsorted (no date, tags, or energy)</div>';
  if (unsorted.length === 0) {
    html +=
      '<div class="dash-review-empty" style="color:var(--green)">\u2728 Inbox zero \u2014 everything is sorted!</div>';
  } else {
    html +=
      '<div style="font-size:.7rem;color:var(--muted);margin-bottom:.4rem">' +
      unsorted.length +
      ' task' +
      (unsorted.length !== 1 ? 's' : '') +
      ' need attention</div>';
    unsorted.forEach((t) => {
      html +=
        '<div class="dash-inline-task" onclick="openEditModal(\'' +
        t.id +
        '\')">' +
        '<span style="color:var(--amber)">\u25CB</span> ' +
        '<span>' +
        esc(t.title) +
        '</span></div>';
    });
  }
  html += '</div>';

  html +=
    '<div class="dash-card"><div class="dash-card-title">Missing energy level (' +
    needsEnergy.length +
    ')</div>';
  if (needsEnergy.length === 0) {
    html +=
      '<div class="dash-review-empty" style="color:var(--green)">All tasks have energy levels!</div>';
  } else {
    needsEnergy.slice(0, 10).forEach((t) => {
      html +=
        '<div class="dash-inline-task" onclick="openEditModal(\'' +
        t.id +
        '\')">' +
        '<span style="color:var(--dim)">\u26A1</span> ' +
        '<span>' +
        esc(t.title) +
        '</span></div>';
    });
    if (needsEnergy.length > 10)
      html +=
        '<div style="font-size:.7rem;color:var(--dim);padding:.3rem .5rem">+ ' +
        (needsEnergy.length - 10) +
        ' more</div>';
  }
  html += '</div>';

  html +=
    '<div class="dash-card"><div class="dash-card-title">No tags (' + noTags.length + ')</div>';
  if (noTags.length === 0) {
    html += '<div class="dash-review-empty" style="color:var(--green)">All tasks are tagged!</div>';
  } else {
    noTags.slice(0, 10).forEach((t) => {
      html +=
        '<div class="dash-inline-task" onclick="openEditModal(\'' +
        t.id +
        '\')">' +
        '<span style="color:var(--dim)">\u{1F3F7}</span> ' +
        '<span>' +
        esc(t.title) +
        '</span>' +
        (t.energy ? '<span class="energy-dot ' + t.energy + '"></span>' : '') +
        '</div>';
    });
    if (noTags.length > 10)
      html +=
        '<div style="font-size:.7rem;color:var(--dim);padding:.3rem .5rem">+ ' +
        (noTags.length - 10) +
        ' more</div>';
  }
  html += '</div>';

  // Duplicate detection
  const titleMap = {};
  tasks
    .filter((t) => t.status !== 'done')
    .forEach((t) => {
      titleMap[t.title] = (titleMap[t.title] || 0) + 1;
    });
  const dupes = Object.entries(titleMap).filter(([_, c]) => c > 1);
  if (dupes.length > 0) {
    html +=
      '<div class="dash-card" style="border-left:3px solid var(--amber)"><div class="dash-card-title" style="color:var(--amber)">Possible duplicates</div>';
    dupes.forEach(([title, cnt]) => {
      html +=
        '<div class="dash-inline-task"><span class="dash-badge amber">' +
        cnt +
        'x</span> <span>' +
        esc(title) +
        '</span></div>';
    });
    html += '</div>';
  }

  return html;
}

// ── Dashboard: Overload Detector ──
function buildOverloadDetector() {
  const todayStr = today();
  const active = tasks.filter((t) => t.status !== 'done' && t.status !== 'backlog');
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const ds = localDateStr(d);
    const dayTasks = active.filter((t) => t.due_date === ds);
    days.push({ date: ds, tasks: dayTasks, count: dayTasks.length });
  }
  const maxPerDay = Math.max(...days.map((d) => d.count), 1);
  const OVERLOAD_THRESHOLD = 5;
  const energyByDay = days.map((d) => {
    const high = d.tasks.filter((t) => t.energy === 'high').length;
    return { ...d, high };
  });
  const overdue = active.filter((t) => t.due_date && t.due_date < todayStr);
  const noDate = active.filter((t) => !t.due_date);

  let html = '';
  if (overdue.length > 0) {
    html +=
      '<div class="dash-card" style="border-left:3px solid var(--red)">' +
      '<div class="dash-card-title" style="color:var(--red)">\u{1F6A8} ' +
      overdue.length +
      ' overdue</div>';
    overdue.slice(0, 8).forEach((t) => {
      const age = Math.round((new Date(todayStr) - new Date(t.due_date)) / 86400000);
      html +=
        '<div class="dash-inline-task" onclick="openEditModal(\'' +
        t.id +
        '\')">' +
        '<span class="dash-badge red">' +
        age +
        'd late</span> ' +
        '<span>' +
        esc(t.title) +
        '</span></div>';
    });
    if (overdue.length > 8)
      html +=
        '<div style="font-size:.7rem;color:var(--dim);padding:.3rem .5rem">+ ' +
        (overdue.length - 8) +
        ' more</div>';
    html += '</div>';
  }

  html += '<div class="dash-card"><div class="dash-card-title">Next 7 days \u2014 task load</div>';
  const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  energyByDay.forEach((d) => {
    const dt = new Date(d.date + 'T00:00:00');
    const dayLabel = d.date === todayStr ? 'Today' : shortDays[dt.getDay()];
    const pct = Math.round((d.count / Math.max(maxPerDay, OVERLOAD_THRESHOLD)) * 100);
    const overloaded = d.count >= OVERLOAD_THRESHOLD;
    html +=
      '<div class="dash-hbar-wrap">' +
      '<div class="dash-hbar-label"><span>' +
      dayLabel +
      (overloaded ? ' \u{1F525}' : '') +
      '</span>' +
      '<span style="color:var(--muted);font-size:.7rem">' +
      d.count +
      (d.high > 0 ? ' (' + d.high + ' high)' : '') +
      '</span></div>' +
      '<div class="dash-hbar"><div class="dash-hbar-fill" style="width:' +
      pct +
      '%;background:' +
      (overloaded ? 'var(--red)' : d.high >= 2 ? 'var(--amber)' : 'var(--accent)') +
      '"></div></div></div>';
  });
  html += '</div>';

  html +=
    '<div class="dash-card"><div class="dash-card-title">No date assigned (' +
    noDate.length +
    ')</div>';
  if (noDate.length === 0) {
    html +=
      '<div class="dash-review-empty" style="color:var(--green)">Everything has a date!</div>';
  } else {
    html +=
      '<div style="font-size:.7rem;color:var(--muted);margin-bottom:.3rem">These could pile up silently</div>';
    noDate.slice(0, 8).forEach((t) => {
      html +=
        '<div class="dash-inline-task" onclick="openEditModal(\'' +
        t.id +
        '\')">' +
        (t.energy ? '<span class="energy-dot ' + t.energy + '"></span>' : '') +
        '<span>' +
        esc(t.title) +
        '</span>' +
        (t.tags || [])
          .slice(0, 2)
          .map((tg) => '<span class="tag-pill">' + esc(tg) + '</span>')
          .join('') +
        '</div>';
    });
    if (noDate.length > 8)
      html +=
        '<div style="font-size:.7rem;color:var(--dim);padding:.3rem .5rem">+ ' +
        (noDate.length - 8) +
        ' more</div>';
  }
  html += '</div>';
  return html;
}

// ── Dashboard 7: Tag Intelligence ──
function buildTagIntelligence() {
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'backlog');

  // Count by tag
  const tagCounts = {};
  open.forEach((t) =>
    (t.tags || []).forEach((tag) => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }),
  );
  const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  const maxCount = sortedTags[0]?.[1] || 1;

  // Phone-call batch
  const phoneCalls = open.filter((t) => (t.tags || []).includes('phone-call'));

  // Tag co-occurrence
  const pairs = {};
  open.forEach((t) => {
    const tags = t.tags || [];
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const key = [tags[i], tags[j]].sort().join(' + ');
        pairs[key] = (pairs[key] || 0) + 1;
      }
    }
  });
  const topPairs = Object.entries(pairs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  let html = `<div class="dash-card">
    <div class="dash-card-title">Open tasks by tag</div>`;
  if (sortedTags.length === 0) {
    html += `<div class="dash-review-empty">No tagged tasks</div>`;
  } else {
    sortedTags.forEach(([tag, cnt]) => {
      const pct = Math.round((cnt / maxCount) * 100);
      const icon = getTagIcon(tag);
      const def = tagDefs.find((d) => d.name === tag);
      const color = def?.color || 'var(--accent)';
      html += `<div class="dash-hbar-wrap">
        <div class="dash-hbar-label">
          <span>${icon ? icon + ' ' : ''}${esc(tag)}</span>
          <span style="color:var(--muted);font-size:.7rem">${cnt}</span>
        </div>
        <div class="dash-hbar"><div class="dash-hbar-fill" style="width:${pct}%;background:${color}"></div></div>
      </div>`;
    });
  }
  html += `</div>`;

  // Phone call batch
  if (phoneCalls.length > 0) {
    html += `<div class="dash-card">
      <div class="dash-card-title">📞 Phone calls — batch these in one session (${phoneCalls.length})</div>`;
    phoneCalls.forEach((t) => {
      html += `<div class="dash-inline-task" onclick="openEditModal('${t.id}')">
        ${t.energy ? `<span class="energy-dot ${t.energy}"></span>` : ''}
        <span>${esc(t.title)}</span>
        ${t.due_date ? `<span class="task-due ${isOverdue(t) ? 'overdue' : isToday(t) ? 'today' : ''}" style="font-size:.65rem">${formatDate(t.due_date)}</span>` : ''}
      </div>`;
    });
    html += `</div>`;
  }

  // Co-occurrence
  if (topPairs.length > 0) {
    html += `<div class="dash-card">
      <div class="dash-card-title">Top tag pairs (often appear together)</div>`;
    topPairs.forEach(([pair, cnt]) => {
      const parts = pair.split(' + ');
      html += `<div class="dash-pair">
        <span class="tag-pill">${esc(parts[0])}</span>
        <span style="color:var(--dim);font-size:.7rem">+</span>
        <span class="tag-pill">${esc(parts[1])}</span>
        <span class="dash-pair-count">${cnt} task${cnt !== 1 ? 's' : ''}</span>
      </div>`;
    });
    html += `</div>`;
  }

  return html;
}

// ─── Keyboard: Add block modal ───
document.getElementById('blockTitle').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveNewBlock();
});

// ─── Counters (localStorage) — conveyor belt items like אבחונים, דוחות ───
let _countersCache = null;
async function getCountersData() {
  if (_countersCache) return _countersCache;
  const { data, error } = await sb.from('counters').select('*').order('created_at');
  _countersCache = error ? [] : data;
  return _countersCache;
}
async function saveCounter(counter) {
  const { error } = await sb.from('counters').upsert(counter);
  if (error) console.error('Save counter error:', error);
  _countersCache = null;
}
async function deleteCounter(id) {
  await sb.from('counters').delete().eq('id', id);
  _countersCache = null;
}

async function renderCountersBar() {
  const bar = document.getElementById('countersBar');
  if (!bar) return;
  const counters = await getCountersData();
  if (!counters.length) {
    bar.innerHTML = '<button class="counter-add-btn" onclick="addCounter()">+ Add counter</button>';
    return;
  }
  let html = counters
    .map(
      (c) =>
        `<div class="counter-chip" onclick="editCounter('${c.id}')" title="Click to update">
      <span class="counter-val">${c.value}</span>
      <span class="counter-label">${esc(c.label)}</span>
    </div>`,
    )
    .join('');
  html += '<button class="counter-add-btn" onclick="addCounter()">+</button>';
  bar.innerHTML = html;
}

async function addCounter() {
  const label = prompt('Counter name (e.g. אבחונים לכתוב):');
  if (!label) return;
  const value = parseInt(prompt('Current count:', '0') || '0');
  await saveCounter({ label, value: value || 0 });
  renderCountersBar();
}

async function editCounter(id) {
  const counters = await getCountersData();
  const c = counters.find((x) => x.id === id);
  if (!c) return;
  const choice = prompt(
    `${c.label}: ${c.value}\n\nEnter new number, or type "delete" to remove, or "rename" to rename:`,
  );
  if (choice === null) return;
  if (choice.toLowerCase() === 'delete') {
    await deleteCounter(id);
    showToast('Counter removed');
  } else if (choice.toLowerCase() === 'rename') {
    const newName = prompt('New name:', c.label);
    if (newName) {
      c.label = newName;
      await saveCounter(c);
    }
  } else {
    const num = parseInt(choice);
    if (!isNaN(num)) {
      c.value = num;
      await saveCounter(c);
      showToast(`${c.label}: ${num}`);
    }
  }
  renderCountersBar();
}

// ─── Events (localStorage, cached) ───
let _eventsCache = null;
let _recurringEventsCache = null;
let _recurringCache = null;
function getEventsData() {
  if (_eventsCache) return _eventsCache;
  try {
    _eventsCache = JSON.parse(localStorage.getItem('allison_events') || '[]');
  } catch (e) {
    _eventsCache = [];
  }
  return _eventsCache;
}
function saveEventsData(arr) {
  _eventsCache = arr;
  localStorage.setItem('allison_events', JSON.stringify(arr));
}

function getRecurringEventsData() {
  if (_recurringEventsCache) return _recurringEventsCache;
  // Fallback to localStorage until Supabase loads
  try {
    _recurringEventsCache = JSON.parse(localStorage.getItem('allison_recurring_events') || '[]');
  } catch (e) {
    _recurringEventsCache = [];
  }
  return _recurringEventsCache;
}
function saveRecurringEventsData(arr) {
  _recurringEventsCache = arr;
  localStorage.setItem('allison_recurring_events', JSON.stringify(arr));
}

async function loadRecurringEventsFromSupabase() {
  try {
    const { data, error } = await sb.from('recurring_events').select('*').order('day_of_week');
    if (error) {
      console.error('Failed to load recurring events:', error);
      return;
    }
    _recurringEventsCache = data;
    localStorage.setItem('allison_recurring_events', JSON.stringify(data));
  } catch (e) {
    console.error('Recurring events fetch error:', e);
  }
}

async function addRecurringEventToSupabase(re) {
  try {
    const { data, error } = await sb.from('recurring_events').insert(re).select();
    if (error) {
      console.error('Failed to add recurring event:', error);
      return null;
    }
    return data[0];
  } catch (e) {
    console.error('Recurring event insert error:', e);
    return null;
  }
}

async function deleteRecurringEventFromSupabase(id) {
  try {
    await sb.from('recurring_events').delete().eq('id', id);
  } catch (e) {
    console.error('Recurring event delete error:', e);
  }
}

function getEventsForDate(dateStr) {
  const oneOff = getEventsData().filter((e) => e.date === dateStr && e.time);
  // Add recurring events matching this day of week
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
  const recurring = getRecurringEventsData()
    .filter((re) => re.day_of_week === dow)
    .map((re) => ({
      ...re,
      date: dateStr,
      isRecurringEvent: true,
    }));
  return [...oneOff, ...recurring];
}

function renderEvents(mc) {
  let events = getEventsData().sort((a, b) =>
    (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')),
  );
  if (globalSearch) {
    const words = globalSearch.toLowerCase().split(/s+/).filter(Boolean);
    events = events.filter((ev) => {
      const text = [ev.title || '', ev.with_person || ''].join(' ').toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }
  const todayStr = today();
  function getWeekGroup(dateStr) {
    const diff = Math.floor(
      (new Date(dateStr + 'T00:00:00') - new Date(todayStr + 'T00:00:00')) / 86400000,
    );
    if (diff < 0) return 'Past';
    if (diff < 7) return 'This Week';
    if (diff < 14) return 'Next Week';
    return 'Later';
  }
  const groups = { 'This Week': [], 'Next Week': [], Later: [] };
  events.forEach((ev) => {
    const g = getWeekGroup(ev.date);
    if (groups[g]) groups[g].push(ev);
  });
  let html = buildSearchBar('globalSearch', 'Search events...');
  for (const [groupName, evs] of Object.entries(groups)) {
    if (!evs.length) continue;
    html += `<div class="section-hdr">${groupName}</div>`;
    evs.forEach((ev) => {
      const dateDisplay = formatDate(ev.date) + (ev.time ? ' at ' + ev.time : '');
      html += `<div class="event-card">
        <button class="event-delete" onclick="event.stopPropagation();deleteEvent('${ev.id}')" title="Delete">✕</button>
        <div class="event-title">${esc(ev.title)}</div>
        <div class="event-meta">
          <span class="event-date">${esc(dateDisplay)}</span>
          ${ev.with_person ? `<span class="event-with">with ${esc(ev.with_person)}</span>` : ''}
        </div>
      </div>`;
    });
  }
  if (!events.filter((e) => e.date >= todayStr).length)
    html += emptyState(
      'No upcoming events',
      globalSearch ? 'Try a different search' : 'Add an event below',
    );
  html += `<div class="add-form-section">
    <div class="add-form-title">Add Event</div>
    <div class="add-form-row">
      <input type="text" id="evTitle" placeholder="Event title" style="flex:2">
      <input type="date" id="evDate">
    </div>
    <div class="add-form-row">
      <input type="time" id="evTime" placeholder="Time (optional)">
      <input type="text" id="evWith" placeholder="With (optional)">
    </div>
    <button class="add-form-btn" onclick="addEvent()">Add Event</button>
  </div>`;

  // ─── Recurring Events Section ───
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const recurringEvents = getRecurringEventsData();
  html += `<div class="section-hdr" style="margin-top:24px">📅 Recurring Events</div>`;
  if (recurringEvents.length) {
    recurringEvents.forEach((re) => {
      const endStr = re.end_time ? ' – ' + re.end_time : '';
      html += `<div class="event-card" style="border-inline-start:3px solid #7c3aed">
        <button class="event-delete" onclick="event.stopPropagation();deleteRecurringEvent('${re.id}')" title="Delete">✕</button>
        <div class="event-title">${esc(re.title)}</div>
        <div class="event-meta">
          <span class="event-date">Every ${dayNames[re.day_of_week]} at ${esc(re.time)}${endStr}</span>
          ${re.with_person ? `<span class="event-with">with ${esc(re.with_person)}</span>` : ''}
        </div>
        ${re.notes ? `<div style="font-size:.75rem;color:var(--muted);margin-top:4px">${esc(re.notes)}</div>` : ''}
      </div>`;
    });
  } else {
    html += emptyState('No recurring events', 'Add weekly events that show on your calendar');
  }
  html += `<div class="add-form-section">
    <div class="add-form-title">Add Recurring Event</div>
    <div class="add-form-row">
      <input type="text" id="reTitle" placeholder="Event title" style="flex:2">
      <select id="reDay">
        <option value="0">Sunday</option><option value="1">Monday</option><option value="2" selected>Tuesday</option>
        <option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option>
      </select>
    </div>
    <div class="add-form-row">
      <input type="time" id="reTime" placeholder="Start time">
      <input type="time" id="reEndTime" placeholder="End time (optional)">
      <input type="text" id="reWith" placeholder="With (optional)">
    </div>
    <button class="add-form-btn" onclick="addRecurringEvent()">Add Recurring Event</button>
  </div>`;

  mc.innerHTML = html;
  wireSearchInput(mc, 'globalSearch');
}

function addEvent() {
  const title = document.getElementById('evTitle').value.trim();
  const date = document.getElementById('evDate').value;
  if (!title || !date) {
    showToast('Title and date are required');
    return;
  }
  const time = document.getElementById('evTime').value || '';
  const withPerson = document.getElementById('evWith').value.trim() || '';
  const ev = {
    id: Date.now().toString(),
    title,
    date,
    time,
    with_person: withPerson,
    created_at: new Date().toISOString(),
  };
  const events = getEventsData();
  events.push(ev);
  saveEventsData(events);
  showToast('Event added');
  renderCurrentTab();
}

function deleteEvent(id) {
  saveEventsData(getEventsData().filter((e) => e.id !== id));
  showToast('Event deleted');
  renderCurrentTab();
}

async function addRecurringEvent() {
  const title = document.getElementById('reTitle').value.trim();
  const dayOfWeek = parseInt(document.getElementById('reDay').value);
  const time = document.getElementById('reTime').value;
  if (!title || !time) {
    showToast('Title and time are required');
    return;
  }
  const endTime = document.getElementById('reEndTime').value || '';
  const withPerson = document.getElementById('reWith').value.trim() || '';
  const re = {
    title,
    day_of_week: dayOfWeek,
    time,
    end_time: endTime || null,
    with_person: withPerson || null,
  };
  const saved = await addRecurringEventToSupabase(re);
  if (saved) {
    _recurringEventsCache = null; // clear cache
    await loadRecurringEventsFromSupabase();
    showToast('Recurring event added');
    renderCurrentTab();
  } else {
    showToast('Failed to add recurring event');
  }
}

async function deleteRecurringEvent(id) {
  await deleteRecurringEventFromSupabase(id);
  _recurringEventsCache = null;
  await loadRecurringEventsFromSupabase();
  showToast('Recurring event deleted');
  renderCurrentTab();
}

// ─── Recurring Tracker (Supabase) ───
async function getRecurringData() {
  if (_recurringCache) return _recurringCache;
  const { data, error } = await sb.from('recurring_tasks').select('*').order('created_at');
  _recurringCache = error ? [] : data;
  return _recurringCache;
}
async function saveRecurringItem(item) {
  const { error } = await sb.from('recurring_tasks').upsert(item);
  if (error) console.error('Save recurring error:', error);
  _recurringCache = null;
}
async function deleteRecurringItem(id) {
  await sb.from('recurring_tasks').delete().eq('id', id);
  _recurringCache = null;
}

function getRecurringOccurrences(r) {
  // Returns array of { date, overdue } objects to display
  const todayDate = new Date(today() + 'T00:00:00');
  const type = r.type || 'rolling'; // default for legacy items
  if (type === 'fixed') {
    // Fixed: calculate occurrences from anchor_date forward by frequency_days
    const anchor = new Date((r.anchor_date || r.created_at.slice(0, 10)) + 'T00:00:00');
    const freq = r.frequency_days;
    // Find the next occurrence on or after today
    let next = new Date(anchor);
    while (next < todayDate) next.setDate(next.getDate() + freq);
    // Also find the previous one (might be overdue)
    let prev = new Date(next);
    prev.setDate(prev.getDate() - freq);
    const results = [];
    // If prev is overdue (past today and not done for that date)
    if (prev >= anchor && prev < todayDate && !isDoneForDate(r, prev)) {
      results.push({ date: new Date(prev), overdue: true });
    }
    // Always show next upcoming (unless already done for that date)
    if (!isDoneForDate(r, next)) {
      results.push({ date: new Date(next), overdue: false });
    }
    return results;
  } else {
    // Rolling: next = last_done + frequency_days. Only show current one.
    const lastDone = r.last_done
      ? new Date(r.last_done + 'T00:00:00')
      : new Date(r.created_at.slice(0, 10) + 'T00:00:00');
    const nextDue = new Date(lastDone);
    nextDue.setDate(nextDue.getDate() + r.frequency_days);
    return [{ date: nextDue, overdue: nextDue < todayDate }];
  }
}

function isDoneForDate(r, date) {
  // Check if this specific occurrence was completed
  if (!r.done_dates) return false;
  const dateStr = date.toISOString().slice(0, 10);
  return r.done_dates.includes(dateStr);
}

function getDaysUntilDue(r) {
  const occs = getRecurringOccurrences(r);
  if (!occs.length) return 999;
  const todayDate = new Date(today() + 'T00:00:00');
  return Math.ceil((occs[0].date - todayDate) / 86400000);
}

async function renderRecurring(mc) {
  let items = await getRecurringData();
  if (globalSearch) {
    const words = globalSearch.toLowerCase().split(/s+/).filter(Boolean);
    items = items.filter((r) => words.every((w) => (r.title || '').toLowerCase().includes(w)));
  }
  const sorted = [...items].sort((a, b) => getDaysUntilDue(a) - getDaysUntilDue(b));
  let html = buildSearchBar('globalSearch', 'Search recurring...');
  if (!sorted.length) {
    html = emptyState('No recurring items', 'Add habits and routines to track below');
  } else {
    sorted.forEach((r) => {
      const occs = getRecurringOccurrences(r);
      const typeLabel = (r.type || 'rolling') === 'fixed' ? 'Fixed' : 'Rolling';
      const freqLabel =
        r.frequency_days >= 7 && r.frequency_days % 7 === 0
          ? `Every ${r.frequency_days / 7} week${r.frequency_days / 7 !== 1 ? 's' : ''}`
          : `Every ${r.frequency_days} day${r.frequency_days !== 1 ? 's' : ''}`;
      const lastDoneText = r.last_done ? `Last done: ${formatDate(r.last_done)}` : 'Never done';
      occs.forEach((occ) => {
        const daysUntil = Math.ceil((occ.date - new Date(today() + 'T00:00:00')) / 86400000);
        let dotColor = '#2d6a4f';
        let dueText = `In ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`;
        if (daysUntil <= 0) {
          dotColor = '#c0392b';
          dueText = daysUntil === 0 ? 'TODAY' : 'OVERDUE';
        } else if (daysUntil <= 7) dotColor = '#b5621a';
        const occDateStr = occ.date.toISOString().slice(0, 10);
        html += `<div class="recurring-item">
          <div class="recurring-status-dot" style="background:${dotColor}"></div>
          <div class="recurring-body">
            <div class="recurring-title">${esc(r.title)}</div>
            <div class="recurring-meta">${typeLabel} · ${freqLabel} · Due: ${formatDate(occDateStr)} · ${lastDoneText}</div>
            <div class="recurring-due" style="color:${dotColor}">${dueText}</div>
          </div>
          <button class="recurring-done-btn" onclick="markRecurringDone('${r.id}','${occDateStr}')">Done</button>
          <button class="recurring-delete-btn" onclick="deleteRecurring('${r.id}')" title="Remove">✕</button>
        </div>`;
      });
    });
  }
  html += `<div class="add-form-section">
    <div class="add-form-title">Add Recurring Item</div>
    <div class="add-form-row">
      <input type="text" id="recTitle" placeholder="e.g. Take vitamins" style="flex:3">
      <input type="number" id="recFreq" placeholder="Days" min="1" max="365" style="flex:1;max-width:80px">
    </div>
    <div class="add-form-row">
      <select id="recType" style="flex:1">
        <option value="rolling">Rolling (resets on completion)</option>
        <option value="fixed">Fixed (set schedule)</option>
      </select>
      <input type="date" id="recAnchor" placeholder="Start date (fixed)" style="flex:1">
    </div>
    <button class="add-form-btn" onclick="addRecurring()">Add</button>
  </div>`;
  mc.innerHTML = html;
  wireSearchInput(mc, 'globalSearch');
}

async function addRecurring() {
  const title = document.getElementById('recTitle').value.trim();
  const freq = parseInt(document.getElementById('recFreq').value);
  if (!title || !freq || freq < 1) {
    showToast('Title and frequency required');
    return;
  }
  const type = document.getElementById('recType').value;
  const anchor = document.getElementById('recAnchor').value || null;
  if (type === 'fixed' && !anchor) {
    showToast('Fixed schedule needs a start date');
    return;
  }
  await saveRecurringItem({
    title,
    frequency_days: freq,
    type,
    anchor_date: anchor,
    last_done: null,
    done_dates: [],
  });
  showToast('Added');
  renderCurrentTab();
}

async function markRecurringDone(id, occDateStr) {
  const items = await getRecurringData();
  const r = items.find((x) => x.id === id);
  if (r) {
    r.last_done = today();
    if (r.type === 'fixed') {
      if (!r.done_dates) r.done_dates = [];
      if (occDateStr && !r.done_dates.includes(occDateStr)) r.done_dates.push(occDateStr);
    }
    await saveRecurringItem(r);
    showToast('Marked done!');
    renderCurrentTab();
  }
}

async function deleteRecurring(id) {
  await deleteRecurringItem(id);
  showToast('Removed');
  renderCurrentTab();
}

// ─── Week Tab ───
function renderWeekTab(mc) {
  const weekDates = getWeekDates(today());
  const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayStr = today();
  let html = buildSearchBar('globalSearch', 'Search week...');
  html += '<div class="week-view-tab">';
  weekDates.forEach((wd, i) => {
    const dayTasks = tasks.filter(
      (t) => t.due_date === wd && t.status !== 'done' && t.status !== 'backlog',
    );
    const isToday = wd === todayStr;
    const d = new Date(wd + 'T00:00:00');
    const dateLabel =
      d.getDate() +
      ' ' +
      ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
        d.getMonth()
      ];
    html += `<div class="week-day-section">
      <div class="week-col-header ${isToday ? 'today-col' : ''}">
        ${shortDays[i]} <span class="week-col-date">${dateLabel}</span>
        ${dayTasks.length > 0 ? `<span style="font-size:.62rem;background:var(--surface2);padding:.1rem .35rem;border-radius:8px;color:var(--dim)">${dayTasks.length}</span>` : ''}
        ${isToday ? '<span style="font-size:.62rem;color:var(--accent);font-weight:700">TODAY</span>' : ''}
      </div>`;
    if (!dayTasks.length) {
      html += `<div style="font-size:.75rem;color:var(--dim);padding:.2rem .5rem;font-style:italic">Free</div>`;
    } else {
      dayTasks.forEach((t) => {
        const dot = t.energy
          ? `<span class="energy-dot ${t.energy}" style="width:6px;height:6px"></span>`
          : '';
        html += `<div class="week-task-row" onclick="openEditModal('${t.id}')">
          ${dot}
          <span style="font-size:.82rem;font-weight:500;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</span>
          ${t.due_time ? `<span style="font-size:.68rem;color:var(--dim);font-family:'DM Mono',monospace">${esc(t.due_time)}</span>` : ''}
        </div>`;
      });
    }
    html += '</div>';
  });
  const floating = tasks.filter((t) => !t.due_date && t.status === 'open');
  html += `<div class="week-floating-section">
    <div class="week-floating-label">Floating (no date) — ${floating.length}</div>`;
  if (!floating.length) {
    html += `<div style="font-size:.75rem;color:var(--dim);font-style:italic">None</div>`;
  } else {
    floating.forEach((t) => {
      const dot = t.energy
        ? `<span class="energy-dot ${t.energy}" style="width:6px;height:6px"></span>`
        : '';
      html += `<div class="week-task-row" onclick="openEditModal('${t.id}')">
        ${dot}
        <span style="font-size:.82rem;font-weight:500;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</span>
      </div>`;
    });
  }
  html += '</div></div>';
  mc.innerHTML = html;
  wireSearchInput(mc, 'globalSearch');
}

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
checkSession();
