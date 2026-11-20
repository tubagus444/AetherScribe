import type { StoryBibleRule, CodexEntry, ContextDepth, Relationship } from '@/src/types';
import { getRelevantContext, getRelevantBibleRules } from '@/src/services/contextEngine';
import { formatBibleBlock } from '@/src/lib/storyBible';
import { formatFieldsForAI } from '@/src/lib/codexFields';
import { buildCodexLoreString, buildRelationshipGraph } from '@/src/lib/loreFormat';
import { getMaxCachedLoreChars } from '@/src/lib/aiTuning';
import { createCodexDetailFormatter, hasSharedDetailHistory, type CodexDetailScope } from '@/src/lib/codexDetails';
import { readChapterList } from '@/src/services/chapterQueries';

type FormatDetails = ReturnType<typeof createCodexDetailFormatter>;

const CACHE_SUPPORTED_PROVIDERS = ['google', 'claude', 'openrouter'];

export function isCacheSupported(provider: string): boolean {
  return CACHE_SUPPORTED_PROVIDERS.includes(provider.toLowerCase());
}

// Perkiraan jendela konteks (token) per provider — dipakai meter konteks sebagai
// denominator headroom. Nilai konservatif; model spesifik bisa berbeda, tapi cukup
// sebagai indikator visual "seberapa penuh konteks".
const PROVIDER_CONTEXT_WINDOW: Record<string, number> = {
  google: 2_000_000,
  claude: 200_000,
  openrouter: 128_000,
  openai: 128_000,
  groq: 128_000,
  huggingface: 128_000,
  ollama: 8_192,
};

export function getContextWindow(provider: string): number {
  return PROVIDER_CONTEXT_WINDOW[provider?.toLowerCase()] ?? 8_192;
}

/**
 * Mode caching: Story Bible + Codex diurutkan deterministik menjadi SEGMEN ber-tier
 * (stabil→volatil) agar system prompt statis & cache-able. Segmen 0 = Story Bible
 * (jarang berubah), segmen 1 = Codex lore + relationship graph (sering diedit). Proxy
 * memberi tiap segmen cache breakpoint sendiri sehingga edit satu entri Codex hanya
 * membatalkan segmen volatil; prefix Bible tetap hit (#P3). Join('\n\n') memulihkan blok
 * tunggal lama (dipakai jalur non-caching). Segmen stabil untuk cakupan detail yang sama.
 */
export function buildCachedContextSegments(bibleRules: StoryBibleRule[], codexEntries: CodexEntry[], relationships: Relationship[] = [], formatDetails?: FormatDetails): string[] {
  const sortedRules = [...bibleRules].sort((a, b) => a.key.localeCompare(b.key));
  const sortedCodex = [...codexEntries].sort((a, b) => a.name.localeCompare(b.name));

  const bibleString = formatBibleBlock(sortedRules) || 'No specific rules set.';
  // Format lore (entri `hidden` & `secret` TETAP diumpankan agar AI menangkap
  // kontradiksi/kebocoran) lewat SUMBER TUNGGAL `buildCodexLoreString` — dibagi dengan
  // meter token di contextWorker agar tak drift. Cap dipotong pada BATAS ENTRI.
  const lore = buildCodexLoreString(sortedCodex, getMaxCachedLoreChars(), formatDetails);
  if (lore.truncated) {
    // Dulu `.substring()` memangkas senyap di tengah entri → entri huruf-akhir & blok
    // [RAHASIA…] hilang tanpa jejak. Kini potong di batas entri + peringatkan.
    console.warn(
      `[AI] KB lore terpotong: ${lore.includedCount}/${lore.totalCount} entri Codex termuat ` +
      `(cap ${getMaxCachedLoreChars()} char). Naikkan "cap lore cache" di Pengaturan → Optimasi AI Lanjutan.`
    );
  }
  const loreString = lore.text || 'No specific lore.';
  const graphString = buildRelationshipGraph(relationships, codexEntries);

  return [
    `STORY BIBLE:\n${bibleString}`,
    `CODEX LORE:\n${loreString}${graphString}`,
  ];
}

