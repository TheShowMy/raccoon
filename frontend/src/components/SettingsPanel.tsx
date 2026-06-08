import { useCallback, useEffect, useState } from "react";
import { X, Settings, Cpu, KeyRound, Keyboard } from "lucide-react";
import { useAppStore } from "../stores/useAppStore";
import {
  fetchPiModels,
  fetchSystemConfig,
  fetchWorkerTiers,
  fetchThinkingPolicies,
  createWorkerTier,
  updateWorkerTier,
  deleteWorkerTier,
  updateSystemConfig,
} from "../api/client";
import type {
  PiModel,
  SystemConfig,
  WorkerModelTier,
  TaskThinkingPolicy,
} from "../api/client";
import { ModelsTab } from "./ModelsTab";
import { WorkerTierModal } from "./WorkerTierModal";
import { AlertCircle } from "lucide-react";

type Tab = "models" | "auth" | "preferences";

type Message = { type: "success" | "error"; text: string };

export function SettingsPanel() {
  const { showSettings, closeSettings, sendWithEnter, setSendWithEnter } =
    useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>("models");

  // Data
  const [piModels, setPiModels] = useState<PiModel[]>([]);
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [workerTiers, setWorkerTiers] = useState<WorkerModelTier[]>([]);
  const [thinkingPolicies, setThinkingPolicies] = useState<
    TaskThinkingPolicy[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingTier, setEditingTier] = useState<WorkerModelTier | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [models, config, tiers, policies] = await Promise.all([
        fetchPiModels(),
        fetchSystemConfig(),
        fetchWorkerTiers(),
        fetchThinkingPolicies(),
      ]);
      setPiModels(models);
      setSystemConfig(config);
      setWorkerTiers(tiers);
      setThinkingPolicies(policies);
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
        const [models, config, tiers, policies] = await Promise.all([
          fetchPiModels(),
          fetchSystemConfig(),
          fetchWorkerTiers(),
          fetchThinkingPolicies(),
        ]);
        if (cancelled) return;
        setPiModels(models);
        setSystemConfig(config);
        setWorkerTiers(tiers);
        setThinkingPolicies(policies);
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

  // ESC to close settings panel (only when modal is not open)
  useEffect(() => {
    if (!showSettings) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showModal) {
        closeSettings();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSettings, showModal, closeSettings]);

  const openCreateModal = () => {
    setEditingTier(null);
    setShowModal(true);
  };

  const openEditModal = (tier: WorkerModelTier) => {
    setEditingTier(tier);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTier(null);
  };

  const handleUpdateCoordinator = async (provider: string, model: string) => {
    try {
      await updateSystemConfig({
        coordinatorProvider: provider,
        coordinatorModel: model,
      });
      setMessage({ type: "success", text: "主模型配置已更新" });
      const config = await fetchSystemConfig();
      setSystemConfig(config);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "更新失败",
      });
    }
  };

  const handleSaveTier = async (
    payload: Omit<WorkerModelTier, "id" | "createdAt">,
  ) => {
    await createWorkerTier(payload);
    setMessage({ type: "success", text: "模型等级已创建" });
    await loadData();
  };

  const handleUpdateTier = async (
    id: number,
    payload: Omit<WorkerModelTier, "id" | "createdAt">,
  ) => {
    await updateWorkerTier(id, payload);
    setMessage({ type: "success", text: "模型等级已更新" });
    await loadData();
  };

  const handleDeleteTier = async (id: number) => {
    try {
      await deleteWorkerTier(id);
      setMessage({ type: "success", text: "模型等级已删除" });
      await loadData();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "删除失败",
      });
    }
  };

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
            <button
              onClick={() => setActiveTab("preferences")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "preferences"
                  ? "border-amber-400 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Keyboard className="w-4 h-4" />
              偏好设置
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
            <ModelsTab
              piModels={piModels}
              systemConfig={systemConfig}
              workerTiers={workerTiers}
              thinkingPolicies={thinkingPolicies}
              loading={loading}
              onUpdateCoordinator={handleUpdateCoordinator}
              onOpenCreateModal={openCreateModal}
              onOpenEditModal={openEditModal}
              onDeleteTier={handleDeleteTier}
            />
          )}

          {activeTab === "auth" && <AuthTab />}

          {activeTab === "preferences" && (
            <PreferencesTab
              sendWithEnter={sendWithEnter}
              onToggle={setSendWithEnter}
            />
          )}
        </div>
      </div>

      <WorkerTierModal
        key={editingTier?.id ?? "new"}
        show={showModal}
        editingTier={editingTier}
        piModels={piModels}
        onClose={closeModal}
        onSave={handleSaveTier}
        onUpdate={handleUpdateTier}
      />
    </div>
  );
}

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

interface PreferencesTabProps {
  sendWithEnter: boolean;
  onToggle: (v: boolean) => void;
}

function PreferencesTab({ sendWithEnter, onToggle }: PreferencesTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 bg-amber-50 rounded-lg p-3 border border-amber-100">
        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-amber-700 font-medium">快捷键行为</p>
          <p className="text-xs text-amber-600 mt-0.5">
            自定义消息发送快捷键。默认 Shift+Enter 发送，Enter 换行。
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white cursor-pointer hover:border-slate-300 transition-colors">
          <div>
            <p className="text-sm font-medium text-slate-900">Enter 发送消息</p>
            <p className="text-xs text-slate-500 mt-0.5">
              开启后按 Enter 直接发送，Shift+Enter 换行
            </p>
          </div>
          <div
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              sendWithEnter ? "bg-amber-400" : "bg-slate-200"
            }`}
            onClick={() => onToggle(!sendWithEnter)}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                sendWithEnter ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </div>
        </label>

        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
          <p className="text-xs font-medium text-slate-700 mb-2">当前设置</p>
          <div className="space-y-1.5 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono">
                Enter
              </kbd>
              <span>→ {sendWithEnter ? "发送消息" : "换行"}</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono">
                Shift
              </kbd>
              <span>+</span>
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono">
                Enter
              </kbd>
              <span>→ {sendWithEnter ? "换行" : "发送消息"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
