import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { backupService } from '@/src/services/backupService';
import { SemanticCacheSection } from '@/src/components/panels/settings/sections/SemanticCacheSection';
import { ManualBackupSection } from '@/src/components/panels/settings/sections/ManualBackupSection';
import { AutoBackupSection } from '@/src/components/panels/settings/sections/AutoBackupSection';
import { StoragePersistenceSection } from '@/src/components/panels/settings/sections/StoragePersistenceSection';
import { DataIntegritySection } from '@/src/components/panels/settings/sections/DataIntegritySection';

export function BackupTab() {
  const internalBackups = useLiveQuery(() => backupService.getBackupList(), []);

  return (
    <>
      <ManualBackupSection internalBackups={internalBackups} />
      <AutoBackupSection internalBackups={internalBackups} />
      <details className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <summary className="cursor-pointer text-sm font-semibold">Pemeliharaan data</summary>
        <div className="mt-4 space-y-4">
          <StoragePersistenceSection />
          <DataIntegritySection />
          <SemanticCacheSection />
        </div>
      </details>
    </>
  );
}
