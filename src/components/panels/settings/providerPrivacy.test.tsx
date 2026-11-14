// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AIPreferences } from './sections/AIPreferences';
import { useAISettings } from './useAISettings';
afterEach(() => { cleanup(); localStorage.clear(); });
it('persists privacy consent immediately through settings hook and reloads it', () => {
  const first = renderHook(useAISettings);
  act(() => { first.result.current.setAllowedFallbacks(['openai']); first.result.current.setLocalOnly(true); });
  expect(localStorage.getItem('ai_local_only')).toBe('true'); expect(localStorage.getItem('ai_fallback_providers')).toBe('["openai"]');
  first.unmount();
  const second = renderHook(useAISettings); expect(second.result.current.localOnly).toBe(true); expect(second.result.current.allowedFallbacks).toEqual(['openai']);
});
it('privacy controls disable cloud fallback selections in local-only mode', () => {
  function Preferences() {
    const settings = useAISettings();
    return <AIPreferences {...settings} />;
  }
  render(<Preferences />);
  fireEvent.click(screen.getByLabelText('Hanya AI lokal (Ollama)'));
  expect(screen.getByLabelText('openai').closest('fieldset')!.disabled).toBe(true);
  expect(localStorage.getItem('ai_local_only')).toBe('true');
});
