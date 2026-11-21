import { ChatOutputControl } from './ChatOutputControl';
import { getModelForProvider } from '@/src/services/ai/proxy';
import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Edit2, Check, X, MoreVertical, Trash2, Cpu, ChevronDown, Settings } from 'lucide-react';
import { updateChatSession, deleteChatSession } from '@/src/services/chatSessionOperations';
import { ChatSession } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { getSessionModeLabel } from '@/src/lib/constants';
import { useNavigation } from '@/src/contexts/NavigationContext';

interface AssistantHeaderProps {
  activeSessionId: number;
  activeSession: ChatSession | undefined;
  onBack: () => void;
  onSessionDeleted: () => void;
  availableProviders: string[];
  selectedProvider: string;
  onSelectProvider: (provider: string) => void;
}

const providerLabel = (p: string) => (p === 'google' ? 'Gemini' : p.charAt(0).toUpperCase() + p.slice(1));

export function AssistantHeader({
  activeSessionId,
  activeSession,
  onBack,
  onSessionDeleted,
  availableProviders,
  selectedProvider,
  onSelectProvider
}: AssistantHeaderProps) {
  const { setViewMode } = useNavigation();
  const [isHeaderEditing, setIsHeaderEditing] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const providerMenuRef = useRef<HTMLDivElement>(null);

  // Model dibaca langsung dari localStorage (sumber kebenaran di Pengaturan); kosong = model bawaan provider.
  const activeModel = localStorage.getItem(`ai_model_${selectedProvider}`) || '';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
      if (providerMenuRef.current && !providerMenuRef.current.contains(event.target as Node)) {
        setShowProviderMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRename = async () => {
    if (!editTitleValue.trim()) {
      setIsHeaderEditing(false);
      return;
    }
    try {
      await updateChatSession(activeSessionId, { title: editTitleValue.trim() });
      setIsHeaderEditing(false);
    } catch (error) {
      console.error('Failed to rename session:', error);
    }
  };

  const deleteSession = async () => {
    try {
      await deleteChatSession(activeSessionId);
      onSessionDeleted();
      setShowMoreMenu(false);
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const toggleSmartAuto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (activeSessionId) {
      await updateChatSession(activeSessionId, { smartAutoEnabled: e.target.checked });
    }
  };

  return (
    <div className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali ke daftar percakapan"
          className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg lg:hidden"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          {isHeaderEditing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={editTitleValue}
                onChange={e => setEditTitleValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRename();
                  if (e.key === 'Escape') setIsHeaderEditing(false);
                }}
                aria-label="Nama percakapan"
                placeholder="Nama percakapan"
                className="bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-3 py-1 text-sm font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 w-full max-w-xs"
              />
              <div className="flex items-center gap-1">
                <button 
                  onClick={handleRename}
                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors"
                  title="Simpan"
                >
                  <Check size={18} />
                </button>
                <button 
                  onClick={() => setIsHeaderEditing(false)}
                  className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                  title="Batal"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          ) : (
            <>
              <h3 
                className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-md cursor-pointer hover:text-indigo-600 transition-colors flex items-center gap-2"
                onClick={() => {
                  setEditTitleValue(activeSession?.title || '');
                  setIsHeaderEditing(true);
                }}
              >
                {activeSession?.title}
                {activeSession?.mode && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold uppercase tracking-wider">
                      {getSessionModeLabel(activeSession.mode)}
                    </span>
                )}
              </h3>
              <div className="flex items-center gap-4 mt-1">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                  Terhubung dengan lore
                </p>
                {activeSession?.mode !== 'brainstorm' && (
                  <label
                    className="flex items-center gap-1.5 cursor-pointer group"
                    title="Smart Auto: otomatis melampirkan konteks scene yang relevan dari bab aktif ke percakapan."
                  >
                      <input 
                        type="checkbox"
                        checked={!!activeSession?.smartAutoEnabled}
                        className="sr-only"
                        onChange={toggleSmartAuto}
                      />
                      <div className={cn(
                        "w-6 h-3.5 rounded-full transition-colors relative",
                        activeSession?.smartAutoEnabled ? "bg-indigo-500" : "bg-slate-300 dark:bg-slate-700"
                      )}>
                        <div className={cn(
                          "w-2.5 h-2.5 rounded-full bg-white absolute top-0.5 transition-transform",
                          activeSession?.smartAutoEnabled ? "translate-x-3" : "translate-x-0.5"
                        )} />
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                        Smart Auto
                      </span>
                  </label>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {availableProviders.length > 0 && (
          <div className="relative" ref={providerMenuRef}>
            <button
              type="button"
              onClick={() => setShowProviderMenu(!showProviderMenu)}
              className={cn(
                "flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 rounded-lg px-2.5 py-1.5 transition-all text-xs max-w-[220px]",
                showProviderMenu && "border-indigo-300 dark:border-indigo-500 ring-2 ring-indigo-500/20"
              )}
              title="Pilih provider AI"
            >
              <Cpu size={14} className="shrink-0 text-indigo-500" />
              <span className="font-bold text-slate-700 dark:text-slate-200 shrink-0">{providerLabel(selectedProvider)}</span>
              {activeModel && (
                <span className="truncate text-slate-400 dark:text-slate-500 hidden sm:inline">· {activeModel}</span>
              )}
              <ChevronDown size={14} className={cn("shrink-0 text-slate-400 transition-transform", showProviderMenu && "rotate-180")} />
            </button>

            {showProviderMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-50 py-1.5 animate-in fade-in zoom-in-95 duration-100">
                <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Provider</p>
                {availableProviders.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { onSelectProvider(p); setShowProviderMenu(false); }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-left text-sm transition-colors",
                      p === selectedProvider
                        ? "text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50/60 dark:bg-indigo-900/20"
                        : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )}
                  >
                    {providerLabel(p)}
                    {p === selectedProvider && <Check size={14} />}
                  </button>
                ))}
                <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
                <button
                  type="button"
                  onClick={() => { setShowProviderMenu(false); setViewMode('settings'); }}
                  className="w-full px-3 py-2 text-left text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                  title="Ubah model di Pengaturan"
                >
                  <Settings size={14} className="shrink-0" />
                  <span className="truncate">{activeModel ? `Model: ${activeModel}` : 'Atur model di Pengaturan'}</span>
                </button>
              </div>
            )}
          </div>
        )}

      <div className="relative" ref={moreMenuRef}>
        <button
          onClick={() => setShowMoreMenu(!showMoreMenu)}
          className={cn(
            "p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors",
            showMoreMenu ? "bg-slate-100 dark:bg-slate-800 text-indigo-600" : "text-slate-400"
          )}
          title="Menu"
          aria-expanded={showMoreMenu}
        >
          <MoreVertical size={20} />
        </button>

        {showMoreMenu && (
          <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-50 py-1 animate-in fade-in zoom-in-95 duration-100">
            {activeSession?.id === activeSessionId && (
              <ChatOutputControl key={activeSessionId} id={activeSessionId} value={activeSession.maxOutputTokens}
                provider={selectedProvider} model={activeModel || getModelForProvider(selectedProvider)} />
            )}
            <button
              onClick={() => {
                setEditTitleValue(activeSession?.title || '');
                setIsHeaderEditing(true);
                setShowMoreMenu(false);
              }}
              className="w-full px-4 py-2.5 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors border-b border-slate-100 dark:border-slate-800"
            >
              <Edit2 size={16} />
              Ganti Nama
            </button>
            <button
              onClick={deleteSession}
              className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors"
            >
              <Trash2 size={16} />
              Hapus Percakapan
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
