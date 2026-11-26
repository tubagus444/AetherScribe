import type { ChapterListMetadata } from '@/src/lib/chapterMetadata';
import type { CodexDetail, CodexEntry } from '@/src/types';

type DetailChapter = Pick<ChapterListMetadata, 'id' | 'projectId' | 'order' | 'title'>;
export type CodexDetailScope = { chapterId?: number; history?: boolean };
export type DetailChapterIndex = ReturnType<typeof indexDetailChapters>;

export function indexDetailChapters(chapters: readonly DetailChapter[]) {
  const projectPositions = new Map<number, number>();
  return new Map([...chapters]
    .sort((a, b) => a.order - b.order || a.id - b.id)
    .map(chapter => {
      const position = projectPositions.get(chapter.projectId) ?? 0;
      projectPositions.set(chapter.projectId, position + 1);
      return [chapter.id, { ...chapter, position }];
    }));
}

export function readDetailHistory(detail: CodexDetail, chapters: DetailChapterIndex) {
  return (detail.revisions ?? []).map(revision => ({
    ...revision,
    chapter: revision.chapterId === undefined ? undefined : chapters.get(revision.chapterId),
  })).sort((a, b) => (a.chapter?.position ?? Number.MAX_SAFE_INTEGER) - (b.chapter?.position ?? Number.MAX_SAFE_INTEGER));
}

export function readCurrentDetail(detail: CodexDetail, revisions: ReturnType<typeof readDetailHistory>, projectId: number, throughPosition = Infinity) {
  return revisions.findLast(revision => revision.chapter?.projectId === projectId &&
    revision.chapter.position <= throughPosition && revision.value.trim()) ?? { value: detail.value, chapter: undefined };
}

export function hasChapterDetailHistory(entry: CodexEntry, chapters: DetailChapterIndex) {
  return entry.details?.some(detail => detail.revisions?.some(({ chapterId }) =>
    chapterId !== undefined && chapters.get(chapterId)?.projectId === entry.projectId)) ?? false;
}

export function hasSharedDetailHistory(entry: CodexEntry) {
  return entry.details?.some(detail => detail.includeInAI && detail.revisions?.some(revision => revision.chapterId !== undefined)) ?? false;
}

export function createCodexDetailFormatter(chapters: readonly DetailChapter[], scope: CodexDetailScope = {}) {
  const chaptersById = indexDetailChapters(chapters);
  return (entry: CodexEntry) => {
    const target = scope.chapterId === undefined ? undefined : chaptersById.get(scope.chapterId);
    const cutoff = scope.chapterId === undefined ? Infinity : target?.projectId === entry.projectId ? target.position : -1;
    return (entry.details ?? []).flatMap(detail => {
      if (!detail.includeInAI) return [];
      const historyRows = readDetailHistory(detail, chaptersById);
      const revisions = historyRows.flatMap(revision => {
        const { chapter, value } = revision;
        return chapter?.projectId === entry.projectId && value.trim() ? [{ chapter, value: value.trim() }] : [];
      });
      const initial = detail.value.trim();
      const value = readCurrentDetail(detail, historyRows, entry.projectId, cutoff).value.trim();
      if (scope.history && revisions.length) {
        const history = revisions.map(({ chapter, value }) => `Bab ${chapter.position + 1} (${chapter.title}): ${value}`);
        if (initial) history.unshift(`Nilai awal: ${initial}`);
        if (target?.projectId === entry.projectId) history.unshift(`Nilai pada bab yang diperiksa: ${value || 'Belum tercatat'}`);
        return [`${detail.label}:\n${history.join('\n')}`];
      }
      return value ? [`${detail.label}: ${value}`] : [];
    }).join('\n');
  };
}
