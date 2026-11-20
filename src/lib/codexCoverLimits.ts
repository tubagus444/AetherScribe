export const CODEX_COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const CODEX_COVER_BYTES = { cover: 96 * 1024, thumbnail: 12 * 1024 } as const;
export const CODEX_COVER_SOURCE_BYTES = 20 * 1024 * 1024;

export function isCodexCoverType(type: string) {
  return CODEX_COVER_TYPES.some(supported => supported === type);
}

export type CodexCoverPair = { cover: Blob; thumbnail: Blob };
