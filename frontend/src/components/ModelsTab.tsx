import { useMemo } from "react";
import {
  Globe,
  Eye,
  Code,
  ShieldCheck,
  Plus,
  Trash2,
  Edit2,
  Crown,
} from "lucide-react";
import type {
  PiModel,
  SystemConfig,
  WorkerModelTier,
  TaskThinkingPolicy,
} from "../api/client";

const WORKER_IDENTITY_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; description: string }
> = {
  coder: {
    label: "编码专家",
    icon: <Code className="w-4 h-4" />,
    description: "代码实现、功能开发",
  },
  reviewer: {
    label: "审查员",
    icon: <ShieldCheck className="w-4 h-4" />,
    description: "代码审查、质量把控",
  },
  browser: {
    label: "浏览器操作",
    icon: <Globe className="w-4 h-4" />,
    description: "页面操作、自动化测试",
  },
  vision: {
    label: "视觉分析",
    icon: <Eye className="w-4 h-4" />,
    description: "图像识别、UI 分析",
  },
};

const TASK_TYPE_LABELS: Record<string, string> = {
  requirement_analysis: "需求分析",
  architecture_design: "架构设计",
  coding: "编码",
  review: "审查",
  batch_execution: "批量执行",
  browser_operation: "浏览器操作",
  vision_analysis: "视觉分析",
};

const THINKING_LABELS: Record<string, string> = {
  off: "关闭",
  minimal: "最小",
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "极高",
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

interface ModelsTabProps {
  piModels: PiModel[];
  systemConfig: SystemConfig | null;
  workerTiers: WorkerModelTier[];
  thinkingPolicies: TaskThinkingPolicy[];
  loading: boolean;
  onUpdateCoordinator: (provider: string, model: string) => void;
  onOpenCreateModal: () => void;
  onOpenEditModal: (tier: WorkerModelTier) => void;
  onDeleteTier: (id: number) => void;
}

export function ModelsTab({
  piModels,
  systemConfig,
  workerTiers,
  thinkingPolicies,
  loading,
  onUpdateCoordinator,
  onOpenCreateModal,
  onOpenEditModal,
  onDeleteTier,
}: ModelsTabProps) {
  // Group tiers by identity
  const tiersByIdentity = useMemo(() => {
    const grouped: Record<string, WorkerModelTier[]> = {};
    for (const tier of workerTiers) {
      if (!grouped[tier.identity]) {
        grouped[tier.identity] = [];
      }
      grouped[tier.identity].push(tier);
    }
    // Sort each group by tier_level
    for (const identity of Object.keys(grouped)) {
      grouped[identity].sort((a, b) => a.tierLevel - b.tierLevel);
    }
    return grouped;
  }, [workerTiers]);

  // Find model details from piModels
  const getModelInfo = (provider: string, model: string) => {
    return piModels.find((m) => m.provider === provider && m.id === model);
  };

  const handleCoordinatorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (!value) return;
    const [provider, model] = value.split("::");
    if (provider && model) {
      onUpdateCoordinator(provider, model);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-amber-400 rounded-full animate-spin" />
        <span className="ml-2 text-sm text-slate-400">加载中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Coordinator Config */}
      <div className="bg-amber-50 rounded-xl border border-amber-100 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Crown className="w-4 h-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-amber-900">
            系统主模型（Coordinator）
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={
              systemConfig?.coordinatorProvider &&
              systemConfig?.coordinatorModel
                ? `${systemConfig.coordinatorProvider}::${systemConfig.coordinatorModel}`
                : ""
            }
            onChange={handleCoordinatorChange}
            className="flex-1 px-3 py-2 border border-amber-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">选择主模型...</option>
            {piModels.map((m) => (
              <option
                key={`${m.provider}-${m.id}`}
                value={`${m.provider}::${m.id}`}
              >
                {m.provider} / {m.name} ({m.id})
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-amber-600 mt-2">
          主模型负责与用户沟通、需求确认、任务拆解和 Worker 调度
        </p>
      </div>

      {/* Thinking Policies */}
      {thinkingPolicies.length > 0 && (
        <div className="bg-slate-50 rounded-xl border border-slate-100 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            任务思考强度
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {thinkingPolicies.map((policy) => (
              <div
                key={policy.taskType}
                className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-slate-100"
              >
                <span className="text-xs text-slate-600">
                  {TASK_TYPE_LABELS[policy.taskType] || policy.taskType}
                </span>
                <span className="text-xs font-medium text-slate-800">
                  {THINKING_LABELS[policy.defaultLevel] || policy.defaultLevel}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Worker Identities */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">
            Worker 身份配置
          </h3>
          <button
            onClick={onOpenCreateModal}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white text-xs rounded-lg hover:bg-slate-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            添加模型等级
          </button>
        </div>

        {Object.entries(WORKER_IDENTITY_CONFIG).map(([identityKey, config]) => {
          const tiers = tiersByIdentity[identityKey] || [];

          return (
            <div
              key={identityKey}
              className="bg-white rounded-xl border border-slate-100 overflow-hidden"
            >
              {/* Identity header */}
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-500">
                  {config.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {config.label}
                  </p>
                  <p className="text-xs text-slate-400">{config.description}</p>
                </div>
              </div>

              {/* Tier list */}
              {tiers.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs text-slate-400">暂无模型配置</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {tiers.map((tier) => {
                    const modelInfo = getModelInfo(tier.provider, tier.model);

                    return (
                      <div
                        key={tier.id}
                        className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xs font-bold">
                            {tier.tierLevel}
                          </div>
                          <div>
                            <p className="text-sm text-slate-700">
                              {tier.provider} / {tier.model}
                              {modelInfo && (
                                <span className="text-xs text-slate-400 ml-1">
                                  · 上下文{" "}
                                  {formatTokens(modelInfo.contextWindow)}
                                </span>
                              )}
                            </p>
                            {tier.description && (
                              <p className="text-xs text-slate-400">
                                {tier.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onOpenEditModal(tier)}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="编辑"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteTier(tier.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
