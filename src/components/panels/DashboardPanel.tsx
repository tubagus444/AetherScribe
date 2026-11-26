/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useChapterList } from '@/src/hooks/useChapterQueries';
import React, { useMemo, useState, useEffect } from 'react';
import { db } from '@/src/db';
import { useOptimizedLiveQuery } from '@/src/hooks/useOptimizedLiveQuery';
import { useProjectData } from '@/src/hooks/useProjectData';
import { BarChart2, Book, FileText, Clock, Database, HardDrive, Target, Sparkles, Server, AlertTriangle, ScrollText, Network, Flame, TrendingUp, PenLine } from 'lucide-react';
import { countWords } from '@/src/lib/utils';
import { motion } from 'motion/react';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { useDailyProgress } from '@/src/hooks/useDailyProgress';
import { readLastEditedChapter } from '@/src/features/editor/editPosition';

interface DashboardPanelProps {
  projectId: number;
}

// Label manusiawi untuk tiap actionType yang dicatat di aiUsageLogs (proxy.ts).
// Catatan: 'chat' mencakup Studio Asisten DAN Scribble — keduanya memakai processChat.
const ACTION_LABELS: Record<string, string> = {
  rewrite: 'Tulis Ulang',
  chat: 'Asisten (Studio & Scribble)',
  consistency: 'Cek Konsistensi',
  'consistency-inline': 'Konsistensi Inline',
  extract: 'Saran Entitas',
  expand: 'Perluas Codex',
  summarize: 'Auto-Ringkasan',
  other: 'Lainnya',
};
const actionLabel = (t: string) => ACTION_LABELS[t] || t;

