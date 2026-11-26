/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodexEntry, StoryBibleRule } from '@/src/types';

// L2: tanda baca kalimat/penutup yang tidak boleh ikut tersedot ke akhir token
// mention (mis. "@codex:Kael." → nama "Kael", titik tetap di luar). Apostrof &
// hubung SENGAJA tidak termasuk agar nama seperti "Kael'thas" / "Anne-Marie" utuh.
const TRAILING_MENTION_PUNCT = /[.,;:!?)\]}"]+$/;

/** Pisahkan token mention menjadi inti + tanda baca akhir yang menempel. */
function splitTrailingPunct(token: string): { core: string; trail: string } {
  const m = token.match(TRAILING_MENTION_PUNCT);
  if (!m) return { core: token, trail: '' };
  return { core: token.slice(0, token.length - m[0].length), trail: m[0] };
}

export function formatCodexLore(entry: CodexEntry): string {
  let description = entry.description;
  if (description.length > 150) {
    description = description.substring(0, 150);
    const lastSpace = description.lastIndexOf(' ');
    if (lastSpace > 0) description = description.substring(0, lastSpace);
    description += '...';
  }
  return `[Lore - ${entry.name}: ${description}]`;
}

/**
 * Resolves lore tags like @rule:key and @codex:name into more descriptive
 * text that the AI can understand better.
 */
export function resolveLoreTags(
  input: string, 
  codexEntries: CodexEntry[] = [], 
  bibleRules: StoryBibleRule[] = []
): string {
  let resolved = input;
  
  // Resolve rules: @rule:key
  // Matches @rule: followed by non-whitespace characters (tanda baca akhir dilepas — L2)
  resolved = resolved.replace(/@rule:(\S+)/g, (match, raw) => {
    const { core: key, trail } = splitTrailingPunct(raw);
    const rule = bibleRules.find(r => r.key === key);
    return rule ? `[Rule - ${key}: ${rule.instruction}]${trail}` : match;
  });

  // Resolve codex: @codex:name
  // Matches @codex: followed by non-whitespace characters (tanda baca akhir dilepas — L2)
  resolved = resolved.replace(/@codex:(\S+)/g, (match, raw) => {
    const { core: name, trail } = splitTrailingPunct(raw);
    // Replace underscores with spaces for matching if users type @codex:Character_Name
    const searchName = name.replace(/_/g, ' ');
    const lowerSearch = searchName.toLowerCase();
    
    const entry = codexEntries.find(e => 
      e.name.toLowerCase() === lowerSearch || 
      e.name === name ||
      (e.aliases && e.aliases.some(alias => alias.toLowerCase() === lowerSearch || alias.replace(/_/g, ' ').toLowerCase() === lowerSearch))
    );

    return entry ? formatCodexLore(entry) + trail : match;
  });

  return resolved;
}

/**
 * Versi ringan: ganti tag mention jadi nama polos saja (tanpa mengekspansi deskripsi
 * lore). Dipakai untuk riwayat percakapan yang dikirim ke AI — lore lengkap sudah
 * ada di system prompt, jadi cukup nama agar model paham acuan tanpa membengkakkan token.
 */
export function stripLoreTags(input: string): string {
  const toName = (_m: string, raw: string) => {
    const { core, trail } = splitTrailingPunct(raw);
    return core.replace(/_/g, ' ') + trail;
  };
  return input
    .replace(/@rule:(\S+)/g, toName)
    .replace(/@codex:(\S+)/g, toName);
}

export interface MentionSegment {
  text: string;
  isMention: boolean;
  type?: 'codex' | 'rule' | 'chapter';
  value?: string;
  original?: string;
}

/**
 * Parses a string into segments of text and mentions for visual rendering.
 */
export function parseMentionTags(input: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  // Regex to match @rule:key, @codex:name, @chapter-excerpt, @chapter-summary
  const mentionRegex = /@(codex|rule):(\S+)|@(chapter-excerpt|chapter-summary)/g;
  
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(input)) !== null) {
    // Add text before the mention
    if (match.index > lastIndex) {
      segments.push({
        text: input.substring(lastIndex, match.index),
        isMention: false
      });
    }

    // Add the mention segment
    if (match[3]) {
      segments.push({
        text: match[3],
        isMention: true,
        type: 'chapter',
        value: match[3],
        original: match[0]
      });
    } else {
      // Lepas tanda baca akhir dari token agar tak ikut ke chip mention (L2).
      const { core, trail } = splitTrailingPunct(match[2]);
      segments.push({
        text: core.replace(/_/g, ' '), // Display name (replacing underscores)
        isMention: true,
        type: match[1] as 'codex' | 'rule',
        value: core,
        original: `@${match[1]}:${core}`
      });
      if (trail) {
        segments.push({ text: trail, isMention: false });
      }
    }

    lastIndex = mentionRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < input.length) {
    segments.push({
      text: input.substring(lastIndex),
      isMention: false
    });
  }

  return segments;
}
