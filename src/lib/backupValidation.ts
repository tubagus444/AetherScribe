import { BACKUP_LIMITS } from './backupLimits';
import { validateImageDataUrl } from './blobCodec';
import { record } from './dataContracts';
import { BACKUP_TABLES, type BackupTableName } from './tableCatalog';
import { detachWorkshopEntry, parseWorkshopEntryKey } from './workshopReference';

type Row = Record<string, any>;
type Check = (value: any, path: string) => void;
const fail = (path: string): never => { throw new Error(`Format cadangan tidak valid: ${path}.`); };
const text: Check = (v, p) => { if (typeof v !== 'string') fail(p); };
const number: Check = (v, p) => { if (typeof v !== 'number' || !Number.isFinite(v)) fail(p); };
const nonnegative: Check = (v, p) => { number(v, p); if (v < 0) fail(p); };
const id: Check = (v, p) => { if (!Number.isSafeInteger(v) || v <= 0) fail(p); };
const bool: Check = (v, p) => { if (typeof v !== 'boolean') fail(p); };
const choice = (...values: unknown[]): Check => (v, p) => { if (!values.includes(v)) fail(p); };
const array = (check: Check): Check => (v, p) => {
  if (!Array.isArray(v) || v.length > BACKUP_LIMITS.recordsPerTable) fail(p);
  for (let i = 0; i < v.length; i++) check(v[i], `${p}[${i}]`);
};
const object = (required: Record<string, Check>, optional: Record<string, Check> = {}) => {
  const check: Check = (v, p) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail(p);
    for (const [key, check] of Object.entries(required)) check(v[key], `${p}.${key}`);
    for (const [key, check] of Object.entries(optional)) if (v[key] !== undefined) check(v[key], `${p}.${key}`);
  };
  return Object.assign(check, { required, optional });
};
const date = object({ era: nonnegative, year: id, month: id, day: id });
const point = object({ x: number, y: number });
const relativePoint: Check = (v, p) => { point(v, p); if (v.x < 0 || v.x > 1 || v.y < 0 || v.y > 1) fail(p); };
const fields = array(object({ key: text, label: text, type: choice('text', 'textarea', 'number', 'select') }, { options: array(text) }));
const calendar = object({
  eras: array(object({ name: text }, { abbr: text })), weekdays: array(text),
  months: array(object({ name: text, days: id })),
  seasons: array(object({ name: text, fromMonth: id, toMonth: id, color: text })),
}, { holidays: array(object({ id: text, name: text, month: id, day: id }, { description: text, color: text })) });

