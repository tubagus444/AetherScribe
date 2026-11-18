/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Heatmap Tensi/Pacing (#16) — kurva naik-turun alur SELURUH NASKAH, murni lokal
 * & TANPA AI. Logika di src/lib/pacingHeatmap.ts; panel ini menyajikan, memungkinkan
 * override tensi manual per-bab, dan menautkan hasil ke editor.
 */

import React, { useMemo } from 'react';
import { updateChapter } from '@/src/services/chapterOperations';
import { useLiveQuery } from 'dexie-react-hooks';
import { Activity, ArrowUpRight, Flame, TrendingDown, Sparkles, Info } from 'lucide-react';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { usePlainChapters } from '@/src/hooks/usePlainChapters';
import { usePacingReport } from '@/src/hooks/usePacingReport';
import {
  TENSION_LABEL,
  TensionRow,
  TensionRun,
} from '@/src/lib/pacingHeatmap';
import { TensionLevel } from '@/src/types';
import { cn } from '@/src/lib/utils';

interface PacingHeatmapPanelProps {
  projectId: number;
}

// Ramp "panas": tenang (biru) → tegang (merah). Konsisten light/dark.
const LEVEL_STYLES: Record<TensionLevel, { cell: string; solid: string; text: string }> = {
  1: { cell: 'bg-sky-100 dark:bg-sky-900/40', solid: 'bg-sky-400 dark:bg-sky-500', text: 'text-sky-700 dark:text-sky-300' },
  2: { cell: 'bg-emerald-100 dark:bg-emerald-900/40', solid: 'bg-emerald-400 dark:bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
  3: { cell: 'bg-amber-100 dark:bg-amber-900/40', solid: 'bg-amber-400 dark:bg-amber-500', text: 'text-amber-700 dark:text-amber-300' },
  4: { cell: 'bg-orange-100 dark:bg-orange-900/40', solid: 'bg-orange-400 dark:bg-orange-500', text: 'text-orange-700 dark:text-orange-300' },
  5: { cell: 'bg-red-100 dark:bg-red-900/40', solid: 'bg-red-500 dark:bg-red-500', text: 'text-red-700 dark:text-red-300' },
};

const LEVELS: TensionLevel[] = [1, 2, 3, 4, 5];

export function PacingHeatmapPanel({ projectId }: PacingHeatmapPanelProps) {
  const { setActiveChapterId, setViewMode } = useNavigation();

  const chapters = usePlainChapters(projectId);
  const { report } = usePacingReport(projectId, chapters);

  const openChapter = (id: number) => {
    setActiveChapterId(id);
    setViewMode('write');
  };

  const setTension = (id: number, tension: TensionLevel | undefined) => {
    updateChapter(id, { tension });
  };

  const total = report?.chapterCount ?? 0;

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8 pb-20 w-full">
      {/* Header */}
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold tracking-wide uppercase border border-indigo-100 dark:border-indigo-800/50">
          <Activity size={14} />
          <span>Heatmap Tensi</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-serif text-slate-900 dark:text-slate-100 tracking-tight">
          Tensi &amp; Pacing
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base max-w-2xl leading-relaxed">
          Kurva naik-turun alur <span className="font-medium">seluruh manuskrip</span> untuk evaluasi makro — deteksi bagian yang <span className="font-medium">tegang terus-menerus</span> (pembaca jenuh) atau <span className="font-medium">melandai</span>. Alat menyarankan tensi dari sinyal prosa; Anda bisa menimpanya per bab. Sepenuhnya lokal — <span className="font-medium">tanpa AI, tanpa token</span>.
        </p>
      </header>

      {report === null ? (
        <div className="text-sm text-slate-400 dark:text-slate-500">Memuat…</div>
      ) : total === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {/* Ringkasan */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total bab" value={String(total)} />
            <StatCard label="Tensi rata-rata" value={`${report.avgScore}`} sub="/100" />
            <StatCard
              label="Puncak"
              value={report.peak ? `Bab ${report.peak.index + 1}` : '—'}
              sub={report.peak ? TENSION_LABEL[report.peak.level] : undefined}
            />
            <StatCard
              label="Masih otomatis"
              value={String(report.suggestedCount)}
              sub={report.suggestedCount === total ? 'semua bab' : `dari ${total}`}
            />
          </div>

          {/* Kurva heatmap */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Kurva tensi per bab</h2>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
              <div className="overflow-x-auto custom-scrollbar pb-1">
                <div
                  className="flex items-end gap-[3px] h-40 min-w-full"
                  style={{ minWidth: `${Math.max(total * 14, 100)}px` }}
                >
                  {report.chapters.map((row) => (
                    <TensionBar key={row.id} row={row} onOpen={() => openChapter(row.id)} />
                  ))}
                </div>
              </div>
              {/* Legenda */}
              <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                {LEVELS.map((lvl) => (
                  <div key={lvl} className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className={cn('w-3 h-3 rounded-sm', LEVEL_STYLES[lvl].solid)} />
                    {lvl}. {TENSION_LABEL[lvl]}
                  </div>
                ))}
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 sm:ml-auto">
                  <Info size={12} /> Bar bergaris = tensi otomatis (belum disetel)
                </span>
              </div>
            </div>
          </section>

          {/* Peringatan pola */}
          {(report.plateaus.length > 0 || report.valleys.length > 0) && (
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Pola makro</h2>
              <div className="space-y-2">
                {report.plateaus.map((run, i) => (
                  <PatternCard
                    key={`p${i}`}
                    kind="plateau"
                    run={run}
                    onOpen={() => openChapter(report.chapters[run.startIndex].id)}
                  />
                ))}
                {report.valleys.map((run, i) => (
                  <PatternCard
                    key={`v${i}`}
                    kind="valley"
                    run={run}
                    onOpen={() => openChapter(report.chapters[run.startIndex].id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Daftar bab + override */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Tensi per bab</h2>
            <div className="space-y-2">
              {report.chapters.map((row) => (
                <ChapterTensionRow
                  key={row.id}
                  row={row}
                  onOpen={() => openChapter(row.id)}
                  onSet={(t) => setTension(row.id, t)}
                />
              ))}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Pilih tingkat untuk menetapkan tensi manual, atau <span className="font-medium">Otomatis</span> agar alat menyarankan dari sinyal prosa (panjang kalimat, dialog, tanda seru/tanya). Heuristik — bukan aturan mutlak, sesuaikan dengan genre.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
      <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
        {value}
        {sub && <span className="text-sm font-medium text-slate-400 dark:text-slate-500 ml-1">{sub}</span>}
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function TensionBar({ row, onOpen }: { row: TensionRow; onOpen: () => void }) {
  const style = LEVEL_STYLES[row.level];
  // Tinggi proporsional skor; minimal 8% agar bab tenang tetap terlihat & bisa diklik.
  const heightPct = Math.max(8, row.score);
  return (
    <button
      onClick={onOpen}
      title={`Bab ${row.index + 1}: ${row.title || 'Tanpa judul'} — ${TENSION_LABEL[row.level]} (${row.score}/100)${row.suggested ? ' · otomatis' : ''}`}
      className="group relative flex-1 min-w-[10px] h-full flex flex-col justify-end rounded-t-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
    >
      <div
        className={cn(
          'w-full rounded-t-sm transition-all group-hover:brightness-110',
          style.solid,
        )}
        style={{
          height: `${heightPct}%`,
          // Bar otomatis diberi pola garis agar beda dari yang dideklarasikan.
          backgroundImage: row.suggested
            ? 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.35) 3px, rgba(255,255,255,0.35) 6px)'
            : undefined,
        }}
      />
    </button>
  );
}

function PatternCard({ kind, run, onOpen }: { kind: 'plateau' | 'valley'; run: TensionRun; onOpen: () => void }) {
  const isPlateau = kind === 'plateau';
  const from = run.startIndex + 1;
  const to = run.endIndex + 1;
  return (
    <div
      className={cn(
        'rounded-2xl p-4 shadow-sm border flex items-start gap-3',
        isPlateau
          ? 'bg-red-50/60 dark:bg-red-900/15 border-red-200 dark:border-red-900/40'
          : 'bg-sky-50/60 dark:bg-sky-900/15 border-sky-200 dark:border-sky-900/40',
      )}
    >
      <div className={cn('shrink-0 mt-0.5', isPlateau ? 'text-red-500' : 'text-sky-500')}>
        {isPlateau ? <Flame size={18} /> : <TrendingDown size={18} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {isPlateau ? 'Plateau tegang' : 'Lembah datar'} — Bab {from}–{to} ({run.length} bab)
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
          {isPlateau
            ? 'Tensi tinggi tanpa jeda beberapa bab berturut-turut. Pertimbangkan momen tenang agar pembaca tak kelelahan.'
            : 'Tensi rendah beberapa bab berturut-turut. Pertimbangkan konflik atau taruhan baru agar alur tak melandai.'}
        </p>
      </div>
      <button
        onClick={onOpen}
        title="Buka bab awal rentang"
        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors active:scale-95"
      >
        Buka <ArrowUpRight size={12} />
      </button>
    </div>
  );
}

function ChapterTensionRow({
  row,
  onOpen,
  onSet,
}: {
  row: TensionRow;
  onOpen: () => void;
  onSet: (t: TensionLevel | undefined) => void;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="min-w-0 flex-1 flex items-center gap-3">
        <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', LEVEL_STYLES[row.level].solid)} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate" title={row.title}>
            <span className="text-slate-400 dark:text-slate-500 tabular-nums mr-1.5">{row.index + 1}.</span>
            {row.title || 'Tanpa judul'}
          </p>
          <p className={cn('text-[11px] font-semibold', LEVEL_STYLES[row.level].text)}>
            {TENSION_LABEL[row.level]}
            {row.suggested && <span className="text-slate-400 dark:text-slate-500 font-normal"> · otomatis ({row.score})</span>}
          </p>
        </div>
      </div>

      {/* Segmented control: Otomatis + 1–5 */}
      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shrink-0">
        <button
          onClick={() => onSet(undefined)}
          className={cn(
            'text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors',
            row.suggested
              ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-slate-100 shadow-sm'
              : 'text-slate-400 dark:text-slate-500 hover:text-slate-600',
          )}
          title="Otomatis (saran dari sinyal prosa)"
        >
          Auto
        </button>
        {LEVELS.map((lvl) => {
          const active = !row.suggested && row.level === lvl;
          return (
            <button
              key={lvl}
              onClick={() => onSet(lvl)}
              title={TENSION_LABEL[lvl]}
              className={cn(
                'text-[11px] font-bold w-7 py-1.5 rounded-lg transition-colors tabular-nums',
                active
                  ? cn(LEVEL_STYLES[lvl].solid, 'text-white shadow-sm')
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600',
              )}
            >
              {lvl}
            </button>
          );
        })}
      </div>

      <button
        onClick={onOpen}
        title="Buka bab di editor"
        className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors active:scale-95"
      >
        Buka <ArrowUpRight size={12} />
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/50">
      <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center mb-5">
        <Sparkles size={24} className="text-slate-300 dark:text-slate-600" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1.5">Belum ada bab</h3>
      <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
        Tulis beberapa bab dulu — heatmap tensi akan memetakan naik-turun alurnya di sini.
      </p>
    </div>
  );
}
