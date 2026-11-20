import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Tag, Link2, X, Edit2, Trash2, FlaskConical, Crosshair, EyeOff, Dices, Quote, CornerDownRight, ListChecks, MapPin, Map as MapIcon, CalendarDays } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/src/db';
import { CodexEntry, Relationship, PlotPromise } from '@/src/types';
import { buildLoreGraph } from '@/src/lib/loreGraph';
import { effectiveStatus, parseTodos } from '@/src/lib/worldCompleteness';
import { WorldStatusBadge } from '@/src/features/codex/components/WorldStatusBadge';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { QuickPromiseModal } from '@/src/features/consistency/components/QuickPromiseModal';
import { NameForgeModal } from '@/src/features/codex/components/NameForgeModal';
import { CategoryIcon } from '@/src/features/codex/components/CategoryIcon';
import { LinkifiedDescription } from '@/src/features/codex/components/LinkifiedDescription';
import { AppearancesList } from '@/src/features/codex/components/AppearancesList';
import { getRelationshipLabel, RELATIONSHIP_TYPES } from '@/src/features/codex/relationshipTypes';
import { getCategoryLabel, getCategoryAccent, type CategoryDef } from '@/src/lib/codexCategories';
import { resolveFieldValues } from '@/src/lib/codexFields';
import { formatDate } from '@/src/lib/worldCalendar';
import { readCurrentDetail, readDetailHistory, type DetailChapterIndex } from '@/src/lib/codexDetails';

interface CodexDetailModalProps {
  entry: CodexEntry;
  entries: CodexEntry[];
  relationships: Relationship[];
  promises?: PlotPromise[];
  projectId: number;
  categories?: CategoryDef[];
  detailChapters: DetailChapterIndex;
  onClose: () => void;
  onEdit: (entry: CodexEntry) => void;
  onDelete: (id: number) => void;
  onAddBond: (sourceId: number, targetId: number, type: string) => void;
  onDeleteRelationship: (id: number) => void;
  onOpenEntry?: (entry: CodexEntry) => void;
}

