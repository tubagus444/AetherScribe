// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import { useEditorSave } from './useEditorSave';
import { flushActiveEditor, reloadActiveEditor } from '../editorBridge';
import { EditorPanelContext } from '@/src/contexts/EditorPanelContext';
import { readEditPosition, readLastEditedChapter } from '@/src/features/editor/editPosition';

const { update, get } = vi.hoisted(() => ({ update: vi.fn(), get: vi.fn() }));
vi.mock('@/src/db', () => ({
  db: { chapters: { update, get }, transaction: (_mode: string, _tables: unknown, run: () => Promise<unknown>) => run() },
}));
const { titleError } = vi.hoisted(() => ({ titleError: vi.fn() }));
vi.mock('@/src/hooks/useToast', () => ({ useToast: () => ({ toast: { error: titleError } }) }));

describe('F05 editor persistence', () => {
  const status = vi.fn();
  let html: string;
  let editor: Editor;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <EditorPanelContext.Provider value={{ activePanel: 'none', setActivePanel: vi.fn(), saveStatus: '', setSaveStatus: status }}>
      {children}
    </EditorPanelContext.Provider>
  );
  const baseContent = '<p>database lama</p>';
  const mount = () => renderHook(() => useEditorSave({ chapterId: 1, chapter: { title: 'Bab', content: baseContent, projectId: 1 }, editor }), { wrapper });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    update.mockResolvedValue(1);
    get.mockResolvedValue({ content: baseContent });
    html = '<p>draft terbaru</p>';
    editor = { getHTML: () => html, state: { selection: { head: 5 } }, isDestroyed: false, commands: { setContent: vi.fn() } } as unknown as Editor;
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('does not read or write chapter content when flushing an untouched editor', async () => {
    mount();
    await flushActiveEditor();
    expect(get).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it.each(['reject', 'missing'])('rejects flush on %s, keeps draft and permits retry', async failure => {
    const { result } = mount();
    act(() => result.current.onEditorUpdate({ editor }));
    if (failure === 'reject') update.mockRejectedValueOnce(new Error('quota'));
    else update.mockResolvedValueOnce(0);
    await expect(flushActiveEditor()).rejects.toThrow();
    expect(status).toHaveBeenLastCalledWith('Gagal menyimpan');
    expect(readLastEditedChapter(1)).toBeUndefined();
    expect(editor.getHTML()).toBe(html);
    await flushActiveEditor();
    expect(update).toHaveBeenLastCalledWith(1, expect.objectContaining({ content: html }));
    expect(status).toHaveBeenLastCalledWith('Tersimpan');
    expect(readLastEditedChapter(1)).toBe(1);
    expect(readEditPosition(1, 1)).toEqual({ position: 5, lastModified: update.mock.lastCall?.[1].lastModified });
  });

  it('does not reload over a draft after a failed save', async () => {
    const { result } = mount();
    act(() => result.current.onEditorUpdate({ editor }));
    update.mockRejectedValueOnce(new Error('quota'));
    await flushActiveEditor().catch(() => {});
    await expect(reloadActiveEditor()).rejects.toThrow();
    expect(get).toHaveBeenCalledTimes(1);
    expect(editor.commands.setContent).not.toHaveBeenCalled();
  });

  it('reports a failed title write without discarding the typed title', async () => {
    const { result } = mount();
    update.mockResolvedValueOnce(0);
    await act(() => result.current.handleTitleChange('Judul baru'));
    expect(result.current.title).toBe('Judul baru');
    expect(titleError).toHaveBeenCalledWith(expect.stringContaining('Gagal menyimpan judul'));
  });

  it('flushes a newer edit after the in-flight write and waits for both', async () => {
    const { result } = mount();
    let finish!: (affected: number) => void;
    let finishSecond!: (affected: number) => void;
    update.mockReturnValueOnce(new Promise<number>(resolve => { finish = resolve; }))
      .mockReturnValueOnce(new Promise<number>(resolve => { finishSecond = resolve; }));
    get.mockResolvedValueOnce({ content: baseContent }).mockResolvedValueOnce({ content: html });
    act(() => result.current.onEditorUpdate({ editor }));
    const firstSave = flushActiveEditor();
    html = '<p>edit lebih baru</p>';
    act(() => result.current.onEditorUpdate({ editor }));
    await act(async () => { finish(1); });
    expect(update).toHaveBeenNthCalledWith(2, 1, expect.objectContaining({ content: html }));
    expect(status).toHaveBeenLastCalledWith('Menyimpan...');
    await act(async () => { finishSecond(1); await firstSave; });
    expect(status).toHaveBeenLastCalledWith('Tersimpan');
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(update).toHaveBeenCalledTimes(2);
  });

  it.each(['', '<p></p>', '<p>isi baru</p>'])('flushes current content %j and cancels debounce', async content => {
    const { result } = mount();
    html = content;
    act(() => result.current.onEditorUpdate({ editor }));
    await flushActiveEditor();
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(1, expect.objectContaining({ content }));
    await reloadActiveEditor();
    expect(editor.commands.setContent).toHaveBeenCalledWith('<p>database lama</p>', { emitUpdate: false });
  });

  it('keeps failure visible past an older saved-status timer and handles autosave rejection', async () => {
    const { result } = mount();
    act(() => result.current.onEditorUpdate({ editor }));
    await flushActiveEditor();
    update.mockRejectedValueOnce(new Error('quota'));
    get.mockResolvedValueOnce({ content: html });
    html = '<p>perubahan baru</p>';
    act(() => result.current.onEditorUpdate({ editor }));
    await act(() => vi.advanceTimersByTimeAsync(3500));
    expect(status).toHaveBeenLastCalledWith('Gagal menyimpan');
  });

  it('handles cleanup save rejection, including an empty draft', async () => {
    const { result, unmount } = mount();
    html = '';
    act(() => result.current.onEditorUpdate({ editor }));
    update.mockRejectedValueOnce(new Error('quota'));
    unmount();
    await act(async () => {});
    expect(update).toHaveBeenCalledWith(1, expect.objectContaining({ content: '' }));
  });
});