const markerFields = object({ id, projectId: id, mapId: id, kind: choice('pin', 'area', 'route'), createdAt: nonnegative }, {
  codexId: id, title: text, note: text, color: text, linkedMapId: id, meta: object({}, { speedProfileId: text }),
});
const markerGeometry: Check = (v, p) => {
  if (v.kind === 'pin') relativePoint(v.geometry, p);
  else {
    array(relativePoint)(v.geometry, p);
    if (v.geometry.length < (v.kind === 'area' ? 3 : 2)) fail(p);
  }
};
const backupSchemas = {
  projects: object({ id, name: text, description: text, createdAt: nonnegative, lastOpened: nonnegative }, {
    wordGoal: nonnegative, dailyGoal: nonnegative, lastWordCount: nonnegative, lastWordCountDate: text,
    dailyLog: (v, p) => { object({})(v, p); Object.entries(v).forEach(([k, n]) => nonnegative(n, `${p}.${k}`)); },
    calendar, travelSpeeds: array(object({ id: text, name: text, speedPerDay: number, unit: text })),
  }),
  chapters: object({ id, projectId: id, title: text, content: text, order: nonnegative, lastModified: nonnegative }, {
    summary: text, summaryUpdatedAt: nonnegative, summarySourceHash: (v, p) => { if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) fail(p); }, status: choice('outline', 'draft', 'edit', 'polish', 'done'),
    pov: text, wordGoal: nonnegative, tension: choice(1, 2, 3, 4, 5), act: choice('act-1', 'act-2a', 'act-2b', 'act-3', 'unassigned'),
  }),
  codex: object({ id, projectId: id, name: text, category: text, description: text, aliases: array(text), tags: array(text) }, {
    hidden: bool, secret: text, birthDate: date, worldStatus: choice('stub', 'partial', 'solid'), todo: text,
    customFields: array(object({ key: text, label: text, value: text })), factionTag: text, factionBoard: point,
    namePalette: object({ patterns: array(text), onsets: array(text), nuclei: array(text), codas: array(text) }, {
      minSyllables: id, maxSyllables: id, morphemes: array(object({ root: text, meaning: text })),
    }),
  }),
  bible: object({ id, projectId: id, key: text, instruction: text }, { isVirtual: bool }),
  aiActions: object({ id, projectId: id, label: text, prompt: text }, { icon: text }),
  snapshots: object({ id, chapterId: id, content: text, label: text, timestamp: nonnegative }, { auto: bool, orphaned: choice(true) }),
  timeline: object({ id, projectId: id, title: text, description: text, type: choice('plot', 'character', 'world', 'subplot', 'reveal', 'other'), order: nonnegative }, {
    chapterId: id, eventDate: text, characterIds: array(id), startDate: date, endDate: date,
  }),
  relationships: object({ id, projectId: id, sourceId: id, targetId: id, type: text }, { description: text }),
  chatSessions: object({ id, projectId: id, title: text, messages: array(object({ role: choice('user', 'model'), content: text, timestamp: nonnegative }, {
    id: text, isActionable: bool, isWelcome: bool, isError: bool,
  })), lastMessageAt: nonnegative }, {
    chapterId: id, activeChapterId: id, mode: choice('prose-review', 'plot-check', 'brainstorm'), smartAutoEnabled: bool,
    kind: choice('studio', 'scribble', 'workshop'), workshopKey: text,
  }),
  codexCategories: object({ id, projectId: id, slug: text, label: text, icon: text, color: text, order: nonnegative }, { fields }),
  plotPromises: object({ id, projectId: id, title: text, status: choice('open', 'paid', 'abandoned'), createdAt: nonnegative, updatedAt: nonnegative }, {
    description: text, codexId: id, payoffCodexId: id, plantedChapterId: id, keywords: array(text), expectedBy: text, importance: choice('high', 'medium', 'low'),
  }),
  glossary: object({ id, projectId: id, term: text, createdAt: nonnegative, updatedAt: nonnegative }, {
    definition: text, variants: array(text), category: text, strictMatch: bool,
  }),
  maps: object({ id, projectId: id, name: text, width: id, height: id, createdAt: nonnegative }, {
    imageDataUrl: (v) => validateImageDataUrl(v), imageAssetId: (v, p) => { if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) fail(p); },
    imageMissing: bool, scale: object({ distanceUnit: text, ratioToRelative: number }),
  }),
  mapMarkers: Object.assign((v: Row, p: string) => {
    markerFields(v, p);
    markerGeometry(v, `${p}.geometry`);
  }, markerFields),
  continuityTriage: object({ id, projectId: id, findingId: text, status: choice('dismissed', 'acknowledged'), timestamp: nonnegative }),
} satisfies Record<BackupTableName, ReturnType<typeof object>>;
const schemas: Record<string, ReturnType<typeof object>> = backupSchemas;

/** Validasi hanya field yang dikirim oleh patch agar field lama tetap utuh. */
export function validateWriteFields(table: string, row: unknown, mode: 'create' | 'patch', allowed?: readonly string[]) {
  const schema = schemas[table];
  if (!record(row) || !schema) throw new Error(`Masukan ${table} tidak valid.`);
  const keys = new Set(Object.keys(row));
  if (mode === 'create') for (const key of Object.keys(schema.required)) if (key !== 'id') keys.add(key);
  for (const key of keys) {
    if (key === 'id' || (mode === 'patch' && key === 'projectId') || (allowed && !allowed.includes(key))) {
      throw new Error(`Field ${table}.${key} tidak dapat ditulis.`);
    }
    const required = Object.hasOwn(schema.required, key);
    const check = required ? schema.required[key] : Object.hasOwn(schema.optional, key) ? schema.optional[key] : undefined;
    if (!check) throw new Error(`Field ${table}.${key} tidak dikenal.`);
    const value = Object.hasOwn(row, key) ? row[key] : undefined;
    if (!required && value === undefined) continue;
    try { check(value, `${table}.${key}`); }
    catch (cause) { throw new Error(`Nilai ${table}.${key} tidak valid.`, { cause }); }
  }
}

