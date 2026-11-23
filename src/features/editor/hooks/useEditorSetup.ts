import { useEditor, ReactRenderer, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import TextAlign from '@tiptap/extension-text-align';

import { SearchAndReplace } from '@/src/features/editor/extensions/SearchAndReplace';
import { PassiveCodexHighlight } from '@/src/features/editor/extensions/PassiveCodexHighlight';
import { SemanticHighlight } from '@/src/features/editor/extensions/SemanticHighlight';
import { ConsistencyUnderline } from '@/src/features/editor/extensions/ConsistencyUnderline';
import { RevisionComment } from '@/src/features/editor/extensions/RevisionComment';
import { MentionList } from '@/src/features/editor/components/MentionList';
import { CustomAIKeymap } from '@/src/features/editor/hooks/useEditorAI';
import tippy from 'tippy.js';
import { cn } from '@/src/lib/utils';
import { CodexEntry } from '@/src/types';
import { InlineQuoteFinding, InlineSpellingFinding, InlineGlossaryFinding } from '@/src/lib/inlineConsistency';
import { useRef, useEffect } from 'react';

interface UseEditorSetupProps {
  chapterId: number;
  initialContent?: string;
  codexEntries: CodexEntry[];
  onCodexClick: (entryId: number, event: MouseEvent) => void;
  onUpdate: (props: { editor: Editor }) => void;
  /** Akses temuan kutipan dari lapisan AI inline (Fase 2), stabil identitasnya. */
  getConsistencyQuotes?: () => InlineQuoteFinding[];
  /** Akses temuan salah-eja nama (Buku Gaya), stabil identitasnya. */
  getConsistencySpelling?: () => InlineSpellingFinding[];
  /** Akses temuan glosarium istilah in-world (#8), stabil identitasnya. */
  getConsistencyGlossary?: () => InlineGlossaryFinding[];
}

const CustomMention = Mention.extend({
  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      HTMLAttributes,
      `${node.attrs.label ?? node.attrs.id}`,
    ];
  },
  renderText({ node }) {
    return `${node.attrs.label ?? node.attrs.id}`;
  },
});

export function useEditorSetup({ chapterId, initialContent, codexEntries, onCodexClick, onUpdate, getConsistencyQuotes, getConsistencySpelling, getConsistencyGlossary }: UseEditorSetupProps) {
  const visibleCodexEntriesRef = useRef<CodexEntry[]>(codexEntries.filter(e => !e.hidden));
  const onUpdateRef = useRef(onUpdate);
  // Akses flag/temuan konsistensi lewat ref agar closure extension selalu baca versi terkini.
  const getQuotesRef = useRef(getConsistencyQuotes);
  const getSpellingRef = useRef(getConsistencySpelling);
  const getGlossaryRef = useRef(getConsistencyGlossary);

  useEffect(() => {
    visibleCodexEntriesRef.current = codexEntries.filter(e => !e.hidden);
  }, [codexEntries]);

  useEffect(() => {
    getQuotesRef.current = getConsistencyQuotes;
  }, [getConsistencyQuotes]);

  useEffect(() => {
    getSpellingRef.current = getConsistencySpelling;
  }, [getConsistencySpelling]);

  useEffect(() => {
    getGlossaryRef.current = getConsistencyGlossary;
  }, [getConsistencyGlossary]);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      CustomAIKeymap,
      SearchAndReplace.configure({
        disableRegex: false,
        caseSensitive: false,
      }),
      SemanticHighlight,
      ConsistencyUnderline.configure({
        getQuoteFindings: () => getQuotesRef.current?.() ?? [],
        getSpellingFindings: () => getSpellingRef.current?.() ?? [],
        getGlossaryFindings: () => getGlossaryRef.current?.() ?? [],
      }),
      RevisionComment,
      PassiveCodexHighlight.configure({
        getCodexEntries: () => visibleCodexEntriesRef.current,
        onCodexClick: (entryId, event) => onCodexClick(entryId, event)
      }),
      Placeholder.configure({
        placeholder: 'Mulai menulis cerita Anda...',
      }),
      CustomMention.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        suggestion: {
          items: ({ query }) => {
            const entries = visibleCodexEntriesRef.current;
            return entries
              .filter(item =>
                item.name.toLowerCase().includes(query.toLowerCase()) ||
                item.aliases?.some(a => a.toLowerCase().includes(query.toLowerCase()))
              )
              .slice(0, 50);
          },
          render: () => {
            let component: ReactRenderer;
            let popup: any;

            return {
              onStart: (props: any) => {
                component = new ReactRenderer(MentionList, {
                  props,
                  editor: props.editor,
                });

                if (!props.clientRect) return;

                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                  theme: 'mention',
                  arrow: false,
                });
              },
              onUpdate(props: any) {
                component.updateProps(props);
                if (!props.clientRect) return;
                popup[0].setProps({
                  getReferenceClientRect: props.clientRect,
                });
              },
              onKeyDown(props: any) {
                if (props.event.key === 'Escape') {
                  popup[0].hide();
                  return true;
                }
                return (component.ref as any)?.onKeyDown(props);
              },
              onExit() {
                if (popup?.[0]) popup[0].destroy();
                if (component) component.destroy();
              },
            };
          },
        },
      }),
    ],
    content: initialContent || '',
    onUpdate: (props) => {
      onUpdateRef.current?.(props as any);
    },
    editorProps: {
      attributes: {
        class: cn(
          "relative w-full font-serif text-lg sm:text-[19px] leading-[1.8] text-slate-800 dark:text-slate-300 bg-transparent focus:outline-none min-h-[500px]"
        ),
      },
    },
  });

  const hasSetInitialContent = useRef(false);

  // Reset the flag when chapterId changes
  useEffect(() => {
    hasSetInitialContent.current = false;
  }, [chapterId]);

  // Apply initial content when it becomes available
  useEffect(() => {
    if (editor && initialContent !== undefined && !hasSetInitialContent.current) {
      if (editor.getHTML() !== initialContent) {
        // emitUpdate:false → muat konten awal tanpa memicu onUpdate (cegah autosave churn). (ED2)
        editor.commands.setContent(initialContent, { emitUpdate: false });
      }
      hasSetInitialContent.current = true;
    }
  }, [editor, initialContent]);

  return editor;
}
