import React, { useState, useRef, useEffect } from 'react';
import { Send, Plus, X, ChevronDown, BookOpen, Check, Activity, Square } from 'lucide-react';
import { updateChatSession } from '@/src/services/chatSessionOperations';
import { Chapter, CodexEntry, StoryBibleRule, ChatMessage } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { MentionDropdown } from '@/src/components/common/MentionDropdown';
import { previewContextTokens } from '@/src/services/contextEngine';
import { isCacheSupported, getContextWindow } from '@/src/services/ai';
import { formatCodexLore, stripLoreTags } from '@/src/lib/loreUtils';

const providerLabel = (p: string) => (p === 'google' ? 'Gemini' : p.charAt(0).toUpperCase() + p.slice(1));

interface AssistantInputAreaProps {
  activeSessionId: number;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  isLoading: boolean;
  handleSend: () => void;
  onStop: () => void;
  provider: string;
  messages: ChatMessage[];
  // Context & Metadata
  sessionChapterId: number | undefined;
  chapters: Chapter[] | undefined;
  sceneMetadata: any;
  chapterContext: string;
  setSceneMetadata: (data: any) => void;
  setChapterContext: (context: string) => void;
  // Lore Data
  codexEntries: CodexEntry[] | undefined;
  bibleRules: StoryBibleRule[] | undefined;
  attachedCodexEntries: CodexEntry[];
  onAttachCodex: (id: number) => void;
  onRemoveCodex: (id: number) => void;
  sessionChapter: Chapter | undefined;
  // Mention Props
  isMentionOpen: boolean;
  setIsMentionOpen: (open: boolean) => void;
  mentionSuggestions: any[];
  mentionSelectedIndex: number;
  handleMentionInputChange: (val: string, cursorPosition: number) => void;
  handleMentionKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>, val: string, setVal: (v: string) => void) => boolean;
  selectMention: (item: any, currentInput: string) => string;
}