export function validateMarkerGeometry(marker: { kind: import('@/src/types').MapMarker['kind']; geometry: unknown }) {
  try {
    markerFields.required.kind(marker.kind, 'mapMarkers.kind');
    markerGeometry(marker, 'mapMarkers.geometry');
  }
  catch (cause) { throw new Error('Geometri penanda tidak valid.', { cause }); }
}

/** Batasi objek langsung sebelum stringify/clone; hanya nilai JSON, tanpa getter/prototype khusus. */
function validateJsonBudget(value: unknown) {
  let bytes = 0;
  let nodes = 0;
  const seen = new WeakSet<object>();
  const visit = (v: any, depth: number) => {
    if (++nodes > 2_000_000 || depth > BACKUP_LIMITS.depth) fail('struktur terlalu besar/dalam');
    if (typeof v === 'string') {
      if (v.length > BACKUP_LIMITS.stringBytes) fail('ukuran teks melebihi 16 MiB');
      const encoded = new TextEncoder().encode(JSON.stringify(v)).byteLength;
      if (encoded > BACKUP_LIMITS.stringBytes) fail('ukuran teks melebihi 16 MiB');
      bytes += encoded;
    } else if (typeof v === 'number') { number(v, 'angka'); bytes += 24; }
    else if (v && typeof v === 'object') {
      if (seen.has(v)) fail('referensi melingkar');
      seen.add(v);
      if (!Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v))) fail('objek bukan JSON');
      for (const [k, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(v))) {
        if (Array.isArray(v) && k === 'length') continue;
        if (['__proto__', 'constructor', 'prototype'].includes(k) || descriptor.get || descriptor.set) fail('kunci objek tidak aman');
        bytes += k.length * 3 + 4;
        visit(descriptor.value, depth + 1);
      }
      seen.delete(v);
    } else if (v !== null && v !== undefined && typeof v !== 'boolean') fail('nilai bukan JSON');
    if (bytes > BACKUP_LIMITS.jsonBytes) fail('ukuran JSON melebihi 128 MiB');
  };
  visit(value, 0);
}

