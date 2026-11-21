import { useState, useRef, useEffect, useMemo } from 'react';
import { addChatSession, updateChatSession } from '@/src/services/chatSessionOperations';
import { useLiveQuery } from 'dexie-react-hooks';
import { sessionOutput } from '@/src/lib/chatOutputLimit';
import { db } from '@/src/db';
import { getActiveWindowText } from '@/src/lib/editorUtils';
import { useAvailableProviders } from '@/src/hooks/useAvailableProviders';
import { useChatSession } from '@/src/hooks/useChatSession';
import { useToast } from '@/src/hooks/useToast';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { Editor } from '@tiptap/core';
import { ChatMessage, CodexEntry, StoryBibleRule } from '@/src/types';
import { useMentionAutocomplete } from '@/src/hooks/useMentionAutocomplete';

interface UseScribbleAssistantPanelProps {
  projectId: number;
  chapterId?: number;
  currentText: string;
  viewMode?: string;
  codexEntries?: CodexEntry[];
  bibleRules?: StoryBibleRule[];
  relationships?: import('@/src/types').Relationship[];
  editor?: Editor | null;
}

// Memory cache lock registry to prevent double-inserting scribble sessions when React 19's StrictMode double-mounts effects concurrently.
const scribbleLocks = new Map<string, Promise<number>>();

