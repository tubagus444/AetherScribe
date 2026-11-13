// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SemanticSearchPanel } from './SemanticSearchPanel';
const { search, scenes } = vi.hoisted(() => ({ search: vi.fn(), scenes: vi.fn() }));
vi.mock('@/src/db', () => ({ db: {} }));
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: (fn: Function) => fn.toString().includes('countIndexedScenes') ? 0 : [] }));
vi.mock('@/src/services/contextEngine', () => ({ searchManuscript: scenes, countIndexedScenes: vi.fn(), indexManuscript: vi.fn(), clearManuscriptIndex: vi.fn() }));
vi.mock('@/src/services/rag/oramaSync', () => ({ oramaSync: { searchWithScores: search } }));
vi.mock('@/src/contexts/NavigationContext', () => ({ useNavigation: () => ({ jumpToText: vi.fn(), openCodexEntry: vi.fn() }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('F08 panel searches Codex through scoped worker facade even without a scene index', async () => {
  search.mockResolvedValue([{ entry: { id: 1, projectId: 7, name: 'Phoenix', category: 'character', description: '' }, score: 4 }]);
  render(<SemanticSearchPanel projectId={7} />);
  fireEvent.change(screen.getByPlaceholderText(/Deskripsikan adegan/), { target: { value: 'Phoenix' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cari' }));
  await waitFor(() => expect(screen.getByText('Phoenix')).toBeTruthy());
  expect(search).toHaveBeenCalledWith(7, 'Phoenix', 8); expect(scenes).not.toHaveBeenCalled();
});
it('F08 panel shows worker failure', async () => {
  search.mockRejectedValue(new Error('Worker unavailable'));
  render(<SemanticSearchPanel projectId={7} />);
  fireEvent.change(screen.getByPlaceholderText(/Deskripsikan adegan/), { target: { value: 'Phoenix' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cari' }));
  await waitFor(() => expect(screen.getByText('Worker unavailable')).toBeTruthy());
});
