import {
  today,
  tomorrow,
  formatDate,
  daysAgo,
  isOverdue,
  isToday,
  getWeekDates,
  localDateStr,
} from './dates';
import { getTagIcon } from './config';
import { tasks, tagDefs, globalSearch, allFilters, DASHBOARD_VIEWS } from './state';
import { esc, matchesSearch, highlightSearch, buildSearchBar, emptyState } from './ui';
import { getEventsForDate } from './events-data';

// ── Dashboard 1: Weekly Planning ──
export function buildWeeklyPlanning() {
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
      (t) => t.due_date === wd && t.status !== 'done' && t.status !== 'backlog' && t.status !== 'spark',
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

export function toggleWeekRow(wd) {
  const row = document.getElementById('weekrow_' + wd);
  const tasks = document.getElementById('weektasks_' + wd);
  if (!row || !tasks) return;
  const expanded = row.classList.toggle('expanded');
  tasks.style.display = expanded ? 'block' : 'none';
}

export function filterFloaters(energy) {
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

export function buildEnergyBudget() {
  const active = tasks.filter((t) => t.status !== 'done' && t.status !== 'backlog' && t.status !== 'spark');
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

export function pickEnergyDash(e) {
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
export function buildWaitingTracker() {
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
export function buildStreamHealth() {
  const allT = tasks.filter((t) => t.status !== 'backlog' && t.status !== 'spark');
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
  const openTagged = tasks.filter((t) => t.status !== 'done' && t.status !== 'backlog' && t.status !== 'spark');
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
export function buildBacklogReview() {
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
export function buildDailyReview() {
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
    (t) => t.due_date === yesterdayStr && t.status !== 'done' && t.status !== 'backlog' && t.status !== 'spark',
  );
  const tomorrowPlate = tasks.filter(
    (t) => t.due_date === tomorrowStr && t.status !== 'done' && t.status !== 'backlog' && t.status !== 'spark',
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
export function buildTriageInbox() {
  const unsorted = tasks.filter(
    (t) => t.status === 'open' && !t.due_date && !(t.tags || []).length && !t.energy,
  );
  const needsEnergy = tasks.filter(
    (t) => t.status !== 'done' && t.status !== 'backlog' && t.status !== 'spark' && !t.energy,
  );
  const noTags = tasks.filter(
    (t) => t.status !== 'done' && t.status !== 'backlog' && t.status !== 'spark' && !(t.tags || []).length,
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
export function buildOverloadDetector() {
  const todayStr = today();
  const active = tasks.filter((t) => t.status !== 'done' && t.status !== 'backlog' && t.status !== 'spark');
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
export function buildTagIntelligence() {
  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'backlog' && t.status !== 'spark');

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
