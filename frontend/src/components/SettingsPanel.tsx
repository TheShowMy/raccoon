import { useCallback, useEffect, useState } from "react";
import {
  X,
  Settings,
  Cpu,
  KeyRound,
  Brain,
  ImageIcon,
  Plus,
  Trash2,
  Pencil,
  Check,
  AlertCircle,
} from "lucide-react";
import { useAppStore } from "../stores/useAppStore";
import {
  fetchPiModels,
  fetchModelIdentities,
  createModelIdentity,
  updateModelIdentity,
  deleteModelIdentity,
} from "../api/client";
import type { PiModel, ModelIdentity } from "../api/client";

type Tab = "models" | "auth";

type Message = { type: "success" | "error"; text: string };

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

export function SettingsPanel() {
  const { showSettings, closeSettings } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>("models");

  // Models & identities
  const [piModels, setPiModels] = useState<PiModel[]>([]);
  const [identities, setIdentities] = useState<ModelIdentity[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  // Identity modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formProvider, setFormProvider] = useState("");
  const [formModel, setFormModel] = useState("");
  const [formThinking, setFormThinking] = useState("medium");
  const [formEnabled, setFormEnabled] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [models, ids] = await Promise.all([
        fetchPiModels(),
        fetchModelIdentities(),
      ]);
      setPiModels(models);
      setIdentities(ids);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "加载失败",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showSettings) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setMessage(null);
      try {
        const [models, ids] = await Promise.all([
          fetchPiModels(),
          fetchModelIdentities(),
        ]);
        if (cancelled) return;
        setPiModels(models);
        setIdentities(ids);
      } catch (err) {
        if (cancelled) return;
        setMessage({
          type: "error",
          text: err instanceof Error ? err.message : "加载失败",
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showSettings]);

  const openAddModal = (provider?: string, model?: string) => {
    setEditingId(null);
    setFormName("");
    setFormProvider(provider || "");
    setFormModel(model || "");
    setFormThinking("medium");
    setFormEnabled(true);
    setShowModal(true);
  };

  const openEditModal = (identity: ModelIdentity) => {
    setEditingId(identity.id);
    setFormName(identity.name);
    setFormProvider(identity.provider);
    setFormModel(identity.model);
    setFormThinking(identity.thinkingLevel);
    setFormEnabled(identity.enabled);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
  };

  const handleSaveIdentity = async () => {
    if (!formName.trim() || !formProvider.trim() || !formModel.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        name: formName.trim(),
        provider: formProvider.trim(),
        model: formModel.trim(),
        thinkingLevel: formThinking,
        enabled: formEnabled,
      };
      if (editingId !== null) {
        await updateModelIdentity(editingId, payload);
        setMessage({ type: "success", text: "身份已更新" });
      } else {
        await createModelIdentity(payload);
        setMessage({ type: "success", text: "身份已创建" });
      }
      closeModal();
      await loadData();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "保存失败",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteIdentity = async (id: number) => {
    if (!confirm("确定要删除这个身份吗？")) return;
    setSaving(true);
    setMessage(null);
    try {
      await deleteModelIdentity(id);
      await loadData();
      setMessage({ type: "success", text: "身份已删除" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "删除失败",
      });
    } finally {
      setSaving(false);
    }
  };

  const getIdentitiesForModel = (provider: string, model: string) =>
    identities.filter((i) => i.provider === provider && i.model === model);

  if (!showSettings) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
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

        {/* Tabs */}
        <div className="px-6 border-b border-slate-100 shrink-0">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab("models")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "models"
                  ? "border-amber-400 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Cpu className="w-4 h-4" />
              模型设置
            </button>
            <button
              onClick={() => setActiveTab("auth")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "auth"
                  ? "border-amber-400 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <KeyRound className="w-4 h-4" />
              Provider 认证
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {message && (
            <div
              className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${
                message.type === "success"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-rose-50 text-rose-700"
              }`}
            >
              {message.text}
            </div>
          )}

          {activeTab === "models" && (
            <div className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-5 h-5 border-2 border-slate-300 border-t-amber-400 rounded-full animate-spin" />
                  <span className="ml-2 text-sm text-slate-400">加载中...</span>
                </div>
              ) : piModels.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <p className="text-sm text-slate-400">暂无可用模型</p>
                  <p className="text-xs text-slate-300">
                    配置 Provider 认证后，pi 会自动列出可用模型
                  </p>
                  <button
                    onClick={() => openAddModal()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    手动添加模型身份
                  </button>
                </div>
              ) : (
                piModels.map((m) => {
                  const modelIdentities = getIdentitiesForModel(
                    m.provider,
                    m.id,
                  );
                  const enabledCount = modelIdentities.filter(
                    (i) => i.enabled,
                  ).length;

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
                            <p className="text-sm font-semibold text-slate-800">
                              {m.id}
                            </p>
                            <p className="text-xs text-slate-400">
                              {m.provider} · 上下文{" "}
                              {formatTokens(m.contextWindow)} · 输出{" "}
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
                              <span className="font-medium">
                                {identity.name}
                              </span>
                              <span className="text-xs text-slate-400">
                                {THINKING_LABELS[identity.thinkingLevel] ||
                                  identity.thinkingLevel}
                              </span>
                              <button
                                onClick={() => openEditModal(identity)}
                                className="p-0.5 text-slate-300 hover:text-slate-500 transition-colors"
                                title="编辑"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() =>
                                  handleDeleteIdentity(identity.id)
                                }
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
                          onClick={() => openAddModal(m.provider, m.id)}
                          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-amber-600 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          添加身份
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === "auth" && <AuthTab />}
        </div>
      </div>

      {/* Identity Modal */}
      {showModal && (
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
                    value={`${formProvider}|${formModel}`}
                    onChange={(e) => {
                      const [p, m] = e.target.value.split("|");
                      setFormProvider(p);
                      setFormModel(m);
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
                      onChange={(e) => setFormProvider(e.target.value)}
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
                      onChange={(e) => setFormModel(e.target.value)}
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
                  onChange={(e) => setFormName(e.target.value)}
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

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                />
                <label htmlFor="enabled" className="text-sm text-slate-700">
                  启用
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveIdentity}
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
      )}
    </div>
  );
}

// ===== Provider Auth Tab (simplified) =====

function AuthTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 bg-amber-50 rounded-lg p-3 border border-amber-100">
        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-amber-700 font-medium">Provider 认证</p>
          <p className="text-xs text-amber-600 mt-0.5">
            Provider 认证请在终端运行{" "}
            <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">
              pi /login
            </code>{" "}
            或{" "}
            <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">
              pi config
            </code>{" "}
            进行配置。配置完成后刷新页面即可看到可用模型。
          </p>
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 text-center">
        <p className="text-sm text-slate-400">
          Provider 认证管理功能即将推出...
        </p>
      </div>
    </div>
  );
}
