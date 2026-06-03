import { useCallback, useEffect, useState } from "react";
import { X, Settings, Cpu, KeyRound } from "lucide-react";
import { useAppStore } from "../stores/useAppStore";
import {
  fetchPiModels,
  fetchModelIdentities,
  createModelIdentity,
  updateModelIdentity,
  deleteModelIdentity,
} from "../api/client";
import type { PiModel, ModelIdentity } from "../api/client";
import { ModelsTab } from "./ModelsTab";
import { IdentityModal } from "./IdentityModal";
import { AlertCircle } from "lucide-react";

type Tab = "models" | "auth";

type Message = { type: "success" | "error"; text: string };

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
              loading={loading}
              onAddIdentity={openAddModal}
              onEditIdentity={openEditModal}
              onDeleteIdentity={handleDeleteIdentity}
            />
          )}

          {activeTab === "auth" && <AuthTab />}
        </div>
      </div>

      <IdentityModal
        show={showModal}
        editingId={editingId}
        piModels={piModels}
        formName={formName}
        formProvider={formProvider}
        formModel={formModel}
        formThinking={formThinking}
        formEnabled={formEnabled}
        saving={saving}
        onNameChange={setFormName}
        onModelSelect={(p, m) => {
          setFormProvider(p);
          setFormModel(m);
        }}
        onThinkingChange={setFormThinking}
        onEnabledChange={setFormEnabled}
        onSave={handleSaveIdentity}
        onCancel={closeModal}
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
