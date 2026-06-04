import { useState, useEffect } from "react";
import { X, Layers } from "lucide-react";
import type { WorkerModelTier, PiModel } from "../api/client";

const WORKER_IDENTITIES = [
  { value: "coder", label: "编码专家" },
  { value: "reviewer", label: "审查员" },
  { value: "browser", label: "浏览器操作" },
  { value: "vision", label: "视觉分析" },
];

interface WorkerTierModalProps {
  show: boolean;
  editingTier: WorkerModelTier | null;
  piModels: PiModel[];
  onClose: () => void;
  onSave: (payload: Omit<WorkerModelTier, "id" | "createdAt">) => Promise<void>;
  onUpdate: (
    id: number,
    payload: Omit<WorkerModelTier, "id" | "createdAt">,
  ) => Promise<void>;
}

export function WorkerTierModal({
  show,
  editingTier,
  piModels,
  onClose,
  onSave,
  onUpdate,
}: WorkerTierModalProps) {
  const [formIdentity, setFormIdentity] = useState(
    () => editingTier?.identity ?? "coder",
  );
  const [formTierLevel, setFormTierLevel] = useState(
    () => editingTier?.tierLevel ?? 1,
  );
  const [formProvider, setFormProvider] = useState(
    () => editingTier?.provider ?? "",
  );
  const [formModel, setFormModel] = useState(() => editingTier?.model ?? "");
  const [formDescription, setFormDescription] = useState(
    () => editingTier?.description ?? "",
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
    if (!formProvider || !formModel) return;
    if (formTierLevel < 1) return;

    setSaving(true);
    try {
      const payload = {
        identity: formIdentity,
        tierLevel: formTierLevel,
        provider: formProvider,
        model: formModel,
        description: formDescription.trim(),
      };
      if (editingTier) {
        await onUpdate(editingTier.id, payload);
      } else {
        await onSave(payload);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // Get unique providers
  const providers = [...new Set(piModels.map((m) => m.provider))];

  // Get models for selected provider
  const modelsForProvider = piModels.filter((m) => m.provider === formProvider);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-500" />
            <h3 className="text-base font-bold text-slate-900">
              {editingTier ? "编辑模型等级" : "添加模型等级"}
            </h3>
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
          {/* Identity */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Worker 身份
            </label>
            <select
              value={formIdentity}
              onChange={(e) => setFormIdentity(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {WORKER_IDENTITIES.map((id) => (
                <option key={id.value} value={id.value}>
                  {id.label}
                </option>
              ))}
            </select>
          </div>

          {/* Tier Level */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              等级（1=快速/便宜，数字越大越强）
            </label>
            <input
              type="number"
              min={1}
              value={formTierLevel}
              onChange={(e) => setFormTierLevel(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Provider */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Provider
            </label>
            <select
              value={formProvider}
              onChange={(e) => {
                setFormProvider(e.target.value);
                setFormModel("");
              }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">选择 Provider...</option>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              模型
            </label>
            <select
              value={formModel}
              onChange={(e) => setFormModel(e.target.value)}
              disabled={!formProvider}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
            >
              <option value="">选择模型...</option>
              {modelsForProvider.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.id})
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              描述（可选）
            </label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="例如：快速编码、标准审查..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
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
            disabled={
              saving || !formProvider || !formModel || formTierLevel < 1
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
