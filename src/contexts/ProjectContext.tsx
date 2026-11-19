import { deleteProjectData } from '@/src/services/entityDeletion';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { createProjectWithChapter, ensureDefaultProject, updateProject } from '@/src/services/projectOperations';
import { db } from '@/src/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { ErrorService } from '@/src/services/errorService';
import { oramaSync } from '@/src/services/rag/oramaSync';
import { flushActiveEditor } from '@/src/features/editor/editorBridge';

interface ProjectContextType {
  projectId: number | null;
  project: any;
  isLoading: boolean;
  switchProject: (id: number) => Promise<void>;
  createProject: (name: string) => Promise<void>;
  deleteProject: (id: number) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projectId, setProjectId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    ensureDefaultProject().then(id => {
      if (id) {
        setProjectId(id);
        oramaSync.init(id);
      }
      setIsLoading(false);
    });
  }, []);

  const project = useLiveQuery(() => 
    projectId ? db.projects.get(projectId) : undefined
  , [projectId]);

  const activateProject = useCallback(async (id: number) => {
    await updateProject(id, { lastOpened: Date.now() });
    setProjectId(id);
    oramaSync.init(id);
  }, []);

  const switchProject = useCallback(async (id: number) => {
    await flushActiveEditor();
    try {
      await activateProject(id);
    } catch (error) {
      ErrorService.log({
        message: 'Failed to switch project',
        type: 'error',
        source: 'ProjectContext',
        metadata: { id, error }
      });
      throw error;
    }
  }, [activateProject]);

  const createProject = useCallback(async (name: string) => {
    await flushActiveEditor();
    try {
      const newId = await createProjectWithChapter(name);
      setProjectId(newId);
      oramaSync.init(newId);
    } catch (error) {
      ErrorService.log({
        message: 'Failed to create project',
        type: 'error',
        source: 'ProjectContext',
        metadata: { name, error }
      });
      throw error;
    }
  }, []);

  const deleteProject = useCallback(async (id: number) => {
    try {
      // LQ3: tentukan target pindah SEBELUM menghapus, lalu HAPUS dulu; pindah hanya
      // setelah hapus sukses (agar tidak terlanjur berpindah bila penghapusan gagal).
      const deletingActive = projectId === id;
      let nextId: number | undefined;
      if (deletingActive) {
        await flushActiveEditor();
        const other = await db.projects.where('id').notEqual(id).first();
        nextId = other?.id;
      }

      await deleteProjectData(id);

      // Pindah proyek hanya setelah penghapusan sukses.
      if (deletingActive) {
        if (nextId) {
          await activateProject(nextId);
        } else {
          const defaultId = await ensureDefaultProject();
          if (defaultId) setProjectId(defaultId);
        }
      }
    } catch (error) {
      ErrorService.log({
        message: 'Failed to delete project',
        type: 'error',
        source: 'ProjectContext',
        metadata: { id, error }
      });
      throw error;
    }
  }, [activateProject, projectId]);

  // Memo value + useCallback agar konsumen/anak ber-memo tidak re-render sia-sia. (LQ2)
  const value = useMemo(() => ({
    projectId,
    project,
    isLoading,
    switchProject,
    createProject,
    deleteProject
  }), [projectId, project, isLoading, switchProject, createProject, deleteProject]);

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