/** Schema terpusat untuk UI dan kedua boundary service. Tidak memutasi input. */
export function validateBackup(backup: unknown, scope: 'all' | 'project'): asserts backup is Row & { data: Record<string, Row[]> } {
  validateJsonBudget(backup);
  object({ version: number, timestamp: nonnegative, data: object({}) }, {
    scope: choice('all', 'project'), projectName: text, checksum: (v, p) => { if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) fail(p); },
    imageMode: choice('full', 'references'),
  })(backup, 'envelope');
  const b = backup as Row;
  if (!Number.isInteger(b.version) || b.version < 3 || b.version > 8) fail('versi didukung hanya 3–8');
  if (scope === 'all' && b.scope !== undefined && b.scope !== 'all') {
    throw new Error('File ekspor per-novel tidak dapat mengganti workspace. Gunakan “Impor Novel”.');
  }
  if (scope === 'project' && b.scope !== 'project') throw new Error('Ini bukan file ekspor per-novel. Gunakan pemulihan cadangan penuh.');
  if (b.version === 8 && (!b.imageMode || !b.scope)) fail('scope dan imageMode wajib pada v8');
  if (scope === 'project' && b.imageMode === 'references') fail('impor novel membutuhkan gambar lengkap');
  const d = b.data as Record<string, Row[]>;
  if (scope === 'project' && Array.isArray(d.projects) && d.projects.length !== 1) throw new Error('File ini bukan ekspor satu novel.');
  for (const key of Object.keys(d)) if (!Object.prototype.hasOwnProperty.call(schemas, key)) fail(`tabel tidak dikenal ${key}`);
  let count = 0;
  for (const table of BACKUP_TABLES) {
    const rows = d[table];
    if (rows === undefined && (b.version < 8 || scope === 'project') && !['projects', 'chapters', 'codex'].includes(table)) continue;
    array(backupSchemas[table])(rows, table);
    count += rows.length;
    if (count > BACKUP_LIMITS.recordsTotal) fail('jumlah record total');
    const keys = new Set<number>();
    for (const row of rows) { if (keys.has(row.id)) fail(`ID duplikat ${table}`); keys.add(row.id); }
  }
  const index = (table: string) => new Map((d[table] ?? []).map(r => [r.id, r]));
  const projects = index('projects'), chapters = index('chapters'), codex = index('codex'), maps = index('maps');
  const ref = (row: Row, field: string, target: Map<number, Row>, path: string) => {
    if (row[field] === undefined) return;
    const parent = target.get(row[field]);
    if (!parent || (row.projectId !== undefined && parent.projectId !== undefined && row.projectId !== parent.projectId)) fail(`${path}.${field} referensi tidak valid`);
  };
  for (const [table, rows] of Object.entries(d)) for (const row of rows) {
    if (table !== 'projects' && table !== 'snapshots' && !projects.has(row.projectId)) fail(`${table}.projectId referensi tidak valid`);
    const detachedSnapshot = table === 'snapshots' && (row.orphaned === true || !chapters.has(row.chapterId));
    if (detachedSnapshot && scope === 'project') fail('snapshots.chapterId referensi tidak valid');
    if (!detachedSnapshot) ref(row, 'chapterId', chapters, table);
    for (const key of ['activeChapterId', 'plantedChapterId']) ref(row, key, chapters, table);
    for (const key of ['sourceId', 'targetId', 'codexId', 'payoffCodexId']) ref(row, key, codex, table);
    if (table === 'chatSessions') {
      const entryId = parseWorkshopEntryKey(row.workshopKey);
      if (entryId === null) fail('chatSessions.workshopKey referensi tidak valid');
      // Full restore can recover legacy sessions from a deleted entry as Studio chats.
      if (entryId !== undefined && (scope === 'project' || codex.has(entryId))) {
        ref({ projectId: row.projectId, workshopKey: entryId }, 'workshopKey', codex, table);
      }
    }
    for (const key of ['mapId', 'linkedMapId']) ref(row, key, maps, table);
    for (const value of row.characterIds ?? []) ref({ ...row, characterId: value }, 'characterId', codex, table);
    if (table === 'maps') {
      if ('imageBlob' in row) fail('maps.imageBlob tidak dapat diimpor dari JSON');
      if (row.imageMissing && (row.imageDataUrl || row.imageAssetId)) fail('status gambar ambigu');
      if (b.version === 8 && !row.imageMissing) {
        if (!row.imageAssetId || (b.imageMode === 'full' && !row.imageDataUrl) || (b.imageMode === 'references' && row.imageDataUrl)) fail('gambar tidak sesuai imageMode');
      }
    }
  }
  for (const [table, key] of [['bible', 'key'], ['codexCategories', 'slug'], ['continuityTriage', 'findingId']]) {
    const seen = new Set<string>();
    for (const row of d[table] ?? []) {
      const composite = JSON.stringify([row.projectId, row[key]]);
      if (seen.has(composite)) fail(`${table}.${key} duplikat`);
      seen.add(composite);
    }
  }
}

/** Migrasi envelope legacy eksplisit: tabel opsional yang belum ada → array kosong.
 * Jangan ubah objek sebelum checksum asli diverifikasi oleh service.
 */
export function normalizeLegacyData(data: Record<string, any>): Record<string, Row[]> {
  return Object.fromEntries(BACKUP_TABLES.map(table => [table, data[table] ?? []]));
}

export function detachMissingWorkshopEntries(data: Record<string, Row[]>) {
  if (!data.chatSessions.length) return;
  const codexIds = new Set(data.codex.map(row => row.id));
  data.chatSessions = data.chatSessions.map(session => {
    const id = parseWorkshopEntryKey(session.workshopKey);
    if (typeof id !== 'number' || codexIds.has(id)) return session;
    const detached = { ...session };
    detachWorkshopEntry(detached);
    return detached;
  });
}