export function CodexDetailModal({
  entry,
  entries,
  relationships,
  promises,
  projectId,
  categories,
  detailChapters,
  onClose,
  onEdit,
  onDelete,
  onAddBond,
  onDeleteRelationship,
  onOpenEntry
}: CodexDetailModalProps) {
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const entryRelationships = relationships.filter(
    r => r.sourceId === entry.id || r.targetId === entry.id
  );
  const accent = getCategoryAccent(entry.category, categories);
  const linkTargets = entries.filter(e => e.id !== entry.id);
  const fieldValues = resolveFieldValues(entry);
  const status = effectiveStatus(entry);
  const todos = parseTodos(entry.todo);

  // Backlink (#9): siapa yang menunjuk ke entri ini. Relasi sengaja DIKELUARKAN —
  // sudah tampil dua-arah di seksi "Hubungan"; sisakan sebutan-nama & payoff janji
  // yang selama ini tak terlihat dari sisi entri yang ditunjuk.
  const mentionBacklinks = useMemo(() => {
    if (entry.id == null) return [];
    const { backlinks } = buildLoreGraph(entries, relationships, promises || []);
    return (backlinks.get(entry.id) || []).filter(l => l.via !== 'relationship');
  }, [entry.id, entries, relationships, promises]);

  const { openWorkshop, openAtlasMarker } = useNavigation();
  const [bondType, setBondType] = useState('Friend');
  const [bondTarget, setBondTarget] = useState<number | ''>('');
  const [showPromise, setShowPromise] = useState(false);
  const [showForge, setShowForge] = useState(false);
  const [showMapMenu, setShowMapMenu] = useState(false);

  const linkedMarkers = useLiveQuery(
    () => entry.id != null ? db.mapMarkers.where('codexId').equals(entry.id).toArray() : Promise.resolve([]),
    [entry.id]
  );
  const maps = useLiveQuery(
    () => db.maps.where('projectId').equals(projectId).toArray(),
    [projectId]
  );

  const mapNameById = useMemo(() => {
    const map = new Map<number, string>();
    if (maps) {
      for (const m of maps) {
        if (m.id != null) map.set(m.id, m.name);
      }
    }
    return map;
  }, [maps]);

  const handleAddBond = () => {
    if (!bondTarget) return;
    onAddBond(entry.id!, Number(bondTarget), bondType);
    setBondTarget('');
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: "spring", bounce: 0, duration: 0.3 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 ${accent.iconBg}`}>
              <CategoryIcon category={entry.category} categories={categories} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{entry.name}</h2>
                {entry.hidden && (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40 px-2 py-0.5 rounded-full border border-purple-200 dark:border-purple-800/60">
                    <EyeOff size={11} /> Rahasia
                  </span>
                )}
                <WorldStatusBadge status={status.status} suggested={status.suggested} />
              </div>
              <span className="text-xs uppercase tracking-widest font-bold text-indigo-500 dark:text-indigo-400">
                {getCategoryLabel(entry.category, categories)}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {linkedMarkers && linkedMarkers.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => {
                    if (linkedMarkers.length === 1) {
                      onClose();
                      openAtlasMarker(linkedMarkers[0].mapId, linkedMarkers[0].id);
                    } else {
                      setShowMapMenu((prev) => !prev);
                    }
                  }}
                  className="p-2 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 rounded-xl transition-all"
                  title={linkedMarkers.length === 1 ? `Lihat di Peta (${mapNameById.get(linkedMarkers[0].mapId) || 'Peta'})` : 'Pilih Peta untuk Melihat Lokasi'}
                >
                  <MapPin size={20} />
                </button>
                {showMapMenu && linkedMarkers.length > 1 && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 z-50 text-xs">
                    <div className="px-3 py-1.5 font-bold uppercase tracking-wider text-[10px] text-slate-400 border-b border-slate-100 dark:border-slate-700/60">
                      Lihat di Peta:
                    </div>
                    {linkedMarkers.map((mk) => (
                      <button
                        key={mk.id}
                        onClick={() => {
                          setShowMapMenu(false);
                          onClose();
                          openAtlasMarker(mk.mapId, mk.id);
                        }}
                        className="w-full text-left px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-2 transition-colors"
                      >
                        <MapIcon size={14} className="text-emerald-500 shrink-0" />
                        <span className="truncate">{mapNameById.get(mk.mapId) || 'Peta'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setShowPromise(true)}
              className="p-2 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/40 rounded-xl transition-all"
              title="Tandai sebagai Janji Plot (Chekhov's Gun)"
            >
              <Crosshair size={20} />
            </button>
            <button
              onClick={() => setShowForge(true)}
              className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 rounded-xl transition-all"
              title="Bengkel Nama — generator & glos nama (palet fonotaktik)"
            >
              <Dices size={20} />
            </button>
            <button
              onClick={() => { onClose(); openWorkshop({ mode: 'edit', entryId: entry.id!, seedName: entry.name }); }}
              className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 rounded-xl transition-all"
              title="Diskusikan & sempurnakan dengan AI (Lokakarya)"
            >
              <FlaskConical size={20} />
            </button>
            <button
              onClick={() => { onClose(); onEdit(entry); }}
              className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 rounded-xl transition-all"
              title="Ubah Entri"
            >
              <Edit2 size={20} />
            </button>
            <button 
              onClick={() => { onClose(); onDelete(entry.id!); }}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/50 rounded-xl transition-all"
              title="Hapus Entri"
            >
              <Trash2 size={20} />
            </button>
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
            <button 
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
              title="Tutup"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="p-8 overflow-y-auto">
          {/* Aliases */}
          {(entry.aliases?.length ?? 0) > 0 && (
            <div className="mb-8 flex flex-wrap gap-2 items-center">
              <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest font-bold text-slate-400 dark:text-slate-500 mr-2">
                <Tag size={14} /> Alias:
              </span>
              {entry.aliases!.map(a => (
                <span key={a} className="text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  {a}
                </span>
              ))}
            </div>
          )}

          {/* Tags */}
          {(entry.tags?.length ?? 0) > 0 && (
            <div className="mb-8 flex flex-wrap gap-2 items-center">
              {entry.tags!.map(t => (
                <span key={t} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-lg border border-indigo-100 dark:border-indigo-800/50">
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* Tanggal Lahir (Karakter) */}
          {entry.birthDate && project?.calendar && (
            <div className="mb-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 text-xs">
              <CalendarDays size={13} className="text-indigo-500" />
              <span className="font-semibold text-slate-500 dark:text-slate-400">Tanggal Lahir:</span>
              <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
                {formatDate(project.calendar, entry.birthDate)}
              </span>
            </div>
          )}

          {/* Description */}
          <div className="prose prose-slate dark:prose-invert max-w-none font-serif text-slate-700 dark:text-slate-300 leading-relaxed text-lg mb-10">
            {entry.description ? (
              <LinkifiedDescription text={entry.description} allEntries={entries || []} />
            ) : (
              <span className="italic opacity-60">Deskripsi belum diisi.</span>
            )}
          </div>

          {!!entry.details?.length && (
            <section className="mb-8 space-y-3" aria-label="Detail tambahan">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Detail tambahan</h4>
              {entry.details.map(detail => {
                const history = readDetailHistory(detail, detailChapters);
                const current = readCurrentDetail(detail, history);
                return (
                  <div key={detail.id} className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h5 className="min-w-0 break-words text-sm font-semibold text-slate-800 dark:text-slate-200">{detail.label}</h5>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{detail.includeInAI ? 'Disertakan ke AI' : 'Hanya di Codex'}</span>
                    </div>
                    {current.chapter && <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Bab {current.chapter.position + 1} · {current.chapter.title}</p>}
                    <p className="whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">{current.value || 'Belum diisi.'}</p>
                    {detail.revisions && (
                      <details className="border-t border-slate-200 pt-2 text-sm dark:border-slate-800">
                        <summary className="cursor-pointer font-medium text-indigo-600 dark:text-indigo-400">Riwayat per bab</summary>
                        <ol className="mt-2 space-y-2">
                          {detail.value && <li><div className="text-xs font-medium">Nilai awal</div><p className="whitespace-pre-wrap break-words">{detail.value}</p></li>}
                          {history.map(revision => (
                            <li key={revision.id}>
                              <div className="break-words text-xs font-medium">{revision.chapter ? `Bab ${revision.chapter.position + 1} · ${revision.chapter.title}` : `${revision.detachedChapterTitle || 'Bab'} (terhapus)`}</div>
                              <p className="whitespace-pre-wrap break-words">{revision.value}</p>
                            </li>
                          ))}
                        </ol>
                        {!history.length && <p className="mt-2 text-xs text-slate-500">Belum ada catatan yang ditautkan ke bab.</p>}
                      </details>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {/* Template field per kategori (#17) — detail terstruktur khas kategori */}
          {fieldValues.length > 0 && (
            <div className="mb-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-5">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                {fieldValues.map(f => (
                  <div key={f.key} className="min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">{f.label}</dt>
                    <dd className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Kebenaran tersembunyi — hanya untuk penulis, tak pernah ke output pembaca */}
          {entry.secret?.trim() && (
            <div className="mb-10 rounded-2xl border border-purple-200 dark:border-purple-800/50 bg-purple-50/50 dark:bg-purple-900/15 p-5">
              <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-purple-700 dark:text-purple-300 mb-2">
                <EyeOff size={14} /> Kebenaran Tersembunyi
                <span className="font-normal normal-case tracking-normal text-purple-400 dark:text-purple-500">· hanya penulis &amp; AI</span>
              </h4>
              <p className="font-serif text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{entry.secret.trim()}</p>
            </div>
          )}

          {/* Catatan & TODO (#11) — pekerjaan worldbuilding yang tersisa untuk entri ini */}
          {todos.length > 0 && (
            <div className="mb-10 rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/15 p-5">
              <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300 mb-3">
                <ListChecks size={14} /> Catatan &amp; TODO
              </h4>
              <ul className="space-y-1.5">
                {todos.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                    <span className="whitespace-pre-wrap break-words">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Backlink (#9) — "apa yang menyebut entri ini" (sebutan nama + payoff janji) */}
          {mentionBacklinks.length > 0 && (
            <div className="mb-10">
              <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4 flex items-center gap-2">
                <Quote size={16} /> Disebut oleh
              </h4>
              <div className="flex flex-wrap gap-2">
                {mentionBacklinks.map(link => {
                  if (link.via === 'payoff') {
                    return (
                      <span
                        key={`payoff-${link.sourceId}`}
                        className="inline-flex items-center gap-1.5 text-sm bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 px-3 py-2 rounded-xl border border-rose-100 dark:border-rose-800/50"
                        title="Janji plot yang dibayar/diungkap oleh entri ini"
                      >
                        <Crosshair size={13} className="shrink-0" />
                        <span className="font-semibold truncate max-w-[220px]">{link.sourceName}</span>
                        <span className="text-rose-400 dark:text-rose-500 text-xs">· janji</span>
                      </span>
                    );
                  }
                  const source = entries.find(e => e.id === link.sourceId);
                  return (
                    <button
                      key={`mention-${link.sourceId}`}
                      onClick={() => source && onOpenEntry?.(source)}
                      disabled={!source || !onOpenEntry}
                      className="group/back inline-flex items-center gap-1.5 text-sm bg-indigo-50/60 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 px-3 py-2 rounded-xl border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:hover:bg-indigo-50/60 dark:disabled:hover:bg-indigo-900/20 transition-all disabled:cursor-default"
                      title={source ? `Buka ${link.sourceName}` : link.sourceName}
                    >
                      <CornerDownRight size={13} className="shrink-0 opacity-60" />
                      <span className="font-semibold truncate max-w-[220px]">{link.sourceName}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Relationships — dikelola di sini (tambah/hapus) */}
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4 flex items-center gap-2">
                <Link2 size={16} /> Hubungan
              </h4>
              <div className="flex flex-col gap-2">
                {entryRelationships.map(r => {
                  const isSource = r.sourceId === entry.id;
                  const otherId = isSource ? r.targetId : r.sourceId;
                  const otherEntry = entries?.find(e => e.id === otherId);
                  if (!otherEntry) return null;
                  return (
                    <div key={r.id} className="group/bond flex items-center justify-between gap-2 bg-indigo-50/50 dark:bg-indigo-900/20 px-4 py-3 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-indigo-700 dark:text-indigo-400 text-sm shrink-0">{getRelationshipLabel(r.type, isSource)}</span>
                        <span className="text-indigo-400 dark:text-indigo-600 text-sm shrink-0">dengan</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100 truncate">{otherEntry.name}</span>
                      </div>
                      <button
                        onClick={() => onDeleteRelationship(r.id!)}
                        className="shrink-0 p-1 text-indigo-300 dark:text-indigo-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/40 rounded-lg opacity-0 group-hover/bond:opacity-100 focus:opacity-100 transition-all"
                        title="Hapus hubungan"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
                {entryRelationships.length === 0 && (
                  <p className="text-sm text-slate-400 dark:text-slate-500 italic">Belum ada hubungan.</p>
                )}
              </div>

              {/* Tambah hubungan */}
              {linkTargets.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={bondType}
                    onChange={e => setBondType(e.target.value)}
                    title="Tipe hubungan"
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none dark:text-slate-200"
                  >
                    {RELATIONSHIP_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <select
                    value={bondTarget}
                    onChange={e => setBondTarget(e.target.value ? Number(e.target.value) : '')}
                    title="Entri tujuan"
                    className="flex-1 min-w-[120px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none dark:text-slate-200"
                  >
                    <option value="">Pilih entri…</option>
                    {linkTargets.map(e => (
                      <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleAddBond}
                    disabled={!bondTarget}
                    className="text-[10px] font-bold uppercase tracking-widest bg-indigo-600 text-white px-3 py-2 rounded-lg disabled:opacity-50 hover:bg-indigo-700 transition shadow-sm active:scale-95"
                  >
                    Tambah
                  </button>
                </div>
              )}
            </div>

            {/* Appearances */}
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">
                Kemunculan
              </h4>
               <AppearancesList entry={entry} projectId={projectId} />
            </div>
          </div>
        </div>
      </motion.div>

      {showPromise && (
        <QuickPromiseModal
          seed={{ projectId, title: entry.name, codexId: entry.id!, codexName: entry.name }}
          onClose={() => setShowPromise(false)}
        />
      )}

      {showForge && (
        <NameForgeModal entry={entry} onClose={() => setShowForge(false)} />
      )}
    </div>
  );
}
