import { useProjectChapters } from '@/src/hooks/useChapterQueries';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { updateCodexEntry, addCodexEntry } from '@/src/services/codexOperations';
import { addChatSession, updateChatSession, deleteChatSession, findWorkshopSession } from '@/src/services/chatSessionOperations';
import { workshopEntryKey } from '@/src/lib/workshopReference';
import { db } from '@/src/db';
import { CodexEntry, ChatMessage } from '@/src/types';
import { useOptimizedLiveQuery } from '@/src/hooks/useOptimizedLiveQuery';
import { useChatSession } from '@/src/hooks/useChatSession';
import { useAvailableProviders } from '@/src/hooks/useAvailableProviders';
import { useCodexCategories } from '@/src/features/codex/hooks/useCodexCategories';
import { useNavigation } from '@/src/contexts/NavigationContext';
import { useToast } from '@/src/hooks/useToast';
import { enrichEntities, auditCodexEntry, type CodexAuditFinding } from '@/src/services/ai';
import { gatherEntityContext } from '@/src/lib/orphanEntities';
import { invalidateContextCache } from '@/src/services/contextEngine';
import { WORKSHOP_DRAFT_INSTRUCTION, parseCodexDraft, stripCodexDraft } from '@/src/lib/codexDraft';

// Lock registry untuk mencegah pembuatan sesi Lokakarya ganda saat StrictMode
// me-mount efek dua kali (selaras dgn pola scribbleLocks di useScribbleAssistantPanel).
const workshopLocks = new Map<string, Promise<{ id: number; messages: ChatMessage[] }>>();

const SEVERITY_LABEL: Record<string, string> = { high: '🔴 Tinggi', medium: '🟠 Sedang', low: '🟡 Rendah' };

/** Format temuan audit jadi pesan markdown untuk ditempel ke kolom chat Lokakarya. */
function formatAuditMessage(findings: CodexAuditFinding[], title = 'Audit Konsistensi', emptyNote = 'lore saat ini'): string {
  if (!findings.length) {
    return `✅ **${title}:** tidak ada masalah terdeteksi terhadap ${emptyNote}.`;
  }
  const lines = findings.map((f, i) => {
    let s = `${i + 1}. **${SEVERITY_LABEL[f.severity] || f.severity} · ${f.type}** — ${f.issue}`;
    if (f.conflictsWith) s += `\n   - Berbenturan dengan: ${f.conflictsWith}`;
    if (f.suggestion) s += `\n   - Saran: ${f.suggestion}`;
    return s;
  });
  return `### 🔍 ${title} (${findings.length} temuan)\n\n${lines.join('\n')}\n\n_Diskusikan atau minta saya perbaiki temuan di atas, lalu simpan._`;
}

/** Satu field yang berubah antara entri asli dan draf, untuk konfirmasi diff sebelum menimpa. */
export interface FieldDiff {
  field: keyof CodexEntry;
  label: string;
  before: string;
  after: string;
}

const DIFF_FIELDS: (keyof CodexEntry)[] = ['name', 'category', 'description', 'aliases', 'tags'];
const FIELD_LABELS: Record<string, string> = {
  name: 'Nama',
  category: 'Kategori',
  description: 'Deskripsi',
  aliases: 'Alias',
  tags: 'Tag',
};

/** Normalisasi nilai field jadi string untuk perbandingan diff (array → daftar dipisah koma). */
function fmtField(v: unknown): string {
  if (Array.isArray(v)) return v.join(', ');
  return (v ?? '').toString();
}

/**
 * Otak Lokakarya Codex (buat-baru & edit). Menyatukan:
 * - draf entitas (field terstruktur yang bisa diedit manual; mode edit + diff),
 * - sesi chat PERSIST (useChatSession + tabel chatSessions, kind 'workshop') yang
 *   di-resume per-target (kunci `entry:<id>` atau `new:<seed>`) — diskusi bertahan
 *   saat pindah panel, dan sesi dibuang setelah entri tersimpan,
 * - "Tarik dari diskusi": panen percakapan → field via enrichEntities,
 * - audit konsistensi lapis 1 (auditCodexEntry),
 * - "Simpan": simpan entri dan invalidasi cache konteks AI.
 *
 * AI tidak pernah menulis ke DB sendiri; penulisan selalu lewat tombol Simpan.
 */
