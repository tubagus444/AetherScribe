/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { MessageSquareText, History, Gauge, ListTree, StickyNote, BookOpen } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useEditorPanel } from '@/src/contexts/EditorPanelContext';

type PanelId = 'outline' | 'comments' | 'chapterCodex' | 'assistant' | 'snapshots' | 'insights';

const ITEMS: { id: PanelId; icon: React.ElementType; label: string }[] = [
  { id: 'outline', icon: ListTree, label: 'Kerangka Bab' },
  { id: 'comments', icon: StickyNote, label: 'Catatan Revisi' },
  { id: 'chapterCodex', icon: BookOpen, label: 'Codex di Bab Ini' },
  { id: 'assistant', icon: MessageSquareText, label: 'Asisten AI' },
  { id: 'snapshots', icon: History, label: 'Riwayat Versi' },
  { id: 'insights', icon: Gauge, label: 'Analisis Prosa' },
];

/**
 * Rail ikon vertikal di tepi kanan editor (pola activity bar) untuk membuka/
 * menutup panel samping. Menggantikan toggle panel yang sebelumnya menumpuk di
 * footer, sehingga lebih mudah diperluas saat panel bertambah.
 */
export function EditorActivityRail() {
  const { activePanel, setActivePanel } = useEditorPanel();
  const toggle = (panel: PanelId) => setActivePanel(activePanel === panel ? 'none' : panel);

  return (
    <div className="flex flex-col items-center gap-1 w-12 shrink-0 border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 py-3">
      {ITEMS.map(({ id, icon: Icon, label }) => {
        const active = activePanel === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => toggle(id)}
            title={label}
            aria-label={label}
            aria-pressed={active}
            className={cn(
              "relative p-2.5 rounded-lg transition-colors",
              active
                ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            )}
          >
            {active && (
              <span className="absolute right-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-indigo-500" />
            )}
            <Icon size={18} />
          </button>
        );
      })}
    </div>
  );
}
