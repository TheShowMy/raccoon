import { ArrowLeft, Settings } from "lucide-react";
import { useAppStore } from "../stores/useAppStore";

export function SettingsPanel() {
  const { closeSettings } = useAppStore();

  return (
    <main className="flex-1 h-full bg-white">
      <div className="px-8 py-5 border-b border-slate-100 flex items-center gap-3">
        <button
          onClick={closeSettings}
          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-slate-500" />
          <h1 className="text-lg font-bold text-slate-900">设置</h1>
        </div>
      </div>

      <div className="p-8">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-amber-400 rounded-full" />
            <h2 className="text-sm font-semibold text-slate-700">通用设置</h2>
          </div>
          <div className="bg-slate-50 rounded-xl p-8 border border-slate-100">
            <p className="text-sm text-slate-400 text-center">
              设置功能即将推出...
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
