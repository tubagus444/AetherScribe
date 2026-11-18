import type { Table, UpdateSpec } from 'dexie';
import { db } from '@/src/db';
import { validateWriteFields } from '@/src/lib/backupValidation';
import { requestId } from '@/src/lib/dataContracts';

export function assertWriteId(value: unknown, label: string): asserts value is number {
  if (!requestId(value)) throw new Error(`${label} tidak valid.`);
}

export async function requireRow<Row, Key>(table: Table<Row, Key>, id: Key): Promise<Row> {
  assertWriteId(id, `ID ${table.name}`);
  const row = await table.get(id);
  if (!row) throw new Error(`Record ${table.name} tidak ditemukan.`);
  return row;
}

export async function requireProjectReference<Row extends { projectId: number }>(
  table: Table<Row, number>, id: number | undefined, projectId: number,
) {
  if (id === undefined) return;
  if ((await requireRow(table, id)).projectId !== projectId) {
    throw new Error(`Referensi ${table.name} berasal dari proyek lain.`);
  }
}

type Owned = { id?: number; projectId: number };
export type CreateInput<Row extends Owned> = Omit<Row, 'id'>;
export type UpdatePatch<Row extends Owned> = Partial<Omit<Row, 'id' | 'projectId'>>;

/** Validasi referensi dan tulis dalam satu transaksi, termasuk jika induk sedang dihapus. */
export async function addOwned<Row extends Owned>(
  table: Table<Row, number>, input: CreateInput<Row>, dependencies: Table[] = [],
  references?: (input: CreateInput<Row>, projectId: number) => Promise<void>,
) {
  validateWriteFields(table.name, input, 'create');
  return db.transaction('rw', [table, db.projects, ...dependencies], async () => {
    await requireRow(db.projects, input.projectId);
    await references?.(input, input.projectId);
    return table.add(input as Row);
  });
}

export async function patchOwned<Row extends Owned>(
  table: Table<Row, number>, id: number, patch: UpdatePatch<Row>, dependencies: Table[] = [],
  references?: (patch: UpdatePatch<Row>, projectId: number) => Promise<void>,
) {
  validateWriteFields(table.name, patch, 'patch');
  return db.transaction('rw', [table, ...dependencies], async () => {
    const row = await requireRow(table, id);
    await references?.(patch, row.projectId);
    // Dexie uses a recursive key-path type. These keys were validated as top-level fields.
    return table.update(id, patch as unknown as UpdateSpec<Row>);
  });
}
