import { allFilters, focusSearch, globalSearch } from './state';

// ─── UI Helpers ───

export function esc(s: string): string {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function emptyState(title: string, subtitle: string): string {
  return `<div class="empty-state">
    <div class="empty-state-icon">&#x2728;</div>
    <div class="empty-state-text"><strong>${title}</strong><br>${subtitle}</div>
  </div>`;
}

let toastTimer: ReturnType<typeof setTimeout>;

export function showToast(msg: string, undoFn: (() => void) | null = null): void {
  const t = document.getElementById('toast') as any;
  if (!t) return;
  clearTimeout(toastTimer);
  if (undoFn) {
    t.innerHTML = `<span>${msg}</span><button class="toast-undo-btn" onclick="toastUndo()">Undo</button>`;
    t._undoFn = undoFn;
    t.classList.add('has-undo');
  } else {
    t.innerHTML = `<span>${msg}</span>`;
    t._undoFn = null;
    t.classList.remove('has-undo');
  }
  t.classList.add('visible');
  toastTimer = setTimeout(
    () => {
      t.classList.remove('visible', 'has-undo');
    },
    undoFn ? 4000 : 2200,
  );
}

export function toastUndo(): void {
  const t = document.getElementById('toast') as any;
  if (t?._undoFn) {
    t._undoFn();
    t._undoFn = null;
  }
  clearTimeout(toastTimer);
  t?.classList.remove('visible', 'has-undo');
}

export function matchesSearch(task: any, query: string): boolean {
  if (!query) return true;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const text = [task.title || '', task.notes || '', ...(task.tags || [])].join(' ').toLowerCase();
  return words.every((w: string) => text.includes(w));
}

export function highlightSearch(text: string): string {
  const q = allFilters.search || focusSearch || globalSearch;
  if (!q || !text) return esc(text);
  const escaped = esc(text);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  let result = escaped;
  words.forEach((w: string) => {
    const re = new RegExp(
      '(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')',
      'gi',
    );
    result = result.replace(re, '<mark class="search-hl">$1</mark>');
  });
  return result;
}

export function buildSearchBar(varName: string, placeholder: string): string {
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
