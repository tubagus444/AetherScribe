/**
 * Pelacakan progres menulis harian untuk sebuah proyek.
 *
 * - Mencatat total kata yang teramati ke `projects` secara DEBOUNCE (3 dtk) agar tak
 *   membebani IndexedDB tiap ketukan; logika murni ada di `src/lib/dailyProgress.ts`.
 * - Mengembalikan nilai tampilan REAL-TIME ("kata hari ini" + streak) yang menambahkan
 *   delta langsung di atas nilai tersimpan, sehingga UI tak menunggu debounce.
 */

import { useEffect } from 'react';
import { saveDailyProgress } from '@/src/services/projectOperations';
import { Project } from '@/src/types';
import { dayKey, wordsOnDay, computeStreak } from '@/src/lib/dailyProgress';

const PERSIST_DEBOUNCE_MS = 3000;
const DEFAULT_DAILY_GOAL = 1500;

export interface DailyProgressView {
  wordsToday: number;
  streak: number;
  dailyGoal: number;
  dailyPercent: number;
}

export function useDailyProgress(
  projectId: number,
  totalWords: number | undefined,
  project: Project | undefined,
): DailyProgressView {
  // Live query memperbarui proyek setelah progres tersimpan.
  useEffect(() => {
    if (totalWords === undefined || !project) return;
    const handle = setTimeout(() => {
      void saveDailyProgress(projectId, totalWords, dayKey()).catch(error => {
        console.error('Failed to save daily progress:', error);
      });
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [projectId, totalWords, project]);

  const today = dayKey();
  const persistedToday = wordsOnDay(project?.dailyLog, today);
  const liveDelta =
    project?.lastWordCountDate === today &&
    typeof project?.lastWordCount === 'number' &&
    totalWords !== undefined
      ? Math.max(0, totalWords - project.lastWordCount)
      : 0;
  const wordsToday = persistedToday + liveDelta;

  const dailyGoal = project?.dailyGoal || DEFAULT_DAILY_GOAL;
  // Sertakan progres hari ini yang real-time agar streak ikut hidup saat target tercapai.
  const effectiveLog = { ...(project?.dailyLog ?? {}), [today]: wordsToday };
  const streak = computeStreak(effectiveLog, dailyGoal, today);
  const dailyPercent = Math.min(100, Math.round((wordsToday / dailyGoal) * 100));

  return { wordsToday, streak, dailyGoal, dailyPercent };
}
