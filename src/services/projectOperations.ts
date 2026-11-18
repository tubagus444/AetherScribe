import { db } from '@/src/db';
import { recordWordCount } from '@/src/lib/dailyProgress';
import type { Project } from '@/src/types';

export function updateProject(id: number, changes: Partial<Pick<Project, 'name' | 'lastOpened' | 'calendar' | 'travelSpeeds' | 'wordGoal' | 'dailyGoal'>>) {
  return db.projects.update(id, changes);
}

export async function createProjectWithChapter(name: string) {
  return db.transaction('rw', db.projects, db.chapters, async () => {
    const now = Date.now();
    const projectId = await db.projects.add({ name, description: 'New Manuscript', createdAt: now, lastOpened: now });
    await db.chapters.add({ projectId, title: 'Chapter 1', content: '', order: 0, lastModified: now });
    return projectId;
  });
}

export async function saveDailyProgress(projectId: number, totalWords: number, today: string) {
  await db.transaction('rw', db.projects, async () => {
    const project = await db.projects.get(projectId);
    if (!project) return;
    const next = recordWordCount(project, totalWords, today);
    if (next.lastWordCount === project.lastWordCount && next.lastWordCountDate === project.lastWordCountDate &&
      next.dailyLog[today] === project.dailyLog?.[today]) return;
    await db.projects.update(projectId, {
      dailyLog: next.dailyLog, lastWordCount: next.lastWordCount, lastWordCountDate: next.lastWordCountDate,
    });
  });
}

// Inisialisasi proyek bawaan bila belum ada satu pun proyek di DB.
export async function ensureDefaultProject() {
  // Serialize concurrent bootstrap calls (including StrictMode/multiple tabs).
  // Roll back the project too if initial chapter or Bible creation fails.
  return db.transaction('rw', db.projects, db.chapters, db.bible, async () => {
    const count = await db.projects.count();
    if (count === 0) {
      const projectId = await db.projects.add({
        name: 'Novel Tanpa Judul',
        description: 'Mulailah mahakarya Anda di sini.',
        createdAt: Date.now(),
        lastOpened: Date.now(),
      });

      await db.chapters.add({
        projectId,
        title: 'Bab 1',
        content: 'Pada suatu hari…',
        order: 0,
        lastModified: Date.now(),
      });

      await db.bible.add({
        projectId,
        key: 'Nada',
        instruction: 'Gelap dan atmosferik'
      });

      return projectId;
    }
    const latest = await db.projects.orderBy('lastOpened').reverse().first();
    return latest?.id;
  });
}
