import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/src/db';
import type { CodexCoverImage } from '@/src/types';

export function useCodexCover(codexId: number | null | undefined, kind: CodexCoverImage['kind']) {
  return useLiveQuery(async () => {
    if (codexId == null) return null;
    return (await db.codexCovers.get({ codexId, kind }))?.imageBlob ?? null;
  }, [codexId, kind]);
}

export function useCoverUrl(blob: Blob | null | undefined) {
  const [preview, setPreview] = useState<{ blob: Blob; url: string }>();
  useEffect(() => {
    if (!blob) { setPreview(undefined); return; }
    const url = URL.createObjectURL(blob);
    setPreview({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return preview && preview.blob === blob ? preview.url : undefined;
}
