import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/src/db';
import { useChapterList } from '@/src/hooks/useChapterQueries';
import { saveNovelNote } from '@/src/services/novelNotes';
import type { NovelNote } from '@/src/types';

const COLORS = [
  { value: '', label: 'Tanpa warna' },
  { value: '#f59e0b', label: 'Kuning' },
  { value: '#3b82f6', label: 'Biru' },
  { value: '#22c55e', label: 'Hijau' },
  { value: '#ec4899', label: 'Merah muda' },
  { value: '#ef4444', label: 'Merah' },
  { value: '#a855f7', label: 'Ungu' },
];

const fieldClass = 'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950';
const buttonClass = 'rounded-md px-2 py-1.5 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50';

function normalizeTags(input: string) {
  const tags = new Map<string, string>();
  for (const value of input.split(',')) {
    const tag = value.trim();
    if (tag && !tags.has(tag.toLocaleLowerCase())) tags.set(tag.toLocaleLowerCase(), tag);
  }
  return [...tags.values()];
}

export function NovelNotesPanel({ projectId, chapterId }: { projectId: number; chapterId?: number }) {
  const notes = useLiveQuery(() => db.novelNotes.where('projectId').equals(projectId).toArray(), [projectId]);
  const chapters = useChapterList(projectId);
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [chapterFilter, setChapterFilter] = useState('');
  const [archived, setArchived] = useState(false);
  const [draft, setDraft] = useState<NovelNote>();
  const [tagInput, setTagInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sidebar = chapterId !== undefined;
  const chapterTitles = new Map(chapters?.map(chapter => [chapter.id, chapter.title]));
  const matchingStatus = (notes ?? []).filter(note => note.archived === archived).sort((a, b) => b.updatedAt - a.updatedAt);
  const tags = normalizeTags(matchingStatus.flatMap(note => note.tags).join(',')).sort((a, b) => a.localeCompare(b));
  const selectedTags = new Set(normalizeTags(tagInput).map(value => value.toLocaleLowerCase()));
  const availableTags = draft
    ? normalizeTags((notes ?? []).flatMap(note => note.tags).join(','))
      .filter(value => !selectedTags.has(value.toLocaleLowerCase()))
      .sort((a, b) => a.localeCompare(b))
    : [];
  const query = search.trim().toLocaleLowerCase();
  const visible = matchingStatus.filter(note => {
    if (sidebar) return note.chapterIds.includes(chapterId);
    return (!query || [note.title, note.body].some(value => value.toLocaleLowerCase().includes(query)))
      && (!tag || note.tags.some(value => value.toLocaleLowerCase() === tag))
      && (!chapterFilter || (chapterFilter === 'unlinked' ? !note.chapterIds.length : note.chapterIds.includes(Number(chapterFilter))));
  });

  function edit(note?: NovelNote) {
    setError('');
    setTagInput(note?.tags.join(', ') ?? '');
    setDraft(note ?? {
      projectId, title: '', body: '', tags: [], color: '',
      chapterIds: chapterId === undefined ? [] : [chapterId], archived: false, updatedAt: 0,
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy || !chapters) return;
    setBusy(true);
    setError('');
    try {
      const chapterIds = draft.chapterIds.filter(id => chapterTitles.has(id));
      await saveNovelNote({ ...draft, chapterIds, tags: normalizeTags(tagInput) });
      setDraft(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Catatan gagal disimpan.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive(note: NovelNote) {
    if (note.id === undefined || busy) return;
    setBusy(true);
    setError('');
    try {
      const updated = await db.novelNotes.where('projectId').equals(projectId)
        .filter(current => current.id === note.id).modify({ archived: !note.archived });
      if (!updated) throw new Error('Catatan tidak ditemukan.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Arsip gagal diperbarui.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex-1 min-h-0 overflow-y-auto p-4 text-sm text-slate-700 dark:text-slate-200">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{sidebar ? 'Catatan Bab' : 'Catatan Novel'}</h2>
        {!archived && !draft && (
          <button type="button" className={buttonClass} onClick={() => edit()}>
            {sidebar ? '+ Catatan Bab' : '+ Catatan'}
          </button>
        )}
      </div>
      {error && <p role="alert" className="mb-3 text-red-600 dark:text-red-400">{error}</p>}
      {draft && (
        <form onSubmit={save} className="mb-4 space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <fieldset disabled={busy} className="space-y-3">
            <label className="block">Judul (opsional)
              <input autoFocus className={fieldClass} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} />
            </label>
            <label className="block">Isi catatan
              <textarea required rows={4} className={fieldClass} value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} />
            </label>
            <label className="block">Tag (pisahkan dengan koma)
              <input className={fieldClass} value={tagInput} onChange={event => setTagInput(event.target.value)} />
            </label>
            {availableTags.length > 0 && (
              <label className="block">Tambahkan tag yang sudah ada
                <select className={fieldClass} value="" onChange={event => {
                  const value = event.target.value;
                  if (value) setTagInput(current => [...normalizeTags(current), value].join(', '));
                }}>
                  <option value="">Pilih tag</option>
                  {availableTags.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            )}
            <label className="block">Warna
              <select className={fieldClass} value={draft.color} onChange={event => setDraft({ ...draft, color: event.target.value })}>
                {COLORS.map(color => <option key={color.value} value={color.value}>{color.label}</option>)}
              </select>
            </label>
            <fieldset className="space-y-1">
              <legend>Tautan bab</legend>
              <div className="flex flex-wrap gap-1">
                <button type="button" className={buttonClass} disabled={!chapters?.length} onClick={() => setDraft({ ...draft, chapterIds: [...chapterTitles.keys()] })}>Pilih semua bab saat ini</button>
                <button type="button" className={buttonClass} disabled={!draft.chapterIds.length} onClick={() => setDraft({ ...draft, chapterIds: [] })}>Kosongkan</button>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {chapters?.map(chapter => (
                  <label key={chapter.id} className="flex items-start gap-2 py-1">
                    <input type="checkbox" checked={draft.chapterIds.includes(chapter.id)} onChange={event => {
                      const chapterIds = event.target.checked ? [...draft.chapterIds, chapter.id] : draft.chapterIds.filter(id => id !== chapter.id);
                      setDraft({ ...draft, chapterIds });
                    }} />
                    <span>{chapter.title || 'Bab tanpa judul'}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex gap-2">
              <button type="submit" className="rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50" disabled={!draft.body.trim() || !chapters}>Simpan</button>
              <button type="button" className={buttonClass} onClick={() => { setDraft(undefined); setError(''); }}>Batal</button>
            </div>
          </fieldset>
        </form>
      )}
      {!sidebar && (
        <div className="mb-4 flex flex-wrap gap-2">
          <input type="search" aria-label="Cari catatan" placeholder="Cari judul atau isi" className={fieldClass + ' sm:w-auto'} value={search} onChange={event => setSearch(event.target.value)} />
          <select aria-label="Filter tag" className={fieldClass + ' sm:w-auto'} value={tag} onChange={event => setTag(event.target.value)}>
            <option value="">Semua tag</option>
            {tags.map(value => <option key={value} value={value.toLocaleLowerCase()}>{value}</option>)}
          </select>
          <select aria-label="Filter bab" className={fieldClass + ' sm:w-auto'} value={chapterFilter} onChange={event => setChapterFilter(event.target.value)}>
            <option value="">Semua catatan</option>
            <option value="unlinked">Belum ditautkan</option>
            {chapters?.map(chapter => <option key={chapter.id} value={chapter.id}>{chapter.title || 'Bab tanpa judul'}</option>)}
          </select>
          <button type="button" disabled={!!draft || busy} className={buttonClass} aria-pressed={archived} onClick={() => { setArchived(!archived); setTag(''); setError(''); }}>
            {archived ? 'Lihat catatan aktif' : 'Lihat arsip'}
          </button>
        </div>
      )}
      {notes === undefined && <p role="status">Memuat catatan…</p>}
      {notes !== undefined && !visible.length && !draft && <p className="text-slate-500 dark:text-slate-400">Belum ada catatan di daftar ini.</p>}
      <ul className="space-y-2">
        {visible.map(note => (
          <li key={note.id} className="rounded-lg border border-l-4 border-slate-200 p-3 dark:border-slate-700"
            style={{ borderLeftColor: COLORS.find(color => color.value === note.color)?.value || undefined }}>
            {note.title && <h3 className="mb-1 break-words font-semibold">{note.title}</h3>}
            <p className="whitespace-pre-wrap break-words">{note.body}</p>
            {note.tags.length > 0 && <p className="mt-2 break-words text-xs font-medium">{note.tags.join(' · ')}</p>}
            <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">
              {note.chapterIds.map(id => chapterTitles.get(id) || 'Bab tanpa judul').join(' · ') || 'Belum ditautkan'}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {!note.archived && <button type="button" disabled={!!draft || busy} className={buttonClass} onClick={() => edit(note)}>Edit</button>}
              <button type="button" disabled={!!draft || busy} className={buttonClass} onClick={() => void toggleArchive(note)}>
                {note.archived ? 'Pulihkan' : 'Arsipkan'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
