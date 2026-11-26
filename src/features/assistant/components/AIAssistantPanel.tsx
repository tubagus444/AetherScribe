import { useProjectChapters } from '@/src/hooks/useChapterQueries';
import React, { useEffect, useMemo, useState, type SetStateAction } from 'react';
import { Plus, BrainCircuit } from 'lucide-react';
import { db } from '@/src/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useOptimizedLiveQuery } from '@/src/hooks/useOptimizedLiveQuery';
import { cn } from '@/src/lib/utils';
import { useProject } from '@/src/contexts/ProjectContext';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { SessionModeSelector } from '@/src/components/common/SessionModeSelector';
import { useAssistantChunkEngine } from '@/src/features/assistant/hooks/useAssistantChunkEngine';
import { useAssistantSession } from '@/src/features/assistant/hooks/useAssistantSession';
import { useMentionAutocomplete } from '@/src/hooks/useMentionAutocomplete';
import { useAvailableProviders } from '@/src/hooks/useAvailableProviders';

// New Sub-components
import { AssistantSidebar } from '@/src/features/assistant/components/AssistantSidebar';
import { AssistantHeader } from '@/src/features/assistant/components/AssistantHeader';
import { AssistantMessageList } from '@/src/features/assistant/components/AssistantMessageList';
import { AssistantInputArea } from '@/src/features/assistant/components/AssistantInputArea';

type SessionDraft = {
  input: string;
  attachedCodexIds: number[];
};

const emptyDraft: SessionDraft = { input: '', attachedCodexIds: [] };

