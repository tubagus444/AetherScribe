/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modal tambah/edit peristiwa berkalender (#4). Menulis ke tabel `timeline` yang SAMA
 * dengan Timeline Cerita — tak ada data terpisah. Menambah `startDate`/`endDate`
 * terstruktur (era/tahun/bulan/hari) + rentang opsional; tautan Codex lewat
 * `characterIds` yang sudah ada (dan sudah di-remap saat impor).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { CalendarPlus, X, Check, Loader2 } from 'lucide-react';
import { addTimelineEvent, updateTimelineEvent } from '@/src/services/timelineOperations';
import { useToast } from '@/src/hooks/useToast';
import { TimelineEvent, TimelineEventType, WorldCalendar, WorldDate, CodexEntry } from '@/src/types';
import { compareDate, daysInMonth, formatDate, calculateCharacterAge } from '@/src/lib/worldCalendar';
import { cn } from '@/src/lib/utils';

import { CalendarEditorModal } from './CalendarEditorModal';
import { useCodexCategories } from '@/src/features/codex/hooks/useCodexCategories';
import { getCategoryLabel } from '@/src/lib/codexCategories';

const TYPE_LABELS: Record<TimelineEventType, string> = {
  plot: 'Plot', character: 'Karakter', world: 'Dunia', subplot: 'Subplot', reveal: 'Pengungkapan', other: 'Lainnya',
};
const TYPE_ORDER: TimelineEventType[] = ['plot', 'character', 'world', 'subplot', 'reveal', 'other'];

export interface CalendarEventSeed {
  /** Diisi pada mode edit. */
  event?: TimelineEvent;
  /** Prefill tanggal untuk peristiwa baru. */
  title?: string;
  chapterId?: number;
  era?: number;
  year?: number;
  month?: number;
  day?: number;
}

const inputCls = 'w-full bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400';
const labelCls = 'text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider';

/** Batasi hari ke [1, panjang bulan] agar tak keluar rentang setelah ganti bulan. */
function clampDay(cal: WorldCalendar, month: number, day: number): number {
  const max = daysInMonth(cal, month) || 1;
  return Math.min(Math.max(1, Math.trunc(day)), max);
}

export function CalendarEventModal({
  projectId, calendar, seed, chapters, codex, onClose,
}: {
  projectId: number;
  calendar?: WorldCalendar;
  seed: CalendarEventSeed;
  chapters: { id?: number; title: string }[];
  codex: CodexEntry[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const ev = seed.event;
  const isEdit = ev?.id != null;

  const [title, setTitle] = useState(ev?.title ?? seed.title ?? '');
  const [description, setDescription] = useState(ev?.description ?? '');
  const [type, setType] = useState<TimelineEventType>(ev?.type ?? 'plot');
  const [chapterId, setChapterId] = useState<number | null>(ev?.chapterId ?? seed.chapterId ?? null);
  const [characterIds, setCharacterIds] = useState<number[]>(ev?.characterIds ?? []);

  const start = ev?.startDate;
  const [era, setEra] = useState(start?.era ?? seed.era ?? 0);
  const [year, setYear] = useState(start?.year ?? seed.year ?? 1);
  const [month, setMonth] = useState(start?.month ?? seed.month ?? 1);
  const [day, setDay] = useState(start?.day ?? seed.day ?? 1);

  const [isRange, setIsRange] = useState(!!ev?.endDate);
  const end = ev?.endDate;
  const [endEra, setEndEra] = useState(end?.era ?? start?.era ?? seed.era ?? 0);
  const [endYear, setEndYear] = useState(end?.year ?? start?.year ?? seed.year ?? 1);
  const [endMonth, setEndMonth] = useState(end?.month ?? start?.month ?? seed.month ?? 1);
  const [endDay, setEndDay] = useState(end?.day ?? start?.day ?? seed.day ?? 1);

  const { categories } = useCodexCategories(projectId);
  const [query, setQuery] = useState('');
  const [setup, setSetup] = useState(false);
  const [dated, setDated] = useState(!!start || seed.day != null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (!setup && !saving && e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, setup, saving]);

  const sortedCodex = useMemo(() => [...codex].sort((a, b) => a.name.localeCompare(b.name)), [codex]);

  const term = query.trim().toLocaleLowerCase();
  const choices = sortedCodex.filter(c => c.name.toLocaleLowerCase().includes(term) || (c.id != null && characterIds.includes(c.id)));

  const startDate: WorldDate = { era, year, month, day: calendar ? clampDay(calendar, month, day) : 1 };
  const endDate: WorldDate = { era: endEra, year: endYear, month: endMonth, day: calendar ? clampDay(calendar, endMonth, endDay) : 1 };
  const rangeInvalid = calendar && dated && isRange && compareDate(endDate, startDate) < 0;
  const validYears = !dated || (Number.isSafeInteger(year) && year >= 1 &&
    (!isRange || (Number.isSafeInteger(endYear) && endYear >= 1)));
  const canSave = title.trim().length > 0 && validYears && !rangeInvalid;

  const toggleCharacter = (id: number) => {
    setCharacterIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        type,
        chapterId: chapterId ?? undefined,
        characterIds: characterIds.length ? characterIds : undefined,
        startDate: calendar ? (dated ? startDate : undefined) : ev?.startDate,
        endDate: calendar ? (dated && isRange ? endDate : undefined) : ev?.endDate,
      };
      if (isEdit) {
        // Pertahankan eventDate teks lama & order; hapus endDate bila rentang dimatikan.
        await updateTimelineEvent(ev!.id!, payload);
      } else {
        await addTimelineEvent({ ...payload, projectId });
      }
      toast.success(isEdit ? 'Peristiwa diperbarui.' : 'Peristiwa disimpan.');
      onClose();
    } catch {
      toast.error('Gagal menyimpan peristiwa.');
      setSaving(false);
    }
  };

  if (setup) return <CalendarEditorModal projectId={projectId} calendar={calendar} onClose={() => setSetup(false)} />;
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center md:justify-end bg-slate-950/70 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto"
      onClick={(e) => { e.stopPropagation(); if (!saving) onClose(); }}
    >
      <motion.div role="dialog" aria-modal="true" aria-label="Formulir peristiwa"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.25 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[85vh] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/60 shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"><CalendarPlus size={16} /></span>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">{isEdit ? 'Edit Peristiwa' : 'Tambah peristiwa'}</h3>
          </div>
          <button aria-label="Tutup formulir" disabled={saving} onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
          <label className="block space-y-1.5">
            <span className={labelCls}>Nama peristiwa *</span>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="mis. Perang Merah" className={inputCls} />
          </label>

          <label className="block space-y-1.5">
            <span className={labelCls}>Penjelasan (opsional)</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Apa yang terjadi?" className={cn(inputCls, 'resize-none')} />
          </label>
          {ev?.eventDate && <p className="text-sm">Catatan waktu sebelumnya · {ev.eventDate}</p>}
          {calendar ? <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!dated} onChange={e => setDated(!e.target.checked)} /> Tanggal belum ditentukan
          </label> : <button className={inputCls} onClick={() => setSetup(true)}>Atur kalender untuk memberi tanggal</button>}
          {calendar && dated && <>
          <div className="space-y-1.5">
            <span className={labelCls}>Tanggal (di kalender dunia)</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <select aria-label="Era" value={era} onChange={e => setEra(Number(e.target.value))} className={inputCls}>
                {calendar.eras.map((er, i) => (
                  <option key={i} value={i}>{er.name}{er.abbr ? ` (${er.abbr})` : ''}</option>
                ))}
              </select>
              <input aria-label="Tahun" type="number" min={1} value={year} onChange={e => setYear(Number(e.target.value) || 1)} placeholder="Tahun" className={inputCls} />
              <select aria-label="Bulan" value={month} onChange={e => { const m = Number(e.target.value); setMonth(m); setDay(d => clampDay(calendar, m, d)); }} className={inputCls}>
                {calendar.months.map((m, i) => (
                  <option key={i} value={i + 1}>{m.name}</option>
                ))}
              </select>
              <input aria-label="Hari" type="number" min={1} max={daysInMonth(calendar, month)} value={day} onChange={e => setDay(clampDay(calendar, month, Number(e.target.value) || 1))} placeholder="Hari" className={inputCls} />
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">{formatDate(calendar, startDate)}</p>
          </div>

          {/* Rentang */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={isRange} onChange={e => {
                setIsRange(e.target.checked);
                if (e.target.checked && !end) {
                  setEndEra(era); setEndYear(year); setEndMonth(month); setEndDay(day);
                }
              }} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Berlangsung beberapa hari (rentang)</span>
            </label>
            {isRange && (
              <div className="space-y-1.5 pl-6">
                <span className={labelCls}>Tanggal akhir</span>
                <div className="grid grid-cols-2 gap-2">
                  <select aria-label="Era akhir" value={endEra} onChange={e => setEndEra(Number(e.target.value))} className={inputCls}>
                    {calendar.eras.map((er, i) => <option key={i} value={i}>{er.name}</option>)}
                  </select>
                  <input aria-label="Tahun akhir" type="number" min={1} value={endYear} onChange={e => setEndYear(Number(e.target.value) || 1)} placeholder="Tahun" className={inputCls} />
                  <select aria-label="Bulan akhir" value={endMonth} onChange={e => { const m = Number(e.target.value); setEndMonth(m); setEndDay(d => clampDay(calendar, m, d)); }} className={inputCls}>
                    {calendar.months.map((m, i) => (
                      <option key={i} value={i + 1}>{m.name}</option>
                    ))}
                  </select>
                  <input aria-label="Hari akhir" type="number" min={1} max={daysInMonth(calendar, endMonth)} value={endDay} onChange={e => setEndDay(clampDay(calendar, endMonth, Number(e.target.value) || 1))} placeholder="Hari" className={inputCls} />
                </div>
                {rangeInvalid && <p className="text-[11px] text-rose-500">Tanggal akhir harus sama atau setelah tanggal mulai.</p>}
              </div>
            )}
          </div>

          </>}
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className={labelCls}>Kategori</span>
              <select value={type} onChange={e => setType(e.target.value as TimelineEventType)} className={inputCls}>
                {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className={labelCls}>Bab (opsional)</span>
              <select value={chapterId == null ? '' : String(chapterId)} onChange={e => setChapterId(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
                <option value="">— Tidak ada —</option>
                {chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
          </div>

          <div className="space-y-1.5">
            <span className={labelCls}>Entitas Codex terkait (opsional)</span>
            <input aria-label="Cari entitas Codex" value={query} placeholder="Cari nama entitas…" onChange={e => setQuery(e.target.value)} className={inputCls} />
            {characterIds.filter(id => !sortedCodex.some(c => c.id === id)).map(id =>
              <button type="button" key={id} className={inputCls} onClick={() => toggleCharacter(id)}>Lepas entitas yang sudah dihapus · #{id}</button>
            )}
            {!!sortedCodex.length && !choices.length && <p className="text-xs text-slate-500">Entitas tidak ditemukan.</p>}
            {sortedCodex.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">Belum ada entri Kamus Data untuk ditautkan.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto custom-scrollbar p-0.5">
                {choices.map(c => {
                  const active = c.id != null && characterIds.includes(c.id);
                  const ageInfo = (calendar && dated && c.category === 'character' && c.birthDate)
                    ? calculateCharacterAge(calendar, c.birthDate, startDate)
                    : null;
                  return (
                    <button key={c.id} aria-pressed={active} type="button" onClick={() => c.id != null && toggleCharacter(c.id)}
                      className={cn('px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all active:scale-95 inline-flex items-center gap-1.5',
                        active ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700')}>
                      <span>{c.name} · {getCategoryLabel(c.category, categories)}</span>
                      {ageInfo && (
                        <span className={cn('text-[10px] px-1.5 py-0.2 rounded font-normal',
                          active
                            ? 'bg-emerald-600/70 text-white'
                            : ageInfo.isUnborn
                              ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                              : ageInfo.isBirthday
                                ? 'bg-pink-100 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 font-semibold'
                                : 'bg-slate-200/80 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300')}>
                          {ageInfo.isBirthday ? `🎂 ${ageInfo.years} thn` : ageInfo.formatted}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800/60 shrink-0">
          <button disabled={saving} onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">Batal</button>
          <button onClick={save} disabled={!canSave || saving} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors active:scale-95 cursor-pointer">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Simpan peristiwa
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
