import React from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Quote,
  Undo,
  Redo,
  RemoveFormatting
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';

interface EditorToolbarProps {
  editor: Editor | null;
}

// Didefinisikan di scope modul (bukan di dalam render) agar React tidak
// meng-unmount/mount ulang seluruh tombol — dan membuang/membuat ulang instance
// tippy — setiap kali toolbar render.
function ToolbarButton({
  onClick,
  isActive,
  disabled = false,
  children,
  title
}: {
  onClick: () => void;
  // undefined → tombol aksi (Undo/Redo/Clear); boolean → tombol toggle (Bold, Heading, …).
  // Dipakai untuk menentukan apakah `aria-pressed` dipancarkan.
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  const btnRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    let instance: any;
    if (btnRef.current) {
      instance = tippy(btnRef.current, {
        content: title,
        placement: 'top',
        arrow: true,
        delay: [300, 0],
        theme: 'light',
        duration: 150,
      });
    }
    return () => {
      if (instance) instance.destroy();
    };
  }, [title]);

  return (
    <button
      ref={btnRef}
      type="button"
      aria-label={title}
      aria-pressed={isActive}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      disabled={disabled}
      className={cn(
        "p-2 rounded-md transition-colors flex items-center justify-center",
        "hover:bg-slate-200 dark:hover:bg-slate-700",
        isActive ? "bg-slate-200 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400" : "text-slate-600 dark:text-slate-300",
        disabled && "opacity-40 cursor-not-allowed hover:bg-transparent dark:hover:bg-transparent"
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => (
  <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
);

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const history = useEditorState({
    editor,
    selector: ({ editor }) => editor && {
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    },
  });
  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 rounded-t-sm sticky top-0 z-[40]">
      {/* History */}
      <div className="flex items-center gap-1">
        <ToolbarButton
          title="Undo (Ctrl+Z)"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!history?.canUndo}
        >
          <Undo size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Redo (Ctrl+Y)"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!history?.canRedo}
        >
          <Redo size={16} />
        </ToolbarButton>
      </div>

      <Divider />

      {/* Headings */}
      <div className="flex items-center gap-1">
        <ToolbarButton
          title="Heading 1"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
        >
          <Heading1 size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
        >
          <Heading2 size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
        >
          <Heading3 size={16} />
        </ToolbarButton>
      </div>

      <Divider />

      {/* Formatting */}
      <div className="flex items-center gap-1">
        <ToolbarButton
          title="Bold (Ctrl+B)"
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
        >
          <Bold size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Italic (Ctrl+I)"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
        >
          <Italic size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Underline (Ctrl+U)"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive('underline')}
        >
          <UnderlineIcon size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
        >
          <Strikethrough size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Clear Formatting"
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
        >
          <RemoveFormatting size={16} />
        </ToolbarButton>
      </div>

      <Divider />

      {/* Alignment */}
      <div className="flex items-center gap-1">
        <ToolbarButton
          title="Align Left"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          isActive={editor.isActive({ textAlign: 'left' })}
        >
          <AlignLeft size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Align Center"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          isActive={editor.isActive({ textAlign: 'center' })}
        >
          <AlignCenter size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Align Right"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          isActive={editor.isActive({ textAlign: 'right' })}
        >
          <AlignRight size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Justify"
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          isActive={editor.isActive({ textAlign: 'justify' })}
        >
          <AlignJustify size={16} />
        </ToolbarButton>
      </div>

      <Divider />

      {/* Lists / Quotes */}
      <div className="flex items-center gap-1">
        <ToolbarButton
          title="Bullet List"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
        >
          <List size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered List"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
        >
          <ListOrdered size={16} />
        </ToolbarButton>
        <ToolbarButton
          title="Blockquote"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive('blockquote')}
        >
          <Quote size={16} />
        </ToolbarButton>
      </div>
    </div>
  );
}
