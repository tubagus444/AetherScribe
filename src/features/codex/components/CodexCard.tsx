import React from 'react';
import { BookOpen, Tag, Link2, Edit2, Trash2, EyeOff } from 'lucide-react';
import { CodexEntry, Relationship } from '@/src/types';
import { CategoryIcon } from '@/src/features/codex/components/CategoryIcon';
import { getCategoryLabel, getCategoryAccent, type CategoryDef } from '@/src/lib/codexCategories';
import { resolveFieldValues } from '@/src/lib/codexFields';
import { effectiveStatus } from '@/src/lib/worldCompleteness';
import { WorldStatusBadge } from '@/src/features/codex/components/WorldStatusBadge';
import { readCurrentDetail, readDetailHistory, type DetailChapterIndex } from '@/src/lib/codexDetails';
import { useCodexCover, useCoverUrl } from '@/src/features/codex/hooks/useCodexCover';

interface CodexCardProps {
  entry: CodexEntry;
  relationships: Relationship[];
  categories?: CategoryDef[];
  detailChapters: DetailChapterIndex;
  onEdit: (entry: CodexEntry) => void;
  onDelete: (id: number) => void;
  onSelect: (entry: CodexEntry, openAppearances?: boolean) => void;
}

const metadataPreviewLimit = 3;

// Dimemo-kan: di daftar virtual, kartu terus mount/unmount saat scroll — memo
// mencegah render ulang kartu yang props-nya tak berubah (mis. saat mengetik di
// kotak cari). Deskripsi sengaja dirender sebagai teks polos, BUKAN
// LinkifiedDescription: linkifikasi membangun RegExp per nama+alias atas SELURUH
// codex di tiap kartu → O(N²) yang membuat scroll tersendat pada codex besar.
// Tooltip entitas tetap tersedia di CodexDetailModal (satu entri, biaya nol).
function CodexCardImpl({
  entry,
  relationships,
  categories,
  detailChapters,
  onEdit,
  onDelete,
  onSelect,
}: CodexCardProps) {
  const thumbnail = useCoverUrl(useCodexCover(entry.id, 'thumbnail'));
  const accent = getCategoryAccent(entry.category, categories);
  const relCount = relationships.filter(r => r.sourceId === entry.id || r.targetId === entry.id).length;
  // Template field per kategori (#17): tampilkan ringkas maksimal 2 field kunci.
  const keyFields = resolveFieldValues(entry).slice(0, 2);
  const previewDetails = (entry.details ?? []).flatMap(detail => {
    const current = readCurrentDetail(detail, readDetailHistory(detail, detailChapters));
    return current.value.trim() ? [{ key: detail.id, label: detail.label, value: current.value }] : [];
  }).slice(0, 2);
  // Kelengkapan worldbuilding (#11): status kematangan (badge kecil).
  const status = effectiveStatus(entry);
  const aliases = entry.aliases ?? [];
  const tags = entry.tags ?? [];

  return (
    <article
      onClick={() => onSelect(entry)}
      className="group h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 pl-7 hover:shadow-xl hover:border-indigo-200 dark:hover:border-indigo-800 transition-all relative flex flex-col col-span-1 cursor-pointer overflow-hidden"
    >
      {/* #3 Aksen warna kategori (garis kiri) untuk pemindaian cepat */}
      <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${accent.bar}`} aria-hidden />

      <div className="flex flex-col h-full">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl ${accent.iconBg}`}>
              {thumbnail ? <img src={thumbnail} alt={`Sampul ${entry.name}`} className="size-full object-cover" /> : <CategoryIcon category={entry.category} categories={categories} />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base truncate">{entry.name}</h3>
                {entry.hidden && (
                  <span title="Rahasia penulis — disembunyikan dari pembaca" className="shrink-0 text-purple-500 dark:text-purple-400">
                    <EyeOff size={13} />
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                <span className="line-clamp-2 min-w-0 break-words text-[10px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
                  {getCategoryLabel(entry.category, categories)}
                </span>
                <WorldStatusBadge status={status.status} suggested={status.suggested} size="sm" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 transition-opacity pointer-fine:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(entry); }}
              className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 rounded-lg transition-all"
              title="Ubah Entri"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(entry.id!); }}
              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/50 rounded-lg transition-all"
              title="Hapus Entri"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 border-t border-slate-100 dark:border-slate-800/60 pt-4">
          <div className="text-sm text-slate-600 dark:text-slate-400 line-clamp-4 leading-relaxed font-serif whitespace-pre-wrap break-words">
            {entry.description ? (
              entry.description
            ) : (
              <span className="italic opacity-60">Deskripsi belum diisi.</span>
            )}
          </div>
          {(keyFields.length > 0 || previewDetails.length > 0) && (
            <div className="mt-3 flex flex-col gap-1">
              {[...previewDetails, ...keyFields].map(f => (
                <div key={f.key} className="flex items-baseline gap-1.5 text-[11px] min-w-0">
                  <span className="max-w-[45%] shrink-0 truncate font-semibold text-slate-500 dark:text-slate-400">{f.label}:</span>
                  <span className="text-slate-600 dark:text-slate-300 truncate">{f.value}</span>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={event => { event.stopPropagation(); onSelect(entry, true); }}
            className="mt-3 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600 hover:underline dark:text-indigo-400"
          >
            <BookOpen size={12} /> Cek Kemunculan di Chapter
          </button>
        </div>

        {aliases.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800/60 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">
              <Tag size={12} /> Alias:
            </span>
            {aliases.slice(0, metadataPreviewLimit).map(a => (
              <span key={a} className="max-w-full truncate text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                {a}
              </span>
            ))}
            {aliases.length > metadataPreviewLimit && (
              <span className="self-center text-[11px] text-slate-500 dark:text-slate-400">+{aliases.length - metadataPreviewLimit} alias</span>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 min-w-0">
              {tags.slice(0, metadataPreviewLimit).map(t => (
                <span key={t} className="max-w-full truncate text-[10px] font-semibold text-indigo-500 dark:text-indigo-400">
                  #{t}
                </span>
              ))}
              {tags.length > metadataPreviewLimit && (
                <span className="text-[10px] text-slate-500 dark:text-slate-400">+{tags.length - metadataPreviewLimit} tag</span>
              )}
            </div>
          ) : <span />}

          {/* #1 Hubungan kini ringkas: badge jumlah (kelola di modal detail) */}
          {relCount > 0 && (
            <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2.5 py-1 rounded-full border border-indigo-100 dark:border-indigo-800/40">
              <Link2 size={12} /> {relCount} hubungan
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export const CodexCard = React.memo(CodexCardImpl);
