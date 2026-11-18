import { useCallback } from 'react';
import { useToast } from '@/src/hooks/useToast';

export function useStorageQuota() {
  const { toast } = useToast();

  const checkStorageQuota = useCallback(async () => {
    if (navigator.storage?.estimate) {
      try {
        const { usage, quota } = await navigator.storage.estimate();
        if (usage !== undefined && quota !== undefined && quota > 0) {
          const percentUsed = (usage / quota) * 100;
          if (percentUsed > 80) {
            toast.warning(`Storage ${Math.round(percentUsed)}% penuh. Pertimbangkan backup data.`);
          }
        }
      } catch (error) {
        console.error('Failed to check storage quota:', error);
      }
    }
  }, [toast]);

  return { checkStorageQuota };
}
