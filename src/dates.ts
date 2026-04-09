const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today(): string {
  return localDateStr(new Date());
}

export function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localDateStr(d);
}

export function daysAgo(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - d.getTime()) / 86400000);
}

function parseDate(dateStr: string): Date | null {
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = parseDate(dateStr);
  if (!d) return '';
  return `${DAYS_SHORT[d.getDay()]} ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

export function formatDateLong(dateStr: string): string {
  if (!dateStr) return '';
  const d = parseDate(dateStr);
  if (!d) return '';
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function timeAgo(isoStr: string): string {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return formatDate(isoStr.slice(0, 10));
}

interface TaskLike {
  due_date?: string | null;
  due_date_start?: string | null;
  due_date_end?: string | null;
  status?: string;
}

export function isOverdue(t: TaskLike): boolean {
  if (t.status === 'done') return false;
  if (t.due_date && t.due_date < today()) return true;
  // Range task: overdue if end date has passed
  if (t.due_date_end && t.due_date_end < today()) return true;
  return false;
}

export function isToday(t: TaskLike): boolean {
  if (t.due_date === today()) return true;
  // Range task: today falls within the window
  if (t.due_date_start && t.due_date_end) {
    return t.due_date_start <= today() && t.due_date_end >= today();
  }
  return false;
}

export function isTomorrow(t: TaskLike): boolean {
  if (t.due_date === tomorrow()) return true;
  // Range task: tomorrow falls within the window
  if (t.due_date_start && t.due_date_end) {
    return t.due_date_start <= tomorrow() && t.due_date_end >= tomorrow();
  }
  return false;
}

export function hasDateRange(t: TaskLike): boolean {
  return !!(t.due_date_start || t.due_date_end);
}

export function isInDateRange(t: TaskLike, dateStr: string): boolean {
  if (!hasDateRange(t)) return false;
  const start = t.due_date_start || '0000-01-01';
  const end = t.due_date_end || '9999-12-31';
  return start <= dateStr && dateStr <= end;
}

export function daysFromToday(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return '';
  const t = new Date(today() + 'T00:00:00');
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 0) return `In ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

export function getWeekDates(dateStr: string): string[] {
  const d = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = d.getDay();
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - dayOfWeek);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const wd = new Date(sunday);
    wd.setDate(sunday.getDate() + i);
    dates.push(localDateStr(wd));
  }
  return dates;
}
