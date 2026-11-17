import React, { useEffect, useState } from 'react';
import { DashboardView } from './components/DashboardView';
import { DiagnosticsAdvisorModal } from './components/DiagnosticsAdvisorModal';
import { ExperimentsView } from './components/ExperimentsView';
import { ICLibraryView } from './components/ICLibraryView';
import { TopNav } from './components/TopNav';
import { TrainerWorkspace } from './components/TrainerWorkspace';
import { useLabStore } from './store/useLabStore';

export default function App() {
  const activeView = useLabStore((s) => s.activeView);
  const saveCurrentProject = useLabStore((s) => s.saveCurrentProject);
  const refreshRecentProjects = useLabStore((s) => s.refreshRecentProjects);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  useEffect(() => {
    void refreshRecentProjects();
  }, [refreshRecentProjects]);

  const handleSave = async () => {
    await saveCurrentProject();
    setSaveToast('Project saved to local IndexedDB');
    setTimeout(() => setSaveToast(null), 2200);
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#F1F0EB] text-[#20252B]">
      <TopNav onSaveAndExport={() => void handleSave()} />

      {activeView === 'dashboard' && <DashboardView />}
      {activeView === 'workspace' && <TrainerWorkspace />}
      {activeView === 'library' && <ICLibraryView />}
      {activeView === 'experiments' && <ExperimentsView />}

      <DiagnosticsAdvisorModal />

      {saveToast && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-50 bg-[#20252B] text-[#F1F0EB] border border-[#456A83] px-4 py-2 rounded text-xs font-mono shadow-lg"
        >
          {saveToast}
        </div>
      )}
    </div>
  );
}
