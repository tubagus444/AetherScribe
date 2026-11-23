import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Node as PMNode } from 'prosemirror-model';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { InlineQuoteFinding, InlineSpellingFinding, InlineGlossaryFinding } from '@/src/lib/inlineConsistency';

interface ConsistencyUnderlineOptions {
  getQuoteFindings?: () => InlineQuoteFinding[];
  getSpellingFindings?: () => InlineSpellingFinding[];
  getGlossaryFindings?: () => InlineGlossaryFinding[];
}

const PLUGIN_KEY = new PluginKey('consistencyUnderline');

/** Gaya garis bawah untuk kandidat salah-eja (merah, PUTUS-PUTUS → beda dari wavy). */
function spellingStyle(): string {
  return [
    'text-decoration: underline',
    'text-decoration-style: dashed',
    'text-decoration-color: #ef4444',
    'text-decoration-skip-ink: none',
    'text-underline-offset: 3px',
    'cursor: help',
  ].join('; ');
}

/** Gaya garis bawah untuk temuan Glosarium (teal, PUTUS-PUTUS → beda dari nama). */
function glossaryStyle(): string {
  return [
    'text-decoration: underline',
    'text-decoration-style: dashed',
    'text-decoration-color: #14b8a6',
    'text-decoration-skip-ink: none',
    'text-underline-offset: 3px',
    'cursor: help',
  ].join('; ');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Dekorasi kandidat salah-eja nama — pencarian kata utuh (case-sensitive). */
function buildSpellingDecorations(doc: PMNode, findings: InlineSpellingFinding[]): Decoration[] {
  const decorations: Decoration[] = [];
  for (const f of findings) {
    const word = (f.word || '').trim();
    if (word.length < 3) continue;
    let regex: RegExp;
    try {
      // \b batas kata; case-sensitive agar hanya kemunculan yang persis salah eja ditandai.
      regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'g');
    } catch {
      continue;
    }
    let occurrences = 0;
    doc.descendants((node, pos) => {
      if (!node.isText || !node.text || occurrences >= 20) return;
      let m: RegExpExecArray | null;
      regex.lastIndex = 0;
      while ((m = regex.exec(node.text)) !== null && occurrences < 20) {
        const start = pos + m.index;
        const end = start + m[0].length;
        if (start < doc.content.size && end <= doc.content.size) {
          decorations.push(
            Decoration.inline(start, end, {
              nodeName: 'span',
              class: 'consistency-underline consistency-spelling',
              style: spellingStyle(),
              title: `Kemungkinan salah eja — maksudmu "${f.suggestion}"?`,
            })
          );
          occurrences++;
        }
        if (m.index === regex.lastIndex) regex.lastIndex++;
      }
    });
  }
  return decorations;
}

/** Dekorasi temuan Glosarium — pencarian kata/frasa utuh (case-insensitive). */
function buildGlossaryDecorations(doc: PMNode, findings: InlineGlossaryFinding[]): Decoration[] {
  const decorations: Decoration[] = [];
  for (const f of findings) {
    const word = (f.word || '').trim();
    if (word.length < 2) continue;
    let regex: RegExp;
    try {
      // Case-insensitive: ejaan tak baku bisa muncul dalam berbagai kapitalisasi.
      regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi');
    } catch {
      continue;
    }
    const title = f.kind === 'variant'
      ? `Istilah tak baku — gunakan "${f.suggestion}"`
      : `Kemungkinan salah eja istilah — maksudmu "${f.suggestion}"?`;
    let occurrences = 0;
    doc.descendants((node, pos) => {
      if (!node.isText || !node.text || occurrences >= 20) return;
      let m: RegExpExecArray | null;
      regex.lastIndex = 0;
      while ((m = regex.exec(node.text)) !== null && occurrences < 20) {
        const start = pos + m.index;
        const end = start + m[0].length;
        if (start < doc.content.size && end <= doc.content.size) {
          decorations.push(
            Decoration.inline(start, end, {
              nodeName: 'span',
              class: 'consistency-underline consistency-glossary',
              style: glossaryStyle(),
              title,
            })
          );
          occurrences++;
        }
        if (m.index === regex.lastIndex) regex.lastIndex++;
      }
    });
  }
  return decorations;
}

/** Dekorasi berbasis kutipan verbatim (temuan AI) — pencarian literal di dokumen. */
function buildQuoteDecorations(doc: PMNode, findings: InlineQuoteFinding[]): Decoration[] {
  const decorations: Decoration[] = [];
  for (const f of findings) {
    const quote = (f.quote || '').trim();
    if (quote.length < 3) continue;
    let regex: RegExp;
    try {
      regex = new RegExp(escapeRegExp(quote), 'gi');
    } catch {
      continue;
    }
    let occurrences = 0;
    doc.descendants((node, pos) => {
      if (!node.isText || !node.text || occurrences >= 10) return;
      let m: RegExpExecArray | null;
      regex.lastIndex = 0;
      while ((m = regex.exec(node.text)) !== null && occurrences < 10) {
        const start = pos + m.index;
        const end = start + m[0].length;
        if (start < doc.content.size && end <= doc.content.size) {
          decorations.push(
            Decoration.inline(start, end, {
              nodeName: 'span',
              class: 'consistency-underline consistency-ai',
              style: 'text-decoration: underline wavy #8b5cf6; text-underline-offset: 3px; background-color: rgba(139,92,246,.08); cursor: help',
              title: f.message,
            })
          );
          occurrences++;
        }
        if (m.index === regex.lastIndex) regex.lastIndex++; // jaga match nol-panjang
      }
    });
  }
  return decorations;
}

export const ConsistencyUnderline = Extension.create<ConsistencyUnderlineOptions>({
  name: 'consistencyUnderline',

  addOptions() {
    return {
      getQuoteFindings: () => [],
      getSpellingFindings: () => [],
      getGlossaryFindings: () => [],
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    let debounceTimer: any = null;
    return [
      new Plugin({
        key: PLUGIN_KEY,
        state: {
          init() {
            return { decorations: DecorationSet.empty, needsUpdate: true };
          },
          apply(tr, value) {
            const next = tr.getMeta('updateConsistencyDecos');
            if (next) {
              return { decorations: next, needsUpdate: false };
            }
            if (tr.getMeta('forceUpdateConsistency')) {
              return { decorations: value.decorations.map(tr.mapping, tr.doc), needsUpdate: true };
            }
            if (tr.docChanged) {
              return { decorations: value.decorations.map(tr.mapping, tr.doc), needsUpdate: true };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state).decorations;
          },
        },
        view() {
          return {
            update(view) {
              const pluginState = PLUGIN_KEY.getState(view.state);
              if (!pluginState || !pluginState.needsUpdate) return;

              if (debounceTimer) clearTimeout(debounceTimer);
              debounceTimer = setTimeout(() => {
                if (view.isDestroyed) return;
                const doc = view.state.doc;
                const decorations = [
                  ...buildQuoteDecorations(doc, options.getQuoteFindings?.() ?? []),
                  ...buildSpellingDecorations(doc, options.getSpellingFindings?.() ?? []),
                  ...buildGlossaryDecorations(doc, options.getGlossaryFindings?.() ?? []),
                ];
                view.dispatch(view.state.tr.setMeta('updateConsistencyDecos', DecorationSet.create(doc, decorations)));
              }, 600);
            },
            destroy() {
              if (debounceTimer) clearTimeout(debounceTimer);
            },
          };
        },
      }),
    ];
  },
});
