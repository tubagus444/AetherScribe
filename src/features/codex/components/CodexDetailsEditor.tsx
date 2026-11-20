import { Plus, Trash2 } from 'lucide-react';
import type { CodexDetail } from '@/src/types';
import { readDetailHistory, type DetailChapterIndex } from '@/src/lib/codexDetails';

const control = 'w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
const newId = () => crypto.randomUUID?.() ?? crypto.getRandomValues(new Uint32Array(4)).join('-');

interface Props {
  details: CodexDetail[];
  chapters: DetailChapterIndex;
  onChange: (details: CodexDetail[]) => void;
}

export function CodexDetailsEditor({ details, chapters, onChange }: Props) {
  const update = (detail: CodexDetail) => onChange(details.map(item => item.id === detail.id ? detail : item));

  return (
    <section className="space-y-3" aria-label="Detail tambahan">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Detail tambahan</h4>
        <button
          type="button"
          onClick={() => onChange([...details, { id: newId(), label: '', value: '', includeInAI: false }])}
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950"
        >
          <Plus size={16} /> Tambah detail
        </button>
      </div>
      {details.map((detail, index) => {
        const revisions = detail.revisions ?? [];
        const usedChapters = new Set(revisions.map(revision => revision.chapterId));
        const availableChapters = [...chapters.values()].filter(chapter => !usedChapters.has(chapter.id));
        return (
          <fieldset key={detail.id} className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <legend className="px-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Detail {index + 1}</legend>
            <div className="flex items-end gap-2">
              <label className="min-w-0 flex-1 space-y-1 text-xs font-medium">
                <span>Nama detail</span>
                <input className={control} value={detail.label} placeholder="Misalnya Kemampuan atau Kondisi" onChange={event => update({ ...detail, label: event.target.value })} />
              </label>
              <button type="button" aria-label={`Hapus detail ${index + 1}`} onClick={() => onChange(details.filter(item => item.id !== detail.id))} className="rounded-lg p-2.5 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950">
                <Trash2 size={16} />
              </button>
            </div>
            <label className="block space-y-1 text-xs font-medium">
              <span>{detail.revisions ? 'Nilai awal' : 'Nilai detail'}</span>
              <textarea className={control} rows={2} value={detail.value} onChange={event => update({ ...detail, value: event.target.value })} />
            </label>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={detail.includeInAI} onChange={event => update({ ...detail, includeInAI: event.target.checked })} />
                Sertakan dalam konteks AI
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={detail.revisions !== undefined} disabled={revisions.length > 0} onChange={event => update({ ...detail, revisions: event.target.checked ? [] : undefined })} />
                Aktifkan riwayat per bab
              </label>
            </div>
            {detail.revisions && (
              <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                {readDetailHistory(detail, chapters).map(revision => (
                  <div key={revision.id} className="space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/40">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 break-words text-xs font-semibold">
                        {revision.chapter ? `Bab ${revision.chapter.position + 1} · ${revision.chapter.title}` : `${revision.detachedChapterTitle || 'Bab'} (terhapus)`}
                      </span>
                      <button type="button" aria-label="Hapus catatan bab" className="shrink-0 rounded p-1.5 text-slate-500 hover:text-red-600" onClick={() => update({ ...detail, revisions: revisions.filter(item => item.id !== revision.id) })}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <textarea aria-label={`Catatan ${revision.chapter?.title ?? revision.detachedChapterTitle ?? 'bab'}`} className={control} rows={2} value={revision.value} onChange={event => update({
                      ...detail,
                      revisions: revisions.map(item => item.id === revision.id ? { ...item, value: event.target.value } : item),
                    })} />
                  </div>
                ))}
                {availableChapters.length > 0 ? (
                  <select
                    aria-label="Tambah catatan bab"
                    className={control}
                    value=""
                    onChange={event => {
                      const chapterId = Number(event.target.value);
                      if (chapterId > 0) update({ ...detail, revisions: [...revisions, { id: newId(), chapterId, value: '' }] });
                    }}
                  >
                    <option value="">Tambah catatan bab…</option>
                    {availableChapters.map(chapter => <option key={chapter.id} value={chapter.id}>Bab {chapter.position + 1} · {chapter.title}</option>)}
                  </select>
                ) : chapters.size === 0 && <p className="text-xs text-slate-500">Tambahkan bab untuk mulai mencatat riwayat.</p>}
              </div>
            )}
          </fieldset>
        );
      })}
    </section>
  );
}
