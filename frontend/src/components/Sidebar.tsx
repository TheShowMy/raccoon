import {
  Plus,
  Settings,
  FolderKanban,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { ProjectList } from "./ProjectList";
import { useAppStore } from "../stores/useAppStore";

export function Sidebar() {
  const { openAddModal, openSettings, sidebarCollapsed, toggleSidebar } =
    useAppStore();

  return (
    <aside
      className={`h-full shrink-0 overflow-hidden border-r border-slate-200 bg-slate-50 transition-[width] duration-200 flex flex-col ${
        sidebarCollapsed ? "w-16" : "w-80"
      }`}
    >
      {/* Header */}
      <div
        className={`border-b border-slate-200 bg-white py-4 ${
          sidebarCollapsed ? "px-2" : "px-5"
        }`}
      >
        <div
          className={`mb-4 flex items-center ${
            sidebarCollapsed ? "justify-center" : "gap-2.5"
          }`}
        >
          <img
            src="/raccoon-icon.png"
            alt="raccoon"
            className="w-7 h-7 rounded-lg object-cover"
          />
          <span
            className={`font-bold text-slate-900 text-sm tracking-tight ${
              sidebarCollapsed ? "hidden" : ""
            }`}
          >
            raccoon
          </span>
          <button
            onClick={toggleSidebar}
            className={`rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 ${
              sidebarCollapsed ? "hidden" : "ml-auto"
            }`}
            title="收起项目列表"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
        {sidebarCollapsed && (
          <button
            onClick={toggleSidebar}
            className="mb-2 flex w-full items-center justify-center rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            title="展开项目列表"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={openAddModal}
          className={`w-full flex items-center justify-center gap-1.5 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-800 transition-all active:scale-[0.98] ${
            sidebarCollapsed ? "px-0 py-2" : "px-3 py-2"
          }`}
          title="添加项目"
        >
          <Plus className="w-4 h-4" />
          {!sidebarCollapsed && "添加项目"}
        </button>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div
          className={`py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 ${
            sidebarCollapsed ? "justify-center px-2" : "px-5"
          }`}
          title="项目列表"
        >
          <FolderKanban className="w-3.5 h-3.5" />
          {!sidebarCollapsed && "项目列表"}
        </div>
        <ProjectList collapsed={sidebarCollapsed} />
      </div>

      {/* Settings */}
      <div
        className={`border-t border-slate-200 bg-white py-3 ${
          sidebarCollapsed ? "px-2" : "px-5"
        }`}
      >
        <button
          onClick={openSettings}
          className={`w-full flex items-center rounded-lg py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 ${
            sidebarCollapsed ? "justify-center px-0" : "gap-2 px-3"
          }`}
          title="设置"
        >
          <Settings className="w-4 h-4" />
          {!sidebarCollapsed && "设置"}
        </button>
      </div>
    </aside>
  );
}
