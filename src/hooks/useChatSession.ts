import { useState, useCallback, useEffect, useRef } from 'react';
import { ChatMessage, ChatRequestSnapshot, CodexEntry, StoryBibleRule } from '@/src/types';
import { processChat, cancelAI } from '@/src/services/ai';
import type { StreamFinishStatus } from '@/src/services/ai/types';
import { resolveLoreTags, stripLoreTags } from '@/src/lib/loreUtils';

import { SessionMode } from '@/src/types';

interface UseChatSessionProps {
  projectId: number;
  chapterId?: number;
  codexEntries: CodexEntry[];
  bibleRules: StoryBibleRule[];
  relationships?: import('@/src/types').Relationship[];
  contextText?: string;
  sessionMode?: SessionMode;
  provider?: string;
  /** Instruksi system tambahan untuk tiap pesan (mis. protokol codex-draft Lokakarya). */
  extraSystem?: string;
  initialMessages?: ChatMessage[];
  /** Session ID (opsional). Digunakan untuk mencegah kebocoran state/persisten saat ganti sesi. */
  sessionId?: number | null;
  onMessageAdded?: (messages: ChatMessage[], targetSessionId?: number | null) => void | Promise<void>;
  onResponseReceived?: (response: string) => void;
  maxTokens?: number;
  showInlineErrors?: boolean;
  onError?: (error: string) => void;
}

