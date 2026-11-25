import type { ChapterSearchRequest, ChapterSearchResponse } from '@/src/lib/globalSearch';
import { searchChapters } from '@/src/workers/chapterSearch';

self.onmessage = ({ data }: MessageEvent<ChapterSearchRequest>) => {
  try {
    self.postMessage({ results: searchChapters(data) } satisfies ChapterSearchResponse);
  } catch {
    self.postMessage({ error: true } satisfies ChapterSearchResponse);
  }
};
