import { today, formatDate } from './dates';
import { esc, emptyState, buildSearchBar } from './ui';
import { tasks, globalSearch } from './state';
import { showToast } from './ui';
import { getWeekDates } from './dates';
import {
  getEventsData, saveEventsData,
  getRecurringEventsData,
  loadRecurringEventsFromSupabase, addRecurringEventToSupabase, deleteRecurringEventFromSupabase,
  getRecurringData, saveRecurringItem, deleteRecurringItem,
  getRecurringOccurrences, getDaysUntilDue,
  getCountersData, saveCounter, deleteCounterById,
  clearRecurringEventsCache,
} from './events-data';

// Late-bound render callback — set by app.ts after init
let _renderCurrentTab: () => void = () => {};
let _wireSearchInput: (container: any, varName: string) => void = () => {};

export function setTabEventsCallbacks(renderCb: () => void, wireCb: (c: any, v: string) => void) {
  _renderCurrentTab = renderCb;
  _wireSearchInput = wireCb;
}

// ─── Counters ───

export async function renderCountersBar() {
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

export async function addCounter() {
  const label = prompt('Counter name (e.g. אבחונים לכתוב):');
  if (!label) return;
  const value = parseInt(prompt('Current count:', '0') || '0');
  await saveCounter({ label, value: value || 0 });
  renderCountersBar();
}

export async function editCounter(id) {
  const counters = await getCountersData();
  const c = counters.find((x) => x.id === id);
  if (!c) return;
  const choice = prompt(
    `${c.label}: ${c.value}\n\nEnter new number, or type "delete" to remove, or "rename" to rename:`,
  );
  if (choice === null) return;
  if (choice.toLowerCase() === 'delete') {
    await deleteCounterById(id);
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

// ─── Events Tab ───

export function renderEvents(mc) {
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
      (new Date(dateStr + 'T00:00:00').getTime() - new Date(todayStr + 'T00:00:00').getTime()) / 86400000,
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
  _wireSearchInput(mc, 'globalSearch');
}

export function addEvent() {
  const title = (document.getElementById('evTitle') as HTMLInputElement).value.trim();
  const date = (document.getElementById('evDate') as HTMLInputElement).value;
  if (!title || !date) {
    showToast('Title and date are required');
    return;
  }
  const time = (document.getElementById('evTime') as HTMLInputElement).value || '';
  const withPerson = (document.getElementById('evWith') as HTMLInputElement).value.trim() || '';
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
  _renderCurrentTab();
}

export function deleteEvent(id) {
  saveEventsData(getEventsData().filter((e) => e.id !== id));
  showToast('Event deleted');
  _renderCurrentTab();
}

export async function addRecurringEvent() {
  const title = (document.getElementById('reTitle') as HTMLInputElement).value.trim();
  const dayOfWeek = parseInt((document.getElementById('reDay') as HTMLSelectElement).value);
  const time = (document.getElementById('reTime') as HTMLInputElement).value;
  if (!title || !time) {
    showToast('Title and time are required');
    return;
  }
  const endTime = (document.getElementById('reEndTime') as HTMLInputElement).value || '';
  const withPerson = (document.getElementById('reWith') as HTMLInputElement).value.trim() || '';
  const re = {
    title,
    day_of_week: dayOfWeek,
    time,
    end_time: endTime || null,
    with_person: withPerson || null,
  };
  const saved = await addRecurringEventToSupabase(re);
  if (saved) {
    clearRecurringEventsCache();
    await loadRecurringEventsFromSupabase();
    showToast('Recurring event added');
    _renderCurrentTab();
  } else {
    showToast('Failed to add recurring event');
  }
}

export async function deleteRecurringEvent(id) {
  await deleteRecurringEventFromSupabase(id);
  clearRecurringEventsCache();
  await loadRecurringEventsFromSupabase();
  showToast('Recurring event deleted');
  _renderCurrentTab();
}

// ─── Recurring Tracker Tab ───

export async function renderRecurring(mc) {
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
        const daysUntil = Math.ceil((occ.date - new Date(today() + 'T00:00:00').getTime()) / 86400000);
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
  _wireSearchInput(mc, 'globalSearch');
}

export async function addRecurring() {
  const title = (document.getElementById('recTitle') as HTMLInputElement).value.trim();
  const freq = parseInt((document.getElementById('recFreq') as HTMLInputElement).value);
  if (!title || !freq || freq < 1) {
    showToast('Title and frequency required');
    return;
  }
  const type = (document.getElementById('recType') as HTMLSelectElement).value;
  const anchor = (document.getElementById('recAnchor') as HTMLInputElement).value || null;
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
  _renderCurrentTab();
}

export async function markRecurringDone(id, occDateStr) {
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
    _renderCurrentTab();
  }
}

export async function deleteRecurring(id) {
  await deleteRecurringItem(id);
  showToast('Removed');
  _renderCurrentTab();
}

// ─── Week Tab ───

export function renderWeekTab(mc) {
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
  _wireSearchInput(mc, 'globalSearch');
}
