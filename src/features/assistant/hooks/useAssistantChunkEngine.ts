import { useState, useRef, useEffect, useCallback } from 'react';
import { readProjectChapters } from '@/src/services/chapterQueries';
import { splitIntoScenes, getRelevantScenes, getLastScene, buildExcerptContext, Scene } from '@/src/lib/chunkEngine';
import type { Chapter, CodexEntry } from '@/src/types';

interface UseAssistantChunkEngineProps {
  input: string;
  isSmartAuto?: boolean;
  activeSessionId: number | null;
  sessionChapter?: Chapter;
  codexEntries?: CodexEntry[];
}

type SceneMetadata = { name: string; wordCount: number; isManual: boolean; manualType?: 'excerpt' | 'summary' };

export function useAssistantChunkEngine({
  input,
  isSmartAuto,
  activeSessionId,
  sessionChapter,
  codexEntries = []
}: UseAssistantChunkEngineProps) {
  const [chapterContext, setChapterContext] = useState('');
  const [sceneMetadata, setSceneMetadata] = useState<SceneMetadata | null>(null);

  const [scenes, setScenes] = useState<Scene[]>([]);
  const scenesRef = useRef(scenes);

  const codexRef = useRef(codexEntries);
  useEffect(() => {
    codexRef.current = codexEntries;
  }, [codexEntries]);

  // Split scenes only when chapter content changes
  useEffect(() => {
    if (sessionChapter?.content) {
      const splitScenes = splitIntoScenes(sessionChapter.content);
      setScenes(splitScenes);
      scenesRef.current = splitScenes;
    } else {
      setScenes([]);
      scenesRef.current = [];
    }
  }, [sessionChapter?.id, sessionChapter?.content]);

  const getManualChapterAttachment = useCallback((text: string): { context: string; metadata: SceneMetadata | null } | undefined => {
    if (text.includes('@chapter-excerpt')) {
      const lastScene = getLastScene(scenesRef.current);
      return lastScene ? {
        context: buildExcerptContext([lastScene]),
        metadata: { name: `Scene ${lastScene.index + 1}`, wordCount: lastScene.wordCount, isManual: true, manualType: 'excerpt' },
      } : { context: '', metadata: null };
    }
    if (text.includes('@chapter-summary')) {
      const summary = sessionChapter?.summary;
      return summary ? {
        context: `[CHAPTER SUMMARY]\n${summary}\n[END SUMMARY]`,
        metadata: { name: 'Chapter Summary', wordCount: summary.split(/\s+/).length, isManual: true, manualType: 'summary' },
      } : { context: '', metadata: null };
    }
  }, [sessionChapter?.summary]);

  // Run chunk engine on input change
  useEffect(() => {
    if (!sessionChapter) {
      setChapterContext('');
      setSceneMetadata(null);
      return;
    }
    
    const attachment = getManualChapterAttachment(input);
    if (attachment) {
      setChapterContext(attachment.context);
      setSceneMetadata(attachment.metadata);
      return;
    }

    if (isSmartAuto && sessionChapter?.id && scenesRef.current.length > 0) {
      let cancelled = false;
      const runEngine = setTimeout(async () => {
        // Fetch past chapter summaries
        let pastSummariesText = '';
        if (sessionChapter.projectId) {
          try {
            const chapters = await readProjectChapters(sessionChapter.projectId, 'manuscript');
            
            const summariesList = chapters
              .filter(ch => ch.order < sessionChapter.order && ch.summary?.trim())
              .map(ch => `${ch.title}: ${ch.summary}`);
              
            if (summariesList.length > 0) {
              pastSummariesText = `\n[RINGKASAN BAB MASA LALU]\n${summariesList.join('\n\n')}\n[AKHIR RINGKASAN MASA LALU]\n\n`;
            }
          } catch (error) {
            console.error("Gagal mengambil ringkasan bab masa lalu:", error);
          }
        }

        if (cancelled) return;
        const relevant = getRelevantScenes(input, scenesRef.current, codexRef.current || []);
        let chosenData: Scene[] = [];
        let name = '';
        
        if (relevant.length > 0) {
          chosenData = relevant;
          name = relevant.length === 1 ? `Scene ${relevant[0].index + 1}` : `Scenes ${relevant.map(s => s.index + 1).join(' & ')}`;
        } else {
          const last = getLastScene(scenesRef.current);
          if (last) {
            chosenData = [last];
            name = `Scene ${last.index + 1} (Latest)`;
          }
        }
        
        if (chosenData.length > 0 || pastSummariesText) {
          const currentScenesText = chosenData.length > 0 ? buildExcerptContext(chosenData) : '';
          setChapterContext(`${pastSummariesText}${currentScenesText}`);
          setSceneMetadata({
            name: `${pastSummariesText ? 'Past Summaries + ' : ''}${name}`,
            wordCount: chosenData.reduce((acc, s) => acc + s.wordCount, 0),
            isManual: false
          });
        }
      }, 500); // 500ms debounce
      
      return () => {
        cancelled = true;
        clearTimeout(runEngine);
      };
    } else {
      setChapterContext('');
      setSceneMetadata(null);
    }
  }, [input, isSmartAuto, sessionChapter?.id, sessionChapter?.content, activeSessionId, getManualChapterAttachment]);

  return {
    chapterContext,
    setChapterContext,
    sceneMetadata,
    setSceneMetadata,
    getManualChapterAttachment,
    scenes
  };
}
