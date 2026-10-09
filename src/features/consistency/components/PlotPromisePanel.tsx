/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pelacak Janji Plot (Chekhov's Gun) — ledger yang dideklarasikan penulis.
 * Logika turunan di src/lib/plotPromises.ts; panel ini CRUD + menyajikan status.
 * Pelacakan deterministik & nol token (via PresenceIndex / kata kunci).
 */

import React, { useMemo, useState } from 'react';
import { db } from '@/src/db';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Crosshair, Plus, Loader2, Target, Trash2, Pencil, ArrowUpRight, X, Check,
  AlertTriangle, EyeOff, CheckCircle2, Ban, Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { useProjectData } from '@/src/hooks/useProjectData';
import { usePlainChapters } from '@/src/hooks/usePlainChapters';
import { PlotPromise, PlotPromiseImportance, PlotPromiseStatus } from '@/src/types';
import { analyzePromises, analyzePayoffs, extractKeywordCandidates, PromiseState, PayoffState } from '@/src/lib/plotPromises';
import { usePresenceIndex } from '@/src/hooks/usePresenceIndex';
import { cn } from '@/src/lib/utils';

interface PlotPromisePanelProps {
  projectId: number;
}

const STATE_META: Record<PromiseState, { label: (n: number) => string; badge: string; dot: string; icon: React.ReactNode }> = {
  dormant: { label: (n) => `Tertidur ${n} bab`, badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50', dot: 'bg-red-500', icon: <AlertTriangle size={13} /> },
  unseen: { label: () => 'Tak ditemukan', badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50', dot: 'bg-amber-500', icon: <EyeOff size={13} /> },
  active: { label: () => 'Aktif', badge: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800/50', dot: 'bg-sky-500', icon: <Target size={13} /> },
  paid: { label: () => 'Terbayar', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50', dot: 'bg-emerald-500', icon: <CheckCircle2 size={13} /> },
  abandoned: { label: () => 'Ditinggalkan', badge: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700', dot: 'bg-slate-400', icon: <Ban size={13} /> },
};

const IMPORTANCE_META: Record<PlotPromiseImportance, { label: string; cls: string }> = {
  high: { label: 'Penting', cls: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800/40' },
  medium: { label: 'Sedang', cls: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' },
  low: { label: 'Ringan', cls: 'bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-800/50 dark:text-slate-500 dark:border-slate-700' },
};

export function PlotPromisePanel({ projectId }: PlotPromisePanelProps) {
  const { setActiveChapterId, setViewMode } = useNavigation();
  const { codexEntries } = useProjectData(projectId);

  const chapters = usePlainChapters(projectId);
  const promises = useLiveQuery(() =>
    db.plotPromises.where('projectId').equals(projectId).toArray()
  , [projectId]);

  const [dormancyThreshold, setDormancyThreshold] = useState(4);
  const [editing, setEditing] = useState<PlotPromise | 'new' | null>(null);
  const [onlyAttention, setOnlyAttention] = useState(false);

  // Teks bab polos di-memo (ref stabil selama data tak berubah) untuk feed worker.
  const plain = chapters || null;

  // Scan kehadiran (nama+alias) di WORKER agar main thread tak jank pada naskah besar.
  const presenceIndex = usePresenceIndex(plain, codexEntries);

  // Derivasi murni & cepat; menunggu index worker siap.
  const report = useMemo(() => {
    if (!plain || !promises || !presenceIndex) return null;
    return analyzePromises(promises, plain, codexEntries, { dormancyThreshold, index: presenceIndex });
  }, [plain, promises, codexEntries, dormancyThreshold, presenceIndex]);

  const openChapter = (id: number) => {
    setActiveChapterId(id);
    setViewMode('write');
  };

  const setStatus = (p: PlotPromise, status: PlotPromiseStatus) => {
    if (p.id != null) db.plotPromises.update(p.id, { status, updatedAt: Date.now() });
  };
  const remove = (p: PlotPromise) => {
    if (p.id != null && confirm(`Hapus janji "${p.title}"?`)) db.plotPromises.delete(p.id);
  };

  const analyses = report?.analyses ?? [];

  // Lookup nama/rahasia entri Codex untuk menampilkan target payoff.
  const codexById = useMemo(() => {
    const m = new Map<number, { name: string; hidden?: boolean }>();
    for (const c of codexEntries) if (c.id != null) m.set(c.id, { name: c.name, hidden: c.hidden });
    return m;
  }, [codexEntries]);

  // Payoff/reveal (#2): kelompokkan kait per rahasia yang dibayarnya.
  const payoffs = useMemo(() => analyzePayoffs(analyses), [analyses]);

  const visible = onlyAttention
    ? analyses.filter(a => a.state === 'dormant' || a.state === 'unseen')
    : analyses;
  // Urutkan: yang butuh perhatian dulu (dormant → unseen → active → paid → abandoned).
  const STATE_ORDER: Record<PromiseState, number> = { dormant: 0, unseen: 1, active: 2, paid: 3, abandoned: 4 };
  const sorted = [...visible].sort((a, b) =>
    STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.dormancy - a.dormancy
  );

  const attentionCount = analyses.filter(a => a.state === 'dormant' || a.state === 'unseen').length;
  const loading = chapters === undefined || promises === undefined;

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8 pb-20 w-full">
      {/* Header */}
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold tracking-wide uppercase border border-indigo-100 dark:border-indigo-800/50">
          <Crosshair size={14} />
          <span>Chekhov's Gun</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-serif text-slate-900 dark:text-slate-100 tracking-tight">
          Janji Plot
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base max-w-2xl leading-relaxed">
          Catat elemen yang <span className="font-medium">harus terbayar</span> — senjata, ramalan, misteri. Alat melacak di bab mana ia muncul dan menandai bila <span className="font-medium">tertidur</span> terlalu lama. Anda yang memutuskan kapan sebuah janji terbayar — pelacakan sepenuhnya lokal, <span className="font-medium">tanpa AI, tanpa token</span>.
        </p>
      </header>

      {/* Kontrol */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Ambang tertidur</label>
          <select
            aria-label="Ambang jumlah bab tertidur"
            value={dormancyThreshold}
            onChange={(e) => setDormancyThreshold(Number(e.target.value))}
            className="w-full sm:w-44 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400"
          >
            {[3, 4, 6, 8].map(n => <option key={n} value={n}>≥ {n} bab senyap</option>)}
          </select>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all active:scale-[0.98] shadow-sm hover:shadow-md"
        >
          <Plus size={16} /> Tambah Janji
        </button>
        {analyses.length > 0 && (
          <button
            onClick={() => setOnlyAttention(v => !v)}
            className={cn(
              'flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold border transition-colors sm:ml-auto',
              onlyAttention
                ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50'
                : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            )}
          >
            <AlertTriangle size={14} /> Perlu perhatian ({attentionCount})
          </button>
        )}
      </div>

      {/* Form tambah/edit */}
      <AnimatePresence>
        {editing && chapters && (
          <PromiseForm
            // key per-target: remount dengan state segar saat berpindah janji/"baru"
            // (tanpa ini, edit A → edit B menyimpan isi A ke janji B).
            key={editing === 'new' ? 'new' : editing.id}
            projectId={projectId}
            initial={editing === 'new' ? null : editing}
            codexEntries={codexEntries}
            chapters={chapters.filter(c => c.id != null).map(c => ({ id: c.id!, title: c.title }))}
            onClose={() => setEditing(null)}
          />
        )}
      </AnimatePresence>

      {/* Pembayaran (payoff/reveal) — hanya bila ada janji yang menunjuk rahasia. */}
      {!loading && payoffs.length > 0 && (
        <PayoffSection payoffs={payoffs} codexById={codexById} />
      )}

      {/* Daftar */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : analyses.length === 0 ? (
        <EmptyState onAdd={() => setEditing('new')} />
      ) : (
        <section className="space-y-4">
          <AnimatePresence mode="popLayout">
            {sorted.map((a) => {
              const chapterTitles = chapters?.map(c => c.title) ?? [];
              return (
                <PromiseCard
                  key={a.promise.id}
                  analysis={a}
                  chapterCount={report!.chapterCount}
                  chapterTitles={chapterTitles}
                  chapterIds={chapters?.map(c => c.id!) ?? []}
                  payoffName={a.promise.payoffCodexId != null ? codexById.get(a.promise.payoffCodexId)?.name : undefined}
                  onOpenChapter={openChapter}
                  onEdit={() => setEditing(a.promise)}
                  onDelete={() => remove(a.promise)}
                  onSetStatus={(s) => setStatus(a.promise, s)}
                />
              );
            })}
          </AnimatePresence>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 italic pt-2">
            Status "tertidur" adalah pengingat, bukan kesalahan — pastikan janji memang belum terbayar. Pelacakan memakai nama/alias Codex atau kata kunci; hasil dihitung ulang otomatis.
          </p>
        </section>
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/50">
      <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center mb-5">
        <Sparkles size={24} className="text-slate-300 dark:text-slate-600" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1.5">Belum ada janji plot</h3>
      <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mb-5">
        Tandai elemen yang harus terbayar nanti — belati misterius, ramalan, janji tokoh — lalu pantau agar tak terlupa diikat.
      </p>
      <button onClick={onAdd} className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors active:scale-95">
        <Plus size={16} /> Tambah Janji Pertama
      </button>
    </div>
  );
}

const PAYOFF_META: Record<PayoffState, { label: string; badge: string; icon: React.ReactNode; hint: string }> = {
  unplanted: {
    label: 'Belum ditanam',
    badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50',
    icon: <AlertTriangle size={13} />,
    hint: 'Reveal ini dideklarasikan, tapi tak satu kait pun muncul di prosa.',
  },
  thin: {
    label: 'Tanam tipis',
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50',
    icon: <EyeOff size={13} />,
    hint: 'Foreshadowing sedikit — pertimbangkan menambah kait sebelum reveal.',
  },
  planted: {
    label: 'Cukup ditanam',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50',
    icon: <CheckCircle2 size={13} />,
    hint: 'Kait yang muncul di prosa memadai.',
  },
};

function PayoffSection({
  payoffs, codexById,
}: {
  payoffs: ReturnType<typeof analyzePayoffs>;
  codexById: Map<number, { name: string; hidden?: boolean }>;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Target size={16} className="text-purple-500" />
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Pembayaran (Payoff / Reveal)</h2>
      </div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 -mt-1">
        Rahasia/reveal beserta kait yang menyiapkannya. "Belum ditanam" = kait ada tapi tak muncul di prosa.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {payoffs.map((po) => {
          const target = codexById.get(po.codexId);
          const meta = PAYOFF_META[po.state];
          return (
            <div key={po.codexId} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {target?.hidden && <EyeOff size={13} className="text-purple-500 shrink-0" />}
                <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">{target?.name ?? 'Entri terhapus'}</span>
                <span className={cn('ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border', meta.badge)}>
                  {meta.icon}{meta.label}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {po.seenSetups}/{po.setupCount} kait muncul di prosa · {meta.hint}
              </p>
              <ul className="space-y-0.5">
                {po.setups.map((s) => (
                  <li key={s.promise.id} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', s.mentions > 0 ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600')} />
                    <span className="truncate">{s.promise.title}</span>
                    <span className="text-slate-400 dark:text-slate-500 shrink-0">{s.mentions > 0 ? `${s.mentions}×` : 'tak muncul'}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PromiseCard({
  analysis, chapterCount, chapterTitles, chapterIds, payoffName, onOpenChapter, onEdit, onDelete, onSetStatus,
}: {
  analysis: ReturnType<typeof analyzePromises>['analyses'][number];
  chapterCount: number;
  chapterTitles: string[];
  chapterIds: number[];
  payoffName?: string;
  onOpenChapter: (id: number) => void;
  onEdit: () => void;
  onDelete: () => void;
  onSetStatus: (s: PlotPromiseStatus) => void;
}) {
  const { promise: p, state, perChapterCounts, firstIndex, lastIndex, mentions, dormancy } = analysis;
  const meta = STATE_META[state];
  const imp = p.importance ? IMPORTANCE_META[p.importance] : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border', meta.badge)}>
          <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
          {meta.icon}{meta.label(dormancy)}
        </span>
        {imp && (
          <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border', imp.cls)}>{imp.label}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={onEdit} title="Ubah" className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><Pencil size={14} /></button>
          <button onClick={onDelete} title="Hapus" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Trash2 size={14} /></button>
        </div>
      </div>

      <h3 className="font-semibold text-slate-900 dark:text-slate-100 break-words">{p.title}</h3>
      {p.description && <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{p.description}</p>}

      {/* Strip kemunculan per bab */}
      {chapterCount > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar py-1">
          <div className="flex gap-[3px] min-w-max">
            {Array.from({ length: chapterCount }).map((_, i) => {
              const has = perChapterCounts[i] > 0;
              // Ekor tertidur (setelah kemunculan terakhir) diwarnai merah muda bila dormant.
              const dormantTail = state === 'dormant' && lastIndex != null && i > lastIndex;
              return (
                <div
                  key={i}
                  title={`${chapterTitles[i] ?? `Bab ${i + 1}`}${has ? ` — ${perChapterCounts[i]}×` : dormantTail ? ' — senyap' : ''}`}
                  className={cn(
                    'w-2.5 h-5 rounded-sm',
                    has ? 'bg-indigo-500 dark:bg-indigo-400'
                      : dormantTail ? 'bg-red-100 dark:bg-red-900/40'
                        : 'bg-slate-100 dark:bg-slate-800'
                  )}
                />
              );
            })}
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">{mentions}×</span>
        </div>
      )}

      <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] text-slate-400 dark:text-slate-500">
        {p.codexId != null ? <span>Terpaut entri Codex</span> : p.keywords?.length ? <span>Kata kunci: {p.keywords.join(', ')}</span> : <span className="text-amber-500">Belum ditautkan</span>}
        {payoffName && (
          <span className="inline-flex items-center gap-0.5 text-purple-600 dark:text-purple-400">
            <Target size={11} /> Membayar: {payoffName}
          </span>
        )}
        {p.expectedBy && <span>Target: {p.expectedBy}</span>}
        {(() => {
          if (p.plantedChapterId == null) return null;
          const pIdx = chapterIds.indexOf(p.plantedChapterId);
          if (pIdx < 0) return null;
          return (
            <button onClick={() => onOpenChapter(p.plantedChapterId!)} className="inline-flex items-center gap-0.5 text-indigo-600 dark:text-indigo-400 hover:underline">
              Ditanam: {chapterTitles[pIdx]} <ArrowUpRight size={11} />
            </button>
          );
        })()}
        {firstIndex != null && (
          <button onClick={() => onOpenChapter(chapterIds[firstIndex])} className="inline-flex items-center gap-0.5 text-indigo-600 dark:text-indigo-400 hover:underline">
            Muncul dulu: {chapterTitles[firstIndex]} <ArrowUpRight size={11} />
          </button>
        )}
        {lastIndex != null && lastIndex !== firstIndex && (
          <button onClick={() => onOpenChapter(chapterIds[lastIndex])} className="inline-flex items-center gap-0.5 text-indigo-600 dark:text-indigo-400 hover:underline">
            Terakhir: {chapterTitles[lastIndex]} <ArrowUpRight size={11} />
          </button>
        )}
      </div>

      {/* Aksi status */}
      <div className="flex items-center gap-2 pt-1">
        <StatusBtn active={p.status === 'open'} onClick={() => onSetStatus('open')} label="Terbuka" />
        <StatusBtn active={p.status === 'paid'} onClick={() => onSetStatus('paid')} label="Terbayar" tone="emerald" />
        <StatusBtn active={p.status === 'abandoned'} onClick={() => onSetStatus('abandoned')} label="Ditinggalkan" tone="slate" />
      </div>
    </motion.div>
  );
}

function StatusBtn({ active, onClick, label, tone = 'indigo' }: { active: boolean; onClick: () => void; label: string; tone?: 'indigo' | 'emerald' | 'slate' }) {
  const toneCls = active
    ? tone === 'emerald' ? 'bg-emerald-600 text-white border-emerald-600'
      : tone === 'slate' ? 'bg-slate-500 text-white border-slate-500'
        : 'bg-indigo-600 text-white border-indigo-600'
    : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800';
  return (
    <button onClick={onClick} className={cn('inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors active:scale-95', toneCls)}>
      {active && <Check size={11} />}{label}
    </button>
  );
}

// ── Form ────────────────────────────────────────────────────────────────────

function PromiseForm({
  projectId, initial, codexEntries, chapters, onClose,
}: {
  projectId: number;
  initial: PlotPromise | null;
  codexEntries: { id?: number; name: string; hidden?: boolean }[];
  chapters: { id: number; title: string }[];
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [linkMode, setLinkMode] = useState<'codex' | 'keywords'>(initial?.codexId != null ? 'codex' : 'keywords');
  const [codexId, setCodexId] = useState<number | ''>(initial?.codexId ?? '');
  const [keywords, setKeywords] = useState((initial?.keywords ?? []).join(', '));
  const [importance, setImportance] = useState<PlotPromiseImportance>(initial?.importance ?? 'medium');
  const [expectedBy, setExpectedBy] = useState(initial?.expectedBy ?? '');
  const [plantedChapterId, setPlantedChapterId] = useState<number | ''>(initial?.plantedChapterId ?? '');
  const [payoffCodexId, setPayoffCodexId] = useState<number | ''>(initial?.payoffCodexId ?? '');
  const [saving, setSaving] = useState(false);

  const glossaryEntries = useLiveQuery(() =>
    db.glossary.where('projectId').equals(projectId).toArray()
  , [projectId]);

  const recommendedCandidates = useMemo(() => {
    if (linkMode !== 'keywords') return [];
    const candidates = extractKeywordCandidates(title, description, glossaryEntries);
    const currentTokens = new Set(keywords.split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
    return candidates.filter(c => !currentTokens.has(c.toLowerCase()));
  }, [linkMode, title, description, glossaryEntries, keywords]);

  const addCandidateToKeywords = (candidate: string) => {
    const trimmed = keywords.trim();
    if (!trimmed) {
      setKeywords(candidate);
    } else {
      const sep = trimmed.endsWith(',') ? ' ' : ', ';
      setKeywords(`${trimmed}${sep}${candidate}`);
    }
  };

  const canSave = title.trim().length > 0;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    const kw = keywords.split(',').map(s => s.trim()).filter(Boolean);
    const now = Date.now();
    const base: Partial<PlotPromise> = {
      title: title.trim(),
      description: description.trim() || undefined,
      codexId: linkMode === 'codex' && codexId !== '' ? Number(codexId) : undefined,
      keywords: linkMode === 'keywords' && kw.length ? kw : undefined,
      importance,
      expectedBy: expectedBy.trim() || undefined,
      plantedChapterId: plantedChapterId !== '' ? Number(plantedChapterId) : undefined,
      payoffCodexId: payoffCodexId !== '' ? Number(payoffCodexId) : undefined,
      updatedAt: now,
    };
    try {
      if (initial?.id != null) {
        // Bersihkan field yang mungkin beralih mode (codexId ↔ keywords) / dilepas.
        await db.plotPromises.update(initial.id, {
          ...base,
          codexId: base.codexId ?? undefined,
          keywords: base.keywords ?? undefined,
          payoffCodexId: base.payoffCodexId ?? undefined,
        });
      } else {
        await db.plotPromises.add({
          projectId,
          status: 'open',
          createdAt: now,
          ...base,
        } as PlotPromise);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800/50 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">{initial ? 'Ubah Janji' : 'Janji Baru'}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
        </div>

        <Field label="Judul janji *">
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder='mis. "Belati berukir yang berdenyut"' className={inputCls} />
        </Field>

        <Field label="Deskripsi">
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Apa janjinya pada pembaca?" className={cn(inputCls, 'resize-none')} />
        </Field>

        {/* Cara pelacakan */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ModeTab active={linkMode === 'codex'} onClick={() => setLinkMode('codex')} label="Entri Codex" />
            <ModeTab active={linkMode === 'keywords'} onClick={() => setLinkMode('keywords')} label="Kata kunci" />
          </div>
          {linkMode === 'codex' ? (
            <select value={codexId} onChange={e => setCodexId(e.target.value === '' ? '' : Number(e.target.value))} className={inputCls}>
              <option value="">— Pilih entri Codex —</option>
              {codexEntries.filter(c => c.id != null).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <div className="space-y-2">
              <input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="ramalan, sang pengkhianat (pisahkan dengan koma)" className={inputCls} />
              {recommendedCandidates.length > 0 && (
                <div className="space-y-1.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    <Sparkles size={12} className="text-indigo-500 shrink-0" />
                    <span>Rekomendasi kandidat kata kunci:</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {recommendedCandidates.map((cand) => (
                      <button
                        key={cand}
                        type="button"
                        onClick={() => addCandidateToKeywords(cand)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 shadow-xs transition-all active:scale-95"
                        title={`Tambahkan "${cand}" ke kata kunci`}
                      >
                        <Plus size={11} className="text-indigo-500" />
                        {cand}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            {linkMode === 'codex' ? 'Dilacak lewat nama & alias entri Codex.' : 'Untuk janji non-entitas (ramalan/misteri): dilacak lewat kemunculan kata kunci di teks.'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Kepentingan">
            <select value={importance} onChange={e => setImportance(e.target.value as PlotPromiseImportance)} className={inputCls}>
              <option value="high">Penting</option>
              <option value="medium">Sedang</option>
              <option value="low">Ringan</option>
            </select>
          </Field>
          <Field label="Ditanam di bab">
            <select value={plantedChapterId} onChange={e => setPlantedChapterId(e.target.value === '' ? '' : Number(e.target.value))} className={inputCls}>
              <option value="">— Otomatis —</option>
              {chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </Field>
          <Field label="Target terbayar">
            <input value={expectedBy} onChange={e => setExpectedBy(e.target.value)} placeholder="mis. sebelum klimaks" className={inputCls} />
          </Field>
        </div>

        {/* Payoff / reveal (#2) — janji ini menyiapkan/mengungkap entri Codex tertentu. */}
        <Field label="Membayar / mengungkap (opsional)">
          <select value={payoffCodexId} onChange={e => setPayoffCodexId(e.target.value === '' ? '' : Number(e.target.value))} className={inputCls}>
            <option value="">— Tidak menunjuk rahasia/reveal —</option>
            {codexEntries.filter(c => c.id != null).map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.hidden ? ' — rahasia' : ''}</option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Kaitkan kait ini ke rahasia/reveal yang dibayarnya. Panel "Pembayaran" akan menandai rahasia yang kaitnya kurang ditanam.
          </p>
        </Field>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Batal</button>
          <button onClick={save} disabled={!canSave || saving} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors active:scale-95">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Simpan
          </button>
        </div>
      </div>
    </motion.div>
  );
}

const inputCls = 'w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}

function ModeTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
        active ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800/50'
          : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
      )}
    >
      {label}
    </button>
  );
}
