import type { PiModel } from "../api/client";

const THINKING_LABELS: Record<string, string> = {
  off: "关闭",
  minimal: "最小",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "极高",
};

interface IdentityModalProps {
  show: boolean;
  editingId: number | null;
  piModels: PiModel[];
  formName: string;
  formProvider: string;
  formModel: string;
  formThinking: string;
  formEnabled: boolean;
  saving: boolean;
  onNameChange: (v: string) => void;
  onModelSelect: (provider: string, model: string) => void;
  onThinkingChange: (v: string) => void;
  onEnabledChange: (v: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function IdentityModal({
  show,
  editingId,
  piModels,
  formName,
  formProvider,
  formModel,
  formThinking,
  formEnabled,
  saving,
  onNameChange,
  onModelSelect,
  onThinkingChange,
  onEnabledChange,
  onSave,
  onCancel,
}: IdentityModalProps) {
  if (!show) return null;

  const modelSelectValue =
    formProvider && formModel ? `${formProvider}|${formModel}` : "";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h3 className="text-base font-bold text-slate-900 mb-4">
          {editingId !== null ? "编辑身份" : "添加身份"}
        </h3>

        <div className="space-y-4">
          {piModels.length > 0 ? (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                模型
              </label>
              <select
                value={modelSelectValue}
                onChange={(e) => {
                  const [p, m] = e.target.value.split("|");
                  onModelSelect(p, m);
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {piModels.map((m) => (
                  <option
                    key={`${m.provider}-${m.id}`}
                    value={`${m.provider}|${m.id}`}
                  >
                    {m.provider} / {m.id}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Provider
                </label>
                <input
                  type="text"
                  value={formProvider}
                  onChange={(e) => onModelSelect(e.target.value, formModel)}
                  placeholder="例如：anthropic"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Model
                </label>
                <input
                  type="text"
                  value={formModel}
                  onChange={(e) => onModelSelect(formProvider, e.target.value)}
                  placeholder="例如：claude-sonnet-4-6"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              身份名称
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="例如：快速模式"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Thinking Level
            </label>
            <select
              value={formThinking}
              onChange={(e) => onThinkingChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {Object.entries(THINKING_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={formEnabled}
              onChange={(e) => onEnabledChange(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
            />
            <label htmlFor="enabled" className="text-sm text-slate-700">
              启用
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={
              saving ||
              !formName.trim() ||
              !formProvider.trim() ||
              !formModel.trim()
            }
            className="px-5 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-800 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

export { THINKING_LABELS };
