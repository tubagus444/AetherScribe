import { useState, useRef, useEffect, useMemo } from 'react';
import { addChatSession, updateChatSession } from '@/src/services/chatSessionOperations';
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
const scribbleLocks = new Map<string, Promise<{ id: number; messages: ChatMessage[] }>>();

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

  const [sessionId, setSessionId] = useState<number | null>(null);
  const sessionIdRef = useRef<number | null>(null);

  // Sync state to ref for stable access in callbacks (avoiding stale closures in useChatSession)
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const {
    messages,
    setMessages,
    isLoading,
    sendMessage,
    stop,
    regenerate
  } = useChatSession({
    projectId,
    chapterId,
    codexEntries,
    bibleRules,
    relationships,
    provider: selectedProvider,
    onMessageAdded: async (newMessages) => {
      const activeId = sessionIdRef.current;
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
      const key = `${projectId}_${chapterId ?? 'global'}`;
      
      let sessionPromise = scribbleLocks.get(key);
      if (!sessionPromise) {
        sessionPromise = (async () => {
          const session = await db.chatSessions
            .where('projectId').equals(projectId)
            .and(s => s.chapterId === chapterId)
            .first();

          if (session && session.id) {
            return { id: session.id, messages: session.messages };
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
            
            return { id: newId, messages: [welcomeMsg] };
          }
        })();
        scribbleLocks.set(key, sessionPromise);
      }

      try {
        const result = await sessionPromise;
        if (isSubscribed) {
          sessionIdRef.current = result.id;
          setSessionId(result.id);
          setMessages(result.messages);
        }
      } catch (err) {
        console.error('Failed to load/create scribble session:', err);
        // Clear lock if failed so we can retry on next effect trigger
        scribbleLocks.delete(key);
      }
    };

    loadSession();

    return () => {
      isSubscribed = false;
    };
  }, [projectId, chapterId, setMessages]);

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
    const welcomeMsg: ChatMessage = { 
      id: Date.now().toString(), 
      role: 'model', 
      content: 'Halo! Saya Scribble Assistant. Saya memantau draf Anda secara real-time untuk membantu detail lore atau brainstorming cepat di sini.',
      isWelcome: true,
      timestamp: Date.now()
    };
    
    setMessages([welcomeMsg]);
    const activeId = sessionIdRef.current;
    if (activeId) {
      await updateChatSession(activeId, {
        messages: [welcomeMsg],
        lastMessageAt: Date.now()
      });
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

  // Tandai balasan model terakhir sebagai actionable (Salin/Sisipkan) lalu persist —
  // setMessages langsung tidak memicu onMessageAdded.
  const markLastMessageActionable = () => {
    const activeId = sessionIdRef.current;
    if (!activeId) return;
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'model') {
        const updated = [...prev];
        updated[updated.length - 1] = { ...last, isActionable: true, id: Date.now().toString() };
        updateChatSession(activeId, {
          messages: updated,
          lastMessageAt: Date.now()
        }).catch(err => console.error('Failed to update actionable state in DB:', err));
        return updated;
      }
      return prev;
    });
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

    setMessages(prev => {
      const updated: ChatMessage[] = [...prev, {
        id: Date.now().toString(),
        role: 'model' as const,
        content: `**Error:** ${errorMessage}`,
        isError: true,
        timestamp: Date.now()
      }];

      const activeId = sessionIdRef.current;
      if (activeId) {
        updateChatSession(activeId, {
          messages: updated,
          lastMessageAt: Date.now()
        }).catch(e => console.error('Failed to update error log in DB:', e));
      }

      return updated;
    });
  };

  const handleSend = async (textToProcess?: string) => {
    const textToSend = textToProcess || input;
    if (!textToSend.trim() || isLoading) return;

    if (!textToProcess) setInput('');

    try {
      await sendMessage(textToSend, computeFocusedContext());
      markLastMessageActionable();
    } catch (err: any) {
      reportError(err);
    }
  };

  const handleRegenerate = async () => {
    if (isLoading) return;
    try {
      await regenerate(computeFocusedContext());
      markLastMessageActionable();
    } catch (err: any) {
      reportError(err);
    }
  };

  const handleStop = () => stop();

  return {
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
    handleRegenerate,
    handleStop,
  };
}
