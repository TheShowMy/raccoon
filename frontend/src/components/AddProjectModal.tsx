import { useState } from "react";
import { X, Plus } from "lucide-react";
import { createProject } from "../api/client";
import { useAppStore } from "../stores/useAppStore";

export function AddProjectModal() {
  const { showAddModal, closeAddModal, addProject } = useAppStore();
  const [name, setName] = useState("");
  const [gitUrl, setGitUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!showAddModal) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim() || !gitUrl.trim()) {
      setError("请填写项目名称和 Git 链接");
      return;
    }

    setLoading(true);
    try {
      const project = await createProject(name.trim(), gitUrl.trim());
      addProject(project);
      setName("");
      setGitUrl("");
      closeAddModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建项目失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">添加项目</h2>
          <button
            onClick={closeAddModal}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              项目名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：my-awesome-project"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Git 仓库链接
            </label>
            <input
              type="text"
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeAddModal}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {loading ? "保存中..." : "添加项目"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