export function AssistantInputArea({
  activeSessionId,
  input,
  setInput,
  isLoading,
  handleSend,
  onStop,
  provider,
  messages,
  sessionChapterId,
  chapters,
  sceneMetadata,
  chapterContext,
  setSceneMetadata,
  setChapterContext,
  codexEntries,
  bibleRules,
  attachedCodexEntries,
  onAttachCodex,
  onRemoveCodex,
  sessionChapter,
  isMentionOpen,
  setIsMentionOpen,
  mentionSuggestions,
  mentionSelectedIndex,
  handleMentionInputChange,
  handleMentionKeyDown,
  selectMention
}: AssistantInputAreaProps) {
  const [showLoreMenu, setShowLoreMenu] = useState(false);
  const [loreSearchQuery, setLoreSearchQuery] = useState('');
  const loreMenuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [showChapterMenu, setShowChapterMenu] = useState(false);
  const chapterMenuRef = useRef<HTMLDivElement>(null);

  const [tokenStats, setTokenStats] = useState({ total: 0, text: 0, codex: 0, rules: 0 });
  const [isCalculatingTokens, setIsCalculatingTokens] = useState(false);

  // Mode caching mengirim SELURUH Bible+Codex statis (bukan RAG-filtered), jadi meter
  // harus menghitung lore penuh agar tidak menyesatkan. Cocokkan keputusan di processChat:
  // isCacheSupported(provider) && contextDepth !== 'minimal'.
  const contextDepth = localStorage.getItem('ai_context_depth') || 'balanced';
  const isCachingMode = isCacheSupported(provider) && contextDepth !== 'minimal';
  const model = localStorage.getItem(`ai_model_${provider}`) || undefined;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (loreMenuRef.current && !loreMenuRef.current.contains(event.target as Node)) {
        setShowLoreMenu(false);
      }
      if (chapterMenuRef.current && !chapterMenuRef.current.contains(event.target as Node)) {
        setShowChapterMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    // Debounce token counting
    const timer = setTimeout(() => {
      let combinedText = [input, ...attachedCodexEntries.map(formatCodexLore)].filter(Boolean).join('\n');
      if (chapterContext) combinedText += '\n\n' + chapterContext;
      // Riwayat percakapan (10 pesan terakhir, sama seperti yang dikirim useChatSession)
      // ikut dihitung agar meter mencerminkan total konteks, bukan hanya pesan baru.
      const historyText = messages.slice(-10)
        .map(m => [stripLoreTags(m.content), ...(m.requestSnapshot?.loreNames ?? [])].join('\n')).join('\n');
      if (historyText) combinedText += '\n\n' + historyText;

      if (!combinedText.trim()) {
        setTokenStats({ total: 0, text: 0, codex: 0, rules: 0 });
        return;
      }

      setIsCalculatingTokens(true);
      const projectId = codexEntries?.[0]?.projectId || sessionChapter?.projectId || chapters?.[0]?.projectId || 0;
      previewContextTokens(combinedText, projectId, model, isCachingMode, sessionChapterId).then(stats => {
        setTokenStats({
          total: stats.totalTokens,
          text: stats.textTokens,
          codex: stats.codexTokens,
          rules: stats.rulesTokens
        });
        setIsCalculatingTokens(false);
      }).catch(err => {
        console.error('Failed to preview context tokens', err);
        setIsCalculatingTokens(false);
      });
    }, 500);

    return () => clearTimeout(timer);
  }, [input, chapterContext, attachedCodexEntries, codexEntries, bibleRules, model, isCachingMode, messages, sessionChapterId, sessionChapter?.projectId, chapters]);

  // Jendela konteks provider sebagai denominator headroom (mis. Gemini ~1jt, Claude 200rb).
  const MAX_TOKENS = getContextWindow(provider);
  const tokenPercentage = Math.min((tokenStats.total / MAX_TOKENS) * 100, 100);
  const getProgressColor = () => {
    if (tokenPercentage < 50) return 'text-emerald-500';
    if (tokenPercentage < 80) return 'text-amber-500';
    return 'text-red-500';
  };

  const filteredRules = bibleRules?.filter(rule => 
    rule.key.toLowerCase().includes(loreSearchQuery.toLowerCase()) || 
    rule.instruction.toLowerCase().includes(loreSearchQuery.toLowerCase())
  );

  const filteredCodex = codexEntries?.filter(entry => 
    entry.name.toLowerCase().includes(loreSearchQuery.toLowerCase()) || 
    entry.description.toLowerCase().includes(loreSearchQuery.toLowerCase())
  );

  return (
    <div className="shrink-0 px-3 pb-3 pt-2 sm:px-6 bg-transparent">
      <div className="max-w-3xl mx-auto relative group" ref={loreMenuRef}>
        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl blur opacity-5 group-focus-within:opacity-15 transition-all duration-500" />
        
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

        {showLoreMenu && (
          <div className="absolute left-6 bottom-full mb-2 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-50 p-2 animate-in fade-in slide-in-from-bottom-2 duration-100">
            <div className="px-2 py-1.5 border-b border-slate-100 dark:border-slate-800 mb-2 sticky top-0 bg-white dark:bg-slate-900 z-10">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lampirkan dari Lore</p>
              </div>
              <input
                type="search"
                autoFocus
                placeholder="Cari Lore..."
                value={loreSearchQuery}
                onChange={(e) => setLoreSearchQuery(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-0.5">
              {(!filteredCodex?.length && !filteredRules?.length && !sessionChapterId) && (
                <p className="px-2 py-4 text-center text-[11px] text-slate-500 italic">Lore tidak ditemukan</p>
              )}
              {filteredRules?.map(rule => (
                <button
                  key={rule.id}
                  onClick={() => {
                    setInput(prev => prev + (prev ? ' ' : '') + `@rule:${rule.key} `);
                    setShowLoreMenu(false);
                    setLoreSearchQuery('');
                    inputRef.current?.focus();
                  }}
                  className="w-full px-2 py-1.5 text-left text-xs hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors flex flex-col gap-0.5"
                >
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">#{rule.key}</span>
                  <span className="opacity-60 truncate">{rule.instruction}</span>
                </button>
              ))}
              {filteredCodex?.map(entry => (
                  <button
                  key={entry.id}
                  onClick={() => {
                    if (entry.id !== undefined) onAttachCodex(entry.id);
                    setShowLoreMenu(false);
                    setLoreSearchQuery('');
                    inputRef.current?.focus();
                  }}
                  className="w-full px-2 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors flex flex-col gap-0.5"
                >
                  <span className="font-medium text-slate-900 dark:text-slate-100">{entry.name}</span>
                  <span className="opacity-60 truncate">{entry.description.substring(0, 40)}...</span>
                </button>
              ))}
              {sessionChapterId && !loreSearchQuery && (
                <>
                    <div className="px-2 py-1.5 border-t border-b border-slate-100 dark:border-slate-800 my-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bab Saat Ini</p>
                    </div>
                    <button
                      onClick={() => {
                        setInput(prev => prev + (prev ? ' ' : '') + `@chapter-excerpt `);
                        setShowLoreMenu(false);
                        inputRef.current?.focus();
                      }}
                      className="w-full px-2 py-1.5 text-left text-xs hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors flex flex-col gap-0.5 text-indigo-600 dark:text-indigo-400 font-medium"
                    >
                      @chapter-excerpt
                    </button>
                    {sessionChapter?.summary && (
                      <button
                        onClick={() => {
                          setInput(prev => prev + (prev ? ' ' : '') + `@chapter-summary `);
                          setShowLoreMenu(false);
                          inputRef.current?.focus();
                        }}
                        className="w-full px-2 py-1.5 text-left text-xs hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors flex flex-col gap-0.5 text-emerald-600 dark:text-emerald-400 font-medium"
                      >
                        @chapter-summary
                      </button>
                    )}
                </>
              )}
            </div>
          </div>
        )}

        <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col focus-within:border-indigo-300 dark:focus-within:border-indigo-700">
          {/* Persistent Context Header */}
          <textarea
            ref={inputRef}
            rows={2}
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
            placeholder="Sampaikan ide liar Anda di sini..."
            className="w-full rounded-t-2xl bg-transparent px-3 py-2 text-[15px] leading-6 focus:outline-none resize-none overflow-y-auto min-h-16 max-h-40 [field-sizing:content] dark:text-slate-200"
          />
          {attachedCodexEntries.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pb-2" role="group" aria-label="Lampiran Codex">
              {attachedCodexEntries.map(entry => (
                <button
                  key={entry.id}
                  type="button"
                  aria-label={`Lepas lampiran ${entry.name}`}
                  onClick={() => { if (entry.id !== undefined) onRemoveCodex(entry.id); }}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/40 dark:text-indigo-300"
                >
                  <span className="break-words min-w-0">{entry.name}</span>
                  <X size={12} className="shrink-0" />
                </button>
              ))}
            </div>
          )}
          <div className="rounded-b-2xl px-2 py-1.5 bg-slate-50 dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-1.5 border-t border-slate-100 dark:border-slate-800">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-slate-400">
                <div 
                  className="relative group min-w-0 max-w-[170px] sm:max-w-[200px]"
                  ref={chapterMenuRef}
                >
                  <button
                    type="button"
                    onClick={() => setShowChapterMenu(!showChapterMenu)}
                    className={cn(
                      "flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 rounded-lg shadow-sm px-2.5 py-1.5 transition-all text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 max-w-full",
                      showChapterMenu && "border-indigo-300 dark:border-indigo-500 ring-2 ring-indigo-500/20"
                    )}
                  >
                    <BookOpen size={14} className={cn("shrink-0 transition-colors", showChapterMenu ? "text-indigo-500" : "text-slate-400 group-hover:text-indigo-500")} />
                    <span className="truncate text-slate-700 dark:text-slate-300 font-medium">
                      {sessionChapterId ? chapters?.find(c => c.id === sessionChapterId)?.title || 'Bab Tanpa Judul' : 'Umum (Seluruh Cerita)'}
                    </span>
                    <ChevronDown size={14} className={cn("shrink-0 transition-all opacity-70", showChapterMenu ? "text-indigo-500 rotate-180" : "text-slate-400 group-hover:text-indigo-500")} />
                  </button>

                  {showChapterMenu && (
                    <div className="absolute bottom-full left-0 mb-2 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 ring-1 ring-black/5 dark:ring-white/10">
                      <div className="max-h-56 overflow-y-auto custom-scrollbar p-1.5 flex flex-col gap-0.5">
                        <button
                          onClick={() => {
                            if (activeSessionId) updateChatSession(activeSessionId, { activeChapterId: undefined });
                            setShowChapterMenu(false);
                          }}
                          className={cn(
                            "w-full flex justify-between items-center px-3 py-2 text-left text-xs rounded-lg transition-all",
                            !sessionChapterId 
                              ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-bold"
                              : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-100 font-medium"
                          )}
                        >
                          Umum (Seluruh Cerita)
                          {!sessionChapterId && <Check size={14} className="text-indigo-600 dark:text-indigo-400" />}
                        </button>
                        
                        {chapters && chapters.length > 0 && (
                          <div className="px-3 py-1.5 mt-1 text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-slate-500">Bab</div>
                        )}
                        {chapters?.map(c => (
                          <button
                            key={c.id}
                            onClick={() => {
                              if (activeSessionId) updateChatSession(activeSessionId, { activeChapterId: c.id });
                              setShowChapterMenu(false);
                            }}
                            className={cn(
                              "w-full flex justify-between items-center px-3 py-2 text-left text-xs rounded-lg transition-all group",
                              sessionChapterId === c.id
                                ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-bold"
                                : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-100 font-medium"
                            )}
                          >
                            <span className="truncate pr-2">{c.title || 'Bab Tanpa Judul'}</span>
                            {sessionChapterId === c.id && <Check size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {sceneMetadata && chapterContext && (
                    <div className="flex items-center gap-2 min-w-0 text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/50 px-2 py-1 rounded-md zoom-in-95 animate-in duration-200">
                      <span className="font-bold truncate max-w-24 sm:max-w-[150px]">{sceneMetadata.name}</span>
                      <span className="opacity-70 whitespace-nowrap">· {sceneMetadata.wordCount} kata</span>
                      <button 
                          onClick={() => {
                            setSceneMetadata(null);
                            setChapterContext('');
                            if (sceneMetadata.isManual) {
                              if (sceneMetadata.manualType === 'excerpt') {
                                setInput(prev => prev.replace('@chapter-excerpt', '').trim());
                              } else {
                                setInput(prev => prev.replace('@chapter-summary', '').trim());
                              }
                            } else if (activeSessionId) {
                              updateChatSession(activeSessionId, { smartAutoEnabled: false });
                            }
                          }} 
                          className="hover:text-red-600 dark:hover:text-red-400 ml-1 transition-colors"
                          title="Lepas Konteks"
                      >
                          <X size={14}/>
                      </button>
                    </div>
                )}
                <div className="relative">
                  <button 
                    onClick={() => setShowLoreMenu(!showLoreMenu)}
                    className={cn(
                      "hover:text-indigo-500 transition-all p-1 rounded-full",
                      showLoreMenu ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 scale-110" : ""
                    )}
                    title="Lampirkan Lore"
                  >
                    <Plus size={20} />
                  </button>
                </div>
                
                {/* Context Meter */}
                <div className="flex items-center gap-2 group/meter relative cursor-help">
                  <div className="relative w-6 h-6 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-slate-200 dark:text-slate-700"
                        stroke="currentColor"
                        strokeWidth="3"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className={cn("transition-all duration-500", getProgressColor())}
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray={`${tokenPercentage}, 100`}
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    {isCalculatingTokens ? (
                      <Activity size={10} className="absolute text-slate-400 animate-pulse" />
                    ) : (
                      <span className="absolute text-[8px] font-bold text-slate-500 dark:text-slate-400">
                        {Math.round(tokenPercentage)}%
                      </span>
                    )}
                  </div>
                  
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Konteks</span>
                    <span className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500 leading-none">
                      {tokenStats.total.toLocaleString()} tk
                    </span>
                  </div>

                  {/* Tooltip for Token Breakdown */}
                  <div className="absolute bottom-full left-0 mb-3 w-56 p-3 bg-slate-900 border border-slate-700 rounded-lg shadow-xl opacity-0 group-hover/meter:opacity-100 transition-opacity pointer-events-none z-50">
                    <div className="font-bold text-white text-xs mb-2 border-b border-slate-700 pb-1">Rincian Pemakaian Token</div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Prompt/Teks:</span>
                      <span className="tabular-nums font-medium">{tokenStats.text.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-300 mb-1">
                      <span>Memori Lore{isCachingMode ? ' (penuh)' : ' (relevan)'}:</span>
                      <span className="tabular-nums font-medium">{tokenStats.codex.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-300 mb-2">
                      <span>Aturan Bible:</span>
                      <span className="tabular-nums font-medium">{tokenStats.rules.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs text-indigo-300 border-t border-slate-700 pt-1 font-bold">
                      <span>Total:</span>
                      <span className="tabular-nums">{tokenStats.total.toLocaleString()}</span>
                    </div>
                    <div className="mt-2 pt-1.5 border-t border-slate-700 text-[10px] text-slate-400 leading-relaxed">
                      Mode: <span className="font-bold text-slate-200">{isCachingMode ? 'Caching (lore penuh)' : 'RAG (lore terpilih)'}</span>
                      <br />
                      Jendela {providerLabel(provider)}: <span className="tabular-nums">{MAX_TOKENS.toLocaleString()}</span> tk
                    </div>
                    <div className="absolute bottom-[-5px] left-4 w-2 h-2 bg-slate-900 border-b border-r border-slate-700 transform rotate-45"></div>
                  </div>
                </div>
            </div>
            {isLoading ? (
              <button
                onClick={onStop}
                className="ml-auto shrink-0 px-3 py-1.5 text-sm bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all flex items-center gap-2"
                title="Hentikan generasi"
              >
                Hentikan <Square size={14} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() && !attachedCodexEntries.length}
                className="ml-auto shrink-0 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:bg-slate-400 transition-all flex items-center gap-2"
              >
                Kirim Ide <Send size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
