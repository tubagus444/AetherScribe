/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  FileText, LayoutList, BarChart2, Database, BookMarked, Book, 
  Users, CalendarClock, CalendarDays, ClipboardList, Sparkles, 
  Map as MapIcon, Waypoints, Share2, Network, ShieldCheck, 
  Flame, Crosshair, Gauge, Telescope, BrainCircuit, Settings, 
  HelpCircle, AlertTriangle 
} from 'lucide-react';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { getStudioForViewMode, getStudioDef, rememberLastActiveTab, StudioTabDef } from '@/src/lib/studioNavigation';
import { cn } from '@/src/lib/utils';
import { motion } from 'motion/react';

function renderTabIcon(name: string) {
  const iconProps = { size: 14, className: "shrink-0" };
  switch (name) {
    case 'FileText': return <FileText {...iconProps} />;
    case 'LayoutList': return <LayoutList {...iconProps} />;
    case 'BarChart2': return <BarChart2 {...iconProps} />;
    case 'Database': return <Database {...iconProps} />;
    case 'BookMarked': return <BookMarked {...iconProps} />;
    case 'Book': return <Book {...iconProps} />;
    case 'Users': return <Users {...iconProps} />;
    case 'CalendarClock': return <CalendarClock {...iconProps} />;
    case 'CalendarDays': return <CalendarDays {...iconProps} />;
    case 'ClipboardList': return <ClipboardList {...iconProps} />;
    case 'Sparkles': return <Sparkles {...iconProps} />;
    case 'Map': return <MapIcon {...iconProps} />;
    case 'Waypoints': return <Waypoints {...iconProps} />;
    case 'Share2': return <Share2 {...iconProps} />;
    case 'Network': return <Network {...iconProps} />;
    case 'ShieldCheck': return <ShieldCheck {...iconProps} />;
    case 'Flame': return <Flame {...iconProps} />;
    case 'Crosshair': return <Crosshair {...iconProps} />;
    case 'Gauge': return <Gauge {...iconProps} />;
    case 'Telescope': return <Telescope {...iconProps} />;
    case 'BrainCircuit': return <BrainCircuit {...iconProps} />;
    case 'Settings': return <Settings {...iconProps} />;
    case 'HelpCircle': return <HelpCircle {...iconProps} />;
    case 'AlertTriangle': return <AlertTriangle {...iconProps} />;
    default: return <Sparkles {...iconProps} />;
  }
}

export function StudioTabBar() {
  const { viewMode, setViewMode } = useNavigation();
  const studioId = getStudioForViewMode(viewMode);
  const studio = getStudioDef(studioId);

  // Jangan tampilkan tab bar jika di sistem atau studio hanya punya 1 tab
  if (studioId === 'system' || studio.tabs.length <= 1) {
    return null;
  }

  const handleTabClick = async (tab: StudioTabDef) => {
    if (await setViewMode(tab.mode)) rememberLastActiveTab(studioId, tab.mode);
  };

  return (
    <nav
      aria-label={`Sub-navigasi ${studio.label}`}
      className="h-10 flex-none border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md px-3 sm:px-5 flex items-center gap-1 overflow-x-auto scrollbar-none z-20 select-none"
    >
      <div className="flex items-center gap-1.5 py-1">
        {studio.tabs.map((tab) => {
          const isActive = viewMode === tab.mode;
          return (
            <button
              key={tab.mode}
              onClick={() => handleTabClick(tab)}
              className={cn(
                "relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer",
                isActive
                  ? "text-indigo-600 dark:text-indigo-400 font-semibold bg-white dark:bg-slate-800 shadow-xs border border-slate-200/80 dark:border-slate-700/80"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/40 dark:hover:bg-slate-800/40"
              )}
              title={tab.description || tab.label}
            >
              {renderTabIcon(tab.icon)}
              <span>{tab.shortLabel || tab.label}</span>
              {isActive && (
                <motion.span
                  layoutId="activeTabIndicator"
                  className="absolute bottom-0 left-2 right-2 h-0.5 bg-indigo-500 dark:bg-indigo-400 rounded-full"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
