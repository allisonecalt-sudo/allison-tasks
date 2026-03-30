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
