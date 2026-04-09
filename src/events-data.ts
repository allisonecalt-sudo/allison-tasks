import { sb } from './config';
import { today, localDateStr } from './dates';

// ─── Events (localStorage, cached) ───
let _eventsCache: any[] | null = null;
let _recurringEventsCache: any[] | null = null;
let _recurringCache: any[] | null = null;

export function getEventsData(): any[] {
  if (_eventsCache) return _eventsCache;
  try {
    _eventsCache = JSON.parse(localStorage.getItem('allison_events') || '[]');
  } catch {
    _eventsCache = [];
  }
  return _eventsCache!;
}

export function saveEventsData(arr: any[]): void {
  _eventsCache = arr;
  localStorage.setItem('allison_events', JSON.stringify(arr));
}

export async function loadEventsFromSupabase(): Promise<void> {
  try {
    const { data, error } = await sb.from('events').select('*').order('date');
    if (error) {
      console.error('Failed to load events:', error);
      return;
    }
    _eventsCache = data;
    localStorage.setItem('allison_events', JSON.stringify(data));
  } catch (e) {
    console.error('Events fetch error:', e);
  }
}

export async function addEventToSupabase(ev: any): Promise<any | null> {
  try {
    const { data, error } = await sb.from('events').insert(ev).select();
    if (error) {
      console.error('Failed to add event:', error);
      return null;
    }
    return data[0];
  } catch (e) {
    console.error('Event insert error:', e);
    return null;
  }
}

export async function deleteEventFromSupabase(id: string): Promise<void> {
  try {
    await sb.from('events').delete().eq('id', id);
  } catch (e) {
    console.error('Event delete error:', e);
  }
}

export function getRecurringEventsData(): any[] {
  if (_recurringEventsCache) return _recurringEventsCache;
  try {
    _recurringEventsCache = JSON.parse(localStorage.getItem('allison_recurring_events') || '[]');
  } catch {
    _recurringEventsCache = [];
  }
  return _recurringEventsCache!;
}

export function saveRecurringEventsData(arr: any[]): void {
  _recurringEventsCache = arr;
  localStorage.setItem('allison_recurring_events', JSON.stringify(arr));
}

export async function loadRecurringEventsFromSupabase(): Promise<void> {
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

export async function addRecurringEventToSupabase(re: any): Promise<any | null> {
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

export async function deleteRecurringEventFromSupabase(id: string): Promise<void> {
  try {
    await sb.from('recurring_events').delete().eq('id', id);
  } catch (e) {
    console.error('Recurring event delete error:', e);
  }
}

export function getEventsForDate(dateStr: string): any[] {
  const oneOff = getEventsData().filter((e: any) => e.date === dateStr && e.time);
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  const recurring = getRecurringEventsData()
    .filter((re: any) => re.day_of_week === dow)
    .map((re: any) => ({ ...re, date: dateStr, isRecurringEvent: true }));
  return [...oneOff, ...recurring];
}

// ─── Recurring Tracker (Supabase) ───
export async function getRecurringData(): Promise<any[]> {
  if (_recurringCache) return _recurringCache;
  const { data, error } = await sb.from('recurring_tasks').select('*').order('created_at');
  _recurringCache = error ? [] : (data ?? []);
  return _recurringCache;
}

export async function saveRecurringItem(item: any): Promise<void> {
  const { error } = await sb.from('recurring_tasks').upsert(item);
  if (error) console.error('Save recurring error:', error);
  _recurringCache = null;
}

export async function deleteRecurringItem(id: string): Promise<void> {
  await sb.from('recurring_tasks').delete().eq('id', id);
  _recurringCache = null;
}

export function clearRecurringEventsCache(): void {
  _recurringEventsCache = null;
}

export function isDoneForDate(r: any, date: Date): boolean {
  if (!r.done_dates) return false;
  const dateStr = localDateStr(date);
  return r.done_dates.includes(dateStr);
}

export function getRecurringOccurrences(r: any): { date: Date; overdue: boolean }[] {
  const todayDate = new Date(today() + 'T00:00:00');
  const type = r.type || 'rolling';
  if (type === 'fixed') {
    const anchor = new Date((r.anchor_date || r.created_at.slice(0, 10)) + 'T00:00:00');
    const freq = r.frequency_days;
    const next = new Date(anchor);
    while (next < todayDate) next.setDate(next.getDate() + freq);
    const prev = new Date(next);
    prev.setDate(prev.getDate() - freq);
    const results: { date: Date; overdue: boolean }[] = [];
    if (prev >= anchor && prev < todayDate && !isDoneForDate(r, prev)) {
      results.push({ date: new Date(prev), overdue: true });
    }
    if (!isDoneForDate(r, next)) {
      results.push({ date: new Date(next), overdue: false });
    }
    return results;
  } else {
    const lastDone = r.last_done
      ? new Date(r.last_done + 'T00:00:00')
      : new Date(r.created_at.slice(0, 10) + 'T00:00:00');
    const nextDue = new Date(lastDone);
    nextDue.setDate(nextDue.getDate() + r.frequency_days);
    return [{ date: nextDue, overdue: nextDue < todayDate }];
  }
}

export function getDaysUntilDue(r: any): number {
  const occs = getRecurringOccurrences(r);
  if (!occs.length) return 999;
  const todayDate = new Date(today() + 'T00:00:00');
  return Math.ceil((occs[0].date.getTime() - todayDate.getTime()) / 86400000);
}

// ─── Counters (Supabase) ───
let _countersCache: any[] | null = null;

export async function getCountersData(): Promise<any[]> {
  if (_countersCache) return _countersCache;
  const { data, error } = await sb.from('counters').select('*').order('created_at');
  _countersCache = error ? [] : (data ?? []);
  return _countersCache;
}

export async function saveCounter(counter: any): Promise<void> {
  const { error } = await sb.from('counters').upsert(counter);
  if (error) console.error('Save counter error:', error);
  _countersCache = null;
}

export async function deleteCounterById(id: string): Promise<void> {
  await sb.from('counters').delete().eq('id', id);
  _countersCache = null;
}
