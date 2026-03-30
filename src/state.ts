import { today } from './dates';

// ─── Mutable App State ───
export let tasks: any[] = [];
export let tagDefs: any[] = [];
export let currentTab = 'day';
export let editingTaskId: string | null = null;
export let qaEnergy: string | null = null;
export let dayNowTimer: ReturnType<typeof setInterval> | null = null;
export let viewingDate = today();
export let lowCapacity = false;
export let dayFilter: string | null = null;
export let currentDashboard = 'triage';
export let focusSearch = '';
export let globalSearch = '';

export let allFilters = {
  search: '',
  tags: [] as string[],
  energy: null as string | null,
  status: null as string | null,
  sort: 'due',
  sortDir: 'asc',
  noDate: false,
  timeRange: null as string | null,
};

// Setters — needed because ES modules export live bindings but
// reassignment from outside the module requires explicit functions
export function setTasks(v: any[]) {
  tasks = v;
}
export function setTagDefs(v: any[]) {
  tagDefs = v;
}
export function setCurrentTab(v: string) {
  currentTab = v;
}
export function setEditingTaskId(v: string | null) {
  editingTaskId = v;
}
export function setQaEnergy(v: string | null) {
  qaEnergy = v;
}
export function setDayNowTimer(v: ReturnType<typeof setInterval> | null) {
  dayNowTimer = v;
}
export function setViewingDate(v: string) {
  viewingDate = v;
}
export function setLowCapacity(v: boolean) {
  lowCapacity = v;
}
export function setDayFilter(v: string | null) {
  dayFilter = v;
}
export function setCurrentDashboard(v: string) {
  currentDashboard = v;
}
export function setFocusSearch(v: string) {
  focusSearch = v;
}
export function setGlobalSearch(v: string) {
  globalSearch = v;
}
export function setAllFilters(v: typeof allFilters) {
  allFilters = v;
}
export function resetAllFilters() {
  allFilters = {
    search: '',
    tags: [],
    energy: null,
    status: null,
    sort: 'due',
    sortDir: 'asc',
    noDate: false,
    timeRange: null,
  };
}

// ─── Constants ───
export const RECURRING: any[] = [];

export const TABS = [
  { id: 'day', label: 'My Day' },
  { id: 'focus', label: 'Focus' },
  { id: 'all', label: 'All' },
  { id: 'streams', label: 'Streams' },
  { id: 'week', label: 'Week' },
  { id: 'events', label: 'Events' },
  { id: 'recurring', label: 'Recurring' },
  { id: 'done', label: 'Done' },
  { id: 'history', label: 'History' },
  { id: 'dashboards', label: 'Dashboards' },
];

export const DASHBOARD_VIEWS = [
  { id: 'triage', label: 'Triage' },
  { id: 'overload', label: 'Overload' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'energy', label: 'Energy' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'health', label: 'Streams' },
  { id: 'backlog', label: 'Backlog' },
  { id: 'review', label: 'Daily Review' },
];

export function hasHebrew(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}
