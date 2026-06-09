import { Trash2, GitBranch, FolderGit } from "lucide-react";
import { deleteProject } from "../api/client";
import { useAppStore } from "../stores/useAppStore";
import { parseGitRepoUrl, formatRelativeTime } from "../utils/format";

interface ProjectListProps {
  collapsed?: boolean;
}

export function ProjectList({ collapsed = false }: ProjectListProps) {
  const { projects, currentProjectId, setCurrentProject, removeProject } =
    useAppStore();

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("确定要删除这个项目吗？")) return;
    try {
      await deleteProject(id);
      removeProject(id);
    } catch {
      alert("删除失败");
    }
  };

  if (projects.length === 0) {
    return (
      <div className={`py-8 text-center ${collapsed ? "px-2" : "px-5"}`}>
        {collapsed ? (
          <FolderGit className="mx-auto h-5 w-5 text-slate-300" />
        ) : (
          <>
            <p className="text-sm text-slate-400">暂无项目</p>
            <p className="text-xs text-slate-300 mt-1">点击上方按钮添加</p>
          </>
        )}
      </div>
    );
  }

  if (collapsed) {
    return (
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {projects.map((project) => {
          const isActive = currentProjectId === project.id;
          const isProblem = project.cloneStatus === "failed";
          const isBusy =
            project.cloneStatus === "pending" ||
            project.cloneStatus === "cloning";
          return (
            <button
              key={project.id}
              onClick={() => setCurrentProject(project.id)}
              className={`relative mb-1.5 flex h-10 w-full items-center justify-center rounded-lg border transition ${
                isActive
                  ? "border-amber-200 bg-white text-slate-900 shadow-sm"
                  : "border-transparent text-slate-500 hover:bg-white/70"
              }`}
              title={project.name}
            >
              <FolderGit className="h-4 w-4" />
              {(isBusy || isProblem) && (
                <span
                  className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${
                    isProblem ? "bg-rose-500" : "bg-amber-400"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-2 px-2">
      {projects.map((project) => {
        const isActive = currentProjectId === project.id;
        const repoPath = parseGitRepoUrl(project.gitUrl);
        const createdAt = formatRelativeTime(project.createdAt);

        return (
          <div
            key={project.id}
            role="button"
            tabIndex={0}
            onClick={() => setCurrentProject(project.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setCurrentProject(project.id);
              }
            }}
            className={`w-full text-left rounded-xl mb-1.5 group flex items-start gap-2 px-3 py-2.5 transition-all ${
              isActive
                ? "bg-white shadow-sm border-l-2 border-l-amber-400 border-y border-r border-slate-200"
                : "hover:bg-white/60 border border-transparent"
            }`}
          >
            <div className="min-w-0 flex-1">
              {/* Row 1: name + time */}
              <div className="flex items-center justify-between gap-2">
                <p
                  className={`text-sm font-medium truncate ${
                    isActive ? "text-slate-900" : "text-slate-700"
                  }`}
                  title={project.name}
                >
                  {project.name}
                </p>
                <div className="flex items-center gap-1.5 shrink-0">
                  {project.cloneStatus && project.cloneStatus !== "ready" && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        project.cloneStatus === "failed"
                          ? "bg-rose-100 text-rose-600"
                          : "bg-amber-100 text-amber-600"
                      }`}
                      title={project.cloneError ?? undefined}
                    >
                      {project.cloneStatus === "pending" && "克隆中"}
                      {project.cloneStatus === "cloning" && "克隆中"}
                      {project.cloneStatus === "failed" && "克隆失败"}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400">
                    {createdAt}
                  </span>
                </div>
              </div>

              {/* Row 2: repo path (full width) */}
              <div className="flex items-center gap-1 mt-1">
                <GitBranch className="w-3 h-3 text-slate-400 shrink-0" />
                <p
                  className={`text-[11px] truncate font-mono ${
                    isActive ? "text-slate-500" : "text-slate-400"
                  }`}
                  title={project.gitUrl}
                >
                  {repoPath}
                </p>
              </div>
            </div>

            <button
              onClick={(e) => handleDelete(project.id, e)}
              className={`shrink-0 p-1 rounded-lg transition-all mt-0.5 ${
                isActive
                  ? "text-slate-400 hover:text-rose-500 hover:bg-rose-50"
                  : "text-slate-300 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100"
              }`}
              title="删除项目"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
