import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, Plus } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useProjectChapters } from '@/src/hooks/useChapterQueries';
import { useProjectData } from '@/src/hooks/useProjectData';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { useToast } from '@/src/hooks/useToast';
import { db } from '@/src/db';
import { TimelineEvent } from '@/src/types';
import { compareDate, daysInMonth, formatDateRange } from '@/src/lib/worldCalendar';
import { compareEvents, fitPeriods, groupPeriods, Period, periodKey } from '@/src/lib/timelinePeriods';
import { deleteTimelineEvent, moveTimelineEvent } from '@/src/services/timelineOperations';
import { CalendarEventModal, CalendarEventSeed } from './CalendarEventModal';

const control = 'min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition-colors enabled:hover:border-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200';

function readScrollLimits(element: HTMLDivElement) {
  return {
    canScrollLeft: element.scrollLeft > 1,
    canScrollRight: element.scrollWidth - element.clientWidth - element.scrollLeft > 1,
  };
}
type Window = Pick<Period, 'first' | 'last' | 'label'>;
type Zoom = { window: Window; days: boolean };

export function TimelinePanel({ projectId }: { projectId: number }) {
  const { setViewMode } = useNavigation();
  const { toast } = useToast();
  const { codexEntries } = useProjectData(projectId);
  const chapters = useProjectChapters(projectId, 'manuscript');
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const events = useLiveQuery(() => db.timeline.where('projectId').equals(projectId).toArray(), [projectId]);
  const calendar = project?.calendar;
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const [history, setHistory] = useState<Zoom[]>([]);
  const [day, setDay] = useState('');
  const [seed, setSeed] = useState<CalendarEventSeed | null>(null);
  const [overview, setOverview] = useState(false);
  const [scrollLimits, setScrollLimits] = useState({ canScrollLeft: false, canScrollRight: false });
  const updateScrollLimits = useCallback((element: HTMLDivElement) => {
    const next = readScrollLimits(element);
    setScrollLimits(current => current.canScrollLeft === next.canScrollLeft &&
      current.canScrollRight === next.canScrollRight ? current : next);
  }, []);
  const rail = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const dragged = useRef(false);
  const activeDateButton = useRef<HTMLButtonElement>(null);
  const details = useRef<HTMLElement>(null);
  useEffect(() => {
    if (day) details.current?.scrollIntoView({ block: 'nearest' });
  }, [day]);
  const [frameWidth, setFrameWidth] = useState(0);
  const capacity = Math.max(2, Math.floor(frameWidth / 195));
  const zoom = history.at(-1);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setFrameWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const visible = useMemo(() => (events ?? []).filter(e => filter === 'all' ||
    (filter === 'none' ? e.chapterId == null : e.chapterId === Number(filter))).sort(compareEvents), [events, filter]);
  const dated = visible.filter(e => e.startDate);
  const undated = visible.filter(e => !e.startDate);
  const months = calendar ? groupPeriods(dated, calendar, 'month') : [];
  const inWindow = zoom ? dated.filter(e => e.startDate && compareDate(e.startDate, zoom.window.first) >= 0 &&
    compareDate(e.startDate, zoom.window.last) <= 0) : dated;
  const browse = zoom ? zoom.days : !overview;
  const groups = calendar ? browse ? groupPeriods(inWindow, calendar, 'day') : fitPeriods(inWindow, calendar, capacity) : [];
  const hasGroups = groups.length > 0;
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    el.scrollLeft = 0;
    if (!browse) return;
    const onWheel = (event: WheelEvent) => {
      // Native horizontal trackpad input, shift-wheel and pinch zoom keep their own behavior.
      if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientWidth : 1;
      const left = el.scrollLeft;
      const target = Math.min(el.scrollWidth - el.clientWidth, Math.max(0, left + event.deltaY * unit));
      if (Math.abs(target - left) < 0.5) return;
      event.preventDefault();
      el.scrollLeft = target;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [browse, hasGroups, zoom, filter]);
  useEffect(() => {
    const element = rail.current;
    if (!element || !browse) return;
    const measure = () => updateScrollLimits(element);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, [browse, hasGroups, updateScrollLimits]);

  function scrollRail(direction: -1 | 1) {
    const element = rail.current;
    if (!element) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: reduceMotion ? 'instant' : 'smooth' });
  }

  const openGroup = (p: Period) => {
    if (compareDate(p.first, p.last) === 0) {
      const key = periodKey(p.first, 'day');
      setDay(current => current === key ? '' : key);
    }
    else {
      setDay('');
      setHistory([...history, { window: { first: p.first, last: p.last, label: p.label }, days: periodKey(p.first, 'month') === periodKey(p.last, 'month') }]);
    }
  };
  function selectMonth(month?: Period) {
    setDay('');
    if (!month || !calendar) {
      setHistory([]);
      return;
    }
    const first = { ...month.first, day: 1 };
    const last = { ...month.last, day: daysInMonth(calendar, first.month) };
    setHistory([{ window: { first, last, label: month.label }, days: true }]);
  }
  const monthIndex = zoom?.days ? months.findIndex(m => periodKey(m.first, 'month') === periodKey(zoom.window.first, 'month')) : -1;
  const reset = () => { setDay(''); setHistory([]); };
  const selected = day ? inWindow.filter(e => e.startDate && periodKey(e.startDate, 'day') === day) : [];
  const chapterTitle = (e: TimelineEvent) => chapters?.find(c => c.id === e.chapterId)?.title;
  const detail = (e: TimelineEvent, index: number, siblings: TimelineEvent[]) => (
    <details open={!!day && siblings.length === 1 && !!e.startDate || undefined} key={e.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <summary className="cursor-pointer break-words font-medium">{e.title} <small>{chapterTitle(e)}</small></summary>
      <div className="mt-3 space-y-3 text-sm">
        {(e.eventDate || e.startDate && calendar) && <p>{calendar && e.startDate ? formatDateRange(calendar, e.startDate, e.endDate) : e.eventDate}</p>}
        {e.description && <p className="whitespace-pre-wrap break-words">{e.description}</p>}
        {!!e.characterIds?.length && <p>Entitas Codex terkait · {codexEntries.filter(c => c.id != null && e.characterIds?.includes(c.id)).map(c => c.name).join(', ')}</p>}
        <div className="flex flex-wrap gap-2">
          <button className={control} onClick={() => setSeed({ event: e })}>Edit peristiwa</button>
          <button className={control} onClick={async () => {
            if (e.id && window.confirm('Hapus peristiwa ini?')) {
              try { await deleteTimelineEvent(e.id); } catch { toast.error('Gagal menghapus peristiwa.'); }
            }
          }}>Hapus</button>
          {siblings.length > 1 && [-1, 1].map(delta => <button key={delta} className={control} disabled={!siblings[index + delta]} onClick={async () => {
            try { await moveTimelineEvent(projectId, e.id!, siblings[index + delta].id!); } catch { toast.error('Gagal mengurutkan peristiwa.'); }
          }}>{delta < 0 ? 'Naik' : 'Turun'}</button>)}
        </div>
      </div>
    </details>
  );
  return <section className="mx-auto w-full min-w-0 max-w-7xl space-y-4 px-4 pt-4 pb-20 md:px-8 md:pt-8 dark:text-slate-100">
    <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 md:gap-x-4">
      <h1 className="font-serif text-xl sm:text-2xl md:text-3xl">Kronologi Cerita</h1>
      <button className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        onClick={() => setSeed({ chapterId: Number(filter) || undefined })}>
        <Plus aria-hidden="true" size={16} /> Tambah peristiwa
      </button>
    </header>
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
      <nav aria-label="Tampilan kronologi" className="flex items-center gap-2">
        <span aria-current="page" className="inline-flex min-h-10 items-center rounded-lg border border-indigo-100 bg-indigo-50 px-3 text-sm font-semibold text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">Linimasa</span>
        <button className={control} onClick={() => setViewMode('worldcalendar')}>Kalender</button>
      </nav>
      <div role="group" aria-label="Filter linimasa" className="flex min-w-0 flex-wrap items-center gap-2">
        <button className={control + ' md:hidden'} aria-expanded={filterOpen} aria-controls="timeline-chapter-filter"
          onClick={() => setFilterOpen(!filterOpen)}>
          {filter === 'all' ? 'Filter bab' : 'Filter bab aktif'}
        </button>
        <div id="timeline-chapter-filter" className={(filterOpen ? 'block' : 'hidden') + ' order-last w-full min-w-0 md:order-none md:block md:w-auto'}>
          <select aria-label="Filter peristiwa berdasarkan bab" className={control + ' w-full max-w-full md:w-auto md:max-w-48'}
            value={filter} onChange={e => { setFilter(e.target.value); reset(); }}>
            <option value="all">Semua bab</option><option value="none">Tanpa bab</option>
            {chapters?.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <select className={control + ' min-w-0 max-w-full md:max-w-56'} aria-label="Pilih periode"
          value={zoom?.days ? periodKey(zoom.window.first, 'month') : ''}
          onChange={e => selectMonth(months.find(m => periodKey(m.first, 'month') === e.target.value))}>
          <option value="">Pilih periode</option>
          {months.map(m => <option key={periodKey(m.first, 'month')} value={periodKey(m.first, 'month')}>{m.label}</option>)}
        </select>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h2 className="min-w-0 break-words font-serif text-lg">{zoom?.window.label ?? (overview ? 'Seluruh linimasa' : 'Urutan peristiwa')}</h2>
        {monthIndex >= 0 && <>
          <button className={control} aria-label="Periode sebelumnya" disabled={monthIndex === 0} onClick={() => selectMonth(months[monthIndex - 1])}>‹</button>
          <button className={control} aria-label="Periode berikutnya" disabled={monthIndex === months.length - 1} onClick={() => selectMonth(months[monthIndex + 1])}>›</button>
        </>}
        {history.length > 1 && <button className={control} onClick={() => {
          setDay('');
          setHistory(history.slice(0, -1));
        }}>Kembali ke periode sebelumnya</button>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={control} onClick={() => { reset(); setOverview(!(overview && !zoom)); }}>
          {overview && !zoom ? 'Telusuri linimasa' : 'Lihat seluruh linimasa'}
        </button>
        {browse && hasGroups && (scrollLimits.canScrollLeft || scrollLimits.canScrollRight) &&
          <div aria-label="Navigasi horizontal" role="group" className="flex items-center gap-1.5">
            <button className={control + ' inline-grid w-10 place-items-center px-0'} aria-label="Geser ke kiri"
              disabled={!scrollLimits.canScrollLeft} onClick={() => scrollRail(-1)}><ArrowLeft aria-hidden="true" size={16} /></button>
            <button className={control + ' inline-grid w-10 place-items-center px-0'} aria-label="Geser ke kanan"
              disabled={!scrollLimits.canScrollRight} onClick={() => scrollRail(1)}><ArrowRight aria-hidden="true" size={16} /></button>
          </div>}
      </div>
    </div>
    <div ref={frame} className="min-w-0">
      {hasGroups ? <div ref={rail} tabIndex={0} aria-label="Garis waktu"
        className="overflow-x-auto no-scrollbar rounded-xl border border-slate-200 bg-slate-50/60 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-800 dark:bg-slate-900/35"
        onScroll={e => updateScrollLimits(e.currentTarget)}
        onPointerDown={e => {
          dragged.current = false;
          if (e.pointerType === 'mouse' && e.button === 0 && e.currentTarget.scrollWidth > e.currentTarget.clientWidth)
            drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft };
        }}
        onPointerMove={e => {
          if (!drag.current || !e.buttons) return;
          const delta = e.clientX - drag.current.x;
          if (Math.abs(delta) > 5) {
            dragged.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            e.currentTarget.scrollLeft = drag.current.left - delta;
          }
        }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        onClickCapture={e => { if (dragged.current) { e.stopPropagation(); dragged.current = false; } }}>
        <div className={browse ? 'flex w-max min-w-full select-none p-3' : 'flex flex-col gap-2 p-3 md:flex-row md:gap-0'}>
          {groups.map((p, i) => {
            const singleDay = compareDate(p.first, p.last) === 0;
            const key = periodKey(p.first, 'day');
            const active = singleDay && key === day;
            const event = p.events[0];
            const chapter = singleDay && chapterTitle(event);
            const dateLabel = singleDay && p.events.length === 1 && event.endDate && calendar
              ? formatDateRange(calendar, p.first, event.endDate) : p.label;
            const above = i % 2 === 0;
            const cardRow = above ? 'row-start-1' : 'row-start-3';
            return <div key={key} data-timeline-slot
              className={browse
                ? 'grid w-56 shrink-0 grid-rows-[minmax(7rem,1fr)_1.25rem_minmax(7rem,1fr)] px-1'
                : 'min-w-0 border-l border-indigo-200 pl-3 md:grid md:flex-1 md:basis-0 md:grid-rows-[minmax(7rem,1fr)_1.25rem_minmax(7rem,1fr)] md:border-0 md:px-1 dark:border-indigo-800'}>
              <div aria-hidden="true" className={'col-start-1 row-start-2 -mx-1 grid grid-rows-[1fr] items-center justify-items-center ' + (browse ? '' : 'hidden md:grid')}>
                <span className="col-start-1 row-start-1 h-px w-full bg-indigo-200 dark:bg-indigo-800" />
                <span data-timeline-connector className={'col-start-1 row-start-1 h-1/2 w-px bg-indigo-300 dark:bg-indigo-700 ' +
                  (above ? 'self-start' : 'self-end')} />
                <span data-timeline-point className={'z-10 col-start-1 row-start-1 rounded-full border-2 border-indigo-500 ' +
                  (active ? 'size-3.5 bg-indigo-600 ring-2 ring-indigo-200 dark:ring-indigo-900' : 'size-2.5 bg-white dark:bg-slate-900')} />
              </div>
              <button ref={active ? activeDateButton : undefined} aria-expanded={singleDay ? active : undefined}
                aria-controls={active ? 'timeline-day-details' : undefined}
                className={cardRow + ' col-start-1 flex min-h-0 min-w-0 w-full flex-col justify-center gap-1 rounded-xl border px-3 py-2 text-left shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-indigo-500 ' +
                  (active ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950' :
                    'border-slate-200 bg-white hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-900')}
                onClick={() => openGroup(p)}>
                <span className="line-clamp-2 w-full break-words text-xs font-medium text-slate-600 dark:text-slate-300">{dateLabel}</span>
                {singleDay && <strong className="line-clamp-2 w-full break-words text-sm font-semibold leading-snug">{event.title}</strong>}
                {(chapter || p.events.length > 1 || !singleDay) && <span className="flex w-full items-center justify-between gap-1 text-xs">
                  {chapter && <span className="min-w-0 truncate rounded bg-slate-100 px-1.5 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">{chapter}</span>}
                  {(!singleDay || p.events.length > 1) && <span className="shrink-0 font-medium text-indigo-700 dark:text-indigo-300">
                    {singleDay ? 'Lihat ' : ''}{p.events.length} peristiwa
                  </span>}
                </span>}
              </button>
            </div>;
          })}
        </div>
      </div> : <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm">Belum ada peristiwa bertanggal pada tampilan ini.</p>}
    </div>
    {!!selected.length && calendar && <section id="timeline-day-details" ref={details} className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 dark:border-indigo-900 dark:bg-indigo-950/30" aria-label="Peristiwa pada tanggal terpilih">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-xl">{formatDateRange(calendar, selected[0].startDate!)}</h2>
        <button className={control} onClick={() => {
          activeDateButton.current?.focus({ preventScroll: true });
          setDay('');
        }}>Tutup detail</button>
      </div>
      {selected.map((e, i) => detail(e, i, selected))}
    </section>}
    <details className="group/undated rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/50" open={!dated.length || undefined}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-slate-800 [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" size={16} className="shrink-0 text-slate-500 transition-transform group-open/undated:rotate-90 motion-reduce:transition-none" />
        Belum bertanggal ({undated.length})
      </summary>
      <div className="space-y-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
        {undated.length ? undated.map((e, i) => detail(e, i, undated)) :
          <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada peristiwa tanpa tanggal.</p>}
      </div>
    </details>
    {seed && <CalendarEventModal projectId={projectId} calendar={calendar} seed={seed} chapters={chapters ?? []} codex={codexEntries} onClose={() => setSeed(null)} />}
  </section>;
}
