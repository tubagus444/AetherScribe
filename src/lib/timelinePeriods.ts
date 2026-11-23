import type { TimelineEvent, WorldCalendar, WorldDate } from '@/src/types';
import { compareDate, formatDate } from '@/src/lib/worldCalendar';

export function compareEvents(a: TimelineEvent, b: TimelineEvent): number {
  if (a.startDate && b.startDate) {
    const dateOrder = compareDate(a.startDate, b.startDate);
    if (dateOrder) return dateOrder;
  } else if (a.startDate || b.startDate) return a.startDate ? -1 : 1;
  return a.order - b.order || (a.id ?? 0) - (b.id ?? 0);
}

export interface Period {
  first: WorldDate;
  last: WorldDate;
  label: string;
  events: TimelineEvent[];
}

export function periodKey(d: WorldDate, level: 'year' | 'month' | 'day') {
  const year = d.era + '/' + d.year;
  if (level === 'year') return year;
  const month = year + '/' + d.month;
  return level === 'month' ? month : month + '/' + d.day;
}

// Input is chronologically sorted. Group only occupied periods, even across long gaps.
export function groupPeriods(events: TimelineEvent[], calendar: WorldCalendar, level: 'year' | 'month' | 'day'): Period[] {
  const groups = new Map<string, Period>();
  for (const event of events) {
    const d = event.startDate;
    if (!d) continue;
    const key = periodKey(d, level);
    const existing = groups.get(key);
    if (existing) {
      existing.last = d;
      existing.events.push(event);
    } else {
      const year = [d.year, calendar.eras[d.era]?.abbr || calendar.eras[d.era]?.name].filter(Boolean).join(' ');
      const label = level === 'day' ? formatDate(calendar, d) : level === 'month'
        ? (calendar.months[d.month - 1]?.name ?? d.month) + ' · ' + year : year;
      groups.set(key, { first: d, last: d, label, events: [event] });
    }
  }
  return [...groups.values()];
}

export function fitPeriods(events: TimelineEvent[], calendar: WorldCalendar, capacity: number): Period[] {
  const days = groupPeriods(events, calendar, 'day');
  if (days.length <= capacity) return days;
  const months = groupPeriods(events, calendar, 'month');
  if (months.length > 1 && months.length <= capacity) return months;
  const years = groupPeriods(events, calendar, 'year');
  if (years.length > 1 && years.length <= capacity) return years;
  const units = years.length > 1 ? years : months.length > 1 ? months : days;
  const result: Period[] = [];
  const step = Math.ceil(units.length / Math.max(2, capacity));
  for (let i = 0; i < units.length; i += step) {
    const chunk = units.slice(i, i + step);
    const first = chunk[0], last = chunk[chunk.length - 1];
    result.push({ first: first.first, last: last.last, events: chunk.flatMap(p => p.events),
      label: first === last ? first.label : first.label + ' – ' + last.label });
  }
  return result;
}
