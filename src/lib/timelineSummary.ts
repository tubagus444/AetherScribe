/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TimelineEvent, WorldCalendar } from '@/src/types';
import { compareEvents } from '@/src/lib/timelinePeriods';
import { formatDateRange } from '@/src/lib/worldCalendar';

const MAX_SUMMARY_CHARS = 6000; // batasi agar tak membengkak token konteks

/**
 * Membangun ringkasan kronologis timeline (urut tanggal, lalu urutan manual) sebagai teks
 * untuk disuntikkan ke konteks pengecek konsistensi. Menautkan judul bab & nama
 * karakter agar AI bisa mendeteksi pelanggaran urutan waktu.
 */
export function buildTimelineSummary(
  events: TimelineEvent[],
  chapters: { id?: number; title: string }[],
  codex: { id?: number; name: string }[],
  calendar?: WorldCalendar
): string {
  if (!events || events.length === 0) return '';

  const chapterTitle = new Map<number, string>();
  chapters.forEach(c => c.id != null && chapterTitle.set(c.id, c.title));
  const codexName = new Map<number, string>();
  codex.forEach(c => c.id != null && codexName.set(c.id, c.name));

  const sorted = [...events].sort(compareEvents);

  return sorted.map((e, i) => {
    const date = (e.startDate && calendar)
      ? `[${formatDateRange(calendar, e.startDate, e.endDate)}] `
      : (e.eventDate ? `[${e.eventDate}] ` : '');
    const chap = e.chapterId != null && chapterTitle.has(e.chapterId)
      ? ` (Bab: ${chapterTitle.get(e.chapterId)})` : '';
    const chars = (e.characterIds || [])
      .map(id => codexName.get(id))
      .filter((n): n is string => !!n);
    const who = chars.length ? ` [Entitas Codex terkait: ${chars.join(', ')}]` : '';
    const desc = e.description ? ` — ${e.description}` : '';
    return `${i + 1}. ${date}${e.title}${chap}${who}${desc}`;
  }).join('\n').slice(0, MAX_SUMMARY_CHARS);
}
