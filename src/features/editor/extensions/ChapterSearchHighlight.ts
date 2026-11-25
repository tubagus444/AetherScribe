import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { normalizeChapterSearchBlock, resolveChapterMatch, type ChapterSearchMatch, type TextRange } from '@/src/lib/globalSearch';

export const chapterSearchHighlightKey = new PluginKey<DecorationSet>('chapterSearchHighlight');

export const ChapterSearchHighlight = Extension.create({
  name: 'chapterSearchHighlight',
  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key: chapterSearchHighlightKey,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, previous) {
          const range = tr.getMeta(chapterSearchHighlightKey) as TextRange | null | undefined;
          if (range) {
            return DecorationSet.create(tr.doc, [
              Decoration.inline(range.from, range.to, {
                'data-chapter-search-highlight': '',
                class: 'bg-amber-200 text-slate-900 dark:bg-amber-300',
              }),
            ]);
          }
          return tr.docChanged || range === null ? DecorationSet.empty : previous;
        },
      },
      props: {
        decorations: state => chapterSearchHighlightKey.getState(state),
      },
    })];
  },
});

export function getChapterSearchRange(doc: ProseMirrorNode, match: ChapterSearchMatch): TextRange | undefined {
  const blocks: Array<{ text: string; node: ProseMirrorNode; position: number }> = [];
  doc.descendants((node, position) => {
    if (!node.isTextblock) return;
    let text = '';
    node.forEach(child => { text += inlineText(child); });
    if (text.trim()) blocks.push({ text, node, position });
    return false;
  });

  const location = resolveChapterMatch(blocks.map(block => normalizeChapterSearchBlock(block.text)), match);
  if (!location) return;
  const { node, position, text } = blocks[location.block];
  const start = originalTextOffset(text, location.offset);
  const last = originalTextOffset(text, location.offset + match.text.length - 1);
  if (start === undefined || last === undefined) return;
  const end = last + 1;
  let offset = 0;
  let from: number | undefined;
  let to: number | undefined;
  node.forEach((child, childPosition) => {
    const length = inlineText(child).length;
    const pos = position + 1 + childPosition;
    if (start >= offset && start < offset + length) from = pos + (child.isText ? start - offset : 0);
    if (end > offset && end <= offset + length) to = pos + (child.isText ? end - offset : child.nodeSize);
    offset += length;
  });
  return from !== undefined && to !== undefined && from < to ? { from, to } : undefined;
}

function originalTextOffset(text: string, offset: number): number | undefined {
  let normalized = 0;
  for (const part of text.matchAll(/\S+/gu)) {
    if (offset < normalized + part[0].length) return part.index + offset - normalized;
    normalized += part[0].length + 1;
  }
}

function inlineText(node: ProseMirrorNode): string {
  if (node.type.name === 'hardBreak') return '\n';
  if (node.type.name === 'mention') return String(node.attrs.label ?? node.attrs.id ?? '');
  return node.textContent;
}
