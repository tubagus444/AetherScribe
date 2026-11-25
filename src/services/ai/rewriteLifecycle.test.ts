// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { cancelAI, processRewrite } from './index';
import type { GenerateParams, StreamFinishStatus } from './types';

const { execute, cancel } = vi.hoisted(() => ({ execute: vi.fn(), cancel: vi.fn() }));
vi.mock('./execution', () => ({ cancelAI: cancel, executeAIAction: execute }));
vi.mock('./settings', () => ({ getSettings: () => ({ provider: 'test' }) }));

const params: GenerateParams = {
  prompt: '', selection: 'Naskah asli.', bibleRules: [], codexEntries: [], action: 'rewrite', stream: true,
};

function start() {
  const onFinish = vi.fn();
  return { result: processRewrite({ ...params, onFinish }), onFinish };
}

function mockDeferred() {
  const replies: Array<(status: StreamFinishStatus, text: string) => void> = [];
  execute.mockImplementation(({ callOptions }) => new Promise<string>(resolve => {
    replies.push((status, text) => {
      callOptions.onFinish(status);
      resolve(text);
    });
  }));
  return replies;
}

beforeEach(() => {
  cancelAI('rewrite');
  vi.clearAllMocks();
});

it.each([[40, 4096], [8000, 5000], [16000, 8192]])('requests the adaptive rewrite limit for %i characters', async (length, limit) => {
  execute.mockResolvedValueOnce('Hasil.');
  await processRewrite({ ...params, selection: 'a'.repeat(length) });
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({
    callOptions: expect.objectContaining({ maxTokens: limit }),
  }));
});

it('delivers the completion status to every caller sharing the same rewrite', async () => {
  const replies = mockDeferred();
  const first = start();
  const second = start();
  expect(execute).toHaveBeenCalledTimes(1);
  replies[0]('length', 'Potongan.');
  await expect(first.result).resolves.toBe('Potongan.');
  await expect(second.result).resolves.toBe('Potongan.');
  expect(first.onFinish).toHaveBeenCalledWith('length');
  expect(second.onFinish).toHaveBeenCalledWith('length');
});

it('starts a new rewrite after cancellation even while the old request is settling', async () => {
  const replies = mockDeferred();
  const old = start();
  cancelAI('rewrite');
  const fresh = start();
  expect(execute).toHaveBeenCalledTimes(2);
  expect(cancel).toHaveBeenCalledWith('rewrite');
  replies[0]('provider-stop', 'Balasan lama.');
  await old.result;
  const shared = start();
  expect(execute).toHaveBeenCalledTimes(2);
  replies[1]('complete', 'Balasan baru.');
  await expect(fresh.result).resolves.toBe('Balasan baru.');
  await expect(shared.result).resolves.toBe('Balasan baru.');
});
