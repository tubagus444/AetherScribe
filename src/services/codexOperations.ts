import { db } from '@/src/db';
import { addOwned, patchOwned, requireRow } from './writeIntegrity';
import { validateWriteFields } from '@/src/lib/backupValidation';
import { slugifyFieldKey } from '@/src/lib/codexFields';
import type { CategoryFieldDef, CodexEntry, CustomCategory } from '@/src/types';

export function addCodexEntry(entry: Omit<CodexEntry, 'id'>) {
  return addOwned(db.codex, entry);
}

export function updateCodexEntry(id: number, changes: Partial<Omit<CodexEntry, 'id' | 'projectId'>>) {
  return patchOwned(db.codex, id, changes);
}

export function addCodexEntries(entries: Omit<CodexEntry, 'id'>[]) {
  return db.transaction('rw', db.projects, db.codex, async () => {
    for (const entry of entries) validateWriteFields('codex', entry, 'create');
    for (const projectId of new Set(entries.map(entry => entry.projectId))) await requireRow(db.projects, projectId);
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
