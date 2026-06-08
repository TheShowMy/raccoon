import { X } from "lucide-react";
import { getJobTitle } from "./types";
import type { Job, JobStatus } from "./types";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  analyzing: { label: "分析中", className: "bg-sky-100 text-sky-700" },
  clarifying: { label: "待澄清", className: "bg-amber-100 text-amber-700" },
  draft_ready: { label: "待确认", className: "bg-indigo-100 text-indigo-700" },
  archived: { label: "已归档", className: "bg-slate-100 text-slate-500" },
  confirmed: { label: "已确认", className: "bg-emerald-100 text-emerald-700" },
  failed: { label: "失败", className: "bg-rose-100 text-rose-700" },
};

function StatusBadge({ status }: { status: JobStatus }) {
  const config = STATUS_CONFIG[status] || {
    label: status || "未知",
    className: "bg-slate-100 text-slate-600",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}

interface ChatHeaderProps {
  job: Job;
  round?: number;
  onClose?: () => void;
}

export function ChatHeader({ job, round, onClose }: ChatHeaderProps) {
  const canClose = job.status !== "archived";

  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="truncate text-base font-bold text-slate-900">
            {getJobTitle(job)}
          </h2>
          <StatusBadge status={job.status} />
          {job.status === "clarifying" && round !== undefined && round > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              第 {round} 轮澄清
            </span>
          )}
        </div>
      </div>
      {canClose && onClose && (
        <button
          onClick={onClose}
          title="删除此会话"
          className="shrink-0 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
        >
          <X className="h-3.5 w-3.5" />
          删除
        </button>
      )}
    </div>
  );
}
