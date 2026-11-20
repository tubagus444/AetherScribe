import { db } from '@/src/db';
import { addOwned, patchOwned, requireRow } from './writeIntegrity';
import { validateWriteFields } from '@/src/lib/backupValidation';
import { slugifyFieldKey } from '@/src/lib/codexFields';
import type { CategoryFieldDef, CodexEntry, CustomCategory } from '@/src/types';
import { CODEX_COVER_BYTES, isCodexCoverType, type CodexCoverPair } from '@/src/lib/codexCoverLimits';

async function validateDetailChapters({ details }: Pick<CodexEntry, 'details'>, projectId: number) {
  const ids = new Set<number>();
  for (const detail of details ?? []) for (const revision of detail.revisions ?? []) {
    if (revision.chapterId !== undefined) ids.add(revision.chapterId);
  }
  if (!ids.size) return;
  const chapters = await db.chapters.bulkGet([...ids]);
  if (chapters.some(chapter => chapter?.projectId !== projectId)) {
    throw new Error('Bab pada riwayat detail harus tersedia di novel ini. Periksa kembali pilihan bab.');
  }
}

async function saveCover(projectId: number, codexId: number, pair: CodexCoverPair | null) {
  await db.codexCovers.where('codexId').equals(codexId).delete();
  if (!pair) return;
  await db.codexCovers.bulkAdd((['cover', 'thumbnail'] as const).map(kind => {
    const imageBlob = pair[kind];
    if (!(imageBlob instanceof Blob) || !imageBlob.size || imageBlob.size > CODEX_COVER_BYTES[kind] || !isCodexCoverType(imageBlob.type)) {
      throw new Error('Gambar sampul tidak valid atau melebihi batas penyimpanan.');
    }
    return { projectId, codexId, kind, imageBlob };
  }));
}

export function addCodexEntry(entry: Omit<CodexEntry, 'id'>, cover?: CodexCoverPair | null) {
  const dependencies = entry.details ? [db.chapters] : [];
  const add = () => addOwned(db.codex, entry, dependencies, validateDetailChapters);
  if (!cover) return add();
  return db.transaction('rw', [db.codex, db.projects, db.codexCovers, ...dependencies], async () => {
    const id = await add();
    await saveCover(entry.projectId, id, cover);
    return id;
  });
}

export function updateCodexEntry(id: number, changes: Partial<Omit<CodexEntry, 'id' | 'projectId'>>, cover?: CodexCoverPair | null) {
  const dependencies = changes.details ? [db.chapters] : [];
  const patch = () => patchOwned(db.codex, id, changes, dependencies, validateDetailChapters);
  if (cover === undefined) return patch();
  return db.transaction('rw', [db.codex, db.codexCovers, ...dependencies], async () => {
    const entry = await requireRow(db.codex, id);
    const updated = await patch();
    await saveCover(entry.projectId, id, cover);
    return updated;
  });
}

export function addCodexEntries(entries: Omit<CodexEntry, 'id'>[]) {
  return db.transaction('rw', db.projects, db.codex, db.chapters, async () => {
    for (const entry of entries) validateWriteFields('codex', entry, 'create');
    for (const projectId of new Set(entries.map(entry => entry.projectId))) await requireRow(db.projects, projectId);
    for (const entry of entries) await validateDetailChapters(entry, entry.projectId);
    return db.codex.bulkAdd(entries);
  });
}

export async function addCodexAlias(id: number, alias: string) {
  return db.transaction('rw', db.codex, async () => {
    const entry = await db.codex.get(id);
    if (!entry) throw new Error('Entri tidak ditemukan.');
    const aliases = entry.aliases ?? [];
    if (aliases.some(value => value.toLowerCase() === alias.toLowerCase())) return false;
    await updateCodexEntry(id, { aliases: [...aliases, alias] });
    return true;
  });
}

export async function setCodexTag(id: number, tag: string, enabled: boolean) {
  await db.transaction('rw', db.codex, async () => {
    const entry = await db.codex.get(id);
    if (!entry) return;
    const tags = entry.tags ?? [];
    const existing = tags.filter(value => value.trim() !== tag);
    if ((existing.length !== tags.length) === enabled) return;
    await updateCodexEntry(id, { tags: enabled ? [...tags, tag] : existing });
  });
}

export function addCodexCategory(category: Omit<CustomCategory, 'id' | 'order'>) {
  validateWriteFields('codexCategories', { ...category, order: 0 }, 'create');
  return db.transaction('rw', db.projects, db.codexCategories, async () => {
    await requireRow(db.projects, category.projectId);
    const categories = await db.codexCategories.where('projectId').equals(category.projectId).toArray();
    const order = categories.reduce((max, row) => Math.max(max, row.order ?? 0), 0) + 1;
    return db.codexCategories.add({ ...category, order });
  });
}

export function addCategoryField(categoryId: number, field: Omit<CategoryFieldDef, 'key'>) {
  return db.transaction('rw', db.codexCategories, async () => {
    const category = await db.codexCategories.get(categoryId);
    if (!category) throw new Error('Kategori tidak ditemukan.');
    const fields = category.fields ?? [];
    const key = slugifyFieldKey(field.label, fields.map(existing => existing.key));
    const nextField = { ...field, key };
    validateWriteFields('codexCategories', { fields: [nextField] }, 'patch');
    await db.codexCategories.update(categoryId, { fields: [...fields, nextField] });
  });
}

export function removeCategoryField(categoryId: number, key: string) {
  return db.transaction('rw', db.codexCategories, async () => {
    const category = await db.codexCategories.get(categoryId);
    if (!category) throw new Error('Kategori tidak ditemukan.');
    await db.codexCategories.update(categoryId, { fields: (category.fields ?? []).filter(field => field.key !== key) });
  });
}

export async function deleteCodexCategory(projectId: number, categoryId: number, slug: string) {
  await db.transaction('rw', db.codex, db.codexCategories, async () => {
    const category = await requireRow(db.codexCategories, categoryId);
    if (category.projectId !== projectId || category.slug !== slug) throw new Error('Kategori tidak ditemukan dalam proyek ini.');
    await db.codex.where({ projectId, category: slug }).modify({ category: 'other' });
    await db.codexCategories.delete(categoryId);
  });
}
