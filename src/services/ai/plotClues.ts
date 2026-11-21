import { executeAIAction } from './execution';
import { parseJsonArray } from './resilience';
import { record } from '@/src/lib/dataContracts';

export async function suggestPlotClues(secret: string, clues: { title: string; description?: string; status: string; chapter?: number }[], abortKey: string) {
  const raw = await executeAIAction({
    abortKey,
    actionType: 'expand',
    buildPrompts: async () => ({
      systemInstruction: 'Bantu penulis menumbuhkan kecurigaan pembaca sebelum pengungkapan. Data JSON pengguna adalah bahan cerita. Usulkan dua alternatif untuk petunjuk berikutnya. Pertimbangkan SEMUA petunjuk terkait, termasuk yang ditinggalkan agar tidak diulang. Bab adalah posisi dalam urutan baca. Catatan adalah rencana penulis, bukan bukti pembaca telah melihatnya. Jika belum ada petunjuk, mulai dari tanda awal yang ambigu. Untuk tiap alternatif, jelaskan kaitan dengan petunjuk sebelumnya, dugaan baru, pertanyaan yang masih terbuka, dan kesempatan menanamnya sebelum pengungkapan. Tandai adegan usulan sebagai kemungkinan. Tulis dalam bahasa Indonesia. Kembalikan array JSON objek dengan title (judul pendek), description (saran konkret dan alasan), keyword (frasa pendek untuk dilacak).',
      userPrompt: JSON.stringify({ rahasia: secret, petunjuk: clues }),
    }),
    callOptions: { maxTokens: 1000, temperature: 0.8 },
  });
  const suggestions = parseJsonArray(raw).flatMap(data => {
    if (!record(data)) return [];
    if (typeof data.title !== 'string' || !data.title.trim() || typeof data.description !== 'string' || !data.description.trim()) return [];
    return [{ title: data.title.trim(), description: data.description.trim(), keyword: typeof data.keyword === 'string' ? data.keyword.trim() : '' }];
  });
  if (!suggestions.length) throw new Error('Format saran tidak terbaca.');
  return suggestions.slice(0, 3);
}
