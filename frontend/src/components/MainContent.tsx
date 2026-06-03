import { useAppStore } from "../stores/useAppStore";
import { ProjectDetail } from "./ProjectDetail";
import { EmptyState } from "./EmptyState";
import { MousePointerClick } from "lucide-react";
import { deleteProject } from "../api/client";

export function MainContent() {
  const { projects, currentProjectId, removeProject, openAddModal } =
    useAppStore();

  const currentProject = projects.find((p) => p.id === currentProjectId);

  const handleDelete = async (id: number) => {
    try {
      await deleteProject(id);
      removeProject(id);
    } catch {
      alert("删除失败");
    }
  };

  if (!currentProject) {
    return (
      <main className="flex-1 h-full bg-white">
        <EmptyState
          icon={<MousePointerClick className="w-8 h-8 text-slate-300" />}
          title={projects.length === 0 ? "还没有项目" : "选择一个项目"}
          description={
            projects.length === 0
              ? "添加第一个项目开始使用 raccoon 管理你的代码仓库"
              : "从左侧列表中选择一个项目查看详情"
          }
          action={
            projects.length === 0
              ? { label: "添加项目", onClick: openAddModal }
              : undefined
          }
        />
      </main>
    );
  }

  return (
    <main className="flex-1 h-full bg-white overflow-auto">
      <ProjectDetail project={currentProject} onDelete={handleDelete} />
    </main>
  );
}
