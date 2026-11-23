/// <reference lib="webworker" />
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Web Worker untuk komputasi graf lore — memindahkan `buildLoreGraphView`
 * (scan Aho-Corasick O(n²) + dedup + sort) dari main thread agar UI tetap
 * responsif saat codex ratusan entri.
 *
 * Protokol pesan:
 *   → { type: 'BUILD_GRAPH_VIEW', entries, relationships, promises, requestId }
 *   ← { type: 'GRAPH_VIEW_RESULT', nodes, links, backlinks, requestId }
 */

import { buildLoreGraph, buildLoreGraphView, scanMentions, type LoreGraph, type LoreGraphView } from '@/src/lib/loreGraph';
import type { CodexEntry, Relationship, PlotPromise } from '@/src/types';

export interface LoreGraphWorkerRequest {
  type: 'BUILD_GRAPH_VIEW';
  entries: CodexEntry[];
  relationships: Relationship[];
  promises: PlotPromise[];
  requestId: number;
}

export interface LoreGraphWorkerResponse extends LoreGraphView, Pick<LoreGraph, 'backlinks'> {
  type: 'GRAPH_VIEW_RESULT';
  requestId: number;
}

self.onmessage = (e: MessageEvent<LoreGraphWorkerRequest>) => {
  const { type, entries, relationships, promises, requestId } = e.data;

  if (type === 'BUILD_GRAPH_VIEW') {
    const mentions = scanMentions(entries);
    const view = buildLoreGraphView(entries, relationships, promises, mentions);
    const { backlinks } = buildLoreGraph(entries, relationships, promises, mentions);
    const response: LoreGraphWorkerResponse = {
      type: 'GRAPH_VIEW_RESULT',
      ...view,
      backlinks,
      requestId,
    };
    self.postMessage(response);
  }
};
