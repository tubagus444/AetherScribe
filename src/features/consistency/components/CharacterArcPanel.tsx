/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lensa Karakter — analitik per-karakter lintas-bab, murni lokal & TANPA AI.
 * Logika di src/lib/characterArc.ts; panel ini menyajikan & menautkan hasil.
 */

import { useProjectChapters } from '@/src/hooks/useChapterQueries';
import React, { useState, useRef, useCallback } from 'react';
import { X, Activity, Loader2, Sparkles, Eye, Users, MapPin, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { useProjectData } from '@/src/hooks/useProjectData';
import { stripHtml } from '@/src/lib/editorUtils';
import { PresenceIndex } from '@/src/lib/continuity';
import { buildPresenceIndexAsync } from '@/src/services/contextEngine';
import { computeCharacterArc, CharacterArc, ArcChapter } from '@/src/lib/characterArc';
import { cn } from '@/src/lib/utils';

export interface CharacterArcSidePanelProps {
  projectId: number;
  characterId: number;
  onClose: () => void;
  presenceIndex?: PresenceIndex | null;
}

export function CharacterArcSidePanel({ projectId, characterId, onClose, presenceIndex }: CharacterArcSidePanelProps) {
  const { setActiveChapterId, setViewMode } = useNavigation();
  const { codexEntries } = useProjectData(projectId);

  const chapters = useProjectChapters(projectId, 'manuscript');

  const characters = codexEntries.filter(e => e.category === 'character');

  const [scanning, setScanning] = useState(false);
  const [arc, setArc] = useState<CharacterArc | null>(null);

  const arcChaptersRef = useRef<ArcChapter[]>([]);

  const openChapter = (id: number) => {
    setActiveChapterId(id);
    setViewMode('write');
  };

  const scan = useCallback(async () => {
    if (!chapters || chapters.length === 0) return;
    setScanning(true);
    setArc(null);
    await new Promise(r => setTimeout(r, 0));
    
    const arcChapters: ArcChapter[] = chapters
      .filter(c => c.id != null)
      .map(c => ({ id: c.id!, title: c.title, content: stripHtml(c.content || ''), pov: c.pov }));
    arcChaptersRef.current = arcChapters;

    // Gunakan indeks dari properti (bila diteruskan dari Peta Kontinuitas) atau hitung baru
    let index = presenceIndex;
    if (!index) {
      index = await buildPresenceIndexAsync(arcChapters, codexEntries);
    }
    
    setArc(computeCharacterArc(characterId, arcChapters, codexEntries, { index }));
    setScanning(false);
  }, [chapters, codexEntries, characterId, presenceIndex]);

  // Otomatis scan saat characterId berubah atau chapters dimuat
  React.useEffect(() => {
    scan();
  }, [scan]);

  const totalChapters = chapters?.length ?? 0;
  const maxCount = arc ? Math.max(1, ...arc.perChapter.map(c => c.count)) : 1;
  const chapterLabel = (i: number) => arc?.perChapter[i]?.title ?? `Bab ${i + 1}`;

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0.5 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0.5 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-y-0 right-0 w-full sm:w-[450px] bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-[60] flex flex-col"
    >
      {/* Header Panel */}
      <header className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900">
        <div className="flex flex-col gap-0.5">
          <div className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-xs font-semibold tracking-wide uppercase">
            <Activity size={14} />
            <span>Lensa Karakter</span>
          </div>
          <h2 className="text-xl font-serif font-bold text-slate-900 dark:text-slate-100 truncate pr-4">
            {arc ? arc.name : (characters.find(c => c.id === characterId)?.name ?? 'Memuat...')}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 -mr-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X size={20} />
        </button>
      </header>

      {/* Konten Scrollable */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
        {scanning && !arc && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 size={32} className="animate-spin mb-4" />
            <p className="text-sm">Menghitung statistik porsi layar...</p>
          </div>
        )}
        {arc && !scanning && (
          <div className="space-y-8">
            {/* Statistik */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={<Sparkles size={14} />} label="Total sebutan" value={arc.totalMentions} accent="text-indigo-600 dark:text-indigo-400" />
            <StatCard icon={<MapPin size={14} />} label="Bab muncul" value={`${arc.chaptersPresent}/${totalChapters}`} />
            <StatCard icon={<Eye size={14} />} label="Bab POV" value={arc.povCount} />
            <StatCard icon={<Clock size={14} />} label="Absen terlama" value={`${arc.longestAbsence} bab`} />
          </div>

          {arc.chaptersPresent === 0 ? (
            <div className="text-center py-12 px-6 border-2 border-dashed border-amber-200 dark:border-amber-800/50 rounded-3xl bg-amber-50/40 dark:bg-amber-900/10">
              <p className="text-slate-600 dark:text-slate-300 text-sm">
                <span className="font-semibold">{arc.name}</span> tidak ditemukan di teks bab mana pun. Periksa ejaan nama/alias di Codex.
              </p>
            </div>
          ) : (
            <>
              {/* Grafik screen-time */}
              <section className="space-y-3">
                <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Porsi layar per bab</h2>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm overflow-x-auto custom-scrollbar">
                  <div className="flex items-end gap-[3px] min-w-max h-32">
                    {arc.perChapter.map((c) => (
                      <button
                        key={c.chapterId}
                        onClick={() => openChapter(c.chapterId)}
                        title={`${c.title}${c.count ? ` — ${c.count}× sebutan` : ' — tak muncul'}${c.isPov ? ' · POV' : ''}`}
                        className="group relative flex flex-col items-center justify-end h-full w-3 shrink-0"
                      >
                        {c.isPov && <span className="absolute -top-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 ring-2 ring-white dark:ring-slate-900" />}
                        <span
                          className={cn(
                            'w-full rounded-sm transition-colors',
                            c.count > 0
                              ? 'bg-indigo-400 group-hover:bg-indigo-600 dark:bg-indigo-500 dark:group-hover:bg-indigo-400'
                              : 'bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200'
                          )}
                          style={{ height: c.count > 0 ? `${Math.max(8, (c.count / maxCount) * 100)}%` : '4px' }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-2 flex-wrap">
                  <span>Tiap batang = satu bab (urut); tinggi = jumlah sebutan. Klik untuk membuka bab.</span>
                  <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> = bab ber-POV {arc.name}</span>
                </p>
              </section>

              {/* Ko-kemunculan */}
              {arc.coAppearances.length > 0 && (
                <section className="space-y-3">
                  <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Users size={15} /> Paling sering bersama
                  </h2>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-2.5">
                    {arc.coAppearances.map(co => (
                      <div key={co.entityId} className="flex items-center gap-3">
                        <span className="w-28 shrink-0 truncate text-xs font-medium text-slate-600 dark:text-slate-300 text-right" title={co.name}>{co.name}</span>
                        <div className="flex-1 h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-indigo-400 dark:bg-indigo-500 rounded-full"
                            style={{ width: `${(co.sharedChapters / arc.chaptersPresent) * 100}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0 tabular-nums">{co.sharedChapters} bab</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
        )}
      </div>
    </motion.div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number | string; accent?: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 mb-1">{icon}</div>
      <p className={cn('text-2xl font-bold tabular-nums', accent ?? 'text-slate-900 dark:text-slate-100')}>{value}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}
