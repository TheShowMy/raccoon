import {
  GitBranch,
  Clock,
  ExternalLink,
  Trash2,
  FolderGit,
} from "lucide-react";
import type { Project } from "../stores/useAppStore";
import {
  parseGitRepoUrl,
  parseGitHost,
  formatRelativeTime,
} from "../utils/format";

interface ProjectDetailProps {
  project: Project;
  onDelete: (id: number) => void;
}

export function ProjectDetail({ project, onDelete }: ProjectDetailProps) {
  const repoPath = parseGitRepoUrl(project.git_url);
  const host = parseGitHost(project.git_url);
  const createdAt = formatRelativeTime(project.created_at);

  const handleDelete = () => {
    if (confirm(`确定要删除项目「${project.name}」吗？`)) {
      onDelete(project.id);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-8 py-6 border-b border-slate-100">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <FolderGit className="w-4 h-4 text-amber-600" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 truncate">
                {project.name}
              </h1>
            </div>

            <div className="flex items-center gap-4 text-sm text-slate-500">
              <a
                href={project.git_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-amber-600 transition-colors group"
                title={project.git_url}
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span className="font-mono">{repoPath}</span>
                <span className="text-xs text-slate-400">({host})</span>
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-2">
              <Clock className="w-3 h-3" />
              <span>创建于 {createdAt}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-4 shrink-0">
            <a
              href={project.git_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              打开仓库
            </a>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-rose-600 bg-rose-50 rounded-lg hover:bg-rose-100 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              删除
            </button>
          </div>
        </div>
      </div>

      {/* Content placeholder */}
      <div className="flex-1 p-8">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-amber-400 rounded-full" />
            <h2 className="text-sm font-semibold text-slate-700">项目概览</h2>
          </div>

          <div className="bg-slate-50 rounded-xl p-6 border border-slate-100">
            <p className="text-sm text-slate-400 text-center py-8">
              项目任务管理功能即将推出...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
