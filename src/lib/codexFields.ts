/**
 * Template field per kategori Codex (#17) — logika murni, tak menyentuh DB/UI.
 *
 * Skema field (definisi) hidup di `CustomCategory.fields` (tabel `codexCategories`);
 * NILAI-nya di `CodexEntry.customFields` sebagai array TER-DENORMALISASI
 * (`{ key, label, value }`). Denormalisasi label saat simpan membuat SEMUA jalur baca
 * (KB AI, ekspor Markdown, detail/kartu) self-contained — tak perlu resolusi kategori,
 * jadi tak ada penerusan kategori ke jalur AI (jaga cache prompt byte-identik).
 *
 * Nilai di luar templat aktif dipertahankan sampai penulis menghapusnya dari entri.
 */
import type { CodexEntry, CategoryFieldDef, CustomFieldValue } from '@/src/types';
import { slugify } from '@/src/lib/codexCategories';

/** Buat key field unik & stabil dari label, terhadap key yang sudah ada di kategori. */
export function slugifyFieldKey(label: string, existingKeys: string[]): string {
  const base = slugify(label) || 'field';
  if (!existingKeys.includes(base)) return base;
  let i = 2;
  while (existingKeys.includes(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/** Nilai field non-kosong pada entri, mempertahankan urutan tersimpan. */
export function resolveFieldValues(entry: Pick<CodexEntry, 'customFields'>): CustomFieldValue[] {
  return (entry.customFields ?? []).filter(
    (f) => f && typeof f.value === 'string' && f.value.trim() !== ''
  );
}

/** Peta key→value dari entri, untuk inisialisasi input di CodexForm. */
export function fieldValueMap(
  entry?: Pick<CodexEntry, 'customFields'> | null
): Record<string, string> {
  const map: Record<string, string> = Object.create(null);
  for (const f of entry?.customFields ?? []) {
    if (f && typeof f.key === 'string') map[f.key] = f.value ?? '';
  }
  return map;
}

/**
 * Bangun array nilai ter-denormalisasi dari definisi kategori + peta nilai (dipakai
 * CodexForm saat simpan). Hanya field ber-nilai non-kosong yang disertakan; urutan
 * mengikuti urutan `defs` agar deterministik.
 */
export function buildFieldValues(
  defs: CategoryFieldDef[] | undefined,
  values: Record<string, string>,
  retained: CustomFieldValue[] = [],
): CustomFieldValue[] {
  const definitions = defs ?? [];
  const out: CustomFieldValue[] = [];
  for (const d of definitions) {
    const value = Object.hasOwn(values, d.key) ? values[d.key]?.trim() : undefined;
    if (value) out.push({ key: d.key, label: d.label, value });
  }
  // Cadangkan semua kunci templat, termasuk input kosong, agar nilai lama
  // tidak dianggap sebagai nilai kolom aktif saat entri dibuka kembali.
  const usedKeys = new Set(definitions.map(def => def.key));
  const retainedKeys = retained.map(field => field.key);
  for (const field of retained) {
    const key = usedKeys.has(field.key)
      ? slugifyFieldKey(field.key, [...usedKeys, ...retainedKeys])
      : field.key;
    usedKeys.add(key);
    out.push({ key, label: field.label, value: field.value });
  }
  return out;
}

/**
 * Baris `Label: nilai` deterministik untuk KB AI. Self-contained (membaca entri saja).
 * String kosong bila tak ada field — pemanggil memutuskan cara menempel.
 */
export function formatFieldsForAI(entry: Pick<CodexEntry, 'customFields'>): string {
  const vals = resolveFieldValues(entry);
  if (!vals.length) return '';
  return vals.map((f) => `${f.label}: ${f.value}`).join('\n');
}

/** Blok Markdown (definition-list) untuk ekspor Codex. Kosong bila tak ada field. */
export function formatFieldsForMarkdown(entry: Pick<CodexEntry, 'customFields'>): string {
  const vals = resolveFieldValues(entry);
  if (!vals.length) return '';
  return vals.map((f) => `- **${f.label}:** ${f.value}`).join('\n');
}
