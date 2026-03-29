const fs = require('fs');
let c = fs.readFileSync('index.html', 'utf8');
let applied = 0, failed = 0;

function r(old, nw) {
  if (c.includes(old)) { c = c.replace(old, nw); applied++; }
  else { failed++; console.log('MISSED:', old.slice(0, 80).replace(/\n/g, '\\n')); }
}

// 4. Insert helpers
const helpers = fs.readFileSync('helpers.js', 'utf8');
r(
  "let focusSearch = '';\n\n// \u2500\u2500\u2500 Date Helpers",
  "let focusSearch = '';\n" + helpers + "\n// \u2500\u2500\u2500 Date Helpers"
);

// 5. globalSearch reset
r(
  "  focusSearch = '';\n  if (id !== 'day'",
  "  focusSearch = '';\n  globalSearch = '';\n  if (id !== 'day'"
);

// 6. Focus search filter
r(
  "  if (focusSearch) {\n    const q = focusSearch.toLowerCase();\n    active = active.filter(t =>\n      t.title?.toLowerCase().includes(q) ||\n      t.notes?.toLowerCase().includes(q) ||\n      (t.tags || []).some(tag => tag.toLowerCase().includes(q))\n    );\n  }",
  "  if (focusSearch) {\n    active = active.filter(t => matchesSearch(t, focusSearch));\n  }"
);

// Focus search bar HTML
r(
  '  let html = `<div class="search-bar">\n    <input type="text" class="search-input" placeholder="Search focus items..." value="${esc(focusSearch)}">\n    <span class="search-icon">&#x1F50D;</span>\n  </div>`;',
  "  let html = buildSearchBar('focusSearch', 'Search focus items...');"
);

// Focus event wiring
r(
  "  mc.innerHTML = html;\n  // Restore search input focus and cursor after re-render\n  const focusSearchEl = mc.querySelector('.search-input');\n  if (focusSearchEl && focusSearch) {\n    focusSearchEl.focus();\n    const len = focusSearchEl.value.length;\n    focusSearchEl.setSelectionRange(len, len);\n  }\n  focusSearchEl && focusSearchEl.addEventListener('input', function() {\n    focusSearch = this.value; renderCurrentTab();\n  });\n}\n\n// \u2500\u2500\u2500 Render: Streams",
  "  mc.innerHTML = html;\n  wireSearchInput(mc, 'focusSearch');\n}\n\n// \u2500\u2500\u2500 Render: Streams"
);

// 7. All tab search bar HTML
r(
  '  let html = `<div class="search-bar">\n    <input type="text" class="search-input" placeholder="Search tasks..." value="${esc(allFilters.search)}">\n    <span class="search-icon">&#x1F50D;</span>\n  </div>`;',
  "  let html = buildSearchBar('allFilters.search', 'Search tasks...');"
);

// All tab search filter
r(
  "  if (allFilters.search) {\n    const q = allFilters.search.toLowerCase();\n    filtered = filtered.filter(t =>\n      t.title?.toLowerCase().includes(q) ||\n      t.notes?.toLowerCase().includes(q) ||\n      (t.tags || []).some(tag => tag.toLowerCase().includes(q))\n    );\n  }",
  "  if (allFilters.search) {\n    filtered = filtered.filter(t => matchesSearch(t, allFilters.search));\n  }"
);

// All tab event wiring
r(
  "  mc.innerHTML = html;\n  // Restore search input focus and cursor after re-render\n  const allSearchEl = mc.querySelector('.search-input');\n  if (allSearchEl && allFilters.search) {\n    allSearchEl.focus();\n    const len = allSearchEl.value.length;\n    allSearchEl.setSelectionRange(len, len);\n  }\n  allSearchEl && allSearchEl.addEventListener('input', function() {\n    allFilters.search = this.value; renderCurrentTab();\n  });\n}\n\nfunction toggleFilter",
  "  mc.innerHTML = html;\n  wireSearchInput(mc, 'allFilters.search');\n}\n\nfunction toggleFilter"
);

// 8. Streams
r(
  "  const active = tasks.filter(t => t.status !== 'backlog');",
  "  let active = tasks.filter(t => t.status !== 'backlog');\n  if (globalSearch) active = active.filter(t => matchesSearch(t, globalSearch));"
);

r(
  "  if (Object.keys(streams).length === 0) {\n    mc.innerHTML = emptyState('No streams', 'Tasks with area tags will appear as streams');\n    return;\n  }\n\n  let html = '';",
  "  if (Object.keys(streams).length === 0) {\n    mc.innerHTML = buildSearchBar('globalSearch', 'Search streams...') + emptyState('No streams', globalSearch ? 'Try a different search' : 'Tasks with area tags will appear as streams');\n    wireSearchInput(mc, 'globalSearch');\n    return;\n  }\n\n  let html = buildSearchBar('globalSearch', 'Search streams...');"
);

r(
  "  mc.innerHTML = html;\n}\n\nfunction toggleStream",
  "  mc.innerHTML = html;\n  wireSearchInput(mc, 'globalSearch');\n}\n\nfunction toggleStream"
);

// 9. Done tab
r("  const done = tasks.filter(t => t.status === 'done'", "  let done = tasks.filter(t => t.status === 'done'");

