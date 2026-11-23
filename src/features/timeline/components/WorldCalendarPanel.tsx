/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Panel Kalender Dunia (#4, viewMode 'worldcalendar') — tampilan visual atas Timeline
 * yang sama (tabel `timeline`), BUKAN data tandingan. Membaca `Project.calendar` +
 * event ber-`startDate`; grid/pita musim/pengelompokan murni turunan dari
 * `src/lib/worldCalendar.ts`. Event tanpa `startDate` tetap di Timeline daftar, tak di
 * grid. Cek kelayakan tanggal = fase 2 (belum dibangun).
 */

import { useProjectChapters } from '@/src/hooks/useChapterQueries';
import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CalendarDays, CalendarCog, CalendarPlus, ChevronLeft, ChevronRight, ChevronDown, Plus, BookText, Users, Search, X, Filter,
  Compass, AlertTriangle, History, LayoutGrid, Calendar, Sparkles, PanelRightClose, PanelRightOpen,
} from 'lucide-react';
import { updateProject } from '@/src/services/projectOperations';
import { db } from '@/src/db';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { useProjectData } from '@/src/hooks/useProjectData';
import { TimelineEvent, WorldCalendar, WorldDate, CodexEntry } from '@/src/types';
import {
  compareDate, daysInMonth, seasonForMonth, weekdayOfFirst, dayOfWeek,
  eraLabel, eraAbbr, formatDate, formatDateRange, calendarPreset, CalendarPreset,
  holidaysOnDate, calculateCharacterAge,
} from '@/src/lib/worldCalendar';
import { auditChronology } from '@/src/lib/chronologyAudit';
import { cn } from '@/src/lib/utils';
import { CalendarEditorModal } from './CalendarEditorModal';
import { compareEvents } from '@/src/lib/timelinePeriods';
import { CalendarEventModal, CalendarEventSeed } from './CalendarEventModal';
import { CalendarCalculatorModal } from './CalendarCalculatorModal';
import { ChronologyAuditModal } from './ChronologyAuditModal';

interface Props { projectId: number; }

export function WorldCalendarPanel({ projectId }: Props) {
  const { setViewMode } = useNavigation();
  const { codexEntries } = useProjectData(projectId);
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const events = useLiveQuery(() => db.timeline.where('projectId').equals(projectId).toArray(), [projectId]);
  const chapters = useProjectChapters(projectId, 'manuscript');

  const cal = project?.calendar;

  if (project === undefined || events === undefined) return null;
  if (!cal || cal.months.length === 0 || cal.eras.length === 0) {
    return <EmptyState projectId={projectId} />;
  }
  return (
    <CalendarView
      projectId={projectId}
      cal={cal}
      events={events}
      chapters={chapters ?? []}
      codex={codexEntries}
    />
  );
}

// ---------------------------------------------------------------------------
// Empty state — belum ada kalender
// ---------------------------------------------------------------------------

