export type EditPosition = { position: number; lastModified: number };

const lastChapterKey = (projectId: number) => `aether_last_edited_chapter:${projectId}`;
const chapterPositionKey = (projectId: number, chapterId: number) => `aether_edit_position:${projectId}:${chapterId}`;

export function readLastEditedChapter(projectId: number): number | undefined {
  try {
    const id = Number(localStorage.getItem(lastChapterKey(projectId)));
    if (Number.isSafeInteger(id) && id > 0) return id;
  } catch {
    // The Dashboard can use chapter metadata when storage is unavailable.
  }
}

export function readEditPosition(projectId: number, chapterId: number): EditPosition | undefined {
  try {
    const raw = localStorage.getItem(chapterPositionKey(projectId, chapterId));
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<EditPosition> | null;
    if (typeof saved?.position === 'number' && Number.isSafeInteger(saved.position) && saved.position >= 0 &&
      typeof saved.lastModified === 'number' && Number.isFinite(saved.lastModified)) {
      return { position: saved.position, lastModified: saved.lastModified };
    }
  } catch {
    // Invalid or unavailable preferences leave normal chapter navigation intact.
  }
}

export function recordEditPosition(projectId: number, chapterId: number, saved: EditPosition) {
  try {
    localStorage.setItem(chapterPositionKey(projectId, chapterId), JSON.stringify(saved));
    localStorage.setItem(lastChapterKey(projectId), String(chapterId));
  } catch {
    // Optional device preferences must not interrupt saving the manuscript.
  }
}
