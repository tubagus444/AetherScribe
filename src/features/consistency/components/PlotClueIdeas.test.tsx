// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PlotClueIdeas } from './PlotClueIdeas';
import { suggestPlotClues } from '@/src/services/ai';
import type { PlotPromise } from '@/src/types';

vi.mock('@/src/services/ai', () => ({ suggestPlotClues: vi.fn(), cancelAI: vi.fn() }));
afterEach(cleanup);

it('uses the clues for the selected secret and prepares a linked draft only after selection', async () => {
  vi.mocked(suggestPlotClues).mockResolvedValue([{ title: 'Kesaksian', description: 'Kesaksian kedua berbeda.', keyword: 'saksi' }]);
  const choose = vi.fn();
  const clue = (title: string, payoffCodexId: number): PlotPromise => ({
    title, payoffCodexId, status: 'open', projectId: 1, importance: 'medium', createdAt: 1, updatedAt: 1,
  });
  render(<PlotClueIdeas secret="Rahasia" entryId={2} projectId={1} chapters={new Map()}
    promises={[clue('Luka', 2), clue('Surat', 2), clue('Lain', 3)]} onChoose={choose} />);
  fireEvent.click(screen.getByRole('button', { name: /Bantu pikirkan/ }));
  const review = await screen.findByRole('button', { name: 'Tinjau dan catat' });
  expect(vi.mocked(suggestPlotClues).mock.calls[0][1].map(p => p.title)).toEqual(['Luka', 'Surat']);
  expect(choose).not.toHaveBeenCalled();
  fireEvent.click(review);
  expect(choose).toHaveBeenCalledWith(expect.objectContaining({ projectId: 1, payoffCodexId: 2, keywords: ['saksi'] }));
});
