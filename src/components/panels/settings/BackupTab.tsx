import React from 'react';
import { SemanticCacheSection } from '@/src/components/panels/settings/sections/SemanticCacheSection';
import { ManualBackupSection } from '@/src/components/panels/settings/sections/ManualBackupSection';
import { AutoBackupSection } from '@/src/components/panels/settings/sections/AutoBackupSection';
import { StoragePersistenceSection } from '@/src/components/panels/settings/sections/StoragePersistenceSection';
import { DataIntegritySection } from '@/src/components/panels/settings/sections/DataIntegritySection';

export function BackupTab() {
  return (
    <>
      <SemanticCacheSection />
      <StoragePersistenceSection />
      <DataIntegritySection />
      <ManualBackupSection />
      <AutoBackupSection />
    </>
  );
}