export function DashboardPanel({ projectId }: DashboardPanelProps) {
  const [storageInfo, setStorageInfo] = useState<{ usage: number, quota: number } | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { resumeChapter } = useNavigation();

  const project = useOptimizedLiveQuery(() => db.projects.get(projectId), [projectId]);
  const chapters = useChapterList(projectId);
  const { codexEntries, aiActions, bibleRules, relationships } = useProjectData(projectId);
  const timelineCount = useOptimizedLiveQuery(() => db.timeline.where('projectId').equals(projectId).count(), [projectId]);
  
  const systemStats = useOptimizedLiveQuery(async () => {
    return {
      snapshots: await db.snapshots.count(),
      backups: await db.backups.count(),
      errors: await db.errors.count()
    };
  }, []);

  const aiStats = useOptimizedLiveQuery(async () => {
    const chatSessions = await db.chatSessions.where('projectId').equals(projectId).toArray();
    let messageCount = 0;
    chatSessions.forEach(s => {
      messageCount += s.messages.length;
    });

    const logs = await db.aiUsageLogs.toArray();
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    let totalTokensThisWeek = 0;
    let promptTokensThisWeek = 0;
    let cachedTokensThisWeek = 0;
    const modelUsage: Record<string, number> = {};
    // Rincian per fitur (actionType). prompt = input, completion = output,
    // cached = bagian input yang dilayani dari cache (subset prompt).
    type ActionAgg = { total: number; prompt: number; completion: number; cached: number; count: number };
    const actionUsage: Record<string, ActionAgg> = {};

    logs.forEach(log => {
        if (log.timestamp > oneWeekAgo) {
            totalTokensThisWeek += log.totalTokens;
            promptTokensThisWeek += log.promptTokens || 0;
            cachedTokensThisWeek += log.cachedTokens || 0;

            // Normalize provider names somewhat (dihitung dalam jendela 7 hari yang sama
            // agar "Model Teratas" konsisten dengan total token di kartu).
            let pName = log.provider;
            if (pName === 'google') pName = 'Gemini';
            else if (pName === 'openrouter') pName = 'OpenR';
            else if (pName === 'huggingface') pName = 'HF';
            else if (pName === 'openai') pName = 'OpenAI';

            const label = `${pName} (${log.model})`;
            modelUsage[label] = (modelUsage[label] || 0) + log.totalTokens;

            const at = log.actionType || 'other';
            const a = actionUsage[at] || (actionUsage[at] = { total: 0, prompt: 0, completion: 0, cached: 0, count: 0 });
            a.total += log.totalTokens;
            a.prompt += log.promptTokens || 0;
            a.completion += log.completionTokens || 0;
            a.cached += log.cachedTokens || 0;
            a.count += 1;
        }
    });

    const topModels = Object.entries(modelUsage).sort((a,b) => b[1] - a[1]).slice(0, 3);
    const actionBreakdown = Object.entries(actionUsage).sort((a, b) => b[1].total - a[1].total);
    // Rasio token input yang dilayani dari prompt cache (semakin tinggi = semakin hemat).
    const cacheHitRate = promptTokensThisWeek > 0
      ? Math.round((cachedTokensThisWeek / promptTokensThisWeek) * 100)
      : 0;

    return {
      activeSessions: chatSessions.length,
      totalMessages: messageCount,
      totalTokensThisWeek,
      cachedTokensThisWeek,
      cacheHitRate,
      topModels,
      actionBreakdown
    };
  }, [projectId]);

  useEffect(() => {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then(({ usage, quota }) => {
        if (usage !== undefined && quota !== undefined) {
          setStorageInfo({ usage, quota });
        }
      }).catch(console.error);
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const totalWords = useMemo(() => {
    if (!chapters) return 0;
    return chapters.reduce((acc, ch) => acc + ch._computedWordCount, 0);
  }, [chapters]);

  const readTimeMin = Math.ceil(totalWords / 250);

  // #1 Progres menulis harian + streak (sumber yang sama dengan pill header).
  const { wordsToday, streak, dailyGoal, dailyPercent } = useDailyProgress(projectId, totalWords, project);

  const lastChapter = useMemo(() => {
    if (!chapters || chapters.length === 0) return null;
    const lastEditedId = readLastEditedChapter(projectId);
    return chapters.find(chapter => chapter.id === lastEditedId)
      ?? chapters.reduce((latest, ch) => (ch.lastModified > latest.lastModified || (ch.lastModified === latest.lastModified && ch.id! < latest.id!) ? ch : latest));
  }, [chapters, projectId]);

  const continueWriting = () => {
    if (!lastChapter) return;
    void resumeChapter(lastChapter.id!);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const wordGoal = project?.wordGoal || 50000;
  const progressPercent = Math.min(100, Math.round((totalWords / wordGoal) * 100));

  return (
    <div className="max-w-[1600px] mx-auto pb-8 mt-2">
      <header className="mb-4 px-2 lg:px-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl shrink-0">
            <BarChart2 className="text-indigo-600 dark:text-indigo-400" size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400 mb-0.5">Dashboard Proyek</p>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
              {project?.name || 'Proyek'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Ringkasan statistik, progres naskah, dan telemetri sistem.</p>
          </div>
        </div>

        {/* #3 CTA: lanjut menulis di bab terakhir yang disentuh */}
        {lastChapter && (
          <button
            onClick={continueWriting}
            className="flex items-center gap-2.5 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all shadow-sm hover:shadow active:scale-95 shrink-0 self-start sm:self-auto"
            title={`Buka editor pada "${lastChapter.title}"`}
          >
            <PenLine size={16} className="shrink-0" />
            <span className="flex flex-col items-start leading-tight text-left">
              <span>Lanjutkan menulis</span>
              <span className="text-[11px] font-normal text-indigo-200 max-w-[170px] truncate">{lastChapter.title}</span>
            </span>
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 px-2 lg:px-0 items-stretch">
        {/* Kolom kiri: Progres + Data Lore ditumpuk vertikal */}
        <div className="col-span-1 md:col-span-4 flex flex-col gap-3">
        {/* Progress Card */}
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-4 shadow-sm flex flex-col justify-center overflow-hidden relative group">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full blur-3xl transition-all duration-700 group-hover:scale-110 pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-purple-500/5 dark:bg-purple-500/10 rounded-full blur-3xl transition-all duration-700 group-hover:scale-110 pointer-events-none" />
          
          <div className="relative z-10 flex flex-col gap-3">
            <div className="flex-1 w-full shrink-0">
              <div className="flex items-center gap-2.5 mb-2">
                <Target size={15} className="text-indigo-500" />
                <h3 className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">
                  Target Progres Naskah
                </h3>
              </div>

              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{progressPercent}%</span>
                <span className="text-sm text-slate-500 dark:text-slate-400 font-medium ml-1">{totalWords.toLocaleString()} / {wordGoal.toLocaleString()} kata</span>
              </div>

              <div className="h-2 bg-slate-100 dark:bg-slate-800/80 rounded-full overflow-hidden w-full shadow-inner ring-1 ring-black/5 dark:ring-white/5">
                <div 
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-1000 ease-out relative"
                  style={{ width: `${progressPercent}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 w-full h-full transform skew-x-12 translate-x-full animate-[shimmer_2s_infinite]"></div>
                </div>
              </div>

              {/* #1 Progres harian + streak */}
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <TrendingUp size={14} className="text-indigo-500" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">Hari Ini</span>
                  </div>
                  {streak > 0 && (
                    <span
                      className="flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-0.5 rounded-full border border-amber-100 dark:border-amber-900/30"
                      title={`${streak} hari berturut-turut memenuhi target harian`}
                    >
                      <Flame size={12} /> {streak} hari beruntun
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums">{wordsToday.toLocaleString()}</span>
                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">/ {dailyGoal.toLocaleString()} kata target harian</span>
                  <span className={`ml-auto text-sm font-bold ${dailyPercent >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-600 dark:text-indigo-400'}`}>{dailyPercent}%</span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-slate-800/80 rounded-full overflow-hidden w-full shadow-inner">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${dailyPercent >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                    style={{ width: `${dailyPercent}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-row gap-3 w-full">
               <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800/80 flex-1 flex flex-col justify-center">
                 <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-1">
                   <Clock size={14} />
                   <p className="text-[11px] font-bold uppercase tracking-wider">Est. Baca</p>
                 </div>
                 <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{readTimeMin} <span className="text-sm font-medium text-slate-500">mnt</span></p>
               </div>

               <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800/80 flex-1 flex flex-col justify-center">
                 <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 mb-1">
                   <FileText size={14} />
                   <p className="text-[11px] font-bold uppercase tracking-wider">Bab Aktif</p>
                 </div>
                 <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{chapters?.length || 0}</p>
               </div>
            </div>
          </div>
        </motion.div>

        {/* Content Metrics */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.4 }} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-4 shadow-sm flex flex-col flex-1">
           <div className="flex items-center gap-2.5 mb-2.5">
             <div className="p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg shadow-inner border border-amber-200/50 dark:border-amber-700/30">
               <Book size={16} />
             </div>
             <div>
               <h3 className="font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100">Data Lore & Dunia</h3>
               <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Informasi ensiklopedia</p>
             </div>
           </div>

           <div className="grid grid-cols-2 gap-3 auto-rows-fr flex-1">
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 flex flex-col justify-center">
                <div className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-0.5">{codexEntries.length}</div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Entri Codex</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 flex flex-col justify-center">
                <div className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-0.5">{bibleRules.length}</div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Aturan Dasar</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 flex flex-col justify-center">
                <div className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-0.5">{relationships.length}</div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Relasi</div>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 flex flex-col justify-center">
                <div className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-0.5">{timelineCount ?? 0}</div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Event Timeline</div>
              </div>
           </div>
        </motion.div>
        </div>
        {/* Akhir kolom kiri */}

        {/* AI Metrics — kolom kanan, setinggi kolom kiri */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-4 shadow-sm col-span-1 md:col-span-8 flex flex-col">
           <div className="flex items-center justify-between mb-2.5">
             <div className="flex items-center gap-2.5">
               <div className="p-2 bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-600 dark:text-fuchsia-400 rounded-lg shadow-inner border border-fuchsia-200/50 dark:border-fuchsia-700/30">
                 <Sparkles size={16} />
               </div>
               <div>
                 <h3 className="font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100">Aktivitas AI</h3>
                 <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Penggunaan model & sesi</p>
               </div>
             </div>
           </div>

           <div className="flex flex-col gap-2.5 flex-1">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
               <div className="bg-fuchsia-50/50 dark:bg-fuchsia-900/10 rounded-xl p-3 flex justify-between items-center border border-fuchsia-100 dark:border-fuchsia-900/20">
                 <div>
                   <div className="text-lg font-bold text-fuchsia-700 dark:text-fuchsia-300">{(aiStats?.totalTokensThisWeek || 0).toLocaleString()}</div>
                   <div className="text-xs font-semibold text-fuchsia-600/70 dark:text-fuchsia-400/70">Total Token (7 Hari Terakhir)</div>
                 </div>
                 <Network size={26} className="text-fuchsia-300/50 dark:text-fuchsia-700/50 stroke-1" />
               </div>

               <div className="bg-emerald-50/50 dark:bg-emerald-900/10 rounded-xl p-3 flex justify-between items-center border border-emerald-100 dark:border-emerald-900/20">
                 <div>
                   <div className="flex items-baseline gap-2">
                     <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{(aiStats?.cachedTokensThisWeek || 0).toLocaleString()}</span>
                     <span className="text-sm font-bold text-emerald-600/80 dark:text-emerald-400/80">({aiStats?.cacheHitRate ?? 0}%)</span>
                   </div>
                   <div className="text-xs font-semibold text-emerald-600/70 dark:text-emerald-400/70">Token dari Cache (Hemat Biaya Input)</div>
                 </div>
                 <Database size={26} className="text-emerald-300/50 dark:text-emerald-700/50 stroke-1" />
               </div>
             </div>

             <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/50 px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">Sesi Chat</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 shrink-0">{aiStats?.activeSessions ?? 0}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">Pesan</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 shrink-0">{(aiStats?.totalMessages ?? 0).toLocaleString()}</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">Snippets</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 shrink-0">{aiActions.length}</span>
                </div>
             </div>

             {/* Dua panel rincian bersebelahan di layar lebar (kartu kini full-width). */}
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
             {/* #2 Model teratas (datanya sudah dihitung; sebelumnya tak ditampilkan) */}
             {aiStats?.topModels && aiStats.topModels.length > 0 && (
               <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800/80">
                 <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Model Teratas (7 Hari)</p>
                 <div className="space-y-2">
                   {aiStats.topModels.map(([label, tokens]) => {
                     const max = aiStats.topModels[0][1] || 1;
                     const pct = Math.max(5, Math.round((tokens / max) * 100));
                     return (
                       <div key={label}>
                         <div className="flex items-baseline justify-between gap-2 mb-1">
                           <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">{label}</span>
                           <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">{tokens.toLocaleString()}</span>
                         </div>
                         <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                           <div className="h-full bg-fuchsia-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                         </div>
                       </div>
                     );
                   })}
                 </div>
               </div>
             )}

             {/* Rincian token per fitur (actionType). Datanya sudah dicatat per-aksi di
                 aiUsageLogs — di sini dikelompokkan agar tiap fitur AI terlihat porsinya. */}
             {aiStats?.actionBreakdown && aiStats.actionBreakdown.length > 0 && (
               <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800/80">
                 <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Token per Fitur (7 Hari)</p>
                 <div className="space-y-2">
                   {aiStats.actionBreakdown.map(([type, agg]) => {
                     const max = aiStats.actionBreakdown[0][1].total || 1;
                     const pct = Math.max(5, Math.round((agg.total / max) * 100));
                     return (
                       <div key={type}>
                         <div className="flex items-baseline justify-between gap-2 mb-1">
                           <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate" title={`${agg.count}× pemanggilan`}>{actionLabel(type)}</span>
                           <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">{agg.total.toLocaleString()}</span>
                         </div>
                         <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-1">
                           <div className="h-full bg-indigo-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                         </div>
                         <div className="flex items-center gap-x-3 text-[10px] font-mono text-slate-400 dark:text-slate-500 tabular-nums">
                           <span title="Token input (prompt)">in {agg.prompt.toLocaleString()}</span>
                           <span title="Token output (jawaban)">out {agg.completion.toLocaleString()}</span>
                           {agg.cached > 0 && <span className="text-emerald-500/80" title="Token input dari cache">cache {agg.cached.toLocaleString()}</span>}
                         </div>
                       </div>
                     );
                   })}
                 </div>
               </div>
             )}
             </div>
           </div>
        </motion.div>

        {/* System Details — di-de-emphasize jadi strip ringkas full-width (#4).
            Catatan: backups/snapshots/errors di-count seluruh DB (bukan per-proyek). */}
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.4 }} className="col-span-1 md:col-span-12 bg-slate-50/70 dark:bg-slate-900/40 rounded-2xl border border-slate-200/70 dark:border-slate-800/60 px-4 py-3">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6">
            <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 shrink-0">
              <Server size={15} />
              <span className="text-[11px] font-bold uppercase tracking-widest">Telemetri Sistem</span>
            </div>

            {/* Penyimpanan */}
            <div className="flex-1 min-w-[180px]">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Penyimpanan</span>
                <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  {storageInfo ? `${formatBytes(storageInfo.usage)} / ${formatBytes(storageInfo.quota)}` : '---'}
                </span>
              </div>
              <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                {storageInfo && storageInfo.quota > 0 && (
                  <div
                    className={`h-full transition-all duration-1000 ease-out ${(storageInfo.usage / storageInfo.quota) > 0.8 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, (storageInfo.usage / storageInfo.quota) * 100)}%` }}
                  />
                )}
              </div>
            </div>

            {/* Chip status ringkas */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs shrink-0">
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  {isOnline && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                </span>
                <span className="font-semibold text-slate-600 dark:text-slate-300">{isOnline ? 'Online' : 'Offline'}</span>
              </span>
              <span className="text-slate-400 dark:text-slate-500">DB <span className="font-mono font-semibold text-slate-600 dark:text-slate-300">v{db.verno}</span></span>
              <span className="text-slate-400 dark:text-slate-500">Backups <strong className="font-semibold text-slate-600 dark:text-slate-300">{systemStats?.backups ?? 0}</strong></span>
              <span className="text-slate-400 dark:text-slate-500">Snapshots <strong className="font-semibold text-slate-600 dark:text-slate-300">{systemStats?.snapshots ?? 0}</strong></span>
              <span className={(systemStats?.errors ?? 0) > 0 ? 'text-rose-500 font-bold' : 'text-slate-400 dark:text-slate-500'}>
                Errors <strong className={(systemStats?.errors ?? 0) > 0 ? 'text-rose-600' : 'font-semibold text-slate-600 dark:text-slate-300'}>{systemStats?.errors ?? 0}</strong>
              </span>
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
}

