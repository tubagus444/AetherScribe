import { useEditor, ReactRenderer, Editor } from '@tiptap/react';
import type { RefObject } from 'react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Mention from '@tiptap/extension-mention';
import TextAlign from '@tiptap/extension-text-align';

import { SearchAndReplace } from '@/src/features/editor/extensions/SearchAndReplace';
import { ChapterSearchHighlight } from '@/src/features/editor/extensions/ChapterSearchHighlight';
import { SnippetInsertionHighlight } from '@/src/features/editor/extensions/SnippetInsertionHighlight';
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

export interface EditorBindings {
  codexEntries: CodexEntry[];
  onCodexClick: (entryId: number, event: MouseEvent) => void;
  onUpdate: (props: { editor: Editor }) => void;
  getConsistencyQuotes: () => InlineQuoteFinding[];
  getConsistencySpelling: () => InlineSpellingFinding[];
  getConsistencyGlossary: () => InlineGlossaryFinding[];
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

export function useEditorSetup(initialContent: string, bindings: RefObject<EditorBindings | null>) {
  return useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      CustomAIKeymap,
      ChapterSearchHighlight,
      SnippetInsertionHighlight,
      SearchAndReplace.configure({
        disableRegex: false,
        caseSensitive: false,
      }),
      SemanticHighlight,
      ConsistencyUnderline.configure({
        getQuoteFindings: () => bindings.current?.getConsistencyQuotes() ?? [],
        getSpellingFindings: () => bindings.current?.getConsistencySpelling() ?? [],
        getGlossaryFindings: () => bindings.current?.getConsistencyGlossary() ?? [],
      }),
      RevisionComment,
      PassiveCodexHighlight.configure({
        getCodexEntries: () => bindings.current?.codexEntries ?? [],
        onCodexClick: (entryId, event) => bindings.current?.onCodexClick(entryId, event)
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
            const entries = bindings.current?.codexEntries ?? [];
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
    content: initialContent,
    onUpdate: props => bindings.current?.onUpdate(props),
    editorProps: {
      attributes: {
        class: cn(
          "relative w-full font-serif text-lg sm:text-[19px] leading-[1.8] text-slate-800 dark:text-slate-300 bg-transparent focus:outline-none min-h-[500px]"
        ),
      },
    },
  });
}
