import { useState } from "react";
import {
  GitBranch,
  ExternalLink,
  Trash2,
  FolderGit,
  ClipboardCheck,
  MessageSquare,
  Network,
} from "lucide-react";
import type { Project } from "../stores/useAppStore";
import { parseGitRepoUrl, parseGitHost } from "../utils/format";
import { JobWorkspace } from "./JobWorkspace";
import { HistoryView } from "./HistoryView";
import { ExecutionCenter } from "./ExecutionCenter";

interface ProjectDetailProps {
  project: Project;
  onDelete: (id: number) => void;
}

export function ProjectDetail({ project, onDelete }: ProjectDetailProps) {
  const [viewMode, setViewMode] = useState<
    "workspace" | "execution" | "history"
  >("workspace");
  const repoPath = parseGitRepoUrl(project.gitUrl);
  const host = parseGitHost(project.gitUrl);

  const handleDelete = () => {
    if (confirm(`确定要删除项目「${project.name}」吗？`)) {
      onDelete(project.id);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header - 紧凑 */}
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-50">
            <FolderGit className="h-3.5 w-3.5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-slate-900">
              {project.name}
            </h1>
            <a
              href={project.gitUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-slate-400 transition-colors hover:text-amber-600"
              title={project.gitUrl}
            >
              <GitBranch className="h-3 w-3" />
              <span className="font-mono">{repoPath}</span>
              <span className="text-[10px]">({host})</span>
            </a>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <a
            href={project.gitUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            title="打开仓库"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1 rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
            title="删除项目"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tab */}
      <div className="border-b border-slate-100 px-6">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode("workspace")}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition border-b-2 ${
              viewMode === "workspace"
                ? "border-amber-500 text-amber-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            任务工作台
          </button>
          <button
            onClick={() => setViewMode("execution")}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition border-b-2 ${
              viewMode === "execution"
                ? "border-violet-500 text-violet-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Network className="h-3.5 w-3.5" />
            执行中心
          </button>
          <button
            onClick={() => setViewMode("history")}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition border-b-2 ${
              viewMode === "history"
                ? "border-emerald-500 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            历史记录
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-4">
        <div className="mx-auto h-full max-w-6xl">
          {viewMode === "workspace" ? (
            <JobWorkspace projectId={project.id} />
          ) : viewMode === "execution" ? (
            <ExecutionCenter
              projectId={project.id}
              onBack={() => setViewMode("workspace")}
            />
          ) : (
            <HistoryView
              projectId={project.id}
              onBack={() => setViewMode("workspace")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
