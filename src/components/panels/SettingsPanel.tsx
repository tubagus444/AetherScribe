import React, { useState } from 'react';
import { BrainCircuit, HardDrive } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { AISettingsTab } from '@/src/components/panels/settings/AISettingsTab';
import { BackupTab } from '@/src/components/panels/settings/BackupTab';
import { useAISettings } from '@/src/components/panels/settings/useAISettings';

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<'ai' | 'backup'>('ai');
  const aiSettings = useAISettings();

  const tabs = [
    { id: 'ai', label: 'Konfigurasi AI', icon: BrainCircuit },
    { id: 'backup', label: 'Data & Cadangan', icon: HardDrive },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12 w-full">
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Pengaturan</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Kelola model AI, kredensial, dan data lokal Anda dengan mulus.
        </p>
      </div>

      <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 w-full custom-scrollbar overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-label={tab.label}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            aria-describedby={tab.id === 'ai' && aiSettings.isDirty ? 'ai-settings-pending' : undefined}
            onClick={() => setActiveTab(tab.id as 'ai' | 'backup')}
            className={cn(
              "relative px-4 py-3 text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap",
              activeTab === tab.id
                ? "text-indigo-600 dark:text-indigo-400"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            )}
          >
            <tab.icon size={16} />
            {tab.label}
            {tab.id === 'ai' && aiSettings.isDirty && (
              <span id="ai-settings-pending" className="flex items-center">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                <span className="sr-only">Perubahan AI belum disimpan</span>
              </span>
            )}
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeTabIndicatorSettings"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400"
                transition={{ duration: 0.2 }}
              />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'ai' ? (
          <motion.div
            key="ai-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-8"
          >
            <AISettingsTab settings={aiSettings} />
          </motion.div>
        ) : (
          <motion.div
            key="backup-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-8"
          >
            <BackupTab />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
