// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AIProviderIndicator } from './AIProviderIndicator';
afterEach(cleanup);
it('shows the effective request destination for local and fallback cloud calls', () => {
  render(<AIProviderIndicator />);
  act(() => window.dispatchEvent(new CustomEvent('ai-provider-dispatched', { detail: 'ollama' })));
  expect(screen.getByRole('status').textContent).toContain('Ollama (lokal)');
  act(() => window.dispatchEvent(new CustomEvent('ai-provider-dispatched', { detail: 'openai' })));
  expect(screen.getByRole('status').textContent).toContain('openai (cloud)');
});
