/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Editor Profil Kecepatan Perjalanan (Atlas Dunia).
 * Menyusun definisi `Project.travelSpeeds`: preset kecepatan (nama, kecepatan, unit).
 * Profil digunakan oleh MarkerSidebar untuk menghitung waktu tempuh rute.
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Gauge, X, Check, Plus, Trash2, Loader2 } from 'lucide-react';
import { updateProject } from '@/src/services/projectOperations';
import { useToast } from '@/src/hooks/useToast';
import { TravelSpeedProfile } from '@/src/types';
import { cn } from '@/src/lib/utils';

const inputCls = 'bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-lg px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-400';
const labelCls = 'text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider';

export function TravelSpeedSettingsModal({
  projectId, travelSpeeds, onClose,
}: {
  projectId: number;
  travelSpeeds: TravelSpeedProfile[] | undefined;
  onClose: () => void;
}) {
  const { toast } = useToast();
  // Default fallback if undefined
  const [profiles, setProfiles] = useState<TravelSpeedProfile[]>(() => {
    return travelSpeeds && travelSpeeds.length > 0
      ? travelSpeeds
      : [
          { id: 'jalan-kaki', name: 'Jalan Kaki', speedPerDay: 30, unit: 'hari' },
          { id: 'kuda', name: 'Naik Kuda', speedPerDay: 60, unit: 'hari' },
        ];
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const valid = profiles.length > 0 && profiles.every(p => p.name.trim() && p.speedPerDay > 0);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    // Rapikan: pastikan speed > 0
    const cleaned: TravelSpeedProfile[] = profiles.map(p => ({
      id: p.id || generateId(),
      name: p.name.trim() || 'Tanpa Nama',
      speedPerDay: Math.max(0.1, Number(p.speedPerDay) || 1),
      unit: p.unit.trim() || 'hari'
    }));
    try {
      await updateProject(projectId, { travelSpeeds: cleaned });
      toast.success('Profil kecepatan disimpan.');
      onClose();
    } catch {
      toast.error('Gagal menyimpan profil kecepatan.');
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh] animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/60 shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"><Gauge size={16} /></span>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Profil Kecepatan Perjalanan</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-6 overflow-y-auto custom-scrollbar">
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Kelola daftar preset kecepatan untuk berbagai metode transportasi di dunia Anda. Ini digunakan untuk menghitung waktu tempuh otomatis saat Anda menggambar rute di Atlas.
          </p>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <label className={labelCls}>Metode Perjalanan</label>
              <button onClick={() => setProfiles(p => [...p, { id: generateId(), name: 'Metode Baru', speedPerDay: 20, unit: 'hari' }])} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"><Plus size={12} /> Tambah</button>
            </div>
            {profiles.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500 italic">Belum ada profil kecepatan. Rute tidak akan bisa dihitung waktu tempuhnya.</p>}
            <div className="space-y-2">
              {profiles.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2">
                  <input value={p.name} onChange={ev => setProfiles(arr => arr.map((x, j) => j === i ? { ...x, name: ev.target.value } : x))} placeholder="Nama (Jalan Kaki)" className={cn(inputCls, 'flex-1 min-w-[100px]')} />
                  <input type="number" min={0.1} step={0.1} value={p.speedPerDay} onChange={ev => setProfiles(arr => arr.map((x, j) => j === i ? { ...x, speedPerDay: Math.max(0.1, Number(ev.target.value) || 1) } : x))} className={cn(inputCls, 'w-20 shrink-0')} />
                  <span className="text-[11px] text-slate-400 shrink-0">per</span>
                  <input value={p.unit} onChange={ev => setProfiles(arr => arr.map((x, j) => j === i ? { ...x, unit: ev.target.value } : x))} placeholder="hari" className={cn(inputCls, 'w-16 text-center shrink-0')} />
                  <button onClick={() => setProfiles(arr => arr.filter((_, j) => j !== i))} className="p-1.5 text-slate-400 hover:text-rose-500 shrink-0"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800/60 shrink-0">
          {!valid && <span className="text-[11px] text-rose-500">Isi semua nama dan pastikan kecepatan &gt; 0.</span>}
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Batal</button>
            <button onClick={save} disabled={!valid || saving} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors active:scale-95">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Simpan Profil
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
