/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Editor Kalender Dunia (#4) — menyusun definisi `Project.calendar`: era (berurutan),
 * hari-dalam-seminggu, bulan (nama + panjang), dan musim (rentang bulan + warna).
 * Menulis ke `db.projects.update`. Grid & pita di panel murni turunan dari sini.
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { CalendarCog, X, Check, Plus, Trash2, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { updateProject } from '@/src/services/projectOperations';
import { db } from '@/src/db';
import { useToast } from '@/src/hooks/useToast';
import { WorldCalendar } from '@/src/types';
import { calendarPreset, CalendarPreset, daysInYear, daysInMonth } from '@/src/lib/worldCalendar';
import { cn } from '@/src/lib/utils';

const inputCls = 'bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700/80 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-indigo-400';
const labelCls = 'text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider';

const SEASON_SWATCHES = ['#4ade80', '#fbbf24', '#f97316', '#60a5fa', '#a78bfa', '#f472b6', '#2dd4bf', '#94a3b8'];

/** Pindahkan elemen array dari `from` ke `to` (immutable). */
function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

export function CalendarEditorModal({
  projectId, calendar, onClose,
}: {
  projectId: number;
  calendar: WorldCalendar | undefined;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [cal, setCal] = useState<WorldCalendar>(() => calendar ?? calendarPreset('blank'));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const applyPreset = (p: CalendarPreset) => setCal(calendarPreset(p));

  const valid = cal.eras.length > 0 && cal.weekdays.length > 0 && cal.months.length > 0 && daysInYear(cal) > 0;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    // Rapikan: buang bulan tanpa nama/hari & era tanpa nama.
    const cleaned: WorldCalendar = {
      eras: cal.eras.map(e => ({ name: e.name.trim() || 'Era', abbr: e.abbr?.trim() || undefined })),
      weekdays: cal.weekdays.map(w => w.trim()).filter(Boolean),
      months: cal.months.map(m => ({ name: m.name.trim() || 'Bulan', days: Math.max(1, Math.floor(m.days) || 1) })),
      seasons: cal.seasons.map(s => ({ name: s.name.trim() || 'Musim', fromMonth: s.fromMonth, toMonth: s.toMonth, color: s.color })),
      holidays: (cal.holidays ?? []).map((h, idx) => ({
        id: h.id || `h-${idx}-${Date.now()}`,
        name: h.name.trim() || 'Festival',
        month: h.month,
        day: Math.max(1, Math.min(h.day, daysInMonth(cal, h.month) || 1)),
        color: h.color || '#fbbf24',
        description: h.description?.trim() || undefined,
      })),
    };
    try {
      await updateProject(projectId, { calendar: cleaned });
      toast.success('Kalender dunia disimpan.');
      onClose();
    } catch {
      toast.error('Gagal menyimpan kalender.');
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.25 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[85vh] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/60 shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"><CalendarCog size={16} /></span>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Editor Kalender Dunia</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-6 overflow-y-auto custom-scrollbar">
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Susun dunia Anda: berapa bulan, panjang tiap bulan, panjang seminggu, musim, dan era. Grid kalender mengikuti apa pun yang Anda tetapkan di sini.
          </p>

          {/* Preset */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={labelCls}>Mulai dari</span>
            <button onClick={() => applyPreset('gregorian')} className="px-3 py-1.5 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Seperti Masehi</button>
            <button onClick={() => applyPreset('fantasy')} className="px-3 py-1.5 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Fantasi 8-bulan</button>
            <button onClick={() => applyPreset('blank')} className="px-3 py-1.5 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Kosong</button>
          </div>

          {/* Era */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={labelCls}>Era <span className="normal-case font-medium text-slate-400">— berurutan; atas = paling tua</span></label>
              <button onClick={() => setCal(c => ({ ...c, eras: [...c.eras, { name: `Era ${c.eras.length + 1}`, abbr: '' }] }))} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"><Plus size={12} /> Era</button>
            </div>
            <div className="space-y-1.5">
              {cal.eras.map((e, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="flex flex-col">
                    <button onClick={() => setCal(c => ({ ...c, eras: move(c.eras, i, i - 1) }))} disabled={i === 0} className="text-slate-400 hover:text-indigo-500 disabled:opacity-30"><ChevronUp size={12} /></button>
                    <button onClick={() => setCal(c => ({ ...c, eras: move(c.eras, i, i + 1) }))} disabled={i === cal.eras.length - 1} className="text-slate-400 hover:text-indigo-500 disabled:opacity-30"><ChevronDown size={12} /></button>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 w-5 text-right">{i + 1}.</span>
                  <input value={e.name} onChange={ev => setCal(c => ({ ...c, eras: c.eras.map((x, j) => j === i ? { ...x, name: ev.target.value } : x) }))} placeholder="Nama era" className={cn(inputCls, 'flex-1')} />
                  <input value={e.abbr ?? ''} onChange={ev => setCal(c => ({ ...c, eras: c.eras.map((x, j) => j === i ? { ...x, abbr: ev.target.value } : x) }))} placeholder="Singkatan" className={cn(inputCls, 'w-24')} />
                  <button onClick={() => setCal(c => ({ ...c, eras: c.eras.filter((_, j) => j !== i) }))} disabled={cal.eras.length <= 1} className="p-1.5 text-slate-400 hover:text-rose-500 disabled:opacity-30"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </section>

          {/* Minggu */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={labelCls}>Minggu <span className="normal-case font-medium text-slate-400">— nama hari (= kolom grid)</span></label>
              <button onClick={() => setCal(c => ({ ...c, weekdays: [...c.weekdays, `Hari ${c.weekdays.length + 1}`] }))} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"><Plus size={12} /> Hari</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {cal.weekdays.map((w, i) => (
                <div key={i} className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg pl-2 pr-1 py-1">
                  <input value={w} onChange={ev => setCal(c => ({ ...c, weekdays: c.weekdays.map((x, j) => j === i ? ev.target.value : x) }))} className="bg-transparent text-sm w-20 focus:outline-none" />
                  <button onClick={() => setCal(c => ({ ...c, weekdays: c.weekdays.filter((_, j) => j !== i) }))} disabled={cal.weekdays.length <= 1} className="text-slate-400 hover:text-rose-500 disabled:opacity-30"><X size={12} /></button>
                </div>
              ))}
            </div>
          </section>

          {/* Bulan */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={labelCls}>Bulan <span className="normal-case font-medium text-slate-400">— nama & jumlah hari · setahun = {daysInYear(cal)} hari</span></label>
              <button onClick={() => setCal(c => ({ ...c, months: [...c.months, { name: `Bulan ${c.months.length + 1}`, days: 30 }] }))} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"><Plus size={12} /> Bulan</button>
            </div>
            <div className="space-y-1.5">
              {cal.months.map((m, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="flex flex-col">
                    <button onClick={() => setCal(c => ({ ...c, months: move(c.months, i, i - 1) }))} disabled={i === 0} className="text-slate-400 hover:text-indigo-500 disabled:opacity-30"><ChevronUp size={12} /></button>
                    <button onClick={() => setCal(c => ({ ...c, months: move(c.months, i, i + 1) }))} disabled={i === cal.months.length - 1} className="text-slate-400 hover:text-indigo-500 disabled:opacity-30"><ChevronDown size={12} /></button>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 w-5 text-right">{i + 1}.</span>
                  <input value={m.name} onChange={ev => setCal(c => ({ ...c, months: c.months.map((x, j) => j === i ? { ...x, name: ev.target.value } : x) }))} placeholder="Nama bulan" className={cn(inputCls, 'flex-1')} />
                  <input type="number" min={1} value={m.days} onChange={ev => setCal(c => ({ ...c, months: c.months.map((x, j) => j === i ? { ...x, days: Math.max(1, Number(ev.target.value) || 1) } : x) }))} className={cn(inputCls, 'w-20')} />
                  <span className="text-[11px] text-slate-400">hari</span>
                  <button onClick={() => setCal(c => ({ ...c, months: c.months.filter((_, j) => j !== i) }))} disabled={cal.months.length <= 1} className="p-1.5 text-slate-400 hover:text-rose-500 disabled:opacity-30"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </section>

          {/* Musim */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={labelCls}>Musim <span className="normal-case font-medium text-slate-400">— rentang bulan + warna pita</span></label>
              <button onClick={() => setCal(c => ({ ...c, seasons: [...c.seasons, { name: 'Musim', fromMonth: 1, toMonth: Math.min(2, c.months.length), color: SEASON_SWATCHES[c.seasons.length % SEASON_SWATCHES.length] }] }))} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"><Plus size={12} /> Musim</button>
            </div>
            {cal.seasons.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500 italic">Belum ada musim (opsional).</p>}
            <div className="space-y-1.5">
              {cal.seasons.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 flex-wrap">
                  <input type="color" value={s.color} onChange={ev => setCal(c => ({ ...c, seasons: c.seasons.map((x, j) => j === i ? { ...x, color: ev.target.value } : x) }))} className="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent" title="Warna musim" />
                  <input value={s.name} onChange={ev => setCal(c => ({ ...c, seasons: c.seasons.map((x, j) => j === i ? { ...x, name: ev.target.value } : x) }))} placeholder="Nama musim" className={cn(inputCls, 'flex-1 min-w-[100px]')} />
                  <span className="text-[11px] text-slate-400">bulan</span>
                  <select value={s.fromMonth} onChange={ev => setCal(c => ({ ...c, seasons: c.seasons.map((x, j) => j === i ? { ...x, fromMonth: Number(ev.target.value) } : x) }))} className={inputCls}>
                    {cal.months.map((m, mi) => <option key={mi} value={mi + 1}>{mi + 1}. {m.name}</option>)}
                  </select>
                  <span className="text-[11px] text-slate-400">–</span>
                  <select value={s.toMonth} onChange={ev => setCal(c => ({ ...c, seasons: c.seasons.map((x, j) => j === i ? { ...x, toMonth: Number(ev.target.value) } : x) }))} className={inputCls}>
                    {cal.months.map((m, mi) => <option key={mi} value={mi + 1}>{mi + 1}. {m.name}</option>)}
                  </select>
                  <button onClick={() => setCal(c => ({ ...c, seasons: c.seasons.filter((_, j) => j !== i) }))} className="p-1.5 text-slate-400 hover:text-rose-500"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </section>

          {/* Hari Libur & Festival Tahunan */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={labelCls}>Hari Libur & Festival <span className="normal-case font-medium text-slate-400">— perayaan tahunan yang berulang</span></label>
              <button
                type="button"
                onClick={() => setCal(c => ({
                  ...c,
                  holidays: [
                    ...(c.holidays ?? []),
                    {
                      id: `h-${Date.now()}`,
                      name: `Festival ${(c.holidays?.length ?? 0) + 1}`,
                      month: 1,
                      day: 1,
                      color: '#fbbf24',
                      description: '',
                    },
                  ],
                }))}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                <Plus size={12} /> Hari Libur
              </button>
            </div>
            {(!cal.holidays || cal.holidays.length === 0) && (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">Belum ada hari libur / festival (opsional).</p>
            )}
            <div className="space-y-2">
              {(cal.holidays ?? []).map((h, i) => (
                <div key={h.id || i} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/60 space-y-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <input
                      type="color"
                      value={h.color || '#fbbf24'}
                      onChange={ev => setCal(c => ({
                        ...c,
                        holidays: (c.holidays ?? []).map((x, j) => j === i ? { ...x, color: ev.target.value } : x),
                      }))}
                      className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent"
                      title="Warna festival"
                    />
                    <input
                      value={h.name}
                      onChange={ev => setCal(c => ({
                        ...c,
                        holidays: (c.holidays ?? []).map((x, j) => j === i ? { ...x, name: ev.target.value } : x),
                      }))}
                      placeholder="Nama festival / hari libur"
                      className={cn(inputCls, 'flex-1 min-w-[140px]')}
                    />
                    <span className="text-[11px] text-slate-400">bulan</span>
                    <select
                      value={h.month}
                      onChange={ev => {
                        const newM = Number(ev.target.value);
                        setCal(c => ({
                          ...c,
                          holidays: (c.holidays ?? []).map((x, j) => j === i ? {
                            ...x,
                            month: newM,
                            day: Math.min(x.day, daysInMonth(c, newM) || 1),
                          } : x),
                        }));
                      }}
                      className={inputCls}
                    >
                      {cal.months.map((m, mi) => <option key={mi} value={mi + 1}>{mi + 1}. {m.name}</option>)}
                    </select>
                    <span className="text-[11px] text-slate-400">hari ke</span>
                    <input
                      type="number"
                      min={1}
                      max={daysInMonth(cal, h.month) || 1}
                      value={h.day}
                      onChange={ev => setCal(c => ({
                        ...c,
                        holidays: (c.holidays ?? []).map((x, j) => j === i ? {
                          ...x,
                          day: Math.max(1, Math.min(Number(ev.target.value) || 1, daysInMonth(c, h.month) || 1)),
                        } : x),
                      }))}
                      className={cn(inputCls, 'w-16')}
                    />
                    <button
                      type="button"
                      onClick={() => setCal(c => ({
                        ...c,
                        holidays: (c.holidays ?? []).filter((_, j) => j !== i),
                      }))}
                      className="p-1.5 text-slate-400 hover:text-rose-500"
                      title="Hapus"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <input
                    value={h.description ?? ''}
                    onChange={ev => setCal(c => ({
                      ...c,
                      holidays: (c.holidays ?? []).map((x, j) => j === i ? { ...x, description: ev.target.value } : x),
                    }))}
                    placeholder="Keterangan singkat perayaan (opsional)..."
                    className={cn(inputCls, 'w-full text-xs text-slate-600 dark:text-slate-400')}
                  />
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800/60 shrink-0">
          {!valid && <span className="text-[11px] text-rose-500">Perlu minimal 1 era, 1 hari, dan 1 bulan berisi hari.</span>}
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">Batal</button>
            <button onClick={save} disabled={!valid || saving} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors active:scale-95 cursor-pointer">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Simpan Kalender
            </button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
