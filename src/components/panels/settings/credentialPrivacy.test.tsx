// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAISettings } from './useAISettings';
import { ApiCredentials } from './sections/ApiCredentials';
import { readCredential } from '@/src/services/ai/credentialStore';

vi.mock('@/src/components/common/ModelSelect', () => ({ ModelSelect: () => null }));
vi.mock('./useConnectionTest', () => ({ useConnectionTest: () => ({ statusOf: () => 'idle', errors: {}, runTest: vi.fn() }) }));
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('new users save only in the session and settings remount reads the same key', () => {
  const first = renderHook(useAISettings);
  expect(first.result.current.credentialMode).toBe('session');
  act(() => first.result.current.setKeys({ ...first.result.current.keys, openai: '  synthetic-session  ' }));
  act(() => first.result.current.handleSave());
  expect(localStorage.getItem('ai_key_openai')).toBeNull();
  expect(sessionStorage.getItem('ai_key_openai')).toBe('synthetic-session');
  first.unmount();
  const second = renderHook(useAISettings);
  expect(second.result.current.keys.openai).toBe('synthetic-session');
  sessionStorage.clear();
  expect(readCredential('openai')).toBe('');
});

it('preserves legacy keys on mount and only moves them on explicit save', () => {
  localStorage.setItem('ai_key_google', btoa('synthetic-legacy'));
  const hook = renderHook(useAISettings);
  expect(hook.result.current.credentialMode).toBe('persistent');
  expect(hook.result.current.keys.google).toBe('synthetic-legacy');
  act(() => hook.result.current.setCredentialMode('session'));
  expect(localStorage.getItem('ai_key_google')).toBe(btoa('synthetic-legacy'));
  act(() => hook.result.current.handleSave());
  expect(localStorage.getItem('ai_key_google')).toBeNull();
  expect(sessionStorage.getItem('ai_key_google')).toBe('synthetic-legacy');
  expect(readCredential('google')).toBe('synthetic-legacy');
});

it('persistent choice survives a new session and clearing removes both copies', () => {
  const hook = renderHook(useAISettings);
  act(() => { hook.result.current.setKeys({ ...hook.result.current.keys, claude: 'synthetic-persistent' }); hook.result.current.setCredentialMode('persistent'); });
  act(() => hook.result.current.handleSave());
  sessionStorage.clear();
  expect(readCredential('claude')).toBe('synthetic-persistent');
  act(() => hook.result.current.handleClearCredentials());
  expect(readCredential('claude')).toBe('');
  expect(hook.result.current.keys.claude).toBe('');
  expect(localStorage.getItem('ai_key_claude')).toBeNull();
  expect(sessionStorage.getItem('ai_key_claude')).toBeNull();
});

it('session mode never falls back to a leftover persistent key', () => {
  localStorage.setItem('ai_key_storage', 'session');
  localStorage.setItem('ai_key_openai', btoa('stale-key'));
  expect(readCredential('openai')).toBe('');
});

it('failed destination write keeps legacy key and reports failure without claiming saved', () => {
  localStorage.setItem('ai_key_google', btoa('synthetic-legacy'));
  const hook = renderHook(useAISettings);
  act(() => hook.result.current.setCredentialMode('session'));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  act(() => hook.result.current.handleSave());
  expect(hook.result.current.isSaved).toBe(false);
  expect(hook.result.current.saveError).toBeTruthy();
  expect(localStorage.getItem('ai_key_google')).toBe(btoa('synthetic-legacy'));
});

it('UI explains persistence and lets the user save or clear credentials', () => {
  function Credentials() {
    const settings = useAISettings();
    return <ApiCredentials {...settings} onSave={settings.handleSave} onClear={settings.handleClearCredentials} />;
  }
  render(<Credentials />);
  fireEvent.change(screen.getByLabelText('API key OpenAI'), { target: { value: 'synthetic-ui' } });
  fireEvent.click(screen.getByText('Simpan Kredensial'));
  expect(sessionStorage.getItem('ai_key_openai')).toBe('synthetic-ui');
  expect(screen.getByText(/Key di browser tidak dienkripsi/)).toBeTruthy();
  fireEvent.click(screen.getByText('Hapus semua API key dari browser ini'));
  expect(sessionStorage.getItem('ai_key_openai')).toBeNull();
  expect((screen.getByLabelText('API key OpenAI') as HTMLInputElement).value).toBe('');
});
