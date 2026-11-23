import { describe, expect, it } from 'vitest';
import { compareEvents, fitPeriods, groupPeriods } from './timelinePeriods';
import { calendarPreset } from './worldCalendar';
import type { TimelineEvent } from '@/src/types';

const cal = calendarPreset('fantasy');
const rows: TimelineEvent[] = Array.from({ length: 200 }, (_, id): TimelineEvent => ({
  id, projectId: 1, type: 'world', order: 200 - id, title: String(id), description: '',
  startDate: { era: 0, year: Math.floor(id / 20) + 1, month: 1, day: 1 + id % 10 },
})).sort(compareEvents);

describe('linimasa berjenjang', () => {
  it('mencapai setiap tanggal dari ikhtisar sempit tanpa kehilangan atau menggandakan peristiwa', () => {
    function visit(events: TimelineEvent[]): TimelineEvent[] {
      const groups = fitPeriods(events, cal, 2);
      expect(groups.length).toBeLessThanOrEqual(2);
      return groups.flatMap(g => {
        if (g.first.year === g.last.year && g.first.day === g.last.day) return g.events;
        expect(g.events.length).toBeLessThan(events.length);
        return visit(g.events);
      });
    }
    expect(visit(rows)).toEqual(rows);
  });
  it('mengurutkan per era dan menyatukan tanggal mulai, termasuk rentang', () => {
    const first = rows[0];
    const earlier = { ...first, startDate: { era: 0, year: 100, month: 2, day: 5 } };
    const later = { ...first, startDate: { era: 1, year: 1, month: 1, day: 1 } };
    const range = { ...later, order: -1, endDate: { ...later.startDate, day: 5 } };
    const undated = { ...first, startDate: undefined, eventDate: 'Dulu' };
    const groups = groupPeriods([undated, later, range, earlier].sort(compareEvents), cal, 'day');
    expect(groups.map(p => p.events)).toEqual([[earlier], [range, later]]);
    expect(fitPeriods([], cal, 2)).toEqual([]);
  });
});
