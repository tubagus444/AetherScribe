import 'fake-indexeddb/auto';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { db } from '@/src/db';
import { ErrorService } from './errorService';

afterEach(async () => { vi.restoreAllMocks(); await db.errors.clear(); });
afterAll(async () => { await db.delete(); });

it('drops manuscript/key/raw errors before writing DB or console', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const secret = 'SYNTHETIC-KEY-AND-MANUSCRIPT';
  await ErrorService.log({
    message: secret, stack: `Error: ${secret}`, source: 'AI-Service (openai)',
    metadata: { provider: 'openai', code: 'API_ERROR', promptPreview: secret, rawMessage: secret, apiKey: secret, nested: { authorization: secret }, model: secret },
  });
  const row = (await db.errors.toArray())[0];
  expect(JSON.stringify(row)).not.toContain(secret);
  expect(JSON.stringify(consoleError.mock.calls)).not.toContain(secret);
  expect(row.metadata).toEqual({ provider: 'openai', code: 'API_ERROR' });
  expect(row.stack).toBeUndefined();
});

it('sanitizes legacy records when read, preserving ID/time and safe diagnostics', async () => {
  await db.errors.add({ message: 'OLD-SECRET', stack: 'OLD-SECRET', source: 'Global (unhandledrejection)', timestamp: 1, type: 'error', metadata: { reason: 'OLD-SECRET', lineno: 10 } });
  const rows = await ErrorService.getRecent();
  expect(JSON.stringify(rows)).not.toContain('OLD-SECRET');
  expect(rows[0]).toMatchObject({ timestamp: 1, metadata: { lineno: 10 } });
  expect(rows[0].id).toBeDefined();
});

it('does not echo storage failures or arbitrary source/metadata strings', async () => {
  const output = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(db.errors, 'add').mockRejectedValue(new Error('SYNTHETIC-PRIVATE-ERROR'));
  await ErrorService.log({ source: 'SYNTHETIC-PRIVATE-ERROR', message: 'SYNTHETIC-PRIVATE-ERROR', metadata: { code: 'SYNTHETIC-PRIVATE-ERROR', provider: 'SYNTHETIC-PRIVATE-ERROR' } });
  expect(JSON.stringify(output.mock.calls)).not.toContain('SYNTHETIC-PRIVATE-ERROR');
});
