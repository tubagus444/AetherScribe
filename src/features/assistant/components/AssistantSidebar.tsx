import React, { useState } from 'react';
import { BrainCircuit, Plus, Search, MessageSquare, Check, Trash2, History, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import { updateChatSession, deleteChatSession } from '@/src/services/chatSessionOperations';
import { ChatSession } from '@/src/types';
import { cn } from '@/src/lib/utils';

interface AssistantSidebarProps {
  sessions: ChatSession[] | undefined;
  activeSessionId: number | null;
  onSelectSession: (id: number | null) => void;
  onCreateSession: () => void;
}

export function AssistantSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession
}: AssistantSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSidebarId, setEditingSidebarId] = useState<number | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const filteredSessions = sessions?.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRename = async (sessionIdToRename: number) => {
    if (!editTitleValue.trim()) {
      setEditingSidebarId(null);
      return;
    }
    try {
      await updateChatSession(sessionIdToRename, { title: editTitleValue.trim() });
      setEditingSidebarId(null);
    } catch (error) {
      console.error('Failed to rename session:', error);
    }
  };

  const deleteSession = async (id: number, e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      await deleteChatSession(id);
      if (activeSessionId === id) {
        onSelectSession(null);
      }
      setConfirmDeleteId(null);
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  return (
    <div className={cn(
      "border-r border-slate-200 dark:border-slate-800 flex flex-col bg-white dark:bg-slate-900 shrink-0 transition-all",
      activeSessionId ? "hidden lg:flex w-80" : "flex w-full lg:w-80"
    )}>
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <BrainCircuit size={18} className="text-indigo-600" />
          Studio Asisten
        </h2>
        <button 
          onClick={onCreateSession}
          className="p-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-md hover:bg-indigo-100 transition-colors"
          title="Percakapan Baru"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="p-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            placeholder="Cari percakapan..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-lg py-2 pl-9 pr-3 text-xs focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
        {filteredSessions?.map(session => (
          <div
            key={session.id}
            onClick={() => onSelectSession(session.id || null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onSelectSession(session.id || null);
              }
            }}
            role="button"
            tabIndex={0}
            className={cn(
              "w-full group flex items-start gap-3 p-3 rounded-xl transition-all text-left relative cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
              activeSessionId === session.id 
                ? "bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
                : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
              activeSessionId === session.id 
                ? "bg-indigo-100 dark:bg-indigo-800/50" 
                : "bg-slate-100 dark:bg-slate-800 group-hover:bg-slate-200 dark:group-hover:bg-slate-700"
            )}>
              <MessageSquare size={14} className="opacity-70" />
            </div>
            <div className="flex-1 min-w-0">
              {editingSidebarId === session.id ? (
                <div className="flex items-center gap-1 pr-2">
                    <input 
                      autoFocus
                      value={editTitleValue}
                      onChange={e => setEditTitleValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(session.id!);
                        if (e.key === 'Escape') setEditingSidebarId(null);
                      }}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded px-1.5 py-0.5 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleRename(session.id!); }}
                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                    >
                      <Check size={14} />
                    </button>
                </div>
              ) : (
                <p
                  className="text-sm font-medium truncate pr-14"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingSidebarId(session.id!);
                    setEditTitleValue(session.title);
                  }}
                  title="Klik dua kali untuk ganti nama"
                >
                  {session.title}
                </p>
              )}
              <p className="text-[10px] opacity-60 mt-0.5">
                {format(session.lastMessageAt, 'dd MMM, HH:mm')}
              </p>
            </div>
            {confirmDeleteId === session.id ? (
              <div className="absolute inset-0 bg-red-600 rounded-xl z-30 flex items-center justify-between px-4 animate-in fade-in slide-in-from-right-2 duration-200">
                <p className="text-xs font-bold text-white">Hapus?</p>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                    className="p-1 text-white hover:bg-white/20 rounded-md transition-colors text-[10px] font-bold uppercase tracking-wider"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={(e) => deleteSession(session.id!, e)}
                    className="px-2 py-1 bg-white text-red-600 rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-sm"
                  >
                    Ya
                  </button>
                </div>
              </div>
            ) : editingSidebarId !== session.id && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all z-20">
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingSidebarId(session.id!); setEditTitleValue(session.title); }}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-indigo-600 rounded-lg transition-all"
                  title="Ganti nama"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(session.id!); }}
                  className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 rounded-lg transition-all"
                  title="Hapus"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        ))}
        {(!filteredSessions || filteredSessions.length === 0) && (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
            <History size={32} className="mb-2 opacity-20" />
            <p className="text-[11px] uppercase tracking-widest font-bold">Belum ada riwayat</p>
          </div>
        )}
      </div>
    </div>
  );
}
