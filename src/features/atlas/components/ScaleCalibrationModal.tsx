/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Modal Kalibrasi Skala Peta.
 * Meminta input jarak nyata dari pengguna setelah menarik garis referensi di peta,
 * lalu menyimpan pengaturan skala ke database.
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ruler, X, Check, Loader2 } from 'lucide-react';
import { calibrateMapScale } from '@/src/services/atlasOperations';
import { useToast } from '@/src/hooks/useToast';

const inputCls = 'bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-lg px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-400';
const labelCls = 'text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block';

export function ScaleCalibrationModal({
  mapId, relativeDistance, onClose,
}: {
  mapId: number;
  relativeDistance: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [realDist, setRealDist] = useState<string>('100');
  const [unit, setUnit] = useState<string>('km');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const numDist = Number(realDist);
  const valid = !isNaN(numDist) && numDist > 0 && unit.trim().length > 0;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const ratioToRelative = numDist / relativeDistance;
      await calibrateMapScale(mapId, { distanceUnit: unit.trim(), ratioToRelative });
      toast.success('Skala peta berhasil dikalibrasi.');
      onClose();
    } catch {
      toast.error('Gagal menyimpan kalibrasi skala.');
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/60 shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"><Ruler size={16} /></span>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Kalibrasi Skala Peta</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
            Berapa jarak sebenarnya dari garis yang baru saja Anda tarik di peta?
          </p>

          <div>
            <label className={labelCls}>Jarak Sebenarnya</label>
            <input
              type="number"
              min={0.1}
              step="any"
              value={realDist}
              onChange={(e) => setRealDist(e.target.value)}
              placeholder="Contoh: 100"
              className={`w-full ${inputCls}`}
              autoFocus
            />
          </div>

          <div>
            <label className={labelCls}>Satuan Jarak</label>
            <input
              type="text"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="Contoh: km, mil, hari kuda"
              className={`w-full ${inputCls}`}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-800/20">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Batal</button>
          <button onClick={save} disabled={!valid || saving} className="flex items-center gap-2 px-5 py-2 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors active:scale-95">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Terapkan Skala
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
