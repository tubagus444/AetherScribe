// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import { useEditorSave } from './useEditorSave';
import { flushActiveEditor, reloadActiveEditor } from '../editorBridge';
import { EditorPanelContext } from '@/src/contexts/EditorPanelContext';

const { update, get } = vi.hoisted(() => ({ update: vi.fn(), get: vi.fn() }));
vi.mock('@/src/db', () => ({ db: { chapters: { update, get } } }));

describe('F05 editor persistence', () => {
  const status = vi.fn();
  let html: string;
  let editor: Editor;
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <EditorPanelContext.Provider value={{ activePanel: 'none', setActivePanel: vi.fn(), saveStatus: '', setSaveStatus: status }}>
      {children}
    </EditorPanelContext.Provider>
  );
  const mount = () => renderHook(() => useEditorSave({ chapterId: 1, chapter: { title: 'Bab' }, editor }), { wrapper });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    update.mockResolvedValue(1);
    get.mockResolvedValue({ content: '<p>database lama</p>' });
    html = '<p>draft terbaru</p>';
    editor = { getHTML: () => html, isDestroyed: false, commands: { setContent: vi.fn() } } as unknown as Editor;
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it.each(['reject', 'missing'])('rejects flush on %s, keeps draft and permits retry', async failure => {
    mount();
    if (failure === 'reject') update.mockRejectedValueOnce(new Error('quota'));
    else update.mockResolvedValueOnce(0);
    await expect(flushActiveEditor()).rejects.toThrow();
    expect(status).toHaveBeenLastCalledWith('Gagal menyimpan');
    expect(editor.getHTML()).toBe(html);
    await flushActiveEditor();
    expect(update).toHaveBeenLastCalledWith(1, expect.objectContaining({ content: html }));
    expect(status).toHaveBeenLastCalledWith('Tersimpan');
  });

  it('does not reload over a draft after a failed save', async () => {
    mount();
    update.mockRejectedValueOnce(new Error('quota'));
    await flushActiveEditor().catch(() => {});
    await expect(reloadActiveEditor()).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
    expect(editor.commands.setContent).not.toHaveBeenCalled();
  });

  it.each(['', '<p></p>', '<p>isi baru</p>'])('flushes current content %j and cancels debounce', async content => {
    const { result } = mount();
    act(() => result.current.onEditorUpdate({ editor }));
    html = content;
    await flushActiveEditor();
    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(1, expect.objectContaining({ content }));
    await reloadActiveEditor();
    expect(editor.commands.setContent).toHaveBeenCalledWith('<p>database lama</p>', { emitUpdate: false });
  });

  it('keeps failure visible past an older saved-status timer and handles autosave rejection', async () => {
    const { result } = mount();
    await flushActiveEditor();
    update.mockRejectedValueOnce(new Error('quota'));
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
