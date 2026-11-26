import React, { useRef, useEffect, useLayoutEffect, useState, useMemo } from 'react';
import { Loader2, Sparkles, Hash, RefreshCw, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ChatMessage, CodexEntry } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { parseMentionTags } from '@/src/lib/loreUtils';
import { scanNewEntities } from '@/src/lib/chatEntityScan';
import { EntitySuggestionChips } from '@/src/features/codex-workshop/components/EntitySuggestionChips';
import { useNavigation } from '@/src/contexts/NavigationContext';

const finishNotes = {
  complete: '',
  length: 'Jawaban mencapai batas panjang.',
  interrupted: 'Respons terputus. Teks yang sudah diterima tersimpan.',
  stopped: 'Jawaban dihentikan.',
  'provider-stop': 'Penyedia AI menghentikan jawaban.',
};

interface AssistantMessageListProps {
  messages: ChatMessage[];
  isLoading: boolean;
  waitingForReply: boolean;
  retryStatus?: string | null;
  onSelectPrompt?: (prompt: string) => void;
  onContinue: (index: number) => void;
  onRegenerate?: () => void;
  onRetry?: () => void;
  /** Untuk mendeteksi nama-diri baru (belum di Codex) di balasan AI → chip Lokakarya. */
  codexEntries?: CodexEntry[];
}

