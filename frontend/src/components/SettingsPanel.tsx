import { useCallback, useEffect, useState } from "react";
import { X, Settings, Cpu, KeyRound } from "lucide-react";
import { useAppStore } from "../stores/useAppStore";
import {
  fetchPiModels,
  fetchModelIdentities,
  fetchModelSettings,
  createModelIdentity,
  updateModelIdentity,
  updateModelSetting,
} from "../api/client";
import type { PiModel, ModelIdentity, ModelSetting } from "../api/client";
import { ModelsTab } from "./ModelsTab";
import { ModelSettingsModal } from "./ModelSettingsModal";
import { AlertCircle } from "lucide-react";

type Tab = "models" | "auth";

type Message = { type: "success" | "error"; text: string };

export function SettingsPanel() {
  const { showSettings, closeSettings } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>("models");

  // Models & identities
  const [piModels, setPiModels] = useState<PiModel[]>([]);
  const [identities, setIdentities] = useState<ModelIdentity[]>([]);
  const [modelSettings, setModelSettings] = useState<ModelSetting[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalProvider, setModalProvider] = useState("");
  const [modalModel, setModalModel] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [models, ids, settings] = await Promise.all([
        fetchPiModels(),
        fetchModelIdentities(),
        fetchModelSettings(),
      ]);
      setPiModels(models);
      setIdentities(ids);
      setModelSettings(settings);
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
        const [models, ids, settings] = await Promise.all([
          fetchPiModels(),
          fetchModelIdentities(),
          fetchModelSettings(),
        ]);
        if (cancelled) return;
        setPiModels(models);
        setIdentities(ids);
        setModelSettings(settings);
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

  const openModal = (provider: string, model: string) => {
    setModalProvider(provider);
    setModalModel(model);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  const handleToggleModel = async (
    provider: string,
    model: string,
    enabled: boolean,
  ) => {
    try {
      const updated = await updateModelSetting({ provider, model, enabled });
      setModelSettings((prev) => {
        const exists = prev.find(
          (s) => s.provider === provider && s.model === model,
        );
        if (exists) {
          return prev.map((s) =>
            s.provider === provider && s.model === model ? updated : s,
          );
        }
        return [...prev, updated];
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "更新失败",
      });
    }
  };

  const handleSaveIdentity = async (
    payload: Omit<ModelIdentity, "id" | "sortOrder" | "createdAt">,
  ) => {
    await createModelIdentity(payload);
    setMessage({ type: "success", text: "身份已创建" });
    await loadData();
  };

  const handleUpdateIdentity = async (
    id: number,
    payload: Omit<ModelIdentity, "id" | "sortOrder" | "createdAt">,
  ) => {
    await updateModelIdentity(id, payload);
    setMessage({ type: "success", text: "身份已更新" });
    await loadData();
  };

  const isModelEnabled = (provider: string, model: string) => {
    const setting = modelSettings.find(
      (s) => s.provider === provider && s.model === model,
    );
    return setting?.enabled ?? true;
  };

  const getIdentityForModel = (provider: string, model: string) => {
    return (
      identities.find((i) => i.provider === provider && i.model === model) ||
      null
    );
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
              identities={identities}
              modelSettings={modelSettings}
              loading={loading}
              onOpenSettings={openModal}
              onToggleModel={handleToggleModel}
            />
          )}

          {activeTab === "auth" && <AuthTab />}
        </div>
      </div>

      <ModelSettingsModal
        key={`${modalProvider}-${modalModel}`}
        show={showModal}
        provider={modalProvider}
        model={modalModel}
        modelEnabled={isModelEnabled(modalProvider, modalModel)}
        identity={getIdentityForModel(modalProvider, modalModel)}
        onClose={closeModal}
        onModelEnableChange={(enabled) =>
          handleToggleModel(modalProvider, modalModel, enabled)
        }
        onSave={handleSaveIdentity}
        onUpdate={handleUpdateIdentity}
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
