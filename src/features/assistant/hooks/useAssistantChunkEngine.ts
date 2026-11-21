import { useState, useRef, useEffect } from 'react';
import { readProjectChapters } from '@/src/services/chapterQueries';
import { splitIntoScenes, getRelevantScenes, getLastScene, buildExcerptContext, Scene } from '@/src/lib/chunkEngine';

interface UseAssistantChunkEngineProps {
  input: string;
  isSmartAuto?: boolean;
  activeSessionId: number | null;
  sessionChapter?: any; // replace with Chapter type if available
  codexEntries?: any[]; // replace with CodexEntry[] type if available
}

export function useAssistantChunkEngine({
  input,
  isSmartAuto,
  activeSessionId,
  sessionChapter,
  codexEntries = []
}: UseAssistantChunkEngineProps) {
  const [chapterContext, setChapterContext] = useState('');
  const [sceneMetadata, setSceneMetadata] = useState<{ name: string; wordCount: number; isManual: boolean; manualType?: 'excerpt' | 'summary' } | null>(null);

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

  // Run chunk engine on input change
  useEffect(() => {
    if (!sessionChapter) {
      setChapterContext('');
      setSceneMetadata(null);
      return;
    }
    
    const hasManualExcerpt = input.includes('@chapter-excerpt');
    const hasManualSummary = input.includes('@chapter-summary');

    if (hasManualExcerpt) {
      if (sessionChapter && sessionChapter.content) {
        const lastScene = getLastScene(scenesRef.current);
        if (lastScene) {
          setChapterContext(buildExcerptContext([lastScene]));
          setSceneMetadata({
            name: `Scene ${lastScene.index + 1}`,
            wordCount: lastScene.wordCount,
            isManual: true,
            manualType: 'excerpt'
          });
        }
      }
      return;
    }

    if (hasManualSummary) {
      if (sessionChapter && sessionChapter.summary) {
        setChapterContext(`[CHAPTER SUMMARY]\n${sessionChapter.summary}\n[END SUMMARY]`);
        setSceneMetadata({ name: 'Chapter Summary', wordCount: sessionChapter.summary.split(/\s+/).length, isManual: true, manualType: 'summary' });
      }
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
    } else if (!hasManualExcerpt && !hasManualSummary) {
      setChapterContext('');
      setSceneMetadata(null);
    }
  }, [input, isSmartAuto, sessionChapter?.id, sessionChapter?.summary, sessionChapter?.content, activeSessionId]);

  return {
    chapterContext,
    setChapterContext,
    sceneMetadata,
    setSceneMetadata,
    scenes
  };
}