export function AIAssistantPanel() {
  const { projectId } = useProject();
  const { activeChapterId } = useNavigation();
  const { availableProviders, selectedProvider, setSelectedProvider } = useAvailableProviders();

  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState(() => new Map<number, SessionDraft>());
  const { input, attachedCodexIds } = (activeSessionId === null ? undefined : drafts.get(activeSessionId)) ?? emptyDraft;

  const updateDraft = (update: (draft: SessionDraft) => SessionDraft) => {
    if (activeSessionId === null) return;
    setDrafts(previous => {
      const draft = update(previous.get(activeSessionId) ?? emptyDraft);
      const next = new Map(previous);
      if (draft.input || draft.attachedCodexIds.length) next.set(activeSessionId, draft);
      else next.delete(activeSessionId);
      return next;
    });
  };
  const setInput = (value: SetStateAction<string>) => updateDraft(draft => ({
    ...draft,
    input: typeof value === 'function' ? value(draft.input) : value,
  }));
  const setAttachedCodexIds = (value: SetStateAction<number[]>) => updateDraft(draft => ({
    ...draft,
    attachedCodexIds: typeof value === 'function' ? value(draft.attachedCodexIds) : value,
  }));

  const codexEntries = useOptimizedLiveQuery(() => 
    projectId ? db.codex.where('projectId').equals(projectId).toArray() : []
  , [projectId]);
  const attachedCodexEntries = useMemo(() => attachedCodexIds.flatMap(id =>
    codexEntries?.find(entry => entry.id === id && entry.projectId === projectId) ?? []),
  [attachedCodexIds, codexEntries, projectId]);

  const bibleRules = useOptimizedLiveQuery(() => 
    projectId ? db.bible.where('projectId').equals(projectId).toArray() : []
  , [projectId]);

  const relationships = useOptimizedLiveQuery(() => 
    projectId ? db.relationships.where('projectId').equals(projectId).toArray() : []
  , [projectId]);

  const chapters = useProjectChapters(projectId, 'manuscript');

  const {
    isOpen: isMentionOpen,
    setIsOpen: setIsMentionOpen,
    suggestions: mentionSuggestions,
    selectedIndex: mentionSelectedIndex,
    handleInputChange: handleMentionInputChange,
    handleKeyDown: handleMentionKeyDown,
    selectMention
  } = useMentionAutocomplete(codexEntries || [], bibleRules || []);

  useEffect(() => setIsMentionOpen(false), [activeSessionId, setIsMentionOpen]);

  const activeSession = useLiveQuery(() => 
    activeSessionId ? db.chatSessions.get(activeSessionId) : undefined
  , [activeSessionId]);

  const isSmartAuto = activeSession?.smartAutoEnabled;
  const sessionChapterId = activeSession?.id === activeSessionId ? activeSession?.activeChapterId : undefined;
  const sessionChapter = chapters?.find(c => c.id === sessionChapterId);

  const {
    chapterContext,
    setChapterContext,
    sceneMetadata,
    setSceneMetadata,
    getManualChapterAttachment,
  } = useAssistantChunkEngine({
    input,
    isSmartAuto,
    activeSessionId,
    sessionChapter,
    codexEntries
  });

  const {
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
  } = useAssistantSession({
    projectId,
    activeChapterId,
    sessionChapterId,
    activeSessionId,
    setActiveSessionId,
    activeSession,
    codexEntries: codexEntries || [],
    bibleRules: bibleRules || [],
    relationships: relationships || [],
    input,
    setInput,
    chapterContext,
    automaticChapterContext: isSmartAuto && !sceneMetadata?.isManual ? chapterContext : '',
    getManualChapterContext: text => getManualChapterAttachment(text)?.context,
    attachedCodexEntries,
    clearCodexAttachments: () => setAttachedCodexIds([]),
    provider: selectedProvider
  });

  return (
    <div className="flex h-full bg-slate-50 dark:bg-slate-900 overflow-hidden text-slate-900 dark:text-slate-100">
      <AssistantSidebar
        projectId={projectId}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onCreateSession={createSession}
      />

      <div className={cn(
        "flex-1 flex flex-col relative",
        !activeSessionId ? "hidden lg:flex" : "flex"
      )}>
        {!activeSessionId ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-3xl flex items-center justify-center text-indigo-600 mb-6 motion-safe:animate-pulse">
              <BrainCircuit size={40} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">Studio Asisten</h1>
            <p className="max-w-md text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
              Ruang kerja khusus untuk menyusun plot, mendalami lore, atau sekadar bertukar pikiran dengan asisten cerdas Anda yang terintegrasi dengan Story Bible & Codex.
            </p>
            <button 
              onClick={createSession}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition-all flex items-center gap-2"
            >
              <Plus size={20} /> Mulai Diskusi Baru
            </button>
          </div>
        ) : (
          <>
            <AssistantHeader
              activeSessionId={activeSessionId}
              activeSession={activeSession}
              onBack={() => setActiveSessionId(null)}
              onSessionDeleted={() => setActiveSessionId(null)}
              availableProviders={availableProviders}
              selectedProvider={selectedProvider}
              onSelectProvider={setSelectedProvider}
            />

            <AssistantMessageList
              key={activeSessionId}
              messages={messages}
              isLoading={isLoading}
              retryStatus={retryStatus}
              waitingForReply={waitingForReply}
              onSelectPrompt={(prompt) => setInput(prompt)}
              onContinue={handleContinue}
              onRegenerate={handleRegenerate}
              onRetry={handleRegenerate}
              codexEntries={codexEntries}
            />

            <AssistantInputArea
              key={`composer-${activeSessionId}`}
              activeSessionId={activeSessionId}
              input={input}
              setInput={setInput}
              isLoading={isLoading}
              handleSend={handleSend}
              onStop={stop}
              provider={selectedProvider}
              messages={messages}
              sessionChapterId={sessionChapterId}
              chapters={chapters}
              sceneMetadata={sceneMetadata}
              chapterContext={chapterContext}
              setSceneMetadata={setSceneMetadata}
              setChapterContext={setChapterContext}
              codexEntries={codexEntries}
              bibleRules={bibleRules}
              attachedCodexEntries={attachedCodexEntries}
              onAttachCodex={id => setAttachedCodexIds(ids => ids.includes(id) ? ids : [...ids, id])}
              onRemoveCodex={id => setAttachedCodexIds(ids => ids.filter(current => current !== id))}
              sessionChapter={sessionChapter}
              isMentionOpen={isMentionOpen}
              setIsMentionOpen={setIsMentionOpen}
              mentionSuggestions={mentionSuggestions}
              mentionSelectedIndex={mentionSelectedIndex}
              handleMentionInputChange={handleMentionInputChange}
              handleMentionKeyDown={handleMentionKeyDown}
              selectMention={selectMention}
            />
          </>
        )}
      </div>
      
      {showModeSelector && (
         <SessionModeSelector 
           onSelect={(mode, smartAuto) => executeCreateSession(mode, smartAuto)} 
           onCancel={() => setShowModeSelector(false)} 
         />
      )}
    </div>
  );
}