export function useCodexWorkshop(projectId: number) {
  const { workshopTarget, closeWorkshop, setViewMode } = useNavigation();
  const { toast } = useToast();

  const mode: 'create' | 'edit' = workshopTarget?.mode ?? 'create';
  const entryId = workshopTarget?.entryId;

  const entries = useOptimizedLiveQuery(
    () => db.codex.where('projectId').equals(projectId).toArray(),
    [projectId]
  );
  const bibleRules = useOptimizedLiveQuery(
    () => db.bible.where('projectId').equals(projectId).toArray(),
    [projectId]
  );
  const relationships = useOptimizedLiveQuery(
    () => db.relationships.where('projectId').equals(projectId).toArray(),
    [projectId]
  );
  // Bab (untuk audit mendalam / lapis 2). Live query murah; teks di-strip HTML saat dipakai.
  const chapters = useProjectChapters(projectId);
  const { categories } = useCodexCategories(projectId);

  const { availableProviders, selectedProvider, setSelectedProvider } = useAvailableProviders();

  // Sesi chat Lokakarya yang dipersist. Kunci resume: per-entri (edit) atau per-seed (create).
  const [sessionId, setSessionId] = useState<number | null>(null);
  const sessionIdRef = useRef<number | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  const workshopKey = useMemo(() => {
    if (mode === 'edit' && entryId) return workshopEntryKey(entryId);
    const seed = (workshopTarget?.seedName || '').trim().toLowerCase();
    return `new:${seed || '__blank__'}`;
  }, [mode, entryId, workshopTarget?.seedName]);
  const workshopKeyRef = useRef(workshopKey);
  workshopKeyRef.current = workshopKey;

  // Draf entitas. Nama diawali dari seed (mis. dari deteksi chat) bila ada.
  const [draft, setDraft] = useState<Partial<CodexEntry>>(() => ({
    name: workshopTarget?.seedName ?? '',
    category: 'character',
    description: '',
    aliases: [],
    tags: [],
  }));

  // Baseline untuk mode edit: snapshot entri asli, dipakai menghitung diff.
  const [current, setCurrent] = useState<Partial<CodexEntry> | null>(null);
  const initRef = useRef(false);

  // Pada mode edit, muat entri yang dibahas ke draf + baseline (sekali, saat data siap).
  useEffect(() => {
    if (initRef.current || mode !== 'edit' || !entryId || !entries) return;
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    const base: Partial<CodexEntry> = {
      name: entry.name,
      category: entry.category,
      description: entry.description,
      aliases: [...(entry.aliases || [])],
      tags: [...(entry.tags || [])],
    };
    setDraft(base);
    setCurrent({ ...base });
    initRef.current = true;
  }, [mode, entryId, entries]);

  const [isHarvesting, setIsHarvesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isAuditingDeep, setIsAuditingDeep] = useState(false);

  // Pesan pembuka — dibuat sekali agar tidak ter-reset saat re-render.
  // Nama diambil dari seedName (mode edit MENGIRIM nama entri saat dibuka) agar
  // tidak bergantung pada live query `entries` yang mungkin belum siap di render awal.
  const welcomeMessage = useMemo<ChatMessage>(() => {
    const name = workshopTarget?.seedName?.trim();
    let content: string;
    if (mode === 'edit') {
      content = name
        ? `Mari tinjau & sempurnakan **${name}**. Datanya sudah saya muat di kanan. Tanyakan apakah ada yang janggal, minta saya perhalus deskripsi, atau bahas hubungannya dengan tokoh lain. Field di kanan ikut diperbarui otomatis sambil kita berdiskusi — saat siap, **Simpan perubahan**.`
        : `Mari tinjau & sempurnakan entri ini. Datanya sudah dimuat di kanan — tanyakan atau minta perbaikan apa saja.`;
    } else {
      content = name
        ? `Mari kita kembangkan **${name}** untuk Kamus Data. Ceritakan siapa dia, perannya, latar belakang, atau hubungan dengan tokoh lain. Field di kanan terisi otomatis sambil kita berdiskusi — sesuaikan bila perlu, lalu **Simpan ke Codex**.`
        : `Mari rancang entri Codex baru lewat diskusi. Mulailah dengan nama dan gambaran singkat entitasnya — karakter, lokasi, item, atau konsep. Field di kanan akan terisi otomatis seiring obrolan.`;
    }
    return { id: 'workshop-welcome', role: 'model', content, isWelcome: true, timestamp: Date.now() };
  }, [mode, workshopTarget?.seedName]);

  const chat = useChatSession({
    projectId,
    codexEntries: entries || [],
    bibleRules: bibleRules || [],
    relationships: relationships || [],
    provider: selectedProvider,
    extraSystem: WORKSHOP_DRAFT_INSTRUCTION,
    initialMessages: [welcomeMessage],
    sessionId, // Teruskan ID sesi agar generation aman saat sesi berubah
    onError: (msg) => reportAIError(msg),
    onMessageAdded: (msgs, targetSessionId) => {
      // Gunakan ID presisi dari parameter
      if (targetSessionId) {
        updateChatSession(targetSessionId, { messages: msgs, lastMessageAt: Date.now() }).catch(() => {});
      }
    },
  });

  // Live-fill: saat sebuah balasan AI selesai, panen blok codex-draft (bila ada)
  // dan terapkan ke draf. Diproses sekali per pesan (id ditandai), termasuk pesan
  // yang tak punya blok agar tak diperiksa ulang.
  const appliedRef = useRef<Set<string>>(new Set());
  const allowedCategorySlugs = useMemo(() => categories.map((c) => c.slug), [categories]);
  useEffect(() => {
    if (chat.isLoading) return;
    const last = chat.messages[chat.messages.length - 1];
    if (!last || last.role !== 'model' || last.isWelcome || last.isError || !last.id) return;
    if (appliedRef.current.has(last.id)) return;
    appliedRef.current.add(last.id);
    const fields = parseCodexDraft(last.content, allowedCategorySlugs);
    // parseCodexDraft hanya menaruh key yang ada → spread aman, tak menimpa dgn undefined.
    if (fields) setDraft((prev) => ({ ...prev, ...fields }));
  }, [chat.isLoading, chat.messages, allowedCategorySlugs]);

  // Muat/buat sesi persist untuk target ini, lalu hidrasi pesan. Pesan lama ditandai
  // "sudah diproses" agar blok codex-draft historis tak diterapkan ulang ke draf saat resume.
  const setMessages = chat.setMessages;
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    const lockKey = `${projectId}::${workshopKey}`;

    let promise = workshopLocks.get(lockKey);
    if (!promise) {
      promise = (async () => {
        const existing = await findWorkshopSession(projectId, workshopKey);
        if (existing?.id) return { id: existing.id, messages: existing.messages };
        const id = await addChatSession({
          projectId,
          title: `Lokakarya: ${workshopTarget?.seedName || (mode === 'edit' ? 'Entri' : 'Entri baru')}`,
          messages: [welcomeMessage],
          lastMessageAt: Date.now(),
          kind: 'workshop',
          workshopKey,
        });
        return { id, messages: [welcomeMessage] };
      })();
      workshopLocks.set(lockKey, promise);
    }

    promise
      .then((res) => {
        if (!alive) return;
        sessionIdRef.current = res.id;
        setSessionId(res.id);
        setMessages(res.messages);
        for (const m of res.messages) if (m.id) appliedRef.current.add(m.id);
      })
      .catch((err) => {
        console.error('Gagal memuat sesi Lokakarya:', err);
        workshopLocks.delete(lockKey); // izinkan retry di render berikutnya
      });

    return () => { alive = false; };
  }, [projectId, workshopKey]);

  // Ringkasan draf sebagai konteks dinamis supaya AI tahu apa yang sedang dibangun.
  const draftContext = useCallback(() => {
    const parts: string[] = ['[Entitas Codex yang sedang dirancang di Lokakarya]'];
    if (draft.name) parts.push(`Nama: ${draft.name}`);
    if (draft.category) parts.push(`Kategori: ${draft.category}`);
    if (draft.aliases?.length) parts.push(`Alias: ${draft.aliases.join(', ')}`);
    if (draft.description) parts.push(`Deskripsi saat ini:\n${draft.description}`);
    return parts.join('\n');
  }, [draft]);

  const draftRef = useRef(draft);
  draftRef.current = draft;

  function reportAIError(msg: string, code?: string) {
    if (code === 'INVALID_KEY' || code === 'QUOTA_EXCEEDED') {
      toast.error(msg, { action: { label: 'Buka Pengaturan', onClick: () => setViewMode('settings') } });
    } else {
      toast.error(msg);
    }
  }

  // onError sudah memunculkan toast; telan rejection agar tak jadi unhandled promise.
  const sendMessage = useCallback(
    (text: string) => { void chat.sendMessage(text, draftContext()).catch(() => {}); },
    [chat, draftContext]
  );
  const regenerate = useCallback(
    () => { void chat.regenerate(draftContext()).catch(() => {}); },
    [chat, draftContext]
  );

  // Panen seluruh diskusi (di luar pesan pembuka) menjadi field entri via enrichEntities.
  const harvestFromDiscussion = useCallback(async () => {
    const name = draftRef.current.name?.trim();
    if (!name) {
      toast.error('Isi Nama entri terlebih dahulu sebelum menarik dari diskusi.');
      return;
    }
    const transcript = chat.messages
      .filter((m) => !m.isWelcome && !m.isError && m.content.trim())
      // Buang blok codex-draft dari balasan AI agar JSON tak ikut diumpankan ke enrichEntities.
      .map((m) => `${m.role === 'user' ? 'Penulis' : 'AI'}: ${(m.role === 'model' ? stripCodexDraft(m.content) : m.content).trim()}`)
      .filter((line) => line.replace(/^(Penulis|AI):\s*/, '').length > 0)
      .join('\n\n');
    if (!transcript) {
      toast.error('Belum ada diskusi yang bisa ditarik. Mulai mengobrol dulu dengan AI.');
      return;
    }

    setIsHarvesting(true);
    try {
      const [enriched] = await enrichEntities([{ name, excerpts: transcript }], bibleRules || []);
      if (!enriched) {
        toast.error('AI tidak menghasilkan ringkasan entitas. Coba perjelas diskusinya.');
        return;
      }
      setDraft((prev) => ({
        ...prev,
        category: enriched.category || prev.category,
        description: enriched.description || prev.description,
        aliases: enriched.aliases?.length ? enriched.aliases : prev.aliases,
      }));
      toast.success('Field diisi dari diskusi. Periksa dan sunting sebelum menyimpan.');
    } catch (e: any) {
      reportAIError(e?.message || 'Gagal menarik dari diskusi.', e?.code);
    } finally {
      setIsHarvesting(false);
    }
  }, [chat.messages, bibleRules, toast]);

  const trimmedName = draft.name?.trim().toLowerCase() ?? '';
  const isDuplicateName =
    trimmedName.length > 0 &&
    (entries || []).some((e) => e.id !== entryId && e.name.trim().toLowerCase() === trimmedName);

  // Diff per-field draf vs baseline (hanya relevan di mode edit) untuk konfirmasi sebelum menimpa.
  const diff = useMemo<FieldDiff[]>(() => {
    if (mode !== 'edit' || !current) return [];
    return DIFF_FIELDS.flatMap((f) => {
      const before = fmtField(current[f]);
      const after = fmtField(draft[f]);
      return before === after ? [] : [{ field: f, label: FIELD_LABELS[f], before, after }];
    });
  }, [mode, current, draft]);

  const hasChanges = diff.length > 0;

  const canSave =
    !!draft.name?.trim() &&
    !!draft.description?.trim() &&
    !isSaving &&
    (mode === 'create' || hasChanges);

  const save = useCallback(async () => {
    const name = draft.name?.trim();
    const description = draft.description?.trim();
    if (!name || !description) return;
    setIsSaving(true);
    try {
      const payload = {
        name,
        category: draft.category || 'character',
        description,
        aliases: draft.aliases || [],
        tags: draft.tags || [],
      };
      if (mode === 'edit' && entryId) {
        await updateCodexEntry(entryId, payload);
      } else {
        await addCodexEntry({ projectId, ...payload } as CodexEntry);
      }
      // Lore berubah → cache konteks AI harus disegarkan (selaras dengan jalur simpan Codex).
      await invalidateContextCache();
      // Sesi Lokakarya sudah tuntas → buang sesi + lock agar tak menyisakan diskusi basi.
      const sid = sessionIdRef.current;
      if (sid) await deleteChatSession(sid).catch(() => {});
      workshopLocks.delete(`${projectId}::${workshopKeyRef.current}`);
      toast.success(
        mode === 'edit' ? `Perubahan "${name}" disimpan.` : `"${name}" ditambahkan ke Kamus Data.`
      );
      closeWorkshop();
    } catch (e: any) {
      toast.error(e?.message || 'Gagal menyimpan entri.');
    } finally {
      setIsSaving(false);
    }
  }, [draft, mode, entryId, projectId, toast, closeWorkshop]);

  const auditBusy = isAuditing || isAuditingDeep || chat.isLoading;
  const canAudit = !!draft.name?.trim() && !!draft.description?.trim() && !auditBusy;
  const canAuditDeep = canAudit && !!chapters?.length;

  // Tempel pesan temuan audit ke chat + persist (setMessages tak memicu onMessageAdded).
  const appendAuditMessage = useCallback((content: string) => {
    chat.setMessages((prev) => {
      const updated: ChatMessage[] = [...prev, { id: `audit-${Date.now()}`, role: 'model', content, timestamp: Date.now() }];
      const id = sessionIdRef.current;
      if (id) updateChatSession(id, { messages: updated, lastMessageAt: Date.now() }).catch(() => {});
      return updated;
    });
  }, [chat]);

  // Audit lapis 1: entri (draf saat ini) vs lore terstruktur. Temuan ditempel ke chat.
  const auditEntry = useCallback(async () => {
    const name = draftRef.current.name?.trim();
    const description = draftRef.current.description?.trim();
    if (!name || !description) {
      toast.error('Isi Nama & Deskripsi dulu sebelum mengaudit.');
      return;
    }
    setIsAuditing(true);
    try {
      const findings = await auditCodexEntry({
        entry: {
          name,
          category: draftRef.current.category || 'character',
          aliases: draftRef.current.aliases || [],
          description,
        },
        codexEntries: entries || [],
        bibleRules: bibleRules || [],
        relationships: relationships || [],
        provider: selectedProvider,
      });
      appendAuditMessage(formatAuditMessage(findings));
    } catch (e: any) {
      reportAIError(e?.message || 'Audit konsistensi gagal.', e?.code);
    } finally {
      setIsAuditing(false);
    }
  }, [entries, bibleRules, relationships, selectedProvider, appendAuditMessage, toast]);

  // Audit lapis 2: entri vs cuplikan prosa bab tempat entitas (nama + alias) muncul.
  const auditDeep = useCallback(async () => {
    const name = draftRef.current.name?.trim();
    const description = draftRef.current.description?.trim();
    if (!name || !description) {
      toast.error('Isi Nama & Deskripsi dulu sebelum mengaudit.');
      return;
    }
    // Kumpulkan cuplikan di sekitar tiap kemunculan nama/alias (pola OrphanScanPanel).
    const plainChapters = (chapters || []).map((c) => ({ content: (c.content || '').replace(/<[^>]*>/g, ' ') }));
    const terms = [name, ...(draftRef.current.aliases || [])].map((t) => t.trim()).filter(Boolean);
    const CAP = 4000;
    let excerpts = '';
    for (const term of terms) {
      if (excerpts.length >= CAP) break;
      const ctx = gatherEntityContext(plainChapters, term, { maxSnippets: 6, window: 200, maxChars: CAP - excerpts.length });
      if (ctx) excerpts += (excerpts ? '\n' : '') + ctx;
    }
    if (!excerpts.trim()) {
      toast.info(`"${name}" belum muncul di bab mana pun — tak ada prosa untuk diaudit.`);
      return;
    }

    setIsAuditingDeep(true);
    try {
      const findings = await auditCodexEntry({
        entry: { name, category: draftRef.current.category || 'character', aliases: draftRef.current.aliases || [], description },
        codexEntries: entries || [],
        bibleRules: bibleRules || [],
        relationships: relationships || [],
        chapterExcerpts: excerpts,
        provider: selectedProvider,
      });
      appendAuditMessage(formatAuditMessage(findings, 'Audit Mendalam (vs prosa bab)', 'prosa bab'));
    } catch (e: any) {
      reportAIError(e?.message || 'Audit mendalam gagal.', e?.code);
    } finally {
      setIsAuditingDeep(false);
    }
  }, [chapters, entries, bibleRules, relationships, selectedProvider, appendAuditMessage, toast]);

  return {
    // data
    entries: entries || [],
    categories,
    mode,
    // draf
    draft,
    setDraft,
    isDuplicateName,
    diff,
    hasChanges,
    // chat
    messages: chat.messages,
    isLoading: chat.isLoading,
    retryStatus: chat.retryStatus,
    sendMessage,
    stop: chat.stop,
    regenerate,
    availableProviders,
    selectedProvider,
    setSelectedProvider,
    // aksi
    isHarvesting,
    harvestFromDiscussion,
    isAuditing,
    canAudit,
    auditEntry,
    isAuditingDeep,
    canAuditDeep,
    auditDeep,
    isSaving,
    canSave,
    save,
    close: closeWorkshop,
  };
}
