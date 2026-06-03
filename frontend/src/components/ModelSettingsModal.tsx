import { useState, useEffect } from "react";
import { X, Settings } from "lucide-react";
import type { ModelIdentity } from "../api/client";

const THINKING_LABELS: Record<string, string> = {
  off: "关闭",
  minimal: "最小",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "极高",
};

interface ModelSettingsModalProps {
  show: boolean;
  provider: string;
  model: string;
  modelEnabled: boolean;
  identity: ModelIdentity | null;
  onClose: () => void;
  onModelEnableChange: (enabled: boolean) => void;
  onSave: (
    payload: Omit<ModelIdentity, "id" | "sortOrder" | "createdAt">,
  ) => Promise<void>;
  onUpdate: (
    id: number,
    payload: Omit<ModelIdentity, "id" | "sortOrder" | "createdAt">,
  ) => Promise<void>;
}

export function ModelSettingsModal({
  show,
  provider,
  model,
  modelEnabled,
  identity,
  onClose,
  onModelEnableChange,
  onSave,
  onUpdate,
}: ModelSettingsModalProps) {
  const [formName, setFormName] = useState(() => identity?.name ?? "");
  const [formThinking, setFormThinking] = useState(
    () => identity?.thinkingLevel ?? "medium",
  );
  const [formEnabled, setFormEnabled] = useState(
    () => identity?.enabled ?? true,
  );
  const [saving, setSaving] = useState(false);

  // ESC to close
  useEffect(() => {
    if (!show) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [show, onClose]);

  const handleSubmit = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        provider,
        model,
        thinkingLevel: formThinking,
        enabled: formEnabled,
      };
      if (identity) {
        await onUpdate(identity.id, payload);
      } else {
        await onSave(payload);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-500" />
            <h3 className="text-base font-bold text-slate-900">模型设置</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {/* Model enable switch */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-100">
            <span className="text-sm text-slate-700">启用此模型</span>
            <input
              type="checkbox"
              checked={modelEnabled}
              onChange={(e) => onModelEnableChange(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
            />
          </div>

          {/* Identity name */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              身份名称
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="例如：快速模式"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Thinking level */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Thinking Level
            </label>
            <select
              value={formThinking}
              onChange={(e) => setFormThinking(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {Object.entries(THINKING_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Identity enabled */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="identity-enabled"
              checked={formEnabled}
              onChange={(e) => setFormEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
            />
            <label
              htmlFor="identity-enabled"
              className="text-sm text-slate-700"
            >
              启用此身份
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !formName.trim()}
            className="px-5 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-800 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
