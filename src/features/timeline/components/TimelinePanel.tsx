/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { addTimelineEvent, updateTimelineEvent, deleteTimelineEvent, moveTimelineEvent } from '@/src/services/timelineOperations';
import { db } from '@/src/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, CalendarDays, Plus, Trash2, Pencil, GripVertical, X, BookText, Clock, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useProjectData } from '@/src/hooks/useProjectData';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { useToast } from '@/src/hooks/useToast';
import { TimelineEvent, TimelineEventType, CodexEntry, WorldCalendar } from '@/src/types';
import { formatDateRange } from '@/src/lib/worldCalendar';
import { cn } from '@/src/lib/utils';

interface TimelinePanelProps {
  projectId: number;
}

const TYPE_META: Record<TimelineEventType, { label: string; dot: string; badge: string }> = {
  plot:      { label: 'Plot',         dot: 'bg-indigo-500',  badge: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800/50' },
  character: { label: 'Karakter',     dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50' },
  world:     { label: 'Dunia',        dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/50' },
  subplot:   { label: 'Subplot',      dot: 'bg-sky-500',     badge: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800/50' },
  reveal:    { label: 'Pengungkapan', dot: 'bg-rose-500',    badge: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/50' },
  other:     { label: 'Lainnya',      dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' }
};

const TYPE_ORDER: TimelineEventType[] = ['plot', 'character', 'world', 'subplot', 'reveal', 'other'];

interface FormState {
  title: string;
  eventDate: string;
  description: string;
  type: TimelineEventType;
  chapterId: number | null;
  characterIds: number[];
}

const EMPTY_FORM: FormState = { title: '', eventDate: '', description: '', type: 'plot', chapterId: null, characterIds: [] };

export function TimelinePanel({ projectId }: TimelinePanelProps) {
  const { setViewMode } = useNavigation();
  const { toast } = useToast();
  const { codexEntries } = useProjectData(projectId);

  const events = useLiveQuery(() =>
    db.timeline.where('projectId').equals(projectId).toArray()
  , [projectId]);

  const chapters = useLiveQuery(() =>
    db.chapters.where('projectId').equals(projectId).sortBy('order')
  , [projectId]);

  // Kalender dunia (opsional) — untuk menampilkan tanggal terstruktur peristiwa
  // yang dibuat lewat panel Kalender Dunia di daftar Timeline ini juga.
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const calendar = project?.calendar;

  const [filterChapter, setFilterChapter] = useState<'all' | 'none' | number>('all');
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const chapterTitle = useMemo(() => {
    const map = new Map<number, string>();
    chapters?.forEach(c => c.id != null && map.set(c.id, c.title));
    return map;
  }, [chapters]);

  const codexName = useMemo(() => {
    const map = new Map<number, string>();
    codexEntries.forEach(c => c.id != null && map.set(c.id, c.name));
    return map;
  }, [codexEntries]);

  // Urutan kronologis = order manual (lalu id sebagai tie-breaker stabil).
  const ordered = useMemo(() => {
    const arr = [...(events || [])];
    arr.sort((a, b) => (a.order - b.order) || ((a.id || 0) - (b.id || 0)));
    return arr;
  }, [events]);

  const visible = useMemo(() => {
    if (filterChapter === 'all') return ordered;
    if (filterChapter === 'none') return ordered.filter(e => e.chapterId == null);
    return ordered.filter(e => e.chapterId === filterChapter);
  }, [ordered, filterChapter]);

  const canReorder = filterChapter === 'all';

  const openNew = () => {
    setForm({ ...EMPTY_FORM, chapterId: typeof filterChapter === 'number' ? filterChapter : null });
    setEditingId('new');
  };

  const openEdit = (ev: TimelineEvent) => {
    setForm({
      title: ev.title,
      eventDate: ev.eventDate || '',
      description: ev.description,
      type: ev.type,
      chapterId: ev.chapterId ?? null,
      characterIds: ev.characterIds ?? []
    });
    setEditingId(ev.id!);
  };

  const closeForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const save = async () => {
    const title = form.title.trim();
    if (!title) return;
    const payload = {
      title,
      eventDate: form.eventDate.trim() || undefined,
      description: form.description.trim(),
      type: form.type,
      chapterId: form.chapterId ?? undefined,
      characterIds: form.characterIds.length ? form.characterIds : undefined
    };

    try {
      if (editingId === 'new') {
        await addTimelineEvent({ ...payload, projectId });
      } else if (typeof editingId === 'number') {
        await updateTimelineEvent(editingId, payload);
      }
      closeForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan peristiwa.');
    }
  };

  const remove = async (id: number) => {
    await deleteTimelineEvent(id);
    if (editingId === id) closeForm();
  };

  // Reorder dengan menormalkan ulang seluruh field order (anti tabrakan nilai).
  const reorder = async (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= ordered.length || to >= ordered.length) return;
    try {
      await moveTimelineEvent(projectId, ordered[from].id!, ordered[to].id!);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal mengurutkan peristiwa.');
    }
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex != null) reorder(dragIndex, targetIndex);
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-8 pb-20 w-full">
      {/* Header */}
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs font-semibold tracking-wide uppercase border border-indigo-100 dark:border-indigo-800/50">
          <CalendarClock size={14} />
          <span>Timeline Cerita</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-serif text-slate-900 dark:text-slate-100 tracking-tight">
          Kronologi Peristiwa
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base max-w-2xl leading-relaxed">
          Susun urutan peristiwa cerita untuk menjaga alur waktu tetap masuk akal. Tautkan tiap peristiwa ke bab dan karakter, lalu beri label waktu in-world untuk mencegah lubang plot. Seret kartu untuk mengubah urutan.
        </p>
        <div className="pt-1">
          <button
            onClick={() => setViewMode('worldcalendar')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 hover:underline transition-colors"
          >
            Atur sistem penanggalan di Kalender Dunia →
          </button>
        </div>
      </header>

      {/* Kontrol */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Filter bab</label>
          <select
            aria-label="Filter peristiwa berdasarkan bab"
            value={typeof filterChapter === 'number' ? String(filterChapter) : filterChapter}
            onChange={(e) => {
              const v = e.target.value;
              setFilterChapter(v === 'all' || v === 'none' ? v : Number(v));
            }}
            className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
          >
            <option value="all">Semua peristiwa</option>
            <option value="none">Tanpa bab</option>
            {chapters?.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
        <button
          onClick={openNew}
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-all active:scale-[0.98] shadow-sm hover:shadow-md"
        >
          <Plus size={16} /> Tambah Peristiwa
        </button>
      </div>

      {/* Form (tambah/edit) */}
      <AnimatePresence>
        {editingId !== null && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <EventForm
              form={form}
              setForm={setForm}
              chapters={chapters || []}
              codex={codexEntries}
              isNew={editingId === 'new'}
              structuredDate={
                typeof editingId === 'number' && calendar
                  ? (() => {
                      const ev = (events || []).find(e => e.id === editingId);
                      return ev?.startDate ? formatDateRange(calendar, ev.startDate, ev.endDate) : null;
                    })()
                  : null
              }
              onSave={save}
              onCancel={closeForm}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline */}
      {events === undefined ? null : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 px-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/50">
          <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center mb-5">
            <Clock size={24} className="text-slate-300 dark:text-slate-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
            {filterChapter === 'all' ? 'Timeline masih kosong' : 'Tidak ada peristiwa untuk filter ini'}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm">
            Tambahkan peristiwa untuk membangun kronologi cerita dan menjaga konsistensi alur waktu.
          </p>
        </div>
      ) : (
        <div className="relative pl-6">
          {/* Garis rel timeline */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {visible.map((ev, idx) => (
                <TimelineRow
                  key={ev.id}
                  event={ev}
                  calendar={calendar}
                  chapterLabel={ev.chapterId != null ? chapterTitle.get(ev.chapterId) : undefined}
                  characterNames={(ev.characterIds || []).map(id => codexName.get(id)).filter((n): n is string => !!n)}
                  canReorder={canReorder}
                  isDragging={dragIndex === idx}
                  isDragOver={overIndex === idx && dragIndex !== idx}
                  onEdit={() => openEdit(ev)}
                  onDelete={() => remove(ev.id!)}
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={() => setOverIndex(idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineRow({
  event, calendar, chapterLabel, characterNames, canReorder, isDragging, isDragOver,
  onEdit, onDelete, onDragStart, onDragOver, onDrop, onDragEnd
}: {
  event: TimelineEvent;
  calendar?: WorldCalendar;
  chapterLabel?: string;
  characterNames: string[];
  canReorder: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const meta = TYPE_META[event.type] || TYPE_META.other;
  // Tanggal terstruktur (Kalender Dunia) diutamakan bila ada; jika tidak, pakai
  // label waktu bebas `eventDate`. Menjadikan peristiwa dari Kalender tampil
  // bertanggal di daftar Timeline juga (tak lagi terlihat kosong).
  const structuredDate = calendar && event.startDate ? formatDateRange(calendar, event.startDate, event.endDate) : null;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="relative"
      draggable={canReorder}
      onDragStart={onDragStart}
      onDragOver={canReorder ? (e) => { e.preventDefault(); onDragOver(); } : undefined}
      onDrop={canReorder ? (e) => { e.preventDefault(); onDrop(); } : undefined}
      onDragEnd={onDragEnd}
    >
      {/* Titik di rel */}
      <span className={cn('absolute -left-[22px] top-5 w-3.5 h-3.5 rounded-full ring-4 ring-background', meta.dot)} />

      <div className={cn(
        'group bg-white dark:bg-slate-900 border rounded-2xl p-5 shadow-sm transition-all',
        isDragOver ? 'border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-100 dark:ring-indigo-900/50' : 'border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800/50',
        isDragging && 'opacity-50'
      )}>
        <div className="flex items-start gap-3">
          {canReorder && (
            <span className="mt-1 text-slate-300 dark:text-slate-600 cursor-grab active:cursor-grabbing shrink-0" title="Seret untuk mengubah urutan">
              <GripVertical size={16} />
            </span>
          )}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {structuredDate ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400" title="Tanggal dari Kalender Dunia">
                  <CalendarDays size={11} /> {structuredDate}
                </span>
              ) : event.eventDate ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <Clock size={11} /> {event.eventDate}
                </span>
              ) : null}
              <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-semibold border', meta.badge)}>
                {meta.label}
              </span>
              {chapterLabel && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 max-w-[180px]">
                  <BookText size={11} className="shrink-0" />
                  <span className="truncate">{chapterLabel}</span>
                </span>
              )}
            </div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">{event.title}</h3>
            {event.description && (
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap break-words">{event.description}</p>
            )}
            {characterNames.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                <Users size={12} className="text-slate-400 shrink-0" />
                {characterNames.map((name, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/40">
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Aksi */}
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button onClick={onEdit} title="Edit" className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
              <Pencil size={15} />
            </button>
            <button onClick={onDelete} title="Hapus" className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function EventForm({
  form, setForm, chapters, codex, isNew, structuredDate, onSave, onCancel
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  chapters: { id?: number; title: string }[];
  codex: CodexEntry[];
  isNew: boolean;
  /** Tanggal terstruktur dari Kalender Dunia bila peristiwa ini punya (mode edit). */
  structuredDate?: string | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const sortedCodex = useMemo(() => [...codex].sort((a, b) => a.name.localeCompare(b.name)), [codex]);

  const toggleCharacter = (id: number) => {
    setForm(f => ({
      ...f,
      characterIds: f.characterIds.includes(id)
        ? f.characterIds.filter(x => x !== id)
        : [...f.characterIds, id]
    }));
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800/50 rounded-2xl p-5 shadow-sm space-y-4 ring-4 ring-indigo-50 dark:ring-indigo-950/40">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">{isNew ? 'Peristiwa Baru' : 'Edit Peristiwa'}</h2>
        <button onClick={onCancel} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Judul peristiwa</label>
          <input
            autoFocus
            value={form.title}
            onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); }}
            placeholder="mis. Kael menemukan pedang kuno"
            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-900 transition-all placeholder:text-slate-400"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Catatan waktu (bebas)</label>
          <input
            value={form.eventDate}
            onChange={(e) => setForm(f => ({ ...f, eventDate: e.target.value }))}
            placeholder="mis. Hari 3, Pagi"
            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-900 transition-all placeholder:text-slate-400"
          />
          {structuredDate ? (
            <p className="text-[11px] text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
              <CalendarDays size={11} className="shrink-0" /> Terjadwal di Kalender: {structuredDate}
            </p>
          ) : (
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Label bebas. Untuk tanggal terstruktur di grid, pakai panel Kalender Dunia.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Kategori</label>
          <select
            aria-label="Kategori peristiwa"
            value={form.type}
            onChange={(e) => setForm(f => ({ ...f, type: e.target.value as TimelineEventType }))}
            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
          >
            {TYPE_ORDER.map(t => (
              <option key={t} value={t}>{TYPE_META[t].label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Bab terkait (opsional)</label>
          <select
            aria-label="Bab terkait"
            value={form.chapterId == null ? '' : String(form.chapterId)}
            onChange={(e) => setForm(f => ({ ...f, chapterId: e.target.value ? Number(e.target.value) : null }))}
            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
          >
            <option value="">— Tidak ada —</option>
            {chapters.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Deskripsi</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Apa yang terjadi pada peristiwa ini?"
          className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-900 transition-all min-h-[80px] resize-none leading-relaxed placeholder:text-slate-400"
        />
      </div>

      {/* Karakter/entitas terkait */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Users size={12} /> Karakter / entitas terkait
        </label>
        {sortedCodex.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 italic">Belum ada entri Kamus Data untuk ditautkan.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar p-0.5">
            {sortedCodex.map(c => {
              const active = c.id != null && form.characterIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => c.id != null && toggleCharacter(c.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all active:scale-95',
                    active
                      ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700'
                  )}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
          Batal
        </button>
        <button
          onClick={onSave}
          disabled={!form.title.trim()}
          className="px-5 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:opacity-50 transition-all active:scale-[0.98]"
        >
          {isNew ? 'Tambah' : 'Simpan'}
        </button>
      </div>
    </div>
  );
}
