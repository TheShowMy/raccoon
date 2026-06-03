import { useCallback, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { MainContent } from "./components/MainContent";
import { AddProjectModal } from "./components/AddProjectModal";
import { SettingsPanel } from "./components/SettingsPanel";
import { PiAgentInstallBlocker } from "./components/PiAgentInstallBlocker";
import { useAppStore } from "./stores/useAppStore";
import { fetchPiStatus, fetchProjects } from "./api/client";

function App() {
  const { piInstalled, setPiInstalled, setProjects } = useAppStore();

  const checkPiStatus = useCallback(async () => {
    try {
      const installed = await fetchPiStatus();
      setPiInstalled(installed);
    } catch {
      setPiInstalled(false);
    }
  }, [setPiInstalled]);

  const loadProjects = useCallback(async () => {
    try {
      const projects = await fetchProjects();
      setProjects(projects);
    } catch {
      // ignore
    }
  }, [setProjects]);

  useEffect(() => {
    checkPiStatus();
    loadProjects();
  }, [checkPiStatus, loadProjects]);

  if (piInstalled === null) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3">
          <img
            src="/raccoon-icon.png"
            alt="raccoon"
            className="w-8 h-8 rounded object-cover animate-pulse"
          />
          <span className="text-gray-400 text-sm">检测环境中...</span>
        </div>
      </div>
    );
  }

  if (piInstalled === false) {
    return <PiAgentInstallBlocker onRefresh={checkPiStatus} />;
  }

  return (
    <div className="flex h-screen w-screen">
      <Sidebar />
      <MainContent />
      <AddProjectModal />
      <SettingsPanel />
    </div>
  );
}

export default App;
