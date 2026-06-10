import { CircleDashed } from "lucide-react";
import { formatRelativeTime } from "../../utils/format";
import type { Job, JobStatus, StatusConfig } from "./types";
import { getJobTitle } from "./types";

const STATUS_CONFIG: Record<string, StatusConfig> = {
  analyzing: {
    label: "分析中",
    className: "bg-sky-100 text-sky-700",
    icon: <div className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />,
  },
  clarifying: {
    label: "待澄清",
    className: "bg-amber-100 text-amber-700",
    icon: <div className="h-2 w-2 rounded-full bg-amber-500" />,
  },
  draft_ready: {
    label: "待确认",
    className: "bg-indigo-100 text-indigo-700",
    icon: <div className="h-2 w-2 rounded-full bg-indigo-500" />,
  },
  dag_planning: {
    label: "规划 DAG",
    className: "bg-violet-100 text-violet-700",
    icon: <div className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />,
  },
  dag_planning_failed: {
    label: "规划失败",
    className: "bg-rose-100 text-rose-700",
    icon: <div className="h-2 w-2 rounded-full bg-rose-500" />,
  },
  dag_ready: {
    label: "待执行",
    className: "bg-cyan-100 text-cyan-700",
    icon: <div className="h-2 w-2 rounded-full bg-cyan-500" />,
  },
  executing: {
    label: "执行中",
    className: "bg-blue-100 text-blue-700",
    icon: <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />,
  },
  completed: {
    label: "已完成",
    className: "bg-emerald-100 text-emerald-700",
    icon: <div className="h-2 w-2 rounded-full bg-emerald-500" />,
  },
  blocked: {
    label: "阻塞",
    className: "bg-orange-100 text-orange-700",
    icon: <div className="h-2 w-2 rounded-full bg-orange-500" />,
  },
  archived: {
    label: "已归档",
    className: "bg-slate-100 text-slate-500",
    icon: <div className="h-2 w-2 rounded-full bg-slate-400" />,
  },
  confirmed: {
    label: "已确认",
    className: "bg-emerald-100 text-emerald-700",
    icon: <div className="h-2 w-2 rounded-full bg-emerald-500" />,
  },
  failed: {
    label: "失败",
    className: "bg-rose-100 text-rose-700",
    icon: <div className="h-2 w-2 rounded-full bg-rose-500" />,
  },
};

function StatusBadge({ status }: { status: JobStatus }) {
  const config = STATUS_CONFIG[status] || {
    label: status || "未知",
    className: "bg-slate-100 text-slate-600",
    icon: <CircleDashed className="h-3 w-3" />,
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${config.className}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

interface SidebarItemProps {
  job: Job;
  active: boolean;
  onClick: () => void;
}

export function SidebarItem({ job, active, onClick }: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border border-l-2 p-2.5 text-left transition ${
        active
          ? "border-amber-100 border-l-amber-500 bg-white shadow-sm"
          : "border-transparent border-l-slate-200 bg-white/70 hover:border-slate-200 hover:border-l-slate-300 hover:bg-white"
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
          {getJobTitle(job)}
        </h3>
        <StatusBadge status={job.status} />
      </div>
      <p className="line-clamp-2 text-xs leading-5 text-slate-500">
        {job.originalRequirement}
      </p>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-[11px] text-slate-400">
          更新于 {formatRelativeTime(job.updatedAt)}
        </p>
        {job.clarificationRound > 0 && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
            第 {job.clarificationRound} 轮
          </span>
        )}
      </div>
    </button>
  );
}
