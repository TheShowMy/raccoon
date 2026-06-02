import { Plus, Settings, FolderKanban } from "lucide-react";
import { ProjectList } from "./ProjectList";
import { useAppStore } from "../stores/useAppStore";

export function Sidebar() {
  const { openAddModal, openSettings } = useAppStore();

  return (
    <aside className="w-80 h-full bg-slate-50 border-r border-slate-200 flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2.5 mb-4">
          <img
            src="/raccoon-icon.png"
            alt="raccoon"
            className="w-7 h-7 rounded-lg object-cover"
          />
          <span className="font-bold text-slate-900 text-sm tracking-tight">
            raccoon
          </span>
        </div>
        <button
          onClick={openAddModal}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-800 transition-all active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          添加项目
        </button>
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-5 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <FolderKanban className="w-3.5 h-3.5" />
          项目列表
        </div>
        <ProjectList />
      </div>

      {/* Settings */}
      <div className="px-5 py-3 border-t border-slate-200 bg-white">
        <button
          onClick={openSettings}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <Settings className="w-4 h-4" />
          设置
        </button>
      </div>
    </aside>
  );
}
