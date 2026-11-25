import { hashChunk } from '@/src/lib/manuscriptChunker';
import type { CodexEntry } from '@/src/types';

export interface ChapterSearchMatch {
  block: number;
  offset: number;
  text: string;
  before: string;
  after: string;
  chapterHash: string;
}

export interface ChapterSearchResult {
  id: number;
  title: string;
  match?: ChapterSearchMatch;
}

export interface ChapterSearchRequest {
  query: string;
  chapters: Array<{ id: number; title: string; content: string }>;
}

export type ChapterSearchResponse = { results: ChapterSearchResult[] } | { error: true };

export type TextRange = { from: number; to: number };

export const searchBlocksHash = (blocks: string[]) => hashChunk(JSON.stringify(blocks));
export const normalizeChapterSearchBlock = (text: string) => text.trim().replace(/\s+/gu, ' ');

export function findChapterMatch(blocks: string[], query: string): ChapterSearchMatch | undefined {
  const pattern = query.split(/\s+/).map(part => part.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&')).join('\\s+');
  if (!pattern) return;
  const expression = new RegExp(pattern, 'iu');
  for (const [block, content] of blocks.entries()) {
    const match = expression.exec(content);
    if (!match) continue;
    const offset = match.index;
    const text = match[0];
    return {
      block, offset, text,
      before: content.slice(Math.max(0, offset - 48), offset),
      after: content.slice(offset + text.length, offset + text.length + 48),
      chapterHash: searchBlocksHash(blocks),
    };
  }
}

export function resolveChapterMatch(blocks: string[], match: ChapterSearchMatch) {
  const { block, offset, text, before, after, chapterHash } = match;
  if (searchBlocksHash(blocks) === chapterHash && blocks[block]?.slice(offset, offset + text.length) === text) {
    return { block, offset };
  }

  const context = before + text + after;
  let found: { block: number; offset: number } | undefined;
  for (const [index, content] of blocks.entries()) {
    const start = content.indexOf(context);
    if (start < 0) continue;
    if (found || content.indexOf(context, start + 1) >= 0) return;
    found = { block: index, offset: start + before.length };
  }
  return found;
}

export function findCodexResults(entries: CodexEntry[], query: string) {
  const q = query.toLowerCase();
  if (!q) return [];
  return entries.flatMap(entry => {
    if (entry.id == null) return [];
    const name = entry.name.toLowerCase();
    const aliases = entry.aliases?.map(alias => alias.toLowerCase()) ?? [];
    let rank: number;
    if (name === q) rank = 0;
    else if (aliases.includes(q)) rank = 1;
    else if (name.includes(q)) rank = 2;
    else if (aliases.some(alias => alias.includes(q))) rank = 3;
    else if (entry.description.toLowerCase().includes(q)) rank = 4;
    else return [];
    return [{ entry, id: entry.id, rank }];
  }).sort((a, b) => a.rank - b.rank || a.entry.name.localeCompare(b.entry.name, 'id') || a.id - b.id);
}
