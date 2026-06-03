import {
  Cpu,
  Brain,
  ImageIcon,
  Plus,
  Check,
  AlertCircle,
  Pencil,
  Trash2,
} from "lucide-react";
import type { PiModel, ModelIdentity } from "../api/client";
import { THINKING_LABELS } from "./IdentityModal";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

interface ModelsTabProps {
  piModels: PiModel[];
  identities: ModelIdentity[];
  loading: boolean;
  onAddIdentity: (provider?: string, model?: string) => void;
  onEditIdentity: (identity: ModelIdentity) => void;
  onDeleteIdentity: (id: number) => void;
}

export function ModelsTab({
  piModels,
  identities,
  loading,
  onAddIdentity,
  onEditIdentity,
  onDeleteIdentity,
}: ModelsTabProps) {
  const getIdentitiesForModel = (provider: string, model: string) =>
    identities.filter((i) => i.provider === provider && i.model === model);

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
        <button
          onClick={() => onAddIdentity()}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
        >
          <Plus className="w-4 h-4" />
          手动添加模型身份
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {piModels.map((m) => {
        const modelIdentities = getIdentitiesForModel(m.provider, m.id);
        const enabledCount = modelIdentities.filter((i) => i.enabled).length;

        return (
          <div
            key={`${m.provider}-${m.id}`}
            className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden"
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
            </div>

            {/* Identities */}
            {modelIdentities.length > 0 && (
              <div className="px-4 pb-3 flex flex-wrap gap-2">
                {modelIdentities.map((identity) => (
                  <div
                    key={identity.id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border ${
                      identity.enabled
                        ? "bg-white border-slate-200 text-slate-700"
                        : "bg-slate-100 border-slate-100 text-slate-400"
                    }`}
                  >
                    {identity.enabled ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-slate-300" />
                    )}
                    <span className="font-medium">{identity.name}</span>
                    <span className="text-xs text-slate-400">
                      {THINKING_LABELS[identity.thinkingLevel] ||
                        identity.thinkingLevel}
                    </span>
                    <button
                      onClick={() => onEditIdentity(identity)}
                      className="p-0.5 text-slate-300 hover:text-slate-500 transition-colors"
                      title="编辑"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onDeleteIdentity(identity.id)}
                      className="p-0.5 text-slate-300 hover:text-rose-500 transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add button */}
            <div className="px-4 pb-3">
              <button
                onClick={() => onAddIdentity(m.provider, m.id)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-600 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                添加身份
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