export function useChatSession({
  projectId,
  chapterId,
  codexEntries,
  bibleRules,
  relationships = [],
  contextText = '',
  sessionMode,
  provider = 'google',
  extraSystem,
  initialMessages = [],
  sessionId,
  onMessageAdded,
  onResponseReceived,
  onError,
  maxTokens,
  showInlineErrors = false
}: UseChatSessionProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);
  const messagesRef = useRef(messages);
  const isLoadingRef = useRef(false);
  const activeReplyId = useRef<string | null>(null);
  const manualStopRef = useRef(false);
  
  // Track sesi aktif untuk mencegah update silang antar-sesi
  const sessionIdRef = useRef(sessionId);

  // Keep refs in sync for sendMessage accessibility
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    // Jika user berganti sesi saat AI masih bekerja, batalkan prosesnya.
    if (sessionIdRef.current !== sessionId) {
      if (isLoadingRef.current) {
        manualStopRef.current = true;
        cancelAI('chat');
      }
      sessionIdRef.current = sessionId;
    }
  }, [sessionId]);

  useEffect(() => {
    return () => {
      manualStopRef.current = true;
      cancelAI('chat');
    };
  }, []);

  const runTurn = useCallback(async (
    text: string,
    customContext?: string,
    retryMessages?: ChatMessage[],
    continuationIndex?: number,
    requestSnapshot?: ChatRequestSnapshot,
  ) => {
    const snapshot = retryMessages?.at(-1)?.requestSnapshot ?? requestSnapshot;
    if ((!text.trim() && !snapshot?.message) || isLoadingRef.current) return;
    const targetSessionId = sessionIdRef.current;
    const previous = messagesRef.current;
    const original = continuationIndex === undefined ? undefined : previous[continuationIndex];
    if (continuationIndex !== undefined && (original?.role !== 'model' || original.finishStatus !== 'length')) return;
    const userMsg: ChatMessage = {
      id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now(),
      ...(requestSnapshot && { requestSnapshot }),
    };
    const turn = original ? previous.slice(0, continuationIndex! + 1) : retryMessages ?? [...previous, userMsg];
    const assistantId = Date.now().toString() + '_assistant';
    activeReplyId.current = assistantId;
    const keepPreviousAnswer = !!retryMessages && previous.slice(turn.length).some(m => m.role === 'model' && !m.isError && m.content);
    let buffer = '';
    let lastPartial = '';
    let finishStatus: StreamFinishStatus = 'complete';
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const display = (updated: ChatMessage[]) => {
      if (sessionIdRef.current !== targetSessionId) return;
      messagesRef.current = updated;
      setMessages(updated);
    };
    const withReply = (content: string, metadata: Partial<ChatMessage> = {}): ChatMessage[] => [
      ...turn, { id: assistantId, role: 'model', content, timestamp: Date.now(), ...metadata },
    ];

    manualStopRef.current = false;
    isLoadingRef.current = true;
    setIsLoading(true);
    setRetryStatus(null);
    try {
      if (!retryMessages && !original) {
        display(turn);
        const pendingSave = onMessageAdded?.(turn, targetSessionId);
        if (pendingSave) await pendingSave;
      }
      if (manualStopRef.current) return;
      const history = (original ? turn : turn.slice(0, -1)).filter(m => !m.isError).slice(-10).map(m => ({
        role: m.role, parts: [{ text: [stripLoreTags(m.content), ...(m.requestSnapshot?.loreNames ?? [])].filter(Boolean).join('\n') }],
      }));
      let reply: string;
      try {
        reply = await processChat({
          message: snapshot?.message ?? resolveLoreTags(text, codexEntries, bibleRules),
          history, bibleRules, codexEntries, relationships, chapterId, provider, sessionMode, extraSystem,
          contextText: snapshot?.chapterContext ?? (customContext || contextText),
          stream: true, maxTokens,
          onFinish: status => { finishStatus = status; },
          onRetry: (attempt, _error, currentProvider) => {
            if (buffer) lastPartial = buffer;
            buffer = '';
            if (sessionIdRef.current !== targetSessionId) return;
            display(retryMessages || original ? previous : turn);
            setRetryStatus(`Koneksi melambat (${currentProvider}). Percobaan ulang ke-${attempt}...`);
          },
          onChunk: chunk => {
            if (!chunk) return;
            buffer += chunk;
            if (flushTimer !== undefined || sessionIdRef.current !== targetSessionId) return;
            flushTimer = setTimeout(() => {
              flushTimer = undefined;
              if (!buffer || sessionIdRef.current !== targetSessionId) return;
              setRetryStatus(null);
              if (!retryMessages && !original) display(withReply(buffer));
            }, 50);
          },
        });
      } catch (error) {
        clearTimeout(flushTimer);
        const partial = buffer || lastPartial;
        const message = error instanceof Error ? error.message : 'Gagal mengirim pesan ke AI.';
        if (!original && !keepPreviousAnswer && (manualStopRef.current || showInlineErrors)) {
          const updated = partial
            ? withReply(partial, { finishStatus: manualStopRef.current ? 'stopped' : 'interrupted' })
            : manualStopRef.current ? (retryMessages ? previous : turn) : withReply(message, { isError: true });
          display(updated);
          await onMessageAdded?.(updated, targetSessionId);
        }
        if (manualStopRef.current) return partial;
        onError?.(message);
        throw error;
      }

      clearTimeout(flushTimer);
      // Pengganti yang terpotong tidak boleh menghapus jawaban yang masih dapat dibaca.
      if (keepPreviousAnswer && finishStatus !== 'complete') {
        throw new Error('Jawaban pengganti belum selesai. Jawaban sebelumnya tetap tersimpan.');
      }
      let finalMessages: ChatMessage[];
      if (original) {
        const separator = /\s$/.test(original.content) || /^[\s.,;:!?)]/.test(reply) ? '' : ' ';
        finalMessages = previous.map((m, i) => i === continuationIndex
          ? { ...m, content: original.content + separator + reply, finishStatus }
          : m);
      } else {
        finalMessages = withReply(reply, { finishStatus });
      }
      await onMessageAdded?.(finalMessages, targetSessionId);
      display(finalMessages);
      onResponseReceived?.(reply);
      return reply;
    } finally {
      clearTimeout(flushTimer);
      setIsLoading(false);
      setRetryStatus(null);
      isLoadingRef.current = false;
      manualStopRef.current = false;
    }
  }, [bibleRules, chapterId, codexEntries, contextText, extraSystem, onError, onMessageAdded,
    onResponseReceived, maxTokens, provider, relationships, sessionMode, showInlineErrors]);

  const sendMessage = useCallback((text: string, customContext?: string, requestSnapshot?: ChatRequestSnapshot) =>
    runTurn(text, customContext, undefined, undefined, requestSnapshot), [runTurn]);

  const continueReply = useCallback((index: number, context?: string) =>
    runTurn('Lanjutkan persis dari akhir jawaban sebelumnya. Tulis hanya sambungannya tanpa mengulang pembukaan atau isi sebelumnya.',
      context, undefined, index), [runTurn]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
    onMessageAdded?.([]);
  }, [onMessageAdded]);

  /** Menghentikan generasi yang sedang berjalan; teks yang sudah ter-stream dipertahankan. */
  const stop = useCallback(() => {
    if (!isLoadingRef.current) return;
    manualStopRef.current = true;
    cancelAI('chat');
  }, []);

  /** Kirim ulang giliran terakhir dan terapkan pengganti setelah selesai. */
  const regenerate = useCallback(async (customContext?: string) => {
    if (isLoadingRef.current) return;
    const msgs = messagesRef.current;
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;
    await runTurn(msgs[lastUserIdx].content, customContext, msgs.slice(0, lastUserIdx + 1));
  }, [runTurn]);

  return {
    messages,
    setMessages,
    isLoading,
    retryStatus,
    waitingForReply: isLoading && messages.at(-1)?.id !== activeReplyId.current,
    sendMessage,
    continueReply,
    clearMessages,
    stop,
    regenerate
  };
}
