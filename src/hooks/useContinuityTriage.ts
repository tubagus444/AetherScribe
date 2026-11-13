import { writeTriage } from '@/src/services/continuityTriageService';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/src/db';
import { ContinuityTriage, TriageStatus } from '@/src/types';

export function useContinuityTriage(projectId: number) {
  // Query all triage records for the current project
  const triageRecords = useLiveQuery(
    () => db.continuityTriage.where('projectId').equals(projectId).toArray(),
    [projectId]
  );

  // Convert to a Map for O(1) lookups by findingId
  const triageMap = new Map<string, ContinuityTriage>();
  if (triageRecords) {
    for (const record of triageRecords) {
      triageMap.set(record.findingId, record);
    }
  }

  const setTriage = useCallback((findingId: string, status: TriageStatus) => writeTriage(projectId, findingId, status), [projectId]);
  const clearTriage = useCallback((findingId: string) => writeTriage(projectId, findingId), [projectId]);

  return {
    triageMap,
    setTriage,
    clearTriage,
  };
}
