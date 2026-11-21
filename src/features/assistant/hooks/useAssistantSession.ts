import { useState, useRef, useEffect } from 'react';
import { addChatSession, updateChatSession } from '@/src/services/chatSessionOperations';
import { sessionOutput } from '@/src/lib/chatOutputLimit';
import { db } from '@/src/db';
import { useToast } from '@/src/hooks/useToast';
import { useChatSession } from '@/src/hooks/useChatSession';
import { SessionMode, CodexEntry, StoryBibleRule } from '@/src/types';

export function useAssistantSession({
  projectId,
  activeChapterId,
  sessionChapterId,
  activeSessionId,
  setActiveSessionId,
  activeSession,
  codexEntries,
  bibleRules,
  relationships,
  input,
  setInput,
  chapterContext,
  provider,
}: {
  projectId: number | null;
  activeChapterId: number | null;
  sessionChapterId: number | null;
  activeSessionId: number | null;
  setActiveSessionId: (id: number | null) => void;
  activeSession: any;
  codexEntries: CodexEntry[];
  bibleRules: StoryBibleRule[];
  relationships?: import('@/src/types').Relationship[];
  input: string;
  setInput: (val: string) => void;
  chapterContext: string;
  provider: string;
}) {
  const { toast } = useToast();
  
  const [showModeSelector, setShowModeSelector] = useState(false);
  useEffect(() => {
    const notify = (event: Event) => {
      const { provider: source, limit } = (event as CustomEvent<{ provider: string; limit: number }>).detail;
      toast.info(`Permintaan ke ${source} disesuaikan menjadi ${limit.toLocaleString('id-ID')} token.`);
    };
    window.addEventListener('chat-output-adjusted', notify);
    return () => window.removeEventListener('chat-output-adjusted', notify);
  }, [toast]);
  const pendingInputRef = useRef<string | null>(null);


  const {
    messages,
    setMessages,
    isLoading,
    retryStatus,
    waitingForReply,
    sendMessage,
    stop,
    continueReply,
    regenerate
  } = useChatSession({
    projectId: projectId || 0,
    chapterId: sessionChapterId ?? undefined,
    codexEntries: codexEntries || [],
    bibleRules: bibleRules || [],
    relationships: relationships || [],
    sessionMode: activeSession?.mode,
    provider,
    initialMessages: activeSession?.messages || [],
    sessionId: activeSessionId,
    showInlineErrors: true,
    maxTokens: sessionOutput(activeSession?.maxOutputTokens),
    onMessageAdded: async (newMessages, targetSessionId) => {
      // Gunakan targetSessionId yang presisi dari useChatSession, 
      // jangan mengandalkan ref yang bisa berubah saat user ganti sesi.
      if (targetSessionId) {
        await updateChatSession(targetSessionId, {
          messages: newMessages,
          lastMessageAt: Date.now()
        });
      }
    }
  });

  // Sync messages ONLY on session change to prevent overwrite loops
  useEffect(() => {
    let isSubscribed = true;
    if (activeSessionId) {
      db.chatSessions.get(activeSessionId).then(session => {
        if (session && isSubscribed) setMessages(session.messages);
      });
    } else {
      setMessages([]);
    }
    return () => { isSubscribed = false; };
  }, [activeSessionId, setMessages]);

  const createSession = async () => {
    setShowModeSelector(true);
  };

  const executeCreateSession = async (mode: SessionMode, smartAuto: boolean) => {
    if (!projectId) return;
    const newId = await addChatSession({
      projectId,
      title: 'Percakapan Baru',
      lastMessageAt: Date.now(),
      messages: [],
      mode,
      smartAutoEnabled: smartAuto,
      activeChapterId: activeChapterId || undefined,
      kind: 'studio'
    });
    setActiveSessionId(newId);
    setShowModeSelector(false);

    if (pendingInputRef.current) {
      const textToSend = pendingInputRef.current;
      pendingInputRef.current = null;
      setInput('');
      setMessages([]); // clean local state
      
      try {
        const newTitle = textToSend.substring(0, 40) + (textToSend.length > 40 ? '...' : '');
        await updateChatSession(newId, { title: newTitle });
        await sendMessage(textToSend, chapterContext);
      } catch (err: any) {
        console.error('Assistant operation failed; sensitive details omitted.');
        toast.error(err.message || 'Gagal mengirim pesan.');
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || !projectId) return;

    // Create session if none active
    if (!activeSessionId) {
      pendingInputRef.current = input;
      setShowModeSelector(true);
      return;
    }

    const textToSend = input;
    setInput('');

    try {
      if (messages.length === 0) {
        const newTitle = textToSend.substring(0, 40) + (textToSend.length > 40 ? '...' : '');
        await updateChatSession(activeSessionId, { title: newTitle });
      }

      await sendMessage(textToSend, chapterContext);
    } catch (err: any) {
      console.error('Assistant operation failed; sensitive details omitted.');
      const errorMessage = err.message || 'Gagal mengirim pesan ke AI.';

      if (err.code === 'INVALID_KEY' || err.code === 'QUOTA_EXCEEDED') {
        toast.error(`${errorMessage} (Cek Pengaturan API)`);
      } else {
        toast.error(errorMessage);
      }

    }
  };

  const handleContinue = async (index: number) => {
    if (!activeSessionId || isLoading) return;
    try {
      await continueReply(index, chapterContext);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal melanjutkan jawaban.');
    }
  };

  const handleRegenerate = async () => {
    if (isLoading || !activeSessionId) return;
    try {
      await regenerate(chapterContext);
    } catch (err: any) {
      console.error('Assistant operation failed; sensitive details omitted.');
      toast.error(err.message || 'Gagal meregenerasi respons.');
    }
  };

  return {
    showModeSelector,
    setShowModeSelector,
    createSession,
    executeCreateSession,
    handleSend,
    messages,
    isLoading,
    retryStatus,
    waitingForReply,
    stop,
    handleContinue,
    handleRegenerate
  };
}
