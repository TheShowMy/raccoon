import { X, Settings } from "lucide-react";
import { useAppStore } from "../stores/useAppStore";

export function SettingsPanel() {
  const { showSettings, closeSettings } = useAppStore();

  if (!showSettings) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-bold text-slate-900">设置</h2>
          </div>
          <button
            onClick={closeSettings}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-5 bg-amber-400 rounded-full" />
          <h3 className="text-sm font-semibold text-slate-700">通用设置</h3>
        </div>

        <div className="bg-slate-50 rounded-xl p-8 border border-slate-100">
          <p className="text-sm text-slate-400 text-center">
            设置功能即将推出...
          </p>
        </div>
      </div>
    </div>
  );
}