function EmptyState({ projectId }: { projectId: number }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const quick = async (p: CalendarPreset) => {
    await updateProject(projectId, { calendar: calendarPreset(p) });
  };
  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto w-full">
      <div className="flex flex-col items-center justify-center text-center py-16 px-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/50">
        <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center mb-5">
          <CalendarDays size={26} className="text-indigo-400" />
        </div>
        <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">Rancang Kalender Dunia Anda</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mb-6 leading-relaxed">
          Buat penanggalan in-world sendiri — bulan, musim, dan era. Lalu tata peristiwa Timeline di grid kalender, tandai rentang panjang seperti perang, dan tautkan ke bab & Codex.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button onClick={() => quick('gregorian')} className="px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Seperti Masehi</button>
          <button onClick={() => quick('fantasy')} className="px-4 py-2 rounded-xl text-sm font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Fantasi 8-bulan</button>
          <button onClick={() => setEditorOpen(true)} className="px-5 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center gap-2"><CalendarCog size={15} /> Susun sendiri</button>
        </div>
      </div>
      {editorOpen && <CalendarEditorModal projectId={projectId} calendar={undefined} onClose={() => setEditorOpen(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tampilan kalender
// ---------------------------------------------------------------------------

function CalendarView({
  projectId, cal, events, chapters, codex,
}: {
  projectId: number;
  cal: WorldCalendar;
  events: TimelineEvent[];
  chapters: { id?: number; title: string }[];
  codex: import('@/src/types').CodexEntry[];
}) {
  const { setViewMode, setActiveChapterId } = useNavigation();
  const [era, setEra] = useState(0);
  const [year, setYear] = useState(1);
  const [month, setMonth] = useState(1); // 1-based
  const [viewType, setViewType] = useState<'month' | 'year'>('month');
  const [selDay, setSelDay] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'detail' | 'agenda'>('detail');
  const [editorOpen, setEditorOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [calcInitialDate, setCalcInitialDate] = useState<WorldDate | undefined>(undefined);
  const [eventSeed, setEventSeed] = useState<CalendarEventSeed | null>(null);
  const [query, setQuery] = useState('');
  const [eraFilter, setEraFilter] = useState<number | 'all'>('all');
  const [collapsedEras, setCollapsedEras] = useState<Set<number>>(new Set());
  const [collapsedYears, setCollapsedYears] = useState<Set<string>>(new Set());

  // Audit kronologi deterministik antar-bab
  const anomalies = useMemo(() => {
    const chRefs = chapters.map((c, i) => ({ id: c.id, title: c.title, order: i }));
    return auditChronology(chRefs, events, cal);
  }, [chapters, events, cal]);
  const highAnomalies = useMemo(() => anomalies.filter(a => a.severity === 'high'), [anomalies]);

  const handleCreateEventFromRange = (start: WorldDate, end: WorldDate, defaultTitle?: string) => {
    setEventSeed({
      era: start.era,
      year: start.year,
      month: start.month,
      day: start.day,
      event: {
        projectId,
        title: defaultTitle ?? 'Perjalanan',
        description: '',
        type: 'world',
        order: events.length,
        startDate: start,
        endDate: end,
      },
    });
  };

  const handleJumpToDate = (d: WorldDate) => {
    setEra(d.era);
    setYear(d.year);
    setMonth(d.month);
    setSelDay(d.day);
    setViewType('month');
    setSidebarTab('detail');
    setSidebarOpen(true);
  };

  const handleSelectDay = (d: number) => {
    setSelDay(d);
    setSidebarTab('detail');
    setSidebarOpen(true);
  };

  const handleSelectEvent = (e: TimelineEvent) => {
    setEra(e.startDate!.era);
    setYear(e.startDate!.year);
    setMonth(e.startDate!.month);
    setSelDay(e.startDate!.day);
    setViewType('month');
    setSidebarTab('detail');
    setSidebarOpen(true);
  };

  const handleOpenChapter = (chId: number) => {
    setActiveChapterId(chId);
    setViewMode('write');
  };

  const toggleEra = (ei: number) => setCollapsedEras(s => { const n = new Set(s); n.has(ei) ? n.delete(ei) : n.add(ei); return n; });
  const toggleYear = (k: string) => setCollapsedYears(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const chapterTitle = useMemo(() => {
    const m = new Map<number, string>();
    chapters.forEach(c => c.id != null && m.set(c.id, c.title));
    return m;
  }, [chapters]);
  const codexName = useMemo(() => {
    const m = new Map<number, string>();
    codex.forEach(c => c.id != null && m.set(c.id, c.name));
    return m;
  }, [codex]);
  const codexMap = useMemo(() => {
    const m = new Map<number, CodexEntry>();
    codex.forEach(c => c.id != null && m.set(c.id, c));
    return m;
  }, [codex]);

  // Hanya event ber-tanggal terstruktur yang muncul di kalender.
  const dated = useMemo(() => events.filter(e => e.startDate).sort(compareEvents), [events]);

  // Apakah event menutupi sebuah sel (era/year/month/day) — sadar rentang lintas-bulan.
  const coversCell = (ev: TimelineEvent, cell: WorldDate): boolean => {
    const s = ev.startDate!;
    const e = ev.endDate ?? ev.startDate!;
    return compareDate(s, cell) <= 0 && compareDate(cell, e) <= 0;
  };
  const isRange = (ev: TimelineEvent) => !!ev.endDate && compareDate(ev.endDate, ev.startDate!) > 0;

  const monthDays = daysInMonth(cal, month);
  const wk = cal.weekdays.length;
  const leadBlanks = wk > 0 ? Math.max(0, weekdayOfFirst(cal, era, year, month)) : 0;
  const season = seasonForMonth(cal, month);

  // Tahun ber-peristiwa di era ini.
  const yearsWithEvents = useMemo(() => {
    const counts = new Map<number, number>();
    dated.forEach(e => { if (e.startDate!.era === era) counts.set(e.startDate!.year, (counts.get(e.startDate!.year) || 0) + 1); });
    return [...counts.entries()].map(([y, n]) => ({ year: y, count: n })).sort((a, b) => a.year - b.year);
  }, [dated, era]);

  // Pencarian daftar peristiwa: cocokkan judul, deskripsi, nama bab & entitas tertaut.
  const datedForList = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dated;
    return dated.filter(e => {
      if (e.title.toLowerCase().includes(q)) return true;
      if (e.description?.toLowerCase().includes(q)) return true;
      if (e.chapterId != null && chapterTitle.get(e.chapterId)?.toLowerCase().includes(q)) return true;
      return (e.characterIds ?? []).some(id => codexName.get(id)?.toLowerCase().includes(q));
    });
  }, [dated, query, chapterTitle, codexName]);

  // Pengelompokan Era → Tahun untuk daftar samping.
  const grouped = useMemo(() => {
    const sorted = [...datedForList].sort((a, b) => compareDate(a.startDate!, b.startDate!));
    const byEra = new Map<number, Map<number, TimelineEvent[]>>();
    for (const e of sorted) {
      const er = e.startDate!.era, yr = e.startDate!.year;
      if (!byEra.has(er)) byEra.set(er, new Map());
      const ymap = byEra.get(er)!;
      if (!ymap.has(yr)) ymap.set(yr, []);
      ymap.get(yr)!.push(e);
    }
    return byEra;
  }, [datedForList]);

  // Era yang punya peristiwa (untuk opsi filter era).
  const erasWithEvents = useMemo(() => {
    const set = new Set<number>();
    dated.forEach(e => set.add(e.startDate!.era));
    return [...set].sort((a, b) => a - b);
  }, [dated]);

  const searching = query.trim().length > 0;

  const changeEra = (e: number) => { setEra(e); setSelDay(null); };
  const changeMonthYear = (m: number, y: number) => { setMonth(m); setYear(y); setSelDay(null); };
  const stepMonth = (dir: number) => {
    let m = month + dir, y = year;
    if (m < 1) { m = cal.months.length; y -= 1; }
    else if (m > cal.months.length) { m = 1; y += 1; }
    changeMonthYear(m, y);
  };

  const openNewAt = (day: number | null) => {
    setEventSeed({ era, year, month, day: day ?? 1 });
  };
  const openEdit = (ev: TimelineEvent) => setEventSeed({ event: ev, era, year, month, day: ev.startDate!.day });

  const selEvents = selDay != null
    ? dated.filter(e => coversCell(e, { era, year, month, day: selDay }))
    : [];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto w-full pb-20 space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold tracking-wide uppercase border border-indigo-100 dark:border-indigo-800/50">
            <CalendarDays size={14} /> Kalender Dunia
          </div>
          <h1 className="text-2xl md:text-3xl font-serif text-slate-900 dark:text-slate-100 tracking-tight">Penanggalan Cerita</h1>
          <div className="pt-1">
            <button
              onClick={() => setViewMode('timeline')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline transition-colors"
            >
              Lihat daftar peristiwa di Timeline Cerita →
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {anomalies.length > 0 && (
            <button
              onClick={() => setAuditOpen(true)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors',
                highAnomalies.length > 0
                  ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60 hover:bg-rose-100'
                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60 hover:bg-amber-100'
              )}
              title="Periksa anomali kronologi tanggal antar-bab"
            >
              <AlertTriangle size={14} className={highAnomalies.length > 0 ? 'text-rose-500' : 'text-amber-500'} />
              <span>{anomalies.length} Anomali Tanggal</span>
            </button>
          )}
          <button
            onClick={() => {
              setCalcInitialDate(selDay != null ? { era, year, month, day: selDay } : undefined);
              setCalcOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
          >
            <Compass size={15} /> Kalkulator Perjalanan
          </button>
          <button onClick={() => setEditorOpen(true)} className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"><CalendarCog size={15} /> Editor</button>
          <button onClick={() => openNewAt(selDay)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"><CalendarPlus size={15} /> Peristiwa baru</button>
          <button
            type="button"
            onClick={() => setSidebarOpen(s => !s)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all cursor-pointer',
              sidebarOpen
                ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-indigo-300'
            )}
            title={sidebarOpen ? "Sembunyikan panel samping" : "Buka panel samping"}
          >
            {sidebarOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
            <span className="hidden sm:inline">{sidebarOpen ? 'Tutup Panel' : 'Panel Samping'}</span>
          </button>
        </div>
      </header>

      {/* Kontainer Utama: 2-Kolom Bersih (Kalender Lega & Panel Samping Terpadu) */}
      <div className="flex flex-col lg:flex-row gap-6 items-start w-full">
        {/* Kolom Kiri: Kalender Utama (Lega & Fleksibel) */}
        <div className="flex-1 min-w-0 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 md:p-6 shadow-sm space-y-4">
          {/* Navigasi bulan/era */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Toggle Mode: Bulan vs Tahun */}
              <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80">
                <button
                  type="button"
                  onClick={() => setViewType('month')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                    viewType === 'month'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  )}
                >
                  <Calendar size={13} />
                  <span>Bulan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewType('year')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                    viewType === 'year'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  )}
                >
                  <LayoutGrid size={13} />
                  <span>Tahun (Heatmap)</span>
                </button>
              </div>

              {viewType === 'month' ? (
                <div className="flex items-baseline gap-2.5 flex-wrap">
                  <h2 className="text-xl md:text-2xl font-serif text-slate-900 dark:text-slate-100">{cal.months[month - 1]?.name}</h2>
                  <span className="text-sm font-medium text-slate-400">Tahun {year}</span>
                  {season && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-0.5 rounded-full" style={{ background: `${season.color}22`, color: season.color }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: season.color }} /> {season.name}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-baseline gap-2.5 flex-wrap">
                  <h2 className="text-xl md:text-2xl font-serif text-slate-900 dark:text-slate-100">Tahun {year}</h2>
                  <span className="text-sm font-medium text-slate-400">{eraLabel(cal, era)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <select aria-label="Pilih era" value={era} onChange={e => changeEra(Number(e.target.value))} className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold border border-indigo-200 dark:border-indigo-800/50 rounded-lg px-2.5 py-1.5 focus:outline-none">
                {cal.eras.map((er, i) => <option key={i} value={i}>{er.name}{er.abbr ? ` (${er.abbr})` : ''}</option>)}
              </select>
              <input aria-label="Tahun" type="number" value={year} onChange={e => { const y = Number(e.target.value) || 1; changeMonthYear(month, y); }} className="w-20 bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-400" />
              {viewType === 'month' ? (
                <>
                  <button onClick={() => stepMonth(-1)} aria-label="Bulan sebelumnya" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer" title="Bulan sebelumnya"><ChevronLeft size={16} /></button>
                  <button onClick={() => stepMonth(1)} aria-label="Bulan berikutnya" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer" title="Bulan berikutnya"><ChevronRight size={16} /></button>
                </>
              ) : (
                <>
                  <button onClick={() => setYear(y => y - 1)} aria-label="Tahun sebelumnya" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer" title="Tahun sebelumnya"><ChevronLeft size={16} /></button>
                  <button onClick={() => setYear(y => y + 1)} aria-label="Tahun berikutnya" className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer" title="Tahun berikutnya"><ChevronRight size={16} /></button>
                </>
              )}
            </div>
          </div>

          {viewType === 'month' ? (
            <>
              {/* Pita musim */}
              {cal.seasons.length > 0 && (
                <div className="flex h-1.5 rounded-full overflow-hidden border border-slate-100 dark:border-slate-800" title="Musim sepanjang tahun">
                  {cal.months.map((_, i) => {
                    const s = seasonForMonth(cal, i + 1);
                    return <div key={i} className="flex-1" style={{ background: s ? s.color : 'transparent', opacity: month === i + 1 ? 1 : 0.5 }} />;
                  })}
                </div>
              )}

              {/* Header hari */}
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${wk}, minmax(0,1fr))` }}>
                {cal.weekdays.map((d, i) => (
                  <div key={i} className="text-[11px] font-bold uppercase tracking-wider text-slate-400 text-center py-1 truncate" title={d}>{d}</div>
                ))}
              </div>

              {/* Grid Hari Bulanan */}
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${wk}, minmax(0,1fr))` }}>
                {Array.from({ length: leadBlanks }).map((_, i) => <div key={`b${i}`} />)}
                {Array.from({ length: monthDays }).map((_, i) => {
                  const d = i + 1;
                  const cell: WorldDate = { era, year, month, day: d };
                  const covering = dated.filter(e => coversCell(e, cell));
                  const rangeEvs = covering.filter(isRange);
                  const pointEvs = covering.filter(e => !isRange(e));
                  const starter = rangeEvs.find(e => e.startDate!.month === month && e.startDate!.year === year && e.startDate!.day === d);
                  const holidays = holidaysOnDate(cal, month, d);
                  return (
                    <button
                      key={d}
                      onClick={() => handleSelectDay(d)}
                      className={cn(
                        'relative min-h-[76px] md:min-h-[88px] rounded-xl border text-left p-2 flex flex-col transition-all overflow-hidden group cursor-pointer',
                        selDay === d
                          ? 'border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900/60 bg-indigo-50/25 dark:bg-indigo-950/20 shadow-xs'
                          : 'border-slate-100 dark:border-slate-800/80 hover:border-indigo-300 dark:hover:border-indigo-700/80 bg-white dark:bg-slate-900',
                        rangeEvs.length > 0 && 'bg-rose-50/35 dark:bg-rose-950/15',
                        holidays.length > 0 && !rangeEvs.length && 'bg-amber-50/30 dark:bg-amber-950/15',
                      )}
                    >
                      <div className="flex items-center justify-between w-full gap-1">
                        <span className={cn(
                          'text-xs md:text-sm font-semibold transition-colors',
                          selDay === d ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-600 dark:text-slate-300'
                        )}>
                          {d}
                        </span>
                        {holidays.length > 0 && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100/90 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 text-[10px] font-medium max-w-[85px] md:max-w-[100px] truncate shadow-2xs"
                            title={holidays.map(h => `${h.name}: ${h.description ?? ''}`).join('\n')}
                          >
                            <Sparkles size={10} className="text-amber-500 shrink-0" />
                            <span className="truncate hidden sm:inline">{holidays[0].name}</span>
                          </span>
                        )}
                      </div>

                      {/* Pill peristiwa utama */}
                      {starter ? (
                        <div className="mt-1 px-1.5 py-0.5 rounded-md bg-rose-100/90 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 text-[10px] md:text-[11px] font-medium truncate leading-tight" title={starter.title}>
                          {starter.title}
                        </div>
                      ) : pointEvs.length > 0 ? (
                        <div className="mt-1 px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-[10px] md:text-[11px] font-medium truncate leading-tight" title={pointEvs[0].title}>
                          {pointEvs[0].title}
                        </div>
                      ) : null}

                      {/* Indikator titik dan pita rentang */}
                      <div className="mt-auto flex items-center justify-between w-full pt-1">
                        {pointEvs.length > 1 ? (
                          <div className="flex items-center gap-1">
                            {pointEvs.slice(0, 3).map(e => (
                              <span key={e.id} className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" title={e.title} />
                            ))}
                            {pointEvs.length > 3 && (
                              <span className="text-[9px] text-slate-400 font-bold leading-none">+{pointEvs.length - 3}</span>
                            )}
                          </div>
                        ) : <span />}
                        {rangeEvs.length > 0 && (
                          <span className="h-1 w-5 rounded-full bg-rose-400/80" title="Berlangsung rentang waktu" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Pita tahun ber-peristiwa */}
              <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">Tahun ber-peristiwa · {eraAbbr(cal, era)}</span>
                {yearsWithEvents.length === 0 ? (
                  <span className="text-[11px] text-slate-400 italic">belum ada peristiwa di era ini</span>
                ) : yearsWithEvents.map(({ year: y, count }) => (
                  <button key={y} onClick={() => changeMonthYear(month, y)} className={cn('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors cursor-pointer', y === year ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-indigo-300')}>
                    {y} <span className="opacity-60">({count})</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <YearHeatmapView
              cal={cal}
              dated={dated}
              era={era}
              year={year}
              onSelectDay={(m, d) => {
                setMonth(m);
                setSelDay(d);
                setViewType('month');
                setSidebarTab('detail');
                setSidebarOpen(true);
              }}
            />
          )}
        </div>

        {/* Kolom Kanan: Panel Samping Terpadu (Collapsible Inspector) */}
        {sidebarOpen && (
          <aside className="w-full lg:w-[360px] xl:w-[390px] shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
            {/* Header Tab Panel Samping */}
            <div className="p-3 bg-slate-50/90 dark:bg-slate-900 border-b border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center p-0.5 rounded-xl bg-slate-200/70 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 flex-1">
                <button
                  type="button"
                  onClick={() => setSidebarTab('detail')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                    sidebarTab === 'detail'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  )}
                >
                  <Calendar size={13} />
                  <span>Detail Tanggal</span>
                  {selDay != null && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab('agenda')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                    sidebarTab === 'agenda'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  )}
                >
                  <Search size={13} />
                  <span>Agenda</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-750 text-slate-600 dark:text-slate-300 font-normal tabular-nums">
                    {query.trim() ? `${datedForList.length}` : dated.length}
                  </span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
                title="Tutup panel samping"
              >
                <X size={15} />
              </button>
            </div>

            {/* Konten Tab */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
              {sidebarTab === 'detail' ? (
                selDay == null ? (
                  <div className="text-center py-12 px-4 space-y-3">
                    <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 flex items-center justify-center">
                      <CalendarDays size={22} />
                    </div>
                    <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200">Pilih Sebuah Tanggal</h4>
                    <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs mx-auto leading-relaxed">
                      Klik tanggal di kalender atau heatmap untuk melihat peristiwa, perayaan tahunan, dan usia karakter.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Header Tanggal */}
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-0.5">
                      <h3 className="font-serif font-bold text-base text-slate-900 dark:text-slate-100">
                        {cal.months[month - 1]?.name} {selDay}
                        {wk > 0 && cal.weekdays[dayOfWeek(cal, { era, year, month, day: selDay })] ? (
                          <span className="font-sans font-normal text-slate-400 text-xs ml-1.5">
                            · {cal.weekdays[dayOfWeek(cal, { era, year, month, day: selDay })]}
                          </span>
                        ) : null}
                      </h3>
                      <p className="text-xs text-slate-400">
                        Tahun {year} · {eraLabel(cal, era)}
                      </p>
                    </div>

                    {/* Spanduk Hari Libur / Festival */}
                    {holidaysOnDate(cal, month, selDay).map((h, i) => (
                      <div key={i} className="p-3 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent flex items-start gap-2.5 shadow-2xs">
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-white shadow-2xs" style={{ backgroundColor: h.color ?? '#f59e0b' }}>
                          <Sparkles size={13} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">{h.name}</h4>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-medium">Festival Tahunan</span>
                          </div>
                          {h.description && (
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-snug">{h.description}</p>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Daftar Peristiwa di Tanggal ini */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400 font-semibold uppercase tracking-wider px-0.5">
                        <span>Peristiwa ({selEvents.length})</span>
                      </div>

                      {selEvents.length === 0 ? (
                        <div className="text-center py-6 px-3 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-400 italic">
                          Belum ada peristiwa pada tanggal ini.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {selEvents.map(e => {
                            const isR = !!e.endDate && compareDate(e.endDate, e.startDate!) > 0;
                            return (
                              <button
                                key={e.id}
                                onClick={() => openEdit(e)}
                                className="block w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-slate-800/50 hover:shadow-2xs transition-all cursor-pointer group"
                              >
                                <div className="flex items-center gap-2">
                                  <span className={cn('w-2 h-2 rounded-full shrink-0', isR ? 'bg-rose-500' : 'bg-indigo-500')} />
                                  <span className="font-semibold text-sm text-slate-800 dark:text-slate-200 flex-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{e.title}</span>
                                </div>
                                <p className="text-[11px] font-mono text-slate-400 mt-1">{formatDateRange(cal, e.startDate!, e.endDate)}</p>
                                {e.description && (
                                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">{e.description}</p>
                                )}
                                {(e.chapterId != null || (e.characterIds?.length ?? 0) > 0) && (
                                  <div className="flex items-center gap-1.5 flex-wrap mt-2 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                                    {e.chapterId != null && chapterTitle.get(e.chapterId) && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500"><BookText size={10} />{chapterTitle.get(e.chapterId)}</span>
                                    )}
                                    {(e.characterIds ?? []).map(id => {
                                      const c = codexMap.get(id);
                                      if (!c) return null;
                                      const ageInfo = (c.category === 'character' && c.birthDate)
                                        ? calculateCharacterAge(cal, c.birthDate, e.startDate!)
                                        : null;
                                      return (
                                        <span
                                          key={id}
                                          className={cn(
                                            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors',
                                            ageInfo?.isBirthday
                                              ? 'bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 font-semibold border border-pink-200 dark:border-pink-800/50'
                                              : ageInfo?.isUnborn
                                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50'
                                                : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400'
                                          )}
                                          title={ageInfo ? `Lahir: ${formatDate(cal, c.birthDate!)} · ${ageInfo.formatted}` : undefined}
                                        >
                                          <Users size={10} />
                                          <span>{c.name}</span>
                                          {ageInfo && (
                                            <span className="font-normal opacity-90">
                                              ({ageInfo.isBirthday ? `🎂 ${ageInfo.years} thn` : ageInfo.years >= 0 ? `${ageInfo.years} thn` : 'Belum lahir'})
                                            </span>
                                          )}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Aksi Tambahan */}
                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        onClick={() => openNewAt(selDay)}
                        className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors cursor-pointer"
                      >
                        <Plus size={14} /> Tambah peristiwa di tanggal ini
                      </button>
                      <button
                        onClick={() => {
                          setCalcInitialDate({ era, year, month, day: selDay });
                          setCalcOpen(true);
                        }}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Compass size={13} /> Hitung perjalanan dari tanggal ini
                      </button>
                    </div>
                  </div>
                )
              ) : (
                /* Tab Agenda & Cari */
                <div className="space-y-3">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Cari peristiwa, bab, entitas…"
                      className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl pl-8 pr-8 py-2 text-xs focus:outline-none focus:border-indigo-400"
                    />
                    {query && (
                      <button onClick={() => setQuery('')} aria-label="Bersihkan pencarian" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {erasWithEvents.length > 1 && (
                    <div className="flex items-center gap-2">
                      <Filter size={12} className="text-slate-400 shrink-0" />
                      <select
                        aria-label="Filter era"
                        value={eraFilter === 'all' ? 'all' : String(eraFilter)}
                        onChange={e => setEraFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                        className="flex-1 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400"
                      >
                        <option value="all">Semua era</option>
                        {erasWithEvents.map(ei => <option key={ei} value={ei}>{eraLabel(cal, ei)}</option>)}
                      </select>
                    </div>
                  )}

                  {dated.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500 italic py-6 text-center">
                      Belum ada peristiwa bertanggal. Klik tanggal di kalender atau "Peristiwa baru" untuk menambah.
                    </p>
                  ) : datedForList.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500 italic py-6 text-center">
                      Tak ada peristiwa yang cocok dengan “{query.trim()}”.
                    </p>
                  ) : (
                    <div className="space-y-3 pt-1">
                      {cal.eras.map((_, ei) => {
                        if (eraFilter !== 'all' && ei !== eraFilter) return null;
                        const ymap = grouped.get(ei);
                        if (!ymap || ymap.size === 0) return null;
                        const eraCount = [...ymap.values()].reduce((n, a) => n + a.length, 0);
                        const eraOpen = searching || !collapsedEras.has(ei);
                        return (
                          <div key={ei} className="space-y-1.5">
                            <button
                              type="button"
                              onClick={() => toggleEra(ei)}
                              className="flex items-center gap-1.5 w-full text-left border-b border-indigo-100 dark:border-indigo-900/40 pb-1 group cursor-pointer"
                            >
                              {eraOpen ? <ChevronDown size={13} className="text-indigo-400 shrink-0" /> : <ChevronRight size={13} className="text-indigo-400 shrink-0" />}
                              <h3 className="text-xs font-serif font-semibold text-indigo-600 dark:text-indigo-400 flex-1 truncate">{eraLabel(cal, ei)}</h3>
                              <span className="text-[10px] font-medium text-slate-400 tabular-nums">{eraCount}</span>
                            </button>
                            {eraOpen && [...ymap.entries()].sort((a, b) => a[0] - b[0]).map(([yr, evs]) => {
                              const yKey = `${ei}-${yr}`;
                              const yOpen = searching || !collapsedYears.has(yKey);
                              return (
                                <div key={yr} className="pl-1.5">
                                  <button
                                    type="button"
                                    onClick={() => toggleYear(yKey)}
                                    className="flex items-center gap-1 w-full text-left mb-1 cursor-pointer"
                                  >
                                    {yOpen ? <ChevronDown size={11} className="text-slate-400 shrink-0" /> : <ChevronRight size={11} className="text-slate-400 shrink-0" />}
                                    <span className="text-[11px] font-bold text-slate-400">Tahun {yr}</span>
                                    <span className="text-[10px] text-slate-300 dark:text-slate-600 ml-auto tabular-nums">{evs.length}</span>
                                  </button>
                                  {yOpen && (
                                    <div className="space-y-1 pl-1">
                                      {evs.map(e => (
                                        <button
                                          key={e.id}
                                          type="button"
                                          onClick={() => handleSelectEvent(e)}
                                          title="Loncat ke tanggal ini & lihat detail"
                                          className="flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer"
                                        >
                                          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', !!e.endDate && compareDate(e.endDate, e.startDate!) > 0 ? 'bg-rose-500' : 'bg-indigo-500')} />
                                          <span className="text-xs text-slate-700 dark:text-slate-300 flex-1 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">{e.title}</span>
                                          <span className="text-[10px] font-mono text-slate-400 shrink-0">{formatDateRange(cal, e.startDate!, e.endDate)}</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {editorOpen && <CalendarEditorModal projectId={projectId} calendar={cal} onClose={() => setEditorOpen(false)} />}
      {eventSeed && <CalendarEventModal projectId={projectId} calendar={cal} seed={eventSeed} chapters={chapters} codex={codex} onClose={() => setEventSeed(null)} />}
      {calcOpen && (
        <CalendarCalculatorModal
          calendar={cal}
          initialDate={calcInitialDate ?? (selDay != null ? { era, year, month, day: selDay } : undefined)}
          onClose={() => setCalcOpen(false)}
          onCreateEventFromRange={handleCreateEventFromRange}
        />
      )}
      {auditOpen && (
        <ChronologyAuditModal
          calendar={cal}
          anomalies={anomalies}
          onClose={() => setAuditOpen(false)}
          onJumpToDate={handleJumpToDate}
          onEditEvent={openEdit}
          onOpenChapter={handleOpenChapter}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tampilan Tahunan (Bird's-Eye / Heatmap View)
// ---------------------------------------------------------------------------

function YearHeatmapView({
  cal,
  dated,
  era,
  year,
  onSelectDay,
}: {
  cal: WorldCalendar;
  dated: TimelineEvent[];
  era: number;
  year: number;
  onSelectDay: (month: number, day: number) => void;
}) {
  const wk = cal.weekdays.length;

  const eventsInThisYear = useMemo(() => {
    return dated.filter(e => {
      const s = e.startDate!;
      const end = e.endDate ?? s;
      if (s.era !== era) return false;
      return s.year <= year && end.year >= year;
    });
  }, [dated, era, year]);

  const holidaysCount = useMemo(() => {
    return cal.holidays?.length ?? 0;
  }, [cal.holidays]);

  const covers = (ev: TimelineEvent, cell: WorldDate): boolean => {
    const s = ev.startDate!;
    const e = ev.endDate ?? ev.startDate!;
    return compareDate(s, cell) <= 0 && compareDate(cell, e) <= 0;
  };

  const isRange = (ev: TimelineEvent) => !!ev.endDate && compareDate(ev.endDate, ev.startDate!) > 0;

  return (
    <div className="space-y-4">
      {/* Stat Bar */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-xl text-xs text-slate-500 dark:text-slate-400 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span>Total: <strong className="text-slate-800 dark:text-slate-200">{eventsInThisYear.length}</strong> peristiwa berlangsung di tahun ini</span>
          {holidaysCount > 0 && (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
              <Sparkles size={12} /> {holidaysCount} festival tahunan
            </span>
          )}
        </div>
        <span className="text-[11px] italic text-slate-400">Klik sebuah tanggal untuk memperbesar ke tampilan bulan</span>
      </div>

      {/* Grid of Months */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
        {cal.months.map((mInfo, mIdx) => {
          const mNum = mIdx + 1;
          const mDays = daysInMonth(cal, mNum);
          const season = seasonForMonth(cal, mNum);
          const leadBlanks = wk > 0 ? Math.max(0, weekdayOfFirst(cal, era, year, mNum)) : 0;
          const monthEvents = eventsInThisYear.filter(e => {
            const s = e.startDate!;
            const end = e.endDate ?? s;
            return (s.year < year || (s.year === year && s.month <= mNum)) &&
                   (end.year > year || (end.year === year && end.month >= mNum));
          });

          return (
            <div
              key={mIdx}
              className="p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/50 hover:border-indigo-200 dark:hover:border-indigo-900/50 transition-colors flex flex-col justify-between"
            >
              <div>
                {/* Month Card Header */}
                <div className="flex items-center justify-between gap-1 mb-2">
                  <button
                    type="button"
                    onClick={() => onSelectDay(mNum, 1)}
                    className="font-serif font-bold text-sm text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 text-left transition-colors flex items-center gap-1.5 group cursor-pointer"
                    title={`Buka bulan ${mInfo.name}`}
                  >
                    <span className="group-hover:underline">{mInfo.name}</span>
                    {season && (
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: season.color }} title={season.name} />
                    )}
                  </button>
                  <span className="text-[10px] text-slate-400 tabular-nums">
                    {monthEvents.length > 0 ? `${monthEvents.length} ev` : `${mDays} hr`}
                  </span>
                </div>

                {/* Weekday initials if defined */}
                {wk > 0 && (
                  <div className="grid gap-0.5 mb-1" style={{ gridTemplateColumns: `repeat(${wk}, minmax(0,1fr))` }}>
                    {cal.weekdays.map((w, wi) => (
                      <div key={wi} className="text-[8px] font-bold text-slate-400 text-center uppercase truncate">
                        {w.slice(0, 1)}
                      </div>
                    ))}
                  </div>
                )}

                {/* Mini Day Heatmap Grid */}
                <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${wk > 0 ? wk : 7}, minmax(0,1fr))` }}>
                  {Array.from({ length: leadBlanks }).map((_, bi) => (
                    <div key={`b-${bi}`} className="aspect-square" />
                  ))}
                  {Array.from({ length: mDays }).map((_, di) => {
                    const d = di + 1;
                    const cell: WorldDate = { era, year, month: mNum, day: d };
                    const covering = dated.filter(e => covers(e, cell));
                    const holidays = holidaysOnDate(cal, mNum, d);
                    const hasRange = covering.some(isRange);
                    const count = covering.length;

                    let bgCls = 'bg-slate-100/80 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500';
                    if (count >= 2) {
                      bgCls = 'bg-indigo-600 text-white font-bold shadow-xs';
                    } else if (count === 1) {
                      bgCls = 'bg-indigo-200 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 font-semibold border border-indigo-300 dark:border-indigo-700/60';
                    } else if (holidays.length > 0) {
                      bgCls = 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-700/80';
                    }

                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => onSelectDay(mNum, d)}
                        className={cn(
                          'aspect-square rounded-[4px] text-[8px] md:text-[9px] flex items-center justify-center transition-all hover:scale-115 hover:z-10 relative cursor-pointer',
                          bgCls,
                          hasRange && count === 0 && 'ring-1 ring-rose-400/80 bg-rose-50 dark:bg-rose-950/40 text-rose-600',
                          holidays.length > 0 && count > 0 && 'ring-1 ring-amber-400',
                        )}
                        title={`${mInfo.name} ${d}: ${count} peristiwa${holidays.length ? ` · Festival: ${holidays.map(h => h.name).join(', ')}` : ''}`}
                      >
                        {d}
                        {holidays.length > 0 && count === 0 && (
                          <span className="absolute -top-0.5 -right-0.5 w-1 h-1 rounded-full bg-amber-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Heatmap Legend */}
      <div className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Keterangan Heatmap:</span>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-[4px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
            <span>0 peristiwa</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-[4px] bg-indigo-200 dark:bg-indigo-900/60 border border-indigo-300 dark:border-indigo-700/60" />
            <span>1 peristiwa</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-[4px] bg-indigo-600 shadow-xs" />
            <span>2+ peristiwa (padat)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-[4px] bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-400/80" />
            <span>Rentang waktu</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-[4px] bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/80" />
            <span className="text-amber-700 dark:text-amber-300 font-medium">Hari Libur / Festival</span>
          </div>
        </div>
      </div>
    </div>
  );
}
