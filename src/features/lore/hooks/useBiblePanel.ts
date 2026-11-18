import { useState, useEffect, useRef, useMemo } from 'react';
import { saveBibleInstruction } from '@/src/services/loreOperations';
import { db } from '@/src/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { DB_KEY_MAP } from '@/src/lib/constants';

export function useBiblePanel(projectId: number) {
  const allRules = useLiveQuery(() => 
    db.bible.where('projectId').equals(projectId).toArray()
  , [projectId]);

  const [formData, setFormData] = useState({
    title: '',
    tagline: '',
    genres: [] as string[],
    premise: '',
    setting: '',
    themes: '',
    tones: [] as string[],
    pov: '',
    pacing: '',
    notes: '',
    targetAudience: ''
  });

  const [savedField, setSavedField] = useState<string | null>(null);
  const lastLoadedProjectId = useRef<number | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Completion progress
  const progress = useMemo(() => {
    const fields = Object.values(formData);
    const filled = fields.filter(v => 
      Array.isArray(v) ? v.length > 0 : (v && v.toString().trim().length > 0)
    ).length;
    return Math.round((filled / fields.length) * 100);
  }, [formData]);

  // Muat/sinkronkan dari DB.
  // - Saat proyek berganti: selalu muat ulang.
  // - Untuk proyek yang sama: sinkronkan ulang dari DB HANYA bila tak ada
  //   penyuntingan tertunda (autoSaveTimerRef null). Ini membuat perubahan
  //   eksternal — restore backup, impor novel, tulisan asisten/lokakarya —
  //   tercermin di panel tanpa menimpa ketikan pengguna yang sedang berjalan.
  useEffect(() => {
    if (!allRules) return;
    const projectChanged = lastLoadedProjectId.current !== projectId;
    if (!projectChanged && autoSaveTimerRef.current) return;

    lastLoadedProjectId.current = projectId;
    const getVal = (k: string) => allRules.find(r => r.key === k)?.instruction || '';
    const getArr = (k: string) => {
      const val = getVal(k);
      try { return val ? JSON.parse(val) : []; } catch (e) { return []; }
    };

    setFormData({
      title: getVal('__STORY_TITLE__'),
      tagline: getVal('__STORY_TAGLINE__'),
      genres: getArr('__GENRES__'),
      premise: getVal('__CORE_PREMISE__'),
      setting: getVal('__WORLD_SETTING__'),
      themes: getVal('__THEMES__'),
      tones: getArr('__TONES__'),
      pov: getVal('__POV__'),
      pacing: getVal('__PACING__'),
      notes: getVal('__AUTHOR_NOTES__'),
      targetAudience: getVal('__TARGET_AUDIENCE__')
    });
  }, [allRules, projectId]);

  const saveField = async (key: string, value: string) => {
    try {
      await saveBibleInstruction(projectId, key, value);
      setSavedField(key);
      setTimeout(() => setSavedField(null), 2000);
    } catch (e) {
      console.error('Failed to save bible field:', e);
    }
  };

  const resolveDbKey = (field: keyof typeof formData): string | null =>
    DB_KEY_MAP[field as string]
    || (field === 'genres' ? '__GENRES__' : field === 'tones' ? '__TONES__' : field === 'pov' ? '__POV__' : field === 'pacing' ? '__PACING__' : null);

  const handleChange = (field: keyof typeof formData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Membersihkan timer autosave DAN me-null-kan ref-nya, sehingga ref adalah
  // penanda tepercaya "ada penyuntingan tertunda" (dipakai efek sinkronisasi
  // agar tak menimpa ketikan pengguna dengan data dari DB).
  const clearAutoSave = () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
  };

  const handleFieldChange = (field: keyof typeof formData, value: string) => {
    handleChange(field, value);
    clearAutoSave();
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      const dbKey = resolveDbKey(field);
      if (dbKey) saveField(dbKey, value);
    }, 800);
  };

  const handleBlur = (field: keyof typeof formData) => {
    clearAutoSave();
    const val = formData[field];
    // Field array (genres/tones) disimpan lewat toggleArrayItem; jangan pernah
    // menulisnya via String() di sini (menghasilkan "a,b", bukan JSON valid).
    if (typeof val !== 'string') return;
    const dbKey = resolveDbKey(field);
    if (dbKey) saveField(dbKey, val);
  };

  // Memperbarui state UI dan langsung menyimpan nilai eksplisit (tanpa menunggu
  // debounce maupun bergantung pada formData yang mungkin masih basi).
  const flushField = (field: keyof typeof formData, value: string) => {
    handleChange(field, value);
    clearAutoSave();
    const dbKey = resolveDbKey(field);
    if (dbKey) saveField(dbKey, value);
  };

  const toggleArrayItem = (field: 'genres' | 'tones', id: string, max?: number) => {
    const arr = formData[field];
    let newArr = [...arr];
    if (newArr.includes(id)) {
      newArr = newArr.filter(i => i !== id);
    } else {
      if (max && newArr.length >= max) {
        newArr.shift(); // Remove oldest if exceeding max
      }
      newArr.push(id);
    }
    handleChange(field, newArr);
    saveField(field === 'genres' ? '__GENRES__' : '__TONES__', JSON.stringify(newArr));
  };

  const selectRadio = (field: 'pov' | 'pacing', id: string, dbKey: string) => {
    handleChange(field, id);
    saveField(dbKey, id);
  };

  return {
    allRules,
    formData,
    savedField,
    progress,
    handleFieldChange,
    handleBlur,
    flushField,
    toggleArrayItem,
    selectRadio
  };
}
