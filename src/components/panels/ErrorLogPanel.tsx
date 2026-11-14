import { privateErrorRecord } from '@/src/lib/errorPrivacy';
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/src/db';
import { ErrorService } from '@/src/services/errorService';
import { Trash2, AlertCircle, AlertTriangle, Info, Clock, ChevronDown, Calendar } from 'lucide-react';
import { format, subHours, subDays } from 'date-fns';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export function ErrorLogPanel() {
  const errors = useLiveQuery(async () => (await db.errors.orderBy('timestamp').reverse().toArray()).map(privateErrorRecord));
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showClearMenu, setShowClearMenu] = useState(false);

  const getIcon = (type: string) => {
    switch (type) {
      case 'error': return <AlertCircle className="text-red-500" size={16} />;
      case 'warning': return <AlertTriangle className="text-amber-500" size={16} />;
      case 'info': return <Info className="text-blue-500" size={16} />;
      default: return <AlertCircle className="text-slate-500" size={16} />;
    }
  };

  const handleClearLogs = async (type: 'all' | '1h' | '1d' | '7d') => {
    try {
      if (type === 'all') {
        await ErrorService.clearAll();
      } else {
        const now = new Date();
        let thresholdTime: Date;
        
        if (type === '1h') thresholdTime = subHours(now, 1);
        else if (type === '1d') thresholdTime = subDays(now, 1);
        else thresholdTime = subDays(now, 7);

        await db.errors.where('timestamp').below(thresholdTime.getTime()).delete();
      }
      setShowClearMenu(false);
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  };

  if (!errors) return <div className="p-8 text-center text-slate-500">Loading logs...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <AlertCircle className="text-slate-600 dark:text-slate-400" size={20} />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Log Sistem</h2>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Diagnostik tanpa isi naskah, key, atau pesan mentah provider. Salinan log lama tetap di penyimpanan sampai dihapus manual atau dibersihkan otomatis setelah 30 hari.
          </p>
        </div>
        
        {errors.length > 0 && (
          <div className="relative">
            <button 
              onClick={() => setShowClearMenu(!showClearMenu)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all border border-transparent focus:outline-none focus:ring-2 focus:ring-red-500/50"
            >
              <Trash2 size={14} />
              Hapus Log Manual
              <ChevronDown size={14} className={cn("transition-transform duration-200", showClearMenu && "rotate-180")} />
            </button>
            
            <AnimatePresence>
              {showClearMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowClearMenu(false)} />
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden z-50 origin-top-right"
                  >
                    <div className="p-1">
                      <button onClick={() => handleClearLogs('1h')} className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg flex items-center gap-2">
                         <Clock size={14} /> &gt; 1 Jam lalu
                      </button>
                      <button onClick={() => handleClearLogs('1d')} className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg flex items-center gap-2">
                         <Calendar size={14} /> &gt; 1 Hari lalu
                      </button>
                      <button onClick={() => handleClearLogs('7d')} className="w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg flex items-center gap-2">
                         <Calendar size={14} /> &gt; 7 Hari lalu
                      </button>
                      <div className="my-1 border-t border-slate-200 dark:border-slate-700"></div>
                      <button onClick={() => handleClearLogs('all')} className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg flex items-center gap-2 font-medium">
                         <Trash2 size={14} /> Hapus Semua
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
        {errors.length === 0 ? (
          <div className="p-20 text-center">
            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Info size={32} className="text-slate-200 dark:text-slate-700" />
            </div>
            <h3 className="text-slate-900 dark:text-slate-100 font-semibold mb-1">Semua Sistem Normal</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Tidak ada masalah yang perlu perhatian saat ini.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {errors.map((error) => (
              <div key={error.id} className="group transition-colors duration-200">
                <button 
                  onClick={() => setExpandedId(expandedId === error.id ? null : (error.id || null))}
                  className={cn(
                    "w-full flex items-start gap-4 p-5 text-left transition-all",
                    expandedId === error.id ? "bg-slate-50/80 dark:bg-white/[0.03]" : "hover:bg-slate-50 dark:hover:bg-white/[0.01]"
                  )}
                >
                  <div className="mt-1 shadow-sm rounded-full p-1 bg-white dark:bg-slate-800">
                    {getIcon(error.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4 mb-1.5">
                      <span className="font-semibold text-[15px] text-slate-900 dark:text-slate-100 break-words leading-tight">
                        {error.message}
                      </span>
                      <span className="shrink-0 flex items-center gap-1.5 text-[11px] font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                        <Clock size={11} />
                        {format(error.timestamp, 'HH:mm:ss')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                       <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
                        error.type === 'error' && "bg-red-50 dark:bg-red-900/20 text-red-600 border-red-100 dark:border-red-900/30",
                        error.type === 'warning' && "bg-amber-50 dark:bg-amber-900/20 text-amber-600 border-amber-100 dark:border-amber-900/30",
                        error.type === 'info' && "bg-blue-50 dark:bg-blue-900/20 text-blue-600 border-blue-100 dark:border-blue-900/30"
                      )}>
                        {error.type}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-500 font-medium">
                        Modul: <span className="text-slate-700 dark:text-slate-300">{error.source || 'Sistem'}</span>
                      </span>
                    </div>
                  </div>
                  <div className={cn(
                    "mt-1 transition-transform duration-300",
                    expandedId === error.id ? "text-slate-900 dark:text-slate-100" : "text-slate-300 dark:text-slate-700"
                  )}>
                    <ChevronDown size={20} className={cn(expandedId === error.id ? "" : "-rotate-90")} />
                  </div>
                </button>
                
                <AnimatePresence>
                  {expandedId === error.id && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden bg-white dark:bg-slate-950/40"
                    >
                      <div className="px-5 pb-6 pt-2 border-t border-slate-100 dark:border-white/5 space-y-6">
                        <div>
                          <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-2">
                            <span className="w-4 h-[1px] bg-slate-200 dark:bg-slate-800"></span>
                            Detail Pesan
                          </h4>
                          <p className="text-[14px] text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-white/[0.02] p-4 rounded-xl border border-slate-100 dark:border-white/5">
                            {error.message}
                          </p>
                        </div>
                        
                        {error.stack && (
                          <div>
                            <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-2">
                              <span className="w-4 h-[1px] bg-slate-200 dark:bg-slate-800"></span>
                              Jejak Error (Stack Trace)
                            </h4>
                            <div className="bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl p-4 overflow-x-auto">
                              <pre className="text-[12px] text-slate-600 dark:text-slate-400 font-mono leading-relaxed">
                                {error.stack}
                              </pre>
                            </div>
                          </div>
                        )}
                        
                        {error.metadata && (
                          <div>
                            <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-2">
                              <span className="w-4 h-[1px] bg-slate-200 dark:bg-slate-800"></span>
                              Metadata Teknis
                            </h4>
                            <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 rounded-xl p-4">
                              <pre className="text-[12px] text-slate-600 dark:text-slate-400 font-mono">
                                {JSON.stringify(error.metadata, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-4 items-center justify-between text-[11px] font-medium text-slate-400 dark:text-slate-600 pt-2 border-t border-slate-100 dark:border-white/5">
                           <div className="flex gap-4">
                             <span className="flex items-center gap-1.5">
                               <Clock size={12} />
                               {format(error.timestamp, 'yyyy-MM-dd HH:mm:ss.SSS')}
                             </span>
                           </div>
                           <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded uppercase tracking-tighter">Event ID: {error.id}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-6 bg-indigo-50/30 dark:bg-indigo-900/10 border border-indigo-100/50 dark:border-indigo-900/20 rounded-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <Info size={80} className="text-indigo-600 dark:text-indigo-400" />
        </div>
        <div className="flex gap-4 items-start relative z-10">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl text-indigo-600 dark:text-indigo-400">
            <Info size={20} />
          </div>
          <div>
            <h5 className="text-base font-bold text-indigo-900 dark:text-indigo-200 mb-1">Panduan Diagnosis</h5>
            <p className="text-sm text-indigo-700/80 dark:text-indigo-400/70 leading-relaxed max-w-2xl">
              Log ini sangat berguna untuk debugging. Jika Anda menemui masalah teknis, klik detail logs di atas, ambil cuplikan (screenshot) atau salin teks "Stack Trace" dan sertakan dalam laporan masalah Anda.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
