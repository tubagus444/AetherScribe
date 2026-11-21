/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Send, Bot, User, Loader2, Sparkles, X, Copy, Check, Hash, Trash2, Square, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { ChatOutputControl } from '@/src/features/assistant/components/ChatOutputControl';
import { getModelForProvider } from '@/src/services/ai/proxy';
import ReactMarkdown from 'react-markdown';
import { PANEL_WIDTH } from '@/src/lib/constants';
import { cn } from '@/src/lib/utils';
import { Editor } from '@tiptap/core';
import { CodexEntry, StoryBibleRule, Relationship } from '@/src/types';
import { parseMentionTags } from '@/src/lib/loreUtils';
import { MentionDropdown } from '@/src/components/common/MentionDropdown';
import { useScribbleAssistantPanel } from '@/src/features/assistant/hooks/useScribbleAssistantPanel';
import { scanNewEntities } from '@/src/lib/chatEntityScan';
import { EntitySuggestionChips } from '@/src/features/codex-workshop/components/EntitySuggestionChips';
import { useNavigation } from '@/src/contexts/NavigationContext';

interface ScribbleAssistantPanelProps {
  projectId: number;
  chapterId?: number;
  currentText: string;
  onClose: () => void;
  onInsertText?: (text: string) => void;
  viewMode?: string;
  codexEntries?: CodexEntry[];
  bibleRules?: StoryBibleRule[];
  relationships?: Relationship[];
  editor?: Editor | null;
}

