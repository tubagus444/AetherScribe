import React, { createContext, useContext, useState, useMemo } from 'react';

type PanelType = 'none' | 'outline' | 'comments' | 'chapterCodex' | 'assistant' | 'snapshots' | 'insights';

interface EditorPanelContextType {
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  saveStatus: string;
  setSaveStatus: (status: string) => void;
}

export const EditorPanelContext = createContext<EditorPanelContextType>({
  activePanel: 'none',
  setActivePanel: () => {},
  saveStatus: '',
  setSaveStatus: () => {},
});

export const EditorPanelProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [activePanel, setActivePanel] = useState<PanelType>('none');
  const [saveStatus, setSaveStatus] = useState<string>('');

  const value = useMemo(() => ({
    activePanel, setActivePanel, saveStatus, setSaveStatus
  }), [activePanel, saveStatus]);

  return (
    <EditorPanelContext.Provider value={value}>
      {children}
    </EditorPanelContext.Provider>
  );
};

export const useEditorPanel = () => useContext(EditorPanelContext);
