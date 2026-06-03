import { Cpu, Brain, ImageIcon, Cog } from "lucide-react";
import type { PiModel, ModelIdentity, ModelSetting } from "../api/client";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

interface ModelsTabProps {
  piModels: PiModel[];
  identities: ModelIdentity[];
  modelSettings: ModelSetting[];
  loading: boolean;
  onOpenSettings: (provider: string, model: string) => void;
  onToggleModel: (provider: string, model: string, enabled: boolean) => void;
}

export function ModelsTab({
  piModels,
  identities,
  modelSettings,
  loading,
  onOpenSettings,
  onToggleModel,
}: ModelsTabProps) {
  const isModelEnabled = (provider: string, model: string) => {
    const setting = modelSettings.find(
      (s) => s.provider === provider && s.model === model,
    );
    return setting?.enabled ?? true;
  };

  const getIdentitiesForModel = (provider: string, model: string) =>
    identities.filter((i) => i.provider === provider && i.model === model);

  // Sort: enabled models first, then disabled
  const sortedModels = [...piModels].sort((a, b) => {
    const aEnabled = isModelEnabled(a.provider, a.id);
    const bEnabled = isModelEnabled(b.provider, b.id);
    if (aEnabled === bEnabled) return 0;
    return aEnabled ? -1 : 1;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-amber-400 rounded-full animate-spin" />
        <span className="ml-2 text-sm text-slate-400">加载中...</span>
      </div>
    );
  }

  if (piModels.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-sm text-slate-400">暂无可用模型</p>
        <p className="text-xs text-slate-300">
          配置 Provider 认证后，pi 会自动列出可用模型
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sortedModels.map((m) => {
        const modelIdentities = getIdentitiesForModel(m.provider, m.id);
        const enabledCount = modelIdentities.filter((i) => i.enabled).length;
        const modelEnabled = isModelEnabled(m.provider, m.id);

        return (
          <div
            key={`${m.provider}-${m.id}`}
            className={`bg-slate-50 rounded-xl border overflow-hidden transition-opacity ${
              modelEnabled
                ? "border-slate-100 opacity-100"
                : "border-slate-200 opacity-60"
            }`}
          >
            {/* Model header */}
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                  <Cpu className="w-4 h-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{m.id}</p>
                  <p className="text-xs text-slate-400">
                    {m.provider} · 上下文 {formatTokens(m.contextWindow)} · 输出{" "}
                    {formatTokens(m.maxTokens)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  {m.reasoning && (
                    <span className="flex items-center gap-1">
                      <Brain className="w-3 h-3" />
                      思考
                    </span>
                  )}
                  {m.input.includes("image") && (
                    <span className="flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" />
                      图片
                    </span>
                  )}
                  <span className="text-slate-300">|</span>
                  <span>
                    身份 {modelIdentities.length} · 启用 {enabledCount}
                  </span>
                </div>
                {/* Enable toggle */}
                <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={modelEnabled}
                    onChange={(e) =>
                      onToggleModel(m.provider, m.id, e.target.checked)
                    }
                    className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                  />
                  <span
                    className={
                      modelEnabled ? "text-slate-600" : "text-slate-400"
                    }
                  >
                    启用
                  </span>
                </label>
                {/* Settings button */}
                <button
                  onClick={() => onOpenSettings(m.provider, m.id)}
                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                  title="设置"
                >
                  <Cog className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