export function ScribbleAssistantPanel({ 
  projectId, 
  chapterId,
  currentText, 
  onClose, 
  onInsertText, 
  viewMode = 'write',
  codexEntries = [],
  bibleRules = [],
  editor
}: ScribbleAssistantPanelProps) {
  const [showOutputSettings, setShowOutputSettings] = useState(false);
  const {
    sessionId,
    outputLimit,
    availableProviders,
    selectedProvider,
    setSelectedProvider,
    messages,
    isLoading,
    input,
    setInput,
    copiedId,
    mentionState,
    messagesEndRef,
    inputRef,
    hasReceivedReply,
    canRegenerate,
    suggestedPrompts,
    handleCopy,
    handleClear,
    handleSend,
    handleContinue,
    handleRegenerate,
    handleStop,
  } = useScribbleAssistantPanel({
    projectId,
    chapterId,
    currentText,
    viewMode,
    codexEntries,
    bibleRules,
    editor
  });

  const {
    isOpen: isMentionOpen,
    setIsOpen: setIsMentionOpen,
    suggestions: mentionSuggestions,
    selectedIndex: mentionSelectedIndex,
    handleInputChange: handleMentionInputChange,
    handleKeyDown: handleMentionKeyDown,
    selectMention
  } = mentionState;

  const { openWorkshop } = useNavigation();
  // Nama-diri baru (belum di Codex) per balasan AI → chip "Buka di Lokakarya".
  const detections = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of messages) {
      if (m.role !== 'model' || m.isError || m.isWelcome || !m.content) continue;
      const names = scanNewEntities(m.content, codexEntries);
      if (names.length) map.set(m.id ?? '', names);
    }
    return map;
  }, [messages, codexEntries]);

  return (
    <div style={{ width: PANEL_WIDTH }} className="bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col h-full shadow-2xl relative z-30 shrink-0">
      <div className="h-14 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between px-5 bg-slate-50 dark:bg-slate-800/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-md flex items-center justify-center shadow-sm">
              <Sparkles size={14} />
            </div>
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 tracking-tight">Nova Assistant</h3>
          </div>
          
          {availableProviders.length > 1 && (
            <div className="flex bg-slate-200/50 dark:bg-slate-700/50 p-0.5 rounded-lg ml-2">
              {availableProviders.map(p => (
                <button
                  key={p}
                  onClick={() => setSelectedProvider(p)}
                  className={cn(
                    "px-2 py-0.5 text-[9px] font-bold rounded-md transition-all uppercase",
                    selectedProvider === p 
                      ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm" 
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                  )}
                >
                  {p === 'google' ? 'Gemini' : p}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={!sessionId} aria-label="Atur panjang jawaban" aria-expanded={showOutputSettings}
            onClick={() => setShowOutputSettings(open => !open)}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700">
            <SlidersHorizontal size={16} />
          </button>
          <button 
            onClick={handleClear}
            title="Hapus riwayat chat"
            className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
          >
            <Trash2 size={16} />
          </button>
          <button onClick={onClose} aria-label="Tutup asisten" className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:text-slate-200 hover:bg-slate-200 rounded-md transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {showOutputSettings && sessionId && (
        <ChatOutputControl key={sessionId} id={sessionId} value={outputLimit} provider={selectedProvider}
          model={localStorage.getItem(`ai_model_${selectedProvider}`) || getModelForProvider(selectedProvider)} />
      )}

      <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50 dark:bg-slate-800/50 custom-scrollbar">
        {messages.map((m, index) => (
          <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
             <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-sm ${m.role === 'user' ? 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400' : 'bg-indigo-600 text-white'}`}>
               {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
             </div>
             <div className={`text-[13px] p-3.5 rounded-2xl max-w-[85%] leading-relaxed shadow-sm ${
               m.role === 'user' 
                 ? 'bg-indigo-600 text-white rounded-tr-none' 
                 : m.isError
                   ? 'bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 rounded-tl-none font-serif'
                   : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 rounded-tl-none font-serif [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:text-slate-900 dark:[&_strong]:text-slate-100 [&_strong]:font-bold'
               }`}>
               {m.role === 'user' ? (
                 <div className="whitespace-pre-wrap">
                   {parseMentionTags(m.content).map((segment, i) => (
                     segment.isMention ? (
                       <span 
                         key={i} 
                         className={cn(
                           "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold mx-0.5 shadow-sm border whitespace-nowrap",
                           segment.type === 'rule' 
                             ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-800" 
                             : "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-400 dark:border-indigo-800"
                         )}
                       >
                         {segment.type === 'rule' ? <Hash size={10} /> : <Sparkles size={10} />}
                         {segment.text}
                       </span>
                     ) : (
                       <span key={i}>{segment.text}</span>
                     )
                   ))}
                 </div>
               ) : (
                 <div className="relative">
                   <div className="markdown-body">
                     <ReactMarkdown>{m.content}</ReactMarkdown>
                   </div>
                   {m.finishStatus === 'length' && (
                     <div className="mt-2 space-y-1 text-xs">
                       <p>Jawaban mencapai batas panjang.</p>
                       <button type="button" disabled={isLoading} onClick={() => void handleContinue(index)}
                         className="rounded-md border px-2 py-1 font-semibold text-indigo-600 disabled:opacity-50 dark:text-indigo-300">
                         Lanjutkan jawaban
                       </button>
                     </div>
                   )}
                   {!m.isError && !m.isWelcome && (m.isActionable || m.finishStatus) && (
                      <div className="mt-3 flex flex-wrap gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <button 
                          onClick={() => handleCopy(m.id || '', m.content)}
                          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-indigo-600 hover:text-indigo-800 transition-colors"
                        >
                          {copiedId === m.id ? (
                            <>
                              <Check size={12} className="text-emerald-500" />
                              <span className="text-emerald-600">Tersalin ✓</span>
                            </>
                          ) : (
                            <>
                              <Copy size={12} />
                              Salin
                            </>
                          )}
                        </button>
                        
                        {onInsertText && (
                          <button 
                            onClick={() => onInsertText(m.content)}
                            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-indigo-600 hover:text-indigo-800 transition-colors"
                          >
                            Masukkan ke editor
                          </button>
                        )}
                      </div>
                    )}
                    {m.isError && (
                      <button 
                        onClick={() => {
                          const lastUser = messages.filter(msg => msg.role === 'user').pop();
                          if (lastUser) handleSend(lastUser.content);
                        }}
                        className="mt-2 text-[10px] font-bold uppercase tracking-widest text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 underline"
                      >
                        Coba Lagi
                      </button>
                    )}
                    {!m.isError && (
                      <EntitySuggestionChips
                        names={detections.get(m.id ?? '') ?? []}
                        onOpen={(name) => openWorkshop({ mode: 'create', seedName: name })}
                      />
                    )}
                 </div>
               )}
             </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
             <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
               <Bot size={14} />
             </div>
             <div className="text-[13px] p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-indigo-500 rounded-tl-none flex items-center gap-2 shadow-sm italic font-serif">
               <Loader2 size={14} className="animate-spin" /> Menghubungkan ke story bible...
             </div>
          </div>
        )}
        {canRegenerate && (
          <div className="flex justify-start pl-10">
            <button
              onClick={handleRegenerate}
              title="Buat ulang respons terakhir"
              className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 rounded-lg px-2.5 py-1 transition-all bg-white dark:bg-slate-900"
            >
              <RefreshCw size={12} /> Regenerasi
            </button>
          </div>
        )}
        <div ref={messagesEndRef} className="h-2" />
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
        {!hasReceivedReply && !isLoading && (
          <div className="mb-3 flex flex-wrap gap-2">
            {suggestedPrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSend(prompt)}
                className="text-left text-[10px] px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-indigo-900/40 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-200 dark:hover:border-indigo-800 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        <div className="relative">
          {isMentionOpen && mentionSuggestions.length > 0 && (
            <MentionDropdown 
              suggestions={mentionSuggestions}
              selectedIndex={mentionSelectedIndex}
              onSelect={(item) => {
                const newValue = selectMention(item, input);
                setInput(newValue);
                setIsMentionOpen(false);
                inputRef.current?.focus();
              }}
              onClose={() => setIsMentionOpen(false)}
            />
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              const val = e.target.value;
              setInput(val);
              handleMentionInputChange(val, e.target.selectionStart ?? val.length);
            }}
            onKeyDown={e => {
              if (handleMentionKeyDown(e, input, (val) => setInput(val))) {
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Tanyakan apa saja tentang lore-mu..."
            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none h-24 placeholder:text-slate-400 dark:text-slate-500 text-slate-800 dark:text-slate-200"
          />
          {isLoading ? (
            <button
              onClick={handleStop}
              title="Hentikan generasi"
              className="absolute right-2 bottom-2 p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all shadow-sm active:scale-95"
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={() => handleSend()}
              disabled={!input.trim()}
              aria-label="Kirim pesan"
              className="absolute right-2 bottom-2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:bg-slate-400 transition-all shadow-sm active:scale-95"
            >
              <Send size={16} />
            </button>
          )}
        </div>
        <div className="flex justify-between items-center mt-3 px-1">
          <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-[0.2em] flex items-center gap-1">
            <Sparkles size={10} className="text-amber-400" /> Uses Codex Context
          </p>
          <p className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">Shift+Enter to add line</p>
        </div>
      </div>
    </div>
  );
}
