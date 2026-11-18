import { db } from '@/src/db';
import type { AIUsageLog } from '@/src/types';
import { AI_USAGE_RETENTION_DAYS } from '@/src/lib/tableCatalog';

export function recordAiUsage(usage: Omit<AIUsageLog, 'id'>) {
  return db.aiUsageLogs.add(usage);
}

export async function cleanupAILogs() {
  try {
    const cutoff = Date.now() - (AI_USAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const deleteCount = await db.aiUsageLogs.where('timestamp').below(cutoff).delete();
    if (deleteCount > 0) {
      console.log(`Cleaned up ${deleteCount} old AI usage logs.`);
    }
  } catch (err) {
    console.error('Failed to cleanup AI usage logs:', err);
  }
}
