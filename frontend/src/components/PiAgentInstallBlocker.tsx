import { useState } from "react";
import { RefreshCw, Terminal, AlertCircle } from "lucide-react";

interface PiAgentInstallBlockerProps {
  onRefresh: () => Promise<void>;
}

export function PiAgentInstallBlocker({
  onRefresh,
}: PiAgentInstallBlockerProps) {
  const [checking, setChecking] = useState(false);

  const handleRefresh = async () => {
    setChecking(true);
    try {
      await onRefresh();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen w-screen bg-gray-50 px-6">
      <div className="max-w-lg w-full bg-white rounded-xl shadow-lg p-8 border border-gray-100">
        <div className="flex items-center gap-3 mb-6">
          <AlertCircle className="w-8 h-8 text-amber-500" />
          <h1 className="text-2xl font-bold text-gray-900">Pi Agent 未安装</h1>
        </div>

        <p className="text-gray-600 mb-6 leading-relaxed">
          使用 raccoon 需要本地安装 Pi Agent。请根据您的系统选择以下安装方式：
        </p>

        <div className="space-y-4 mb-8">
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
              <Terminal className="w-4 h-4" />
              <span>macOS / Linux</span>
            </div>
            <code className="text-green-400 font-mono text-sm block">
              curl -fsSL https://pi.ai/install | sh
            </code>
          </div>

          <div className="bg-gray-900 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
              <Terminal className="w-4 h-4" />
              <span>Windows (PowerShell)</span>
            </div>
            <code className="text-green-400 font-mono text-sm block">
              irm https://pi.ai/install | iex
            </code>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            安装完成后，点击下方按钮刷新检测状态
          </p>
          <button
            onClick={handleRefresh}
            disabled={checking}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw
              className={`w-4 h-4 ${checking ? "animate-spin" : ""}`}
            />
            {checking ? "检测中..." : "刷新检测"}
          </button>
        </div>
      </div>
    </div>
  );
}
