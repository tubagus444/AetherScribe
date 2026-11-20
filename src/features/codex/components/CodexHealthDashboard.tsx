/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { WorldCompletenessPanel } from './WorldCompletenessPanel';
import { OrphanScanPanel } from './OrphanScanPanel';
import { ClipboardList, UserSearch } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface CodexHealthDashboardProps {
  projectId: number;
}

export function CodexHealthDashboard({ projectId }: CodexHealthDashboardProps) {
  const [activeTab, setActiveTab] = useState<'completeness' | 'orphans'>('completeness');

  return (
    <div className="flex flex-col w-full">
      <div className="mx-auto mb-6 flex w-full max-w-[1200px] flex-wrap gap-2 border-b border-slate-200 pb-4 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('completeness')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
            activeTab === 'completeness' 
              ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400 shadow-sm" 
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-300 dark:hover:bg-slate-800/50"
          )}
        >
          <ClipboardList size={16} /> Kelengkapan Dunia
        </button>
        <button
          onClick={() => setActiveTab('orphans')}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
            activeTab === 'orphans' 
              ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400 shadow-sm" 
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:text-slate-400 dark:hover:text-slate-300 dark:hover:bg-slate-800/50"
          )}
        >
          <UserSearch size={16} /> Saran Entitas (Yatim)
        </button>
      </div>

      <div className="flex-1 w-full relative">
        {activeTab === 'completeness' ? (
          <WorldCompletenessPanel projectId={projectId} />
        ) : (
          <OrphanScanPanel projectId={projectId} />
        )}
      </div>
    </div>
  );
}
