import React from 'react';
import { useAISettings } from '@/src/components/panels/settings/useAISettings';
import { AIPreferences } from '@/src/components/panels/settings/sections/AIPreferences';
import { AdvancedAIOptimization } from '@/src/components/panels/settings/sections/AdvancedAIOptimization';
import { ApiCredentials } from '@/src/components/panels/settings/sections/ApiCredentials';
import { OllamaConfig } from '@/src/components/panels/settings/sections/OllamaConfig';

export function AISettingsTab() {
  const s = useAISettings();

  return (
    <>
      <AIPreferences
        localOnly={s.localOnly}
        setLocalOnly={s.setLocalOnly}
        allowedFallbacks={s.allowedFallbacks}
        setAllowedFallbacks={s.setAllowedFallbacks}
        provider={s.provider}
        setProvider={s.setProvider}
        contextDepth={s.contextDepth}
        setContextDepth={s.setContextDepth}
      />

      <AdvancedAIOptimization
        provider={s.provider}
        maxLoreChars={s.maxLoreChars}
        setMaxLoreChars={s.setMaxLoreChars}
        lightModels={s.lightModels}
        setLightModels={s.setLightModels}
        cacheTtl={s.cacheTtl}
        setCacheTtl={s.setCacheTtl}
        rewriteTemp={s.rewriteTemp}
        setRewriteTemp={s.setRewriteTemp}
        inlineConsistencyAI={s.inlineConsistencyAI}
        onToggleInlineConsistencyAI={s.toggleInlineConsistencyAI}
      />

      <ApiCredentials
        keys={s.keys}
        setKeys={s.setKeys}
        models={s.models}
        setModels={s.setModels}
        isSaved={s.isSaved}
        onSave={s.handleSave}
      />

      <OllamaConfig
        ollamaEnabled={s.ollamaEnabled}
        setOllamaEnabled={s.setOllamaEnabled}
        ollamaBaseUrl={s.ollamaBaseUrl}
        setOllamaBaseUrl={s.setOllamaBaseUrl}
        model={s.models.ollama}
        onModelChange={(val) => s.setModels({ ...s.models, ollama: val })}
      />
    </>
  );
}
