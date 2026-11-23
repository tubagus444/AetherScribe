import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { Node as ProseMirrorNode } from 'prosemirror-model';
import { getCodexMatches } from '@/src/services/contextEngine';

interface PassiveCodexHighlightOptions {
  getCodexEntries: () => { id?: number; name: string; aliases?: string[]; description?: string; category?: string }[];
  onCodexClick?: (entryId: number, event: MouseEvent) => void;
}

const PLUGIN_KEY = new PluginKey('passiveCodexHighlight');
const CHAPTER_CODEX_KEY = new PluginKey<DecorationSet>('chapterCodexHighlight');

export function setChapterCodexHighlights(editor: Editor, ranges: readonly { start: number; end: number; isMention: boolean }[]) {
  if (editor.isDestroyed) return;
  const { state, view } = editor;
  if (ranges.length === 0 && CHAPTER_CODEX_KEY.getState(state) === DecorationSet.empty) return;
  const decorations = ranges.map(({ start, end, isMention }) => {
    const attrs = { class: 'chapter-codex-highlight', 'data-chapter-codex-start': String(start) };
    return isMention ? Decoration.node(start, end, attrs) : Decoration.inline(start, end, attrs);
  });
  view.dispatch(state.tr.setMeta(CHAPTER_CODEX_KEY, DecorationSet.create(state.doc, decorations)));
}

export const PassiveCodexHighlight = Extension.create<PassiveCodexHighlightOptions>({
  name: 'passiveCodexHighlight',

  addOptions() {
    return {
      getCodexEntries: () => [],
      onCodexClick: undefined,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    let debounceTimer: any = null;
    // ED4: penanda generasi — bila docChanged baru memicu run lain saat getCodexMatches
    // run sebelumnya masih in-flight, hasil yang basi (run lama) tidak boleh di-dispatch
    // (mencegah highlight kedip ke posisi lama sampai update berikutnya).
    let runGeneration = 0;

    return [
      new Plugin<DecorationSet>({
        key: CHAPTER_CODEX_KEY,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, decorations) {
            const next = tr.getMeta(CHAPTER_CODEX_KEY);
            if (next instanceof DecorationSet) return next;
            return tr.docChanged ? DecorationSet.empty : decorations;
          },
        },
        props: {
          decorations: state => CHAPTER_CODEX_KEY.getState(state),
        },
      }),
      new Plugin({
        key: PLUGIN_KEY,
        state: {
          init(_, { doc }) {
            return {
              decorations: DecorationSet.empty,
              needsUpdate: true
            };
          },
          apply(tr, value, oldState, newState) {
            const nextDecorations = tr.getMeta('updateCodexHighlights');
            if (nextDecorations) {
              return {
                decorations: nextDecorations,
                needsUpdate: false
              };
            }
            
            const forceUpdate = tr.getMeta('forceUpdateCodex');
            if (forceUpdate) {
              return {
                decorations: value.decorations.map(tr.mapping, tr.doc),
                needsUpdate: true
              };
            }
            
            if (tr.docChanged) {
              const newDecorations = value.decorations.map(tr.mapping, tr.doc);
              return {
                decorations: newDecorations,
                needsUpdate: true // Jadwalkan update melalui debounce 500ms
              };
            }
            
            return value;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state).decorations;
          },
          handleDOMEvents: {
            click(view, event) {
              const target = event.target;
              if (!(target instanceof Element) || !options.onCodexClick) return false;
              const codexId = target.closest('.codex-highlight')?.getAttribute('data-codex-id');
              if (codexId) {
                options.onCodexClick(Number(codexId), event);
                return true;
              }
              const mentionId = target.closest('.mention')?.getAttribute('data-id')?.toLowerCase();
              const entry = mentionId && options.getCodexEntries().find(e => e.name.toLowerCase() === mentionId);
              if (entry && entry.id) {
                options.onCodexClick(entry.id, event);
                return true;
              }
              return false;
            }
          }
        },
        view(view) {
          return {
            update(view, prevState) {
              const pluginState = PLUGIN_KEY.getState(view.state);
              if (!pluginState || !pluginState.needsUpdate) {
                return;
              }

              if (debounceTimer) clearTimeout(debounceTimer);

              const myGeneration = ++runGeneration;
              debounceTimer = setTimeout(async () => {
                const entries = options.getCodexEntries();
                if (!entries || entries.length === 0) {
                  if (!view.isDestroyed) {
                    view.dispatch(view.state.tr.setMeta('updateCodexHighlights', DecorationSet.empty));
                  }
                  return;
                }

                const chunks: { pos: number; text: string }[] = [];
                view.state.doc.descendants((node, pos) => {
                  if (node.isText && node.text) {
                    chunks.push({ pos, text: node.text });
                  }
                });

                try {
                  const matches = await getCodexMatches(chunks, entries as any);

                  // Run ini sudah usang (ada docChanged lebih baru) atau view dibongkar → buang.
                  if (view.isDestroyed || myGeneration !== runGeneration) return;

                  const decorations: Decoration[] = [];
                  matches.forEach(m => {
                    // codexId mestinya selalu ada (worker C5 sudah memfilter entri tanpa id),
                    // tapi guard agar atribut tak pernah jadi string "undefined".
                    if (m.codexId == null) return;
                    // Check if bounds are valid for the current document
                    if (m.start < view.state.doc.content.size && m.end <= view.state.doc.content.size) {
                      decorations.push(
                        Decoration.inline(m.start, m.end, {
                          nodeName: 'span',
                          class: 'codex-highlight group',
                          'data-codex-id': String(m.codexId),
                        })
                      );
                    }
                  });

                  const decorationSet = DecorationSet.create(view.state.doc, decorations);
                  view.dispatch(view.state.tr.setMeta('updateCodexHighlights', decorationSet));
                } catch (err) {
                  console.error("Failed to get codex matches", err);
                }
              }, 500); // Use 500ms debounce as discussed
            },
            destroy() {
              if (debounceTimer) clearTimeout(debounceTimer);
            }
          };
        }
      }),
    ];
  },
});
