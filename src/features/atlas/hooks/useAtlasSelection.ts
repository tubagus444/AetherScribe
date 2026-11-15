import { useEffect, useState } from 'react';
import type { DrawMode } from '../components/MapCanvas';

export function useAtlasSelection() {
  const [selectedMapId, setSelectedMapId] = useState<number | undefined>(undefined);
  const [drawMode, setDrawMode] = useState<DrawMode>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<number | undefined>(undefined);
  const [editingGeometry, setEditingGeometry] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const [sidebarView, setSidebarView] = useState<'list' | 'detail'>('list');
  // Mode edit hanya berlaku untuk penanda yang sedang dipilih → matikan saat pilihan
  // berganti / hilang (mis. klik penanda lain, tutup sidebar, mulai menggambar).
  useEffect(() => {
    setEditingGeometry(false);
  }, [selectedMarkerId]);

  return { selectedMapId, setSelectedMapId, drawMode, setDrawMode, selectedMarkerId, setSelectedMarkerId, editingGeometry, setEditingGeometry, draftCount, setDraftCount, sidebarView, setSidebarView };
}
