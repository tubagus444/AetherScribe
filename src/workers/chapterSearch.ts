import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5';
import { findChapterMatch, normalizeChapterSearchBlock, type ChapterSearchRequest, type ChapterSearchResult } from '@/src/lib/globalSearch';

const BLOCK_TAGS = new Set([
  'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure',
  'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol',
  'p', 'pre', 'section', 'table', 'td', 'th', 'ul',
]);
const NON_TEXT_TAGS = new Set(['script', 'style', 'template']);

export function getSearchableHtmlBlocks(html: string): string[] {
  const blocks: string[] = [];
  let current = '';
  const flush = () => {
    const block = normalizeChapterSearchBlock(current);
    if (block) blocks.push(block);
    current = '';
  };
  const visit = (node: DefaultTreeAdapterTypes.ChildNode) => {
    if ('value' in node) {
      current += node.value;
    } else if ('tagName' in node && !NON_TEXT_TAGS.has(node.tagName) && !node.attrs.some(attr => attr.name === 'hidden')) {
      if (node.tagName === 'br') current += '\n';
      const boundary = BLOCK_TAGS.has(node.tagName);
      if (boundary) flush();
      for (const child of node.childNodes) visit(child);
      if (boundary) flush();
    }
  };
  for (const node of parseFragment(html).childNodes) visit(node);
  flush();
  return blocks;
}

export function searchChapters({ chapters, query }: ChapterSearchRequest): ChapterSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return chapters.flatMap(({ id, title, content }) => {
    const name = title.toLowerCase();
    const match = findChapterMatch(getSearchableHtmlBlocks(content), query.trim());
    const rank = name === q ? 0 : name.includes(q) ? 1 : 2;
    return rank < 2 || match ? [{ result: { id, title, match }, rank }] : [];
  }).sort((a, b) => a.rank - b.rank).map(({ result }) => result);
}
