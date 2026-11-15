import type { AIRenderParams } from './types';
import { getSettings } from './settings';
import { isCacheSupported } from './context';
import { AIError, callAI } from './dispatch';

// Satu tipe aksi bisa punya beberapa panggilan berjalan bersamaan, jadi simpan
// kumpulan controller per-tipe agar pembatalan & pembersihan tidak salah sasaran.
const abortControllers = new Map<string, Set<AbortController>>();

function registerAbort(type: string, controller: AbortController) {
  let set = abortControllers.get(type);
  if (!set) {
    set = new Set();
    abortControllers.set(type, set);
  }
  set.add(controller);
}

function unregisterAbort(type: string, controller: AbortController) {
  const set = abortControllers.get(type);
  if (set) {
    set.delete(controller);
    if (set.size === 0) abortControllers.delete(type);
  }
}

export function cancelAI(type?: string) {
  if (type) {
    const set = abortControllers.get(type);
    if (set) {
      set.forEach(controller => controller.abort());
      abortControllers.delete(type);
    }
  } else {
    // Cancel all
    abortControllers.forEach(set => set.forEach(controller => controller.abort()));
    abortControllers.clear();
  }
}

// Helper functions to deduplicate Boilerplate AI actions
interface AIExecutionParams {
  abortKey: string;
  actionType: AIRenderParams['actionType'];
  providerOverride?: string;
  buildPrompts: (ctx: { useCaching: boolean; settings: ReturnType<typeof getSettings>; provider: string }) => Promise<{
    systemInstruction: string;
    cachedContext?: string[];
    userPrompt: string;
  }>;
  callOptions?: Omit<AIRenderParams, 'systemInstruction'|'cachedContext'|'userPrompt'|'provider'|'signal'|'actionType'|'cacheable'>;
}

export async function executeAIAction(config: AIExecutionParams): Promise<string> {
  const settings = getSettings();
  const provider = config.providerOverride || settings.provider;
  const useCaching = isCacheSupported(provider) && settings.contextDepth !== 'minimal';

  const { systemInstruction, cachedContext, userPrompt } = await config.buildPrompts({
    useCaching, settings, provider
  });

  const controller = new AbortController();
  registerAbort(config.abortKey, controller);

  try {
    return await callAI({
      ...(config.callOptions || {}),
      systemInstruction,
      cachedContext,
      userPrompt,
      provider,
      signal: controller.signal,
      actionType: config.actionType,
      cacheable: useCaching,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    if (error instanceof AIError) throw error;
    throw new AIError(error instanceof Error ? error.message : `AI action ${config.actionType} failed.`, 'API_ERROR');
  } finally {
    unregisterAbort(config.abortKey, controller);
  }
}