r(
  "  done.sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));\n  if (done.length === 0) {\n    mc.innerHTML = emptyState('No completed tasks', 'Mark tasks done and they will appear here');\n    return;\n  }\n  mc.innerHTML = `<div class=\"section-hdr\">Last 30 days</div>` +\n    done.map(t => {\n      const extra = `<div class=\"task-age\">Completed ${t.completed_at ? formatDateLong(t.completed_at.slice(0,10)) : ''}</div>`;\n      return renderTaskCard(t, false, extra, false, true);\n    }).join('');\n}",
  "  done.sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));\n  if (globalSearch) done = done.filter(t => matchesSearch(t, globalSearch));\n  let html = buildSearchBar('globalSearch', 'Search completed tasks...');\n  if (done.length === 0) {\n    html += emptyState('No completed tasks', globalSearch ? 'Try a different search' : 'Mark tasks done and they will appear here');\n  } else {\n    html += `<div class=\"section-hdr\">Last 30 days</div>` +\n      done.map(t => {\n        const extra = `<div class=\"task-age\">Completed ${t.completed_at ? formatDateLong(t.completed_at.slice(0,10)) : ''}</div>`;\n        return renderTaskCard(t, false, extra, false, true);\n      }).join('');\n  }\n  mc.innerHTML = html;\n  wireSearchInput(mc, 'globalSearch');\n}"
);

// 10. Events
r(
  "  const events = getEventsData().sort",
  "  let events = getEventsData().sort"
);

r(
  "  const todayStr = today();\n  function getWeekGroup",
  "  if (globalSearch) {\n    const words = globalSearch.toLowerCase().split(/\\s+/).filter(Boolean);\n    events = events.filter(ev => {\n      const text = [ev.title || '', ev.with_person || ''].join(' ').toLowerCase();\n      return words.every(w => text.includes(w));\n    });\n  }\n  const todayStr = today();\n  function getWeekGroup"
);

r(
  "  events.forEach(ev => { const g = getWeekGroup(ev.date); if (groups[g]) groups[g].push(ev); });\n  let html = '';",
  "  events.forEach(ev => { const g = getWeekGroup(ev.date); if (groups[g]) groups[g].push(ev); });\n  let html = buildSearchBar('globalSearch', 'Search events...');"
);

r(
  "  if (!events.filter(e => e.date >= todayStr).length) html = emptyState('No upcoming events', 'Add an event below');",
  "  if (!events.filter(e => e.date >= todayStr).length) html += emptyState('No upcoming events', globalSearch ? 'Try a different search' : 'Add an event below');"
);

r(
  "  mc.innerHTML = html;\n}\n\nfunction addEvent()",
  "  mc.innerHTML = html;\n  wireSearchInput(mc, 'globalSearch');\n}\n\nfunction addEvent()"
);

// 11. Recurring
r(
  "  const items = getRecurringData();\n  const sorted = [...items].sort((a, b) => getDaysUntilDue(a) - getDaysUntilDue(b));\n  let html = '';",
  "  let items = getRecurringData();\n  if (globalSearch) {\n    const words = globalSearch.toLowerCase().split(/\\s+/).filter(Boolean);\n    items = items.filter(r => words.every(w => (r.title || '').toLowerCase().includes(w)));\n  }\n  const sorted = [...items].sort((a, b) => getDaysUntilDue(a) - getDaysUntilDue(b));\n  let html = buildSearchBar('globalSearch', 'Search recurring...');"
);

r(
  "  mc.innerHTML = html;\n}\n\nfunction addRecurring()",
  "  mc.innerHTML = html;\n  wireSearchInput(mc, 'globalSearch');\n}\n\nfunction addRecurring()"
);

// 12. Cache localStorage - Events
r(
  "// \u2500\u2500\u2500 Events (localStorage) \u2500\u2500\u2500\nfunction getEventsData() {\n  try { return JSON.parse(localStorage.getItem('allison_events') || '[]'); }\n  catch(e) { return []; }\n}\nfunction saveEventsData(arr) { localStorage.setItem('allison_events', JSON.stringify(arr)); }",
  "// \u2500\u2500\u2500 Events (localStorage, cached) \u2500\u2500\u2500\nlet _eventsCache = null;\nlet _recurringCache = null;\nfunction getEventsData() {\n  if (_eventsCache) return _eventsCache;\n  try { _eventsCache = JSON.parse(localStorage.getItem('allison_events') || '[]'); }\n  catch(e) { _eventsCache = []; }\n  return _eventsCache;\n}\nfunction saveEventsData(arr) { _eventsCache = arr; localStorage.setItem('allison_events', JSON.stringify(arr)); }"
);

// Cache localStorage - Recurring
r(
  "function getRecurringData() {\n  try { return JSON.parse(localStorage.getItem('allison_recurring') || '[]'); }\n  catch(e) { return []; }\n}\nfunction saveRecurringData(arr) { localStorage.setItem('allison_recurring', JSON.stringify(arr)); }",
  "function getRecurringData() {\n  if (_recurringCache) return _recurringCache;\n  try { _recurringCache = JSON.parse(localStorage.getItem('allison_recurring') || '[]'); }\n  catch(e) { _recurringCache = []; }\n  return _recurringCache;\n}\nfunction saveRecurringData(arr) { _recurringCache = arr; localStorage.setItem('allison_recurring', JSON.stringify(arr)); }"
);

fs.writeFileSync('index.html', c);
console.log('Applied:', applied, 'Failed:', failed);

// Verify
const final = fs.readFileSync('index.html', 'utf8');
console.log('wireSearchInput:', (final.match(/wireSearchInput/g) || []).length);
console.log('matchesSearch:', (final.match(/matchesSearch/g) || []).length);
console.log('buildSearchBar:', (final.match(/buildSearchBar/g) || []).length);
console.log('_eventsCache:', (final.match(/_eventsCache/g) || []).length);
console.log('Total lines:', final.split('\n').length);
