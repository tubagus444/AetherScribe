import { useEffect, useRef } from 'react';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { db } from '@/src/db';
import { callProxy, getLightModelForProvider } from '@/src/services/ai/proxy';

// We should have a debouncer or background tracking.
// We don't want to block the UI, and we want to allow failures without crashing.

// Tunda ringkasan bab yang ditinggalkan agar perpindahan bab cepat (A→B→C) tak
// memicu satu panggilan AI per bab. Hanya bab yang benar-benar ditinggalkan selama
// ≥ DEBOUNCE_MS yang dirangkum. `inFlight` mencegah panggilan kembar untuk bab yang
// sama bila timer & pemicu lain bertumpuk.
const DEBOUNCE_MS = 8000;
const pendingTimers = new Map<number, ReturnType<typeof setTimeout>>();
const inFlight = new Set<number>();

function clearPending(chapterId: number) {
  const t = pendingTimers.get(chapterId);
  if (t) {
    clearTimeout(t);
    pendingTimers.delete(chapterId);
  }
}

function scheduleSummarize(chapterId: number) {
  clearPending(chapterId);
  const t = setTimeout(() => {
    pendingTimers.delete(chapterId);
    summarizeChapterBackground(chapterId);
  }, DEBOUNCE_MS);
  pendingTimers.set(chapterId, t);
}

export function useAutoSummarizer() {
  const { activeChapterId } = useNavigation();
  const prevChapterIdRef = useRef<number | null>(activeChapterId);

  useEffect(() => {
    // When active chapter changes, we check the previous one
    if (activeChapterId !== prevChapterIdRef.current) {
      const chapterToSummarize = prevChapterIdRef.current;
      prevChapterIdRef.current = activeChapterId;

      // Kembali ke sebuah bab → batalkan ringkasan tertunda untuknya (masih diedit).
      if (activeChapterId != null) clearPending(activeChapterId);

      if (chapterToSummarize != null) {
        scheduleSummarize(chapterToSummarize);
      }
    }
  }, [activeChapterId]);

  // Bersihkan timer tertunda saat unmount (teardown app/HMR) agar tak ada panggilan
  // setelah komponen lepas. Guard `summaryUpdatedAt >= lastModified` akan merangkum
  // ulang di sesi berikutnya bila perlu, jadi membatalkan di sini aman.
  useEffect(() => () => {
    pendingTimers.forEach(t => clearTimeout(t));
    pendingTimers.clear();
  }, []);
}

export async function summarizeChapterBackground(chapterId: number) {
  if (inFlight.has(chapterId)) return; // sudah diproses; cegah panggilan kembar
  inFlight.add(chapterId);
  try {
    const chapter = await db.chapters.get(chapterId);
    if (!chapter || !chapter.content || chapter.content.trim().length < 50) {
      return; // Too short to summarize
    }

    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(chapter.content));
    const sourceHash = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
    // Legacy summaries without a source hash are revalidated by regeneration.
    if (chapter.summarySourceHash === sourceHash && chapter.summaryUpdatedAt !== undefined && chapter.summaryUpdatedAt >= chapter.lastModified) {
      return; // Already up to date
    }

    console.log(`[AutoSummarize] Starting background summary for chapter ${chapterId}...`);

    // We use a predefined provider/model or standard API call.
    // We'll construct a simple prompt.
    // getSettings is in ai/index.ts but it's not exported. Let's just use localStorage or proxy directly.
    const provider = localStorage.getItem('ai_provider') || 'google';
    
    const loadKey = (name: string) => {
      try {
        const session = sessionStorage.getItem(`ai_key_${name}`);
        if (session) return session;
        const stored = localStorage.getItem(`ai_key_${name}`);
        return stored ? atob(stored) : '';
      } catch (e) {
        return '';
      }
    };
    const apiKey = loadKey(provider);
    if (!apiKey) return; // No key, can't summarize in background implicitly

    // Tugas mekanis: pakai model tier-murah provider yang sama; jatuh ke pilihan pengguna.
    const userModel = localStorage.getItem(`ai_model_${provider}`) || undefined;
    const model = getLightModelForProvider(provider) || userModel;

    const systemInstruction = 
      "Kamu adalah asisten editor novel profesional. Tugasmu adalah merangkum cerita bab yang diberikan ke dalam 1-2 paragraf singkat namun padat informasi. Fokus pada plot utama, karakter yang muncul, dan perubahan status quo. Format jawaban langsung ringkasan tanpa basa-basi.";

    const userPrompt = `Teks Bab:\n\n${chapter.content.substring(0, 15000)}`; // Max 15000 chars for safety

    const params = {
      systemInstruction,
      userPrompt,
      temperature: 0.3,
      maxTokens: 700, // ringkasan 1-2 paragraf; plafon mencegah output liar
      model,
      provider,
      actionType: 'summarize' as const
    };

    const summaryRes = await callProxy(provider, params, apiKey);
    
    if (summaryRes && summaryRes.trim().length > 0) {
      await db.transaction('rw', db.chapters, async () => {
        const fresh = await db.chapters.get(chapterId);
        if (!fresh || fresh.projectId !== chapter.projectId || fresh.content !== chapter.content || fresh.lastModified !== chapter.lastModified || fresh.summary !== chapter.summary || fresh.summaryUpdatedAt !== chapter.summaryUpdatedAt) return;
        await db.chapters.update(chapterId, {
          summary: summaryRes.trim(),
          summaryUpdatedAt: chapter.lastModified,
          summarySourceHash: sourceHash,
        });
      });

    }

  } catch (error) {
    console.error(`[AutoSummarize] Failed to summarize chapter ${chapterId}:`, error);
  } finally {
    inFlight.delete(chapterId);
  }
}
