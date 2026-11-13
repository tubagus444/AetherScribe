import { useState, useCallback, useEffect, useRef } from 'react';
import { ChatMessage, CodexEntry, StoryBibleRule } from '@/src/types';
import { processChat, cancelAI } from '@/src/services/ai';
import { getRelevantContext, getRelevantBibleRules } from '@/src/services/contextEngine';
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
  onMessageAdded?: (messages: ChatMessage[], targetSessionId?: number | null) => void;
  onResponseReceived?: (response: string) => void;
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
  onError
}: UseChatSessionProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [retryStatus, setRetryStatus] = useState<string | null>(null);
  const messagesRef = useRef(messages);
  const isLoadingRef = useRef(false);
  const manualStopRef = useRef(false);
  
  // Track sesi aktif untuk mencegah update silang antar-sesi
  const sessionIdRef = useRef(sessionId);

  const streamBufferRef = useRef<string>('');
  const isStreamingRef = useRef<boolean>(false);

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
      cancelAI('chat');
    };
  }, []);

  const sendMessage = useCallback(async (text: string, customContext?: string) => {
    if (!text.trim() || isLoadingRef.current) return;

    // Tangkap ID sesi saat pesan ini mulai dikirim
    const targetSessionId = sessionIdRef.current;

    const userMsg: ChatMessage = { 
      id: Date.now().toString(),
      role: 'user', 
      content: text, 
      timestamp: Date.now() 
    };
    
    const currentMessages = messagesRef.current;
    const newMessages = [...currentMessages, userMsg];
    setMessages(newMessages);
    messagesRef.current = newMessages; // Immediate update for rapid fire messages
    onMessageAdded?.(newMessages, targetSessionId);
    setIsLoading(true);
    setRetryStatus(null);
    isLoadingRef.current = true;

    // Diangkat ke luar try agar catch/finally bisa memfinalisasi teks parsial saat dihentikan manual.
    const assistantMsgId = Date.now().toString() + "_assistant";
    let flushInterval: ReturnType<typeof setInterval> | null = null;

    try {
      // 0. Resolve lore tags for AI consumption
      const resolvedText = resolveLoreTags(text, codexEntries, bibleRules);

      // 1. Prepare history for AI. Tag lore di-strip jadi nama polos (lore lengkap
      // sudah ada di system prompt) agar model tak melihat token "@codex:..." mentah,
      // tanpa membengkakkan token seperti ekspansi penuh.
      const history = newMessages
        .slice(-10) // Limit history to last 10 messages for performance
        .map(m => ({
          role: m.role,
          parts: [{ text: stripLoreTags(m.content) }]
        }));

      // 2. Process chat (RAG logic handled inside processChat)
      streamBufferRef.current = "";
      isStreamingRef.current = true;

      const flushBuffer = () => {
        if (!isStreamingRef.current) return;
        // Jangan timpa state UI jika sesi sudah berpindah
        if (sessionIdRef.current !== targetSessionId) return;

        const streamMsg: ChatMessage = {
           id: assistantMsgId,
           role: 'model',
           content: streamBufferRef.current,
           timestamp: Date.now()
        };
        const streamMessages = [...newMessages, streamMsg];
        setMessages(streamMessages);
        messagesRef.current = streamMessages;
      };

      flushInterval = setInterval(flushBuffer, 50);

      const reply = await processChat({
        message: resolvedText,
        history,
        bibleRules: bibleRules,
        codexEntries: codexEntries,
        relationships: relationships,
        contextText: customContext || contextText,
        chapterId,
        provider,
        sessionMode,
        extraSystem,
        stream: true,
        onRetry: (attempt, error, currentProvider) => {
          if (sessionIdRef.current !== targetSessionId) return;
          streamBufferRef.current = "";
          setRetryStatus(`Koneksi melambat (${currentProvider}). Percobaan ulang ke-${attempt}...`);
        },
        onChunk: (chunk) => {
          if (sessionIdRef.current === targetSessionId) streamBufferRef.current += chunk;
        }
      });

      isStreamingRef.current = false;

      // Final flush to ensure no text is truncated at the end
      const finalReply = reply;
      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'model',
        content: finalReply,
        timestamp: Date.now()
      };

      const finalMessages = [...newMessages, assistantMsg];
      
      // Update UI state hanya jika sesi belum berubah
      if (sessionIdRef.current === targetSessionId) {
        setMessages(finalMessages);
        messagesRef.current = finalMessages; // Update ref to latest state
      }
      // Tapi SELALU panggil onMessageAdded agar tersimpan ke DB sesi asal
      onMessageAdded?.(finalMessages, targetSessionId);
      onResponseReceived?.(reply);

      return reply;
    } catch (err: any) {
      isStreamingRef.current = false;
      // Pembatalan manual (tombol Hentikan) ATAU saat ganti sesi: simpan teks parsial
      if (manualStopRef.current) {
        const partial = streamBufferRef.current.trim();
        const stoppedMessages = partial
          ? [...newMessages, { id: assistantMsgId, role: 'model' as const, content: partial, timestamp: Date.now() }]
          : newMessages;
          
        if (sessionIdRef.current === targetSessionId) {
          setMessages(stoppedMessages);
          messagesRef.current = stoppedMessages;
        }
        onMessageAdded?.(stoppedMessages, targetSessionId);
        return partial;
      }
      console.error('Chat error:', err);
      const errorMessage = err.message || 'Maaf, terjadi kesalahan pada layanan AI.';
      onError?.(errorMessage);
      throw err;
    } finally {
      if (flushInterval) clearInterval(flushInterval);
      isStreamingRef.current = false;
      setIsLoading(false);
      setRetryStatus(null);
      isLoadingRef.current = false;
      manualStopRef.current = false;
    }
  }, [
    projectId, 
    chapterId, 
    codexEntries, 
    bibleRules,
    contextText,
    provider,
    extraSystem,
    onMessageAdded,
    onResponseReceived, 
    onError
  ]);

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

  /** Membuang balasan terakhir lalu mengirim ulang pesan pengguna terakhir. */
  const regenerate = useCallback(async (customContext?: string) => {
    if (isLoadingRef.current) return;
    const msgs = messagesRef.current;
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;
    const userText = msgs[lastUserIdx].content;
    // Buang pesan user terakhir + balasan setelahnya; sendMessage akan menambah ulang pesan user-nya.
    const trimmed = msgs.slice(0, lastUserIdx);
    setMessages(trimmed);
    messagesRef.current = trimmed;
    await sendMessage(userText, customContext);
  }, [sendMessage]);

  return {
    messages,
    setMessages,
    isLoading,
    retryStatus,
    sendMessage,
    clearMessages,
    stop,
    regenerate
  };
}
