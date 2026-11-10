// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import { db } from '@/src/db';
import { CrossChapterReplace } from './CrossChapterReplace';
import { useEditorSave } from '@/src/features/editor/hooks/useEditorSave';

const { toast, snapshot, chapter } = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
  snapshot: vi.fn(),
  chapter: { id: 1, projectId: 1, title: 'Bab 1', content: '<p>lama</p>', order: 0, lastModified: 1 },
}));
vi.mock('@/src/db', async () => {
  await import('fake-indexeddb/auto');
  const { default: Dexie } = await import('dexie');
  const db = new Dexie('F05-replace-test');
  db.version(1).stores({ chapters: '++id,projectId' });
  return { db };
});
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: () => [chapter] }));
vi.mock('@/src/hooks/useToast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/src/services/snapshotService', () => ({ createAutoSnapshot: snapshot }));
vi.mock('motion/react', () => ({ motion: { div: ({ children, initial, animate, ...props }: any) => <div {...props}>{children}</div> } }));

describe('F05 replace with the real save hook and isolated IndexedDB', () => {
  let editor: Editor;
  beforeEach(async () => {
    // IndexedDB sintetis tetap membutuhkan scheduler native (setImmediate).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await db.chapters.put(chapter);
    editor = {
      getHTML: () => '<p>lama draft terbaru</p>', isDestroyed: false,
      commands: { setContent: vi.fn() },
    } as unknown as Editor;
    renderHook(() => useEditorSave({ chapterId: 1, chapter, editor }));
    render(<CrossChapterReplace projectId={1} onSelectChapter={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Cari teks'), { target: { value: 'lama' } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    vi.useRealTimers();
  });
  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await db.chapters.clear();
    vi.useRealTimers();
  });

  it.each(['reject', 'missing'])('stops before replace/snapshot/reload when save returns %s', async failure => {
    const update = vi.spyOn(db.chapters, 'update');
    if (failure === 'reject') update.mockRejectedValueOnce(new Error('quota'));
    else update.mockResolvedValueOnce(0);
    const transaction = vi.spyOn(db, 'transaction');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ganti Semua' })); });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(update).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
    expect(snapshot).not.toHaveBeenCalled();
    expect(editor.commands.setContent).not.toHaveBeenCalled();
    expect((await db.chapters.get(1))?.content).toBe(chapter.content);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Draft belum tersimpan'));
    // Klik ulang melakukan flush lagi dan meneruskan penggantian setelah berhasil.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ganti Semua' })); });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect((await db.chapters.get(1))?.content).toBe('<p> draft terbaru</p>');
    expect(editor.commands.setContent).toHaveBeenCalledWith('<p> draft terbaru</p>', { emitUpdate: false });
    expect(snapshot).toHaveBeenCalledWith(1, '<p>lama draft terbaru</p>', expect.any(String));
    expect(toast.success).toHaveBeenCalled();
  });
});