export function buildContextBlock(rules: StoryBibleRule[], codex: CodexEntry[], relationships: Relationship[] = [], depth: ContextDepth = 'balanced', formatDetails?: FormatDetails): string {
  // If depth is minimal, we only include the most core rules and no lore
  if (depth === 'minimal') {
    // Premis + Tema mengarahkan AI jauh lebih kuat daripada Judul; Judul sengaja
    // TIDAK disertakan di mode minimal (nyaris tak berguna untuk generasi).
    const coreKeys = ['__CORE_PREMISE__', '__GENRES__', '__TONES__', '__POV__', '__THEMES__'];
    const bible = formatBibleBlock(rules.filter(r => coreKeys.includes(r.key)));

    return bible ? `CORE RULES:\n${bible}` : '';
  }

  const bible = formatBibleBlock(rules) || 'No specific rules set.';

  let lore = 'No specific lore relevant to this passage.';
  let graph = '';

  if (codex.length > 0) {
    // Limits based on depth
    const MAX_LORE_CHARS = depth === 'deep' ? 4000 : 2500;
    const itemLimit = depth === 'deep' ? 1000 : 500; // Deep gets more detail per entry
    const subLimit = depth === 'deep' ? 300 : 150;

    let currentChars = 0;
    const loreParts: string[] = [];
    const includedCodexIds = new Set<number>();

    codex.forEach((e, index) => {
      if (currentChars >= MAX_LORE_CHARS) return;
      if (e.id) includedCodexIds.add(e.id);

      const limit = index < 3 ? itemLimit : subLimit;
      let desc = e.description.trim();
      if (desc.length > limit) {
        desc = desc.substring(0, limit) + '...';
      }

      let formattedEntry = `[${e.name}]: ${desc}`;
      // Template field per kategori (#17) — ringkas (satu baris) dalam anggaran karakter.
      const fields = formatFieldsForAI(e);
      if (fields) formattedEntry += ` {${fields.replace(/\n/g, '; ').substring(0, subLimit)}}`;
      const details = formatDetails?.(e);
      if (details) formattedEntry += ` {${details.replace(/\n/g, '; ').substring(0, subLimit)}}`;
      // Kebenaran penulis (lihat buildCachedContextSegments) — ikut di jalur RAG legacy.
      if (e.secret?.trim()) formattedEntry += ` [RAHASIA PENULIS: ${e.secret.trim().substring(0, subLimit)}]`;

      if (currentChars + formattedEntry.length <= MAX_LORE_CHARS) {
        loreParts.push(formattedEntry);
        currentChars += formattedEntry.length + 1;
      }
    });

    if (loreParts.length > 0) {
      lore = loreParts.join('\n');
    }

    // Build Relationship Graph (Graph-RAG format), hanya relasi yang menyentuh codex relevan.
    if (relationships && relationships.length > 0) {
      const activeRelations = relationships.filter(r =>
        includedCodexIds.has(r.sourceId) || includedCodexIds.has(r.targetId)
      );
      graph = buildRelationshipGraph(activeRelations, codex);
    }
  }

  let block = `STORY BIBLE:\n${bible}\n\nCODEX LORE:\n${lore}${graph}`;
  return block;
}

export async function resolveContextBuilder(
  useCaching: boolean,
  depth: ContextDepth,
  rules: StoryBibleRule[],
  codex: CodexEntry[],
  rels: Relationship[],
  ragTargetText?: string,
  detailScope?: CodexDetailScope,
): Promise<{ cachedContext?: string[]; contextBlock?: string }> {
  const projects = new Set(codex.filter(hasSharedDetailHistory).map(entry => entry.projectId));
  const chapters = (await Promise.all([...projects].map(projectId => readChapterList(projectId)))).flat();
  const formatDetails = createCodexDetailFormatter(chapters, detailScope);
  if (useCaching) {
    return { cachedContext: buildCachedContextSegments(rules, codex, rels, formatDetails) };
  } else {
    if (ragTargetText) {
      const matches = await getRelevantContext(ragTargetText, codex);
      const currentEntries = new Map(codex.map(entry => [entry.id, entry]));
      // Worker and search matches can lag edits. Format current values and AI permissions.
      const relevantCodex = matches.flatMap(match => {
        const current = currentEntries.get(match.id);
        return current?.projectId === match.projectId ? [current] : [];
      });
      const relevantRules = await getRelevantBibleRules(ragTargetText, rules);
      return { contextBlock: buildContextBlock(relevantRules, relevantCodex, rels, depth, formatDetails) };
    } else {
      const kbSegments = buildCachedContextSegments(rules, codex, rels, formatDetails);
      return { contextBlock: kbSegments.join('\n\n') };
    }
  }
}
