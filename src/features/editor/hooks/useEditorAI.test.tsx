// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEditorAI } from './useEditorAI';
import { Editor } from '@tiptap/core';
import { AllSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { SNIPPET_INSERTION_HIGHLIGHT, SnippetInsertionHighlight, snippetInsertionHighlightKey } from '@/src/features/editor/extensions/SnippetInsertionHighlight';
const { rewrite, cancel, snapshot, toast } = vi.hoisted(() => ({
  rewrite: vi.fn(), cancel: vi.fn(), snapshot: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));
vi.mock('@/src/services/ai', () => ({ processRewrite: rewrite, cancelAI: cancel }));
vi.mock('@/src/services/snapshotService', () => ({ createAutoSnapshot: snapshot }));
vi.mock('@/src/hooks/useToast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/src/contexts/NavigationContext', () => ({ useNavigation: () => ({ setViewMode: vi.fn() }) }));
let editor: Editor;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  editor = new Editor({ extensions: [StarterKit, SnippetInsertionHighlight], content: '<p>Awal.</p><p>Kutipan asli.</p><p>Kutipan asli.</p>' });
  editor.commands.setTextSelection({ from: 8, to: 21 });
  vi.runAllTimers();
});
afterEach(() => { cleanup(); editor.destroy(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('F14 retry replaces partial preview and final output is authoritative', async () => {
  let params: any, finish: (s: string) => void;
  rewrite.mockImplementation(p => { params = p; return new Promise<string>(resolve => { finish = resolve; }); });
  const { result } = renderHook(() => useEditorAI(editor, 1, [], []));
  let pending: Promise<void>;
  act(() => { pending = result.current.runAiAction('rewrite'); });
  act(() => { params.onChunk('old'); params.onRetry(1, {}, 'provider'); });
  expect(result.current.retryStatus).toContain('Percobaan ulang ke-1');
  act(() => { params.onChunk('new'); vi.advanceTimersByTime(50); });
  expect(result.current.retryStatus).toBeNull();
  expect(result.current.rewritePreview?.rewritten).toBe('new');
  await act(async () => { finish!('canonical'); await pending!; });
  expect(result.current.rewritePreview?.rewritten).toBe('canonical'); expect(vi.getTimerCount()).toBe(0);
});
it('F15 failed request clears interval and partial preview', async () => {
  rewrite.mockRejectedValue(new Error('failed'));
  const { result } = renderHook(() => useEditorAI(editor, 1, [], []));
  await act(async () => { await result.current.runAiAction('rewrite'); });
  expect(result.current.rewritePreview).toBeNull(); expect(result.current.isAiProcessing).toBe(false); expect(vi.getTimerCount()).toBe(0);
});
it('F15 unmount aborts and clears timer; late completion is ignored', async () => {
  let params: any, finish: (s: string) => void;
  rewrite.mockImplementation(p => { params = p; return new Promise<string>(resolve => { finish = resolve; }); });
  const { result, unmount } = renderHook(() => useEditorAI(editor, 1, [], []));
  let pending: Promise<void>;
  act(() => { pending = result.current.runAiAction('rewrite'); });
  unmount(); expect(cancel).toHaveBeenCalledWith('rewrite'); expect(vi.getTimerCount()).toBe(0);
  await act(async () => { params.onChunk('late'); finish!('late'); await pending!; });
  expect(toast.error).not.toHaveBeenCalled();
});

it('maps the original quote through outside edits and ignores both apply handlers during streaming', async () => {
  let finish!: (text: string) => void;
  let sendChunk!: (text: string) => void;
  rewrite.mockImplementation(({ onChunk }) => {
    sendChunk = onChunk;
    return new Promise<string>(resolve => { finish = resolve; });
  });
  const { result } = renderHook(() => useEditorAI(editor, 1, [], []));
  let pending!: Promise<void>;
  act(() => { pending = result.current.runAiAction('rewrite'); });
  act(() => {
    sendChunk('Sebagian');
    vi.advanceTimersByTime(50);
    result.current.acceptRewrite();
    result.current.insertRewriteBelow();
    editor.view.dispatch(editor.state.tr.insertText('Tambahan ', 1));
  });
  expect(editor.getText()).not.toContain('Sebagian');
  expect(result.current.rewritePreview?.targetValid).toBe(true);
  expect(snapshot).not.toHaveBeenCalled();
  await act(async () => { finish('Kalimat baru.'); await pending; });
  act(() => result.current.acceptRewrite());
  expect(editor.getHTML()).toBe('<p>Tambahan Awal.</p><p>Kalimat baru.</p><p>Kutipan asli.</p>');
  expect(snapshot).toHaveBeenCalledWith(1, '<p>Tambahan Awal.</p><p>Kutipan asli.</p><p>Kutipan asli.</p>', 'Sebelum tenun AI');
});

it('requires explicit reselection after a change inside the target', async () => {
  rewrite.mockResolvedValue('Kalimat baru.');
  const { result } = renderHook(() => useEditorAI(editor, 1, [], []));
  await act(async () => { await result.current.runAiAction('rewrite'); });
  act(() => {
    editor.view.dispatch(editor.state.tr.insertText('lama', 16, 20));
    result.current.acceptRewrite();
    result.current.insertRewriteBelow();
  });
  expect(result.current.rewritePreview).toMatchObject({ targetValid: false, rewritten: 'Kalimat baru.' });
  expect(editor.getHTML()).toBe('<p>Awal.</p><p>Kutipan lama.</p><p>Kutipan asli.</p>');
  act(() => {
    editor.commands.setTextSelection({ from: 8, to: 21 });
    result.current.reselectRewriteTarget();
    result.current.acceptRewrite();
  });
  expect(editor.getHTML()).toBe('<p>Awal.</p><p>Kalimat baru.</p><p>Kutipan asli.</p>');
});

it('discards an active preview and protects against a late completion or empty final reply', async () => {
  let finish!: (text: string) => void;
  rewrite.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
  const { result } = renderHook(() => useEditorAI(editor, 1, [], []));
  let pending!: Promise<void>;
  act(() => { pending = result.current.runAiAction('rewrite'); });
  act(() => result.current.discardRewrite());
  await act(async () => { finish('Balasan terlambat.'); await pending; });
  expect(cancel).toHaveBeenCalledWith('rewrite');
  expect(result.current.rewritePreview).toBeNull();
  rewrite.mockResolvedValueOnce('   ');
  await act(async () => { await result.current.runAiAction('rewrite'); });
  act(() => {
    result.current.acceptRewrite();
    result.current.insertRewriteBelow();
  });
  expect(editor.getHTML()).toBe('<p>Awal.</p><p>Kutipan asli.</p><p>Kutipan asli.</p>');
  expect(snapshot).not.toHaveBeenCalled();
});

it('applies the exact preview as text without interpreting markup in the reply', async () => {
  rewrite.mockResolvedValue('<b>kata</b>');
  const { result } = renderHook(() => useEditorAI(editor, 1, [], []));
  await act(async () => { await result.current.runAiAction('rewrite'); });
  act(() => result.current.acceptRewrite());
  expect(editor.getHTML()).toBe('<p>Awal.</p><p>&lt;b&gt;kata&lt;/b&gt;</p><p>Kutipan asli.</p>');
  expect(snippetInsertionHighlightKey.getState(editor.state)).toBeNull();
});

it('inserts below the tracked quote while keeping the original and duplicate intact', async () => {
  rewrite.mockResolvedValue('Tambahan prosa.\n\nBaris kedua.');
  const { result } = renderHook(() => useEditorAI(editor, 1, [], []));
  await act(async () => { await result.current.runAiAction('rewrite'); });
  act(() => {
    editor.view.dispatch(editor.state.tr.insertText('Lebih ', 1));
    result.current.insertRewriteBelow();
  });
  expect(editor.state.doc.child(0).textContent).toBe('Lebih Awal.');
  expect(editor.state.doc.child(1).textContent).toBe('Kutipan asli.\n\nTambahan prosa.\n\nBaris kedua.');
  expect(editor.state.doc.child(2).textContent).toBe('Kutipan asli.');
  expect(snapshot).not.toHaveBeenCalled();
  const highlighted = () => editor.view.dom.querySelector('[' + SNIPPET_INSERTION_HIGHLIGHT + ']');
  expect(highlighted()?.textContent).toBe('Tambahan prosa.\n\nBaris kedua.');
  expect(editor.getHTML()).not.toContain(SNIPPET_INSERTION_HIGHLIGHT);

  act(() => editor.view.dispatch(editor.state.tr.insertText('Sisipan luar. ', 1)));
  expect(highlighted()?.textContent).toBe('Tambahan prosa.\n\nBaris kedua.');
  const range = snippetInsertionHighlightKey.getState(editor.state)!;
  act(() => editor.view.dispatch(editor.state.tr.insertText('!', range.from + 2)));
  expect(highlighted()).toBeNull();
});

it('highlights an insertion at the document boundary after selecting the whole chapter', async () => {
  editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)));
  rewrite.mockResolvedValue('Penutup.');
  const { result } = renderHook(() => useEditorAI(editor, 1, [], []));
  await act(async () => { await result.current.runAiAction('rewrite'); });
  act(() => result.current.insertRewriteBelow());
  expect(editor.state.doc.lastChild?.textContent).toContain('Penutup.');
  expect(editor.view.dom.querySelector('[' + SNIPPET_INSERTION_HIGHLIGHT + ']')?.textContent).toBe('Penutup.');
});

it.each(['length', 'provider-stop'])('keeps a %s preview visible and blocks both apply handlers', async status => {
  rewrite.mockImplementation(async ({ onFinish }) => {
    onFinish(status);
    return 'Balasan terpotong.';
  });
  const { result } = renderHook(() => useEditorAI(editor, 1, [], []));
  await act(async () => { await result.current.runAiAction('rewrite'); });
  expect(result.current.rewritePreview).toMatchObject({ status, rewritten: 'Balasan terpotong.' });
  act(() => {
    result.current.acceptRewrite();
    result.current.insertRewriteBelow();
  });
  expect(editor.getHTML()).toBe('<p>Awal.</p><p>Kutipan asli.</p><p>Kutipan asli.</p>');
  expect(snapshot).not.toHaveBeenCalled();
});
