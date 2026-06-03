import { useEffect, useState } from "react";
import { X, Settings, Cpu, KeyRound, AlertCircle } from "lucide-react";
import { useAppStore } from "../stores/useAppStore";
import {
  fetchPiConfig,
  updatePiSettings,
  updatePiAuth,
  deletePiAuth,
} from "../api/client";
import type { PiConfigResponse } from "../api/client";

type Tab = "model" | "auth";

type Message = { type: "success" | "error"; text: string };

const THINKING_LEVELS = [
  { value: "off", label: "关闭" },
  { value: "minimal", label: "最小" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "xhigh", label: "极高" },
];

const API_KEY_PROVIDERS = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "google", label: "Google Gemini" },
  { value: "mistral", label: "Mistral" },
  { value: "groq", label: "Groq" },
  { value: "cerebras", label: "Cerebras" },
  { value: "xai", label: "xAI (Grok)" },
  { value: "fireworks", label: "Fireworks" },
  { value: "together", label: "Together AI" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "nvidia", label: "NVIDIA NIM" },
  { value: "kimi-coding", label: "Kimi For Coding" },
  { value: "minimax", label: "MiniMax" },
  { value: "huggingface", label: "Hugging Face" },
];

const OAUTH_PROVIDERS = [
  { value: "openai-codex", label: "OpenAI Codex (ChatGPT Plus/Pro)" },
  { value: "claude-pro", label: "Claude Pro/Max" },
  { value: "github-copilot", label: "GitHub Copilot" },
];

const ALL_PROVIDERS = [...API_KEY_PROVIDERS, ...OAUTH_PROVIDERS];

export function SettingsPanel() {
  const { showSettings, closeSettings } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>("model");
  const [config, setConfig] = useState<PiConfigResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  // Model settings form
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [thinkingLevel, setThinkingLevel] = useState("");

  // Auth form
  const [newProvider, setNewProvider] = useState("");
  const [newKey, setNewKey] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    if (!showSettings) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setMessage(null);
      try {
        const data = await fetchPiConfig();
        if (cancelled) return;
        setConfig(data);
        setProvider(data.settings.defaultProvider || "");
        setModel(data.settings.defaultModel || "");
        setThinkingLevel(data.settings.defaultThinkingLevel || "");
      } catch (err) {
        if (cancelled) return;
        setMessage({
          type: "error",
          text: err instanceof Error ? err.message : "加载配置失败",
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [showSettings, refreshCounter]);

  const handleSaveSettings = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await updatePiSettings({
        defaultProvider: provider || undefined,
        defaultModel: model || undefined,
        defaultThinkingLevel: thinkingLevel || undefined,
      });
      setMessage({ type: "success", text: "设置已保存" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "保存失败",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddAuth = async () => {
    if (!newProvider || !newKey) return;
    setSaving(true);
    setMessage(null);
    try {
      await updatePiAuth(newProvider, "api_key", newKey);
      setNewProvider("");
      setNewKey("");
      setShowAddForm(false);
      setRefreshCounter((c) => c + 1);
      setMessage({ type: "success", text: "Provider 认证已添加" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "添加失败",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAuth = async (providerName: string) => {
    if (!confirm(`确定要删除 ${providerName} 的认证配置吗？`)) return;
    setSaving(true);
    setMessage(null);
    try {
      await deletePiAuth(providerName);
      setRefreshCounter((c) => c + 1);
      setMessage({ type: "success", text: "认证已删除" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "删除失败",
      });
    } finally {
      setSaving(false);
    }
  };

  const getProviderLabel = (name: string) =>
    ALL_PROVIDERS.find((p) => p.value === name)?.label || name;

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
              onClick={() => setActiveTab("model")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "model"
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
          {loading && !config ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-slate-300 border-t-amber-400 rounded-full animate-spin" />
              <span className="ml-2 text-sm text-slate-400">加载中...</span>
            </div>
          ) : (
            <>
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

              {activeTab === "model" && (
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      默认 Provider
                    </label>
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white"
                    >
                      <option value="">-- 请选择 --</option>
                      {ALL_PROVIDERS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-400">
                      选择默认使用的 AI 提供商
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      默认 Model
                    </label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="例如：claude-sonnet-4-6"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      输入模型 ID，支持 provider/model 格式
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Thinking Level
                    </label>
                    <select
                      value={thinkingLevel}
                      onChange={(e) => setThinkingLevel(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white"
                    >
                      <option value="">-- 请选择 --</option>
                      {THINKING_LEVELS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-400">
                      设置模型思考深度，越高回答越详细但速度越慢
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={handleSaveSettings}
                      disabled={saving}
                      className="px-5 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-800 transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                      {saving ? "保存中..." : "保存设置"}
                    </button>
                  </div>
                </div>
              )}

              {activeTab === "auth" && (
                <div className="space-y-5">
                  {/* 已配置列表 */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">
                      已配置 Providers
                    </h3>
                    {config && Object.keys(config.auth).length === 0 ? (
                      <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 text-center">
                        <p className="text-sm text-slate-400">
                          暂无已配置的 Provider
                        </p>
                        <p className="text-xs text-slate-300 mt-1">
                          点击下方按钮添加
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {config &&
                          Object.entries(config.auth).map(([name, entry]) => (
                            <div
                              key={name}
                              className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl border border-slate-100"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-700">
                                  {getProviderLabel(name)}
                                </p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  {entry.type === "api_key"
                                    ? "API Key"
                                    : "OAuth"}
                                </p>
                              </div>
                              <button
                                onClick={() => handleDeleteAuth(name)}
                                disabled={saving}
                                className="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50 shrink-0 ml-3"
                              >
                                删除
                              </button>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* OAuth 提示 */}
                  <div className="flex items-start gap-2 bg-amber-50 rounded-lg p-3 border border-amber-100">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-amber-700 font-medium">
                        OAuth 认证提示
                      </p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        OpenAI Codex、Claude Pro、GitHub Copilot 等订阅型
                        Provider 需要在终端运行{" "}
                        <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">
                          pi /login
                        </code>{" "}
                        进行 OAuth 登录配置。
                      </p>
                    </div>
                  </div>

                  {/* 添加表单 */}
                  <div>
                    {!showAddForm ? (
                      <button
                        onClick={() => setShowAddForm(true)}
                        className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 border border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-amber-400 hover:text-amber-600 transition-colors"
                      >
                        <KeyRound className="w-4 h-4" />
                        添加 Provider
                      </button>
                    ) : (
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
                        <h4 className="text-sm font-medium text-slate-700">
                          添加 Provider
                        </h4>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Provider
                          </label>
                          <select
                            value={newProvider}
                            onChange={(e) => setNewProvider(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white"
                          >
                            <option value="">-- 请选择 --</option>
                            {API_KEY_PROVIDERS.map((p) => (
                              <option key={p.value} value={p.value}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            API Key
                          </label>
                          <input
                            type="password"
                            value={newKey}
                            onChange={(e) => setNewKey(e.target.value)}
                            placeholder="sk-..."
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                          />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => {
                              setShowAddForm(false);
                              setNewProvider("");
                              setNewKey("");
                            }}
                            className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                          >
                            取消
                          </button>
                          <button
                            onClick={handleAddAuth}
                            disabled={saving || !newProvider || !newKey}
                            className="px-4 py-1.5 bg-slate-900 text-white text-xs rounded-lg hover:bg-slate-800 transition-all active:scale-[0.98] disabled:opacity-50"
                          >
                            {saving ? "保存中..." : "保存"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