export function useScribbleAssistantPanel({
  projectId,
  chapterId,
  currentText,
  viewMode = 'write',
  codexEntries = [],
  bibleRules = [],
  relationships = [],
  editor
}: UseScribbleAssistantPanelProps) {
  const { 
    availableProviders, 
    selectedProvider, 
    setSelectedProvider 
  } = useAvailableProviders();

  const sessionKey = JSON.stringify([projectId, chapterId]);
  const [loadedSession, setLoadedSession] = useState<{ key: string; id: number }>();
  const sessionId = loadedSession?.key === sessionKey ? loadedSession.id : null;

  const outputLimit = useLiveQuery(async () => sessionId ? (await db.chatSessions.get(sessionId))?.maxOutputTokens : undefined, [sessionId]);

  const {
    messages,
    setMessages,
    isLoading,
    sendMessage,
    continueReply,
    stop,
    regenerate
  } = useChatSession({
    projectId,
    chapterId,
    codexEntries,
    bibleRules,
    relationships,
    provider: selectedProvider,
    sessionId,
    showInlineErrors: true,
    maxTokens: sessionOutput(outputLimit),
    onMessageAdded: async (newMessages, activeId) => {
      if (activeId) {
        await updateChatSession(activeId, {
          messages: newMessages,
          lastMessageAt: Date.now()
        });
      }
    }
  });

  // Load or create session based on chapterId & projectId
  useEffect(() => {
    let isSubscribed = true;
    if (!projectId) return;

    const loadSession = async () => {
      const key = sessionKey;
      
      let sessionPromise = scribbleLocks.get(key);
      if (!sessionPromise) {
        sessionPromise = (async () => {
          const session = await db.chatSessions
            .where('projectId').equals(projectId)
            .and(s => s.chapterId === chapterId &&
              (s.kind === 'scribble' || (s.kind === undefined && /Scribble$/.test(s.title))))
            .first();

          if (session && session.id) {
            return session.id;
          } else {
            const welcomeMsg: ChatMessage = { 
              id: '1', 
              role: 'model', 
              content: 'Halo! Saya Scribble Assistant. Saya memantau draf Anda secara real-time untuk membantu detail lore atau brainstorming cepat di sini.',
              isWelcome: true,
              timestamp: Date.now()
            };

            const newId = await addChatSession({
              projectId,
              chapterId,
              title: chapterId ? `Chapter ${chapterId} Scribble` : 'Global Scribble',
              lastMessageAt: Date.now(),
              messages: [welcomeMsg],
              kind: 'scribble'
            });
            
            return newId;
          }
        })().finally(() => { scribbleLocks.delete(key); });
        scribbleLocks.set(key, sessionPromise);
      }

      try {
        const id = await sessionPromise;
        const session = await db.chatSessions.get(id);
        if (isSubscribed && session) {
          setMessages(session.messages);
          setLoadedSession({ key, id });
        }
      } catch (err) {
        console.error('Failed to load/create scribble session:', err);
      }
    };

    loadSession();

    return () => {
      isSubscribed = false;
    };
  }, [projectId, chapterId, sessionKey, setMessages]);

  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const mentionState = useMentionAutocomplete(codexEntries, bibleRules);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasReceivedReply = messages.some(m => m.role === 'model' && !m.isWelcome);

  const lastMessage = messages[messages.length - 1];
  const canRegenerate = !isLoading && !!lastMessage && lastMessage.role === 'model' && !lastMessage.isWelcome && !lastMessage.isError;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const suggestedPrompts = useMemo(() => {
    switch (viewMode) {
      case 'codex':
        return [
          "Bantu kembangkan latar belakang karakter ini",
          "Berikan ide konflik untuk entri ini",
          "Apa rahasia yang mungkin disembunyikan?"
        ];
      case 'outline':
        return [
          "Berikan ide plot twist yang mengejutkan",
          "Bantu menyusun klimaks cerita",
          "Apakah ada masalah pacing di bab ini?"
        ];
      case 'bible':
        return [
          "Saran tema cerita yang lebih kuat",
          "Bantu memperhalus premis cerita",
          "Buat aturan naratif dunia (worldbuilding)"
        ];
      case 'write':
      default:
        return [
          "Evaluasi alur cerita sejauh ini",
          "Berikan ide untuk adegan selanjutnya",
          "Bagaimana cara membuat cerita lebih emosional?"
        ];
    }
  }, [viewMode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const { toast } = useToast();
  const { setViewMode } = useNavigation();

  const handleClear = async () => {
    if (!sessionId || isLoading) return;
    const welcomeMsg: ChatMessage = { 
      id: Date.now().toString(), 
      role: 'model', 
      content: 'Halo! Saya Scribble Assistant. Saya memantau draf Anda secara real-time untuk membantu detail lore atau brainstorming cepat di sini.',
      isWelcome: true,
      timestamp: Date.now()
    };
    
    try {
      await updateChatSession(sessionId, {
        messages: [welcomeMsg],
        lastMessageAt: Date.now()
      });
      setMessages([welcomeMsg]);
    } catch {
      toast.error('Riwayat Nova Assistant gagal dihapus.');
    }
  };

  // Jendela teks di sekitar kursor (atau awal draf) sebagai konteks dinamis untuk AI.
  const computeFocusedContext = () => {
    const cursorPosition = editor
      ? editor.state.doc.textBetween(0, editor.state.selection.from, ' ').length
      : 0;
    return editor
      ? getActiveWindowText(currentText, cursorPosition, 1500)
      : currentText.substring(0, 1500);
  };

  const reportError = (err: any) => {
    const errorMessage = err.message || 'Maaf, saya mengalami kesalahan saat memerinci lore Anda.';

    if (err.code === 'INVALID_KEY' || err.code === 'QUOTA_EXCEEDED') {
      toast.error(errorMessage, {
        action: {
          label: 'Buka Pengaturan',
          onClick: () => setViewMode('settings')
        }
      });
    } else {
      toast.error(errorMessage);
    }


  };

  const handleSend = async (textToProcess?: string) => {
    const textToSend = textToProcess || input;
    if (!sessionId || !textToSend.trim() || isLoading) return;

    if (!textToProcess) setInput('');

    try {
      await sendMessage(textToSend, computeFocusedContext());
    } catch (err: any) {
      reportError(err);
    }
  };

  const handleContinue = async (index: number) => {
    if (!sessionId || isLoading) return;
    try {
      await continueReply(index, computeFocusedContext());
    } catch (error) {
      reportError(error);
    }
  };

  const handleRegenerate = async () => {
    if (!sessionId || isLoading) return;
    try {
      await regenerate(computeFocusedContext());
    } catch (err: any) {
      reportError(err);
    }
  };

  const handleStop = () => stop();

  return {
    sessionId,
    outputLimit,
    availableProviders,
    selectedProvider,
    setSelectedProvider,
    messages: sessionId ? messages : [],
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
  };
}
