// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import { db } from '@/src/db';
import { CrossChapterReplace } from './CrossChapterReplace';
import { useEditorSave } from '@/src/features/editor/hooks/useEditorSave';

const { toast, chapter } = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
  chapter: { id: 1, projectId: 1, title: 'Bab 1', content: '<p>lama</p>', order: 0, lastModified: 1 },
}));
vi.mock('@/src/db', async () => {
  await import('fake-indexeddb/auto');
  const { default: Dexie } = await import('dexie');
  const db = new Dexie('F05-replace-test');
  db.version(1).stores({ chapters: '++id,projectId', snapshots: '++id,chapterId' });
  return { db };
});
vi.mock('@/src/hooks/useToast', () => ({ useToast: () => ({ toast }) }));
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
      state: { selection: { head: 5 } },
      commands: { setContent: vi.fn() },
    } as unknown as Editor;
    const { result } = renderHook(() => useEditorSave({ chapterId: 1, chapter, editor }));
    act(() => result.current.onEditorUpdate({ editor }));
    render(<CrossChapterReplace projectId={1} onSelectChapter={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Cari teks'), { target: { value: 'lama' } });
    await act(() => vi.advanceTimersByTimeAsync(300));
    vi.useRealTimers();
  });
  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await db.chapters.clear();
    await db.snapshots.clear();
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
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0][1]).toEqual([db.chapters]);
    expect(await db.snapshots.count()).toBe(0);
    expect(editor.commands.setContent).not.toHaveBeenCalled();
    expect((await db.chapters.get(1))?.content).toBe(chapter.content);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Draft belum tersimpan'));
    // Klik ulang melakukan flush lagi dan meneruskan penggantian setelah berhasil.
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ganti Semua' })); });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect((await db.chapters.get(1))?.content).toBe('<p> draft terbaru</p>');
    expect(editor.commands.setContent).toHaveBeenCalledWith('<p> draft terbaru</p>', { emitUpdate: false });
    expect(await db.snapshots.toArray()).toEqual([
      expect.objectContaining({ chapterId: 1, content: '<p>lama draft terbaru</p>', auto: true }),
    ]);
    expect(toast.success).toHaveBeenCalled();
  });

  it('rolls back replacements and snapshots when a later chapter cannot be updated', async () => {
    await db.chapters.add({ ...chapter, id: 2, title: 'Bab 2', order: 1 });
    const failSecondChapter = (_changes: object, id: number) => {
      if (id === 2) throw new Error('Synthetic write failure');
    };
    db.chapters.hook('updating', failSecondChapter);
    try {
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ganti Semua' })); });
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Gagal melakukan penggantian.'));
      expect((await db.chapters.get(1))?.content).toBe('<p>lama draft terbaru</p>');
      expect((await db.chapters.get(2))?.content).toBe(chapter.content);
      expect(await db.snapshots.count()).toBe(0);
      expect(editor.commands.setContent).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
    } finally {
      db.chapters.hook('updating').unsubscribe(failSecondChapter);
    }
  });
});
