import { Extension, type Range } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const snippetInsertionHighlightKey = new PluginKey<Range | null>('snippetInsertionHighlight');

export const SNIPPET_INSERTION_HIGHLIGHT = 'data-snippet-insertion-highlight';

export const SnippetInsertionHighlight = Extension.create({
  name: 'snippetInsertionHighlight',
  addProseMirrorPlugins() {
    return [new Plugin<Range | null>({
      key: snippetInsertionHighlightKey,
      state: {
        init: () => null,
        apply(tr, previous, oldState): Range | null {
          const inserted = tr.getMeta(snippetInsertionHighlightKey) as Range | undefined;
          if (inserted) return inserted;
          if (!previous || !tr.docChanged) return previous;

          let { from, to } = previous;
          for (const map of tr.mapping.maps) {
            let touched = false;
            map.forEach((start, end) => {
              if (start < to && end > from) touched = true;
            });
            if (touched) return null;
            from = map.map(from, 1);
            to = map.map(to, -1);
          }

          // Format changes can alter the marked text without moving positions.
          return from < to && tr.doc.slice(from, to).eq(oldState.doc.slice(previous.from, previous.to))
            ? { from, to }
            : null;
        },
      },
      props: {
        decorations(state) {
          const range = snippetInsertionHighlightKey.getState(state);
          if (!range) return null;
          return DecorationSet.create(state.doc, [
            Decoration.inline(range.from, range.to, {
              [SNIPPET_INSERTION_HIGHLIGHT]: '',
              class: 'rounded-sm bg-teal-100 dark:bg-teal-900/60',
            }),
          ]);
        },
      },
    })];
  },
});