export function AssistantMessageList({ messages, isLoading, waitingForReply, retryStatus, onSelectPrompt, onContinue, onRegenerate, onRetry, codexEntries }: AssistantMessageListProps) {
  const { openWorkshop } = useNavigation();
  // Peta id-pesan → nama entitas baru yang terdeteksi (dihitung sekali per perubahan).
  const detections = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!codexEntries) return map;
    for (const m of messages) {
      if (m.role !== 'model' || m.isError || m.isWelcome || !m.content) continue;
      const names = scanNewEntities(m.content, codexEntries);
      if (names.length) map.set(m.id ?? '', names);
    }
    return map;
  }, [messages, codexEntries]);
  const lastMessage = messages[messages.length - 1];
  const canRetry = lastMessage?.isError || lastMessage?.finishStatus === 'interrupted';
  const canRegenerate = !isLoading && !!onRegenerate && lastMessage?.role === 'model' && !canRetry && !lastMessage.isWelcome;
  const followLatest = useRef(true);
  const scrollBox = useRef<HTMLDivElement>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  useEffect(() => () => { if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current); }, []);

  useLayoutEffect(() => {
    const box = scrollBox.current;
    if (followLatest.current && box) box.scrollTop = box.scrollHeight;
  }, [messages, isLoading, retryStatus]);

  return (
    <div ref={scrollBox} className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar"
      onScroll={event => {
        const box = event.currentTarget;
        followLatest.current = box.scrollHeight - box.clientHeight - box.scrollTop < 32;
      }}>
      <div className="max-w-4xl mx-auto space-y-8">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 md:py-24 text-center animate-in fade-in slide-in-from-bottom-4">
            <div className="w-16 h-16 bg-gradient-to-tr from-indigo-100 to-purple-100 dark:from-indigo-900/40 dark:to-purple-900/40 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-6 shadow-sm border border-indigo-50 dark:border-indigo-800/50">
              <Sparkles size={32} />
            </div>
            <h3 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100 mb-3">Mulai Diskusi</h3>
            <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-10 leading-relaxed">
              Pilih salah satu topik di bawah atau ketik langsung pertanyaan/ide Anda di kolom chat.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 w-full max-w-2xl px-4">
              {[
                { title: 'Kembangkan Karakter', desc: 'Bantu saya mendalami motivasi tokoh utama.', prompt: 'Bantu saya mendalami motivasi tokoh utama. Bagaimana jika masa lalunya mengandung konflik yang belum terselesaikan?' },
                { title: 'Eksplorasi Lore', desc: 'Mari bahas aturan sihir atau sejarah dunia ini.', prompt: 'Mari kita kembangkan sistem sihir di dunia ini. Apa batasan utama dan dampaknya bagi para pengguna sihir?' },
                { title: 'Tarik Ulur Plot', desc: 'Saya stuck di bab ini. Apa twist yang bagus?', prompt: 'Saya sedang stuck di bab ini. Karakter utama terpojok, apa twist atau jalan keluar yang masuk akal namun tak terduga?' },
                { title: 'Review Gaya Bahasa', desc: 'Kritik paragraf saya dari segi tone & pacing.', prompt: 'Tolong review ide atau paragraf yang baru saja saya tulis. Berikan saran mengenai tone cerita dan pacing-nya.' },
              ].map((item, i) => (
                <button
                  key={i}
                  onClick={() => onSelectPrompt?.(item.prompt)}
                  className="text-left p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/50 hover:bg-white dark:bg-slate-900/50 dark:hover:bg-slate-900 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 group"
                >
                  <p className="font-bold text-sm text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 mb-1">{item.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={m.id ?? i} className={cn(
            "flex gap-3 md:gap-4 animate-in fade-in slide-in-from-bottom-2",
            m.role === 'user' ? "flex-row-reverse" : "flex-row"
          )}>
            <div className={cn(
              "w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm mt-1",
              m.role === 'user' 
                ? "bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 hidden" // hidden user avatar
                : "bg-gradient-to-tr from-indigo-500 to-purple-600 text-white shadow-indigo-200 dark:shadow-none"
            )}>
              {m.role !== 'user' && <Sparkles size={18} />}
            </div>
            
            <div className={cn(
              "flex flex-col max-w-[90%] md:max-w-[85%]",
              m.role === 'user' ? "items-end" : "items-start"
            )}>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] mb-1.5 opacity-50 px-1">
                {m.role === 'user' ? 'Anda' : 'Asisten'}
              </p>
              
              <div className={cn(
                "text-[15px] leading-relaxed shadow-sm",
                m.role === 'user'
                  ? "bg-indigo-600 text-white px-5 py-3.5 rounded-3xl rounded-tr-sm"
                  : m.isError
                    ? "bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300 px-5 md:px-6 py-4 md:py-5 rounded-3xl rounded-tl-sm w-full"
                    : "bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-5 md:px-6 py-4 md:py-5 rounded-3xl rounded-tl-sm dark:text-slate-200 w-full"
              )}>
                {m.role === 'user' ? (
                  <div className="whitespace-pre-wrap font-medium">
                    {parseMentionTags(m.content).map((segment, i) => (
                      segment.isMention ? (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-semibold mx-1 shadow-sm bg-white/20 text-white whitespace-nowrap not-italic border border-white/10"
                        >
                          {segment.type === 'rule' ? <Hash size={12} /> : <Sparkles size={12} />}
                          {segment.text}
                        </span>
                      ) : (
                        <span key={i}>{segment.text}</span>
                      )
                    ))}
                    {!!m.requestSnapshot?.loreNames?.length && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {m.requestSnapshot.loreNames.map((name, index) => (
                          <span key={index} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-white/10 bg-white/20 px-2.5 py-0.5 text-xs font-semibold">
                            <Sparkles size={12} className="shrink-0" />
                            <span className="min-w-0 break-words">{name}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="markdown-body text-[14px] md:text-[15px]">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                )}
              </div>

              {m.finishStatus && finishNotes[m.finishStatus] && (
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{finishNotes[m.finishStatus]}</p>
              )}

              {m.role === 'model' && m.finishStatus === 'length' && (
                <button type="button" disabled={isLoading} onClick={() => onContinue(i)}
                  className="mt-2 rounded-lg border px-3 py-1.5 text-xs font-semibold text-indigo-600 disabled:opacity-50 dark:text-indigo-300">
                  Lanjutkan jawaban
                </button>
              )}

              {m.role === 'model' && canRetry && i === messages.length - 1 && !isLoading && onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-2 flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transition-colors px-1"
                >
                  <RefreshCw size={13} /> Coba Lagi
                </button>
              )}

              {m.role === 'model' && !m.isError && m.content && (
                <button
                  type="button"
                  onClick={() => handleCopy(m.id ?? String(i), m.content)}
                  className="mt-2 flex items-center gap-1.5 text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors px-1"
                  title="Salin teks"
                >
                  {copiedId === (m.id ?? String(i)) ? (
                    <><Check size={13} className="text-emerald-500" /> <span className="text-emerald-600 dark:text-emerald-400">Tersalin</span></>
                  ) : (
                    <><Copy size={13} /> Salin</>
                  )}
                </button>
              )}

              {m.role === 'model' && !m.isError && (
                <EntitySuggestionChips
                  names={detections.get(m.id ?? '') ?? []}
                  onOpen={(name) => openWorkshop({ mode: 'create', seedName: name })}
                />
              )}
            </div>
          </div>
        ))}
        
        {waitingForReply && (
          <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-sm mt-1">
              <Sparkles size={18} />
            </div>
            <div className="flex flex-col max-w-[85%] items-start">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] mb-1.5 opacity-50 px-1">Asisten</p>
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-5 md:px-6 py-4 rounded-3xl rounded-tl-sm shadow-sm flex flex-col gap-2">
                <div className="flex items-center gap-3 text-indigo-500 dark:text-indigo-400 font-medium">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="animate-pulse">Sedang menulis jawaban...</span>
                </div>
                {retryStatus && (
                  <div className="bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-medium border border-amber-200 dark:border-amber-800/50 mt-1">
                    <div className="w-1.5 h-1.5 min-w-[6px] bg-amber-500 rounded-full animate-pulse" />
                    {retryStatus}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {canRegenerate && (
          <div className="flex justify-start pl-11 md:pl-14 animate-in fade-in">
            <button
              onClick={onRegenerate}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 rounded-lg px-3 py-1.5 transition-all bg-white/50 dark:bg-slate-900/50"
              title="Buat ulang respons terakhir"
            >
              <RefreshCw size={13} /> Buat Ulang
            </button>
          </div>
        )}
        <div className="h-6" />
      </div>
    </div>
  );
}
