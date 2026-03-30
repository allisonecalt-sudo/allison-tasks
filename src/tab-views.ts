import {
  tasks,
  tagDefs,
  viewingDate,
  lowCapacity,
  dayFilter,
  dayNowTimer,
  currentTab,
  allFilters,
  focusSearch,
  globalSearch,
  hasHebrew,
  RECURRING,
  setViewingDate,
  setDayNowTimer,
} from './state';
import {
  today,
  localDateStr,
  formatDate,
  formatDateLong,
  daysFromToday,
  daysAgo,
  isOverdue,
  isToday,
  isTomorrow,
  timeAgo,
  getWeekDates,
} from './dates';
import { sb, getTagIcon } from './config';
import { esc, emptyState, showToast, matchesSearch, highlightSearch, buildSearchBar } from './ui';
import {
  getEventsForDate,
  getRecurringData,
  getRecurringOccurrences,
  isDoneForDate,
} from './events-data';
import { renderTaskCard } from './task-card';

// Late-bound callbacks
let _renderCurrentTab: () => void = () => {};
let _wireSearchInput: (container: any, varName: string) => void = () => {};

export function setTabViewsCallbacks(renderCb: () => void, wireCb: (c: any, v: string) => void) {
  _renderCurrentTab = renderCb;
  _wireSearchInput = wireCb;
}

export function navigateDay(offset) {
  const d = new Date(viewingDate + 'T00:00:00');
  d.setDate(d.getDate() + offset);
  setViewingDate(localDateStr(d));
  _renderCurrentTab();
}
export function jumpToDay(dateStr) {
  if (dateStr) {
    setViewingDate(dateStr);
    _renderCurrentTab();
  }
}
export function jumpToToday() {
  setViewingDate(today());
  _renderCurrentTab();
}

export function formatDateNav(dateStr) {
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

// getWeekDates → imported from ./dates

export function getRecurringForDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  return RECURRING.filter((r) => r.days.includes(dow));
}

export function getBlockCountForDate(dateStr) {
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
export async function renderDay(mc) {
  // Stop any existing now-line timer
  if (dayNowTimer) {
    clearInterval(dayNowTimer);
    setDayNowTimer(null);
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
    setDayNowTimer(setInterval(updateDayNowLine, 60000));
  }
}

export function formatNowTime(h, m) {
  const ampm = h >= 12 ? 'pm' : 'am';
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return hr + ':' + String(m).padStart(2, '0') + ampm;
}

export function updateDayNowLine() {
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
export function renderFocus(mc) {
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
  _wireSearchInput(mc, 'focusSearch');
}

// ─── Render: Streams ───
export function renderStreams(mc) {
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
    _wireSearchInput(mc, 'globalSearch');
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
  _wireSearchInput(mc, 'globalSearch');
}

export function toggleStream(el) {
  if (
    event.target.closest('.task-card') ||
    event.target.closest('.task-check') ||
    event.target.closest('.activate-btn')
  )
    return;
  el.classList.toggle('expanded');
}

// ─── Render: All Tasks ───
export function renderAll(mc) {
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
  _wireSearchInput(mc, 'allFilters.search');
}

export function toggleFilter(type, val) {
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
  _renderCurrentTab();
}

// ─── Render: Waiting ───
export function renderWaiting(mc) {
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
export function renderFloating(mc) {
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
export function renderLow(mc) {
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
export function renderBacklog(mc) {
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
export function renderDone(mc) {
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
  _wireSearchInput(mc, 'globalSearch');
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

export async function renderHistory(mc) {
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
  _wireSearchInput(mc, 'globalSearch');
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

export function openAddNoteModal(historyId) {
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

export async function saveHistoryNote(historyId, btn) {
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
