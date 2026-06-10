import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Network } from "lucide-react";
import {
  fetchJobDetail,
  fetchProjectJobs,
  replanJob,
  resumeJob,
} from "../api/client";
import type { Job, JobDetail } from "../api/client";
import type { StreamEvent } from "./job/types";
import { DagPanel } from "./job/DagPanel";

interface ExecutionCenterProps {
  projectId: number;
  onBack: () => void;
}

const EXECUTION_STATUSES = new Set([
  "dag_planning",
  "dag_planning_failed",
  "dag_ready",
  "executing",
  "completed",
  "blocked",
]);

const STATUS_LABELS: Record<string, string> = {
  dag_planning: "规划中",
  dag_planning_failed: "规划失败",
  dag_ready: "待执行",
  executing: "执行中",
  completed: "已完成",
  blocked: "阻塞",
};

export function ExecutionCenter({ projectId, onBack }: ExecutionCenterProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [streamMessages, setStreamMessages] = useState<StreamEvent[]>([]);
  const [replanning, setReplanning] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const executionJobs = jobs.filter((job) =>
    EXECUTION_STATUSES.has(job.status),
  );
  const selectedJob = jobs.find((job) => job.id === selectedJobId) || null;

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProjectJobs(projectId, true);
      setJobs(data);
      const execution = data.filter((job) =>
        EXECUTION_STATUSES.has(job.status),
      );
      if (execution.length > 0 && selectedJobId === null) {
        setSelectedJobId(execution[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedJobId]);

  const loadDetail = useCallback(async (jobId: number) => {
    setLoadingDetail(true);
    try {
      const detail = await fetchJobDetail(jobId);
      setJobDetail(detail);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const handleReplan = useCallback(async () => {
    if (selectedJobId === null) return;
    setReplanning(true);
    try {
      const detail = await replanJob(selectedJobId);
      setJobDetail(detail);
      setStreamMessages([]);
      void loadJobs();
    } catch (err) {
      console.error("重新规划失败:", err);
    } finally {
      setReplanning(false);
    }
  }, [selectedJobId, loadJobs]);

  const handleResume = useCallback(async () => {
    if (selectedJobId === null) return;
    setResuming(true);
    try {
      const detail = await resumeJob(selectedJobId);
      setJobDetail(detail);
      setStreamMessages([]);
      void loadJobs();
    } catch (err) {
      console.error("恢复执行失败:", err);
    } finally {
      setResuming(false);
    }
  }, [selectedJobId, loadJobs]);

  useEffect(() => {
    queueMicrotask(() => void loadJobs());
  }, [loadJobs]);

  useEffect(() => {
    if (selectedJobId !== null) {
      queueMicrotask(() => void loadDetail(selectedJobId));
      const source = new EventSource(`/api/jobs/${selectedJobId}/events`);
      const refresh = () => {
        void loadDetail(selectedJobId);
        void loadJobs();
      };
      const handleStreamEvent = (event: MessageEvent) => {
        const parsed = JSON.parse(event.data) as StreamEvent;
        setStreamMessages((current) => [...current, parsed]);
      };
      source.addEventListener("dag_planning_started", () => {
        setStreamMessages([]);
        refresh();
      });
      source.addEventListener("dag_ready", () => {
        setStreamMessages([]);
        refresh();
      });
      source.addEventListener("dag_node_update", refresh);
      source.addEventListener("dag_completed", refresh);
      source.addEventListener("dag_blocked", refresh);
      source.addEventListener("pi_event", handleStreamEvent);
      source.addEventListener("error", refresh);
      return () => source.close();
    }
  }, [loadDetail, loadJobs, selectedJobId]);

  return (
    <div className="grid h-[calc(100vh-8rem)] grid-cols-[280px_minmax(0,1fr)] overflow-hidden rounded-xl border border-slate-100 bg-white">
      <aside className="flex flex-col border-r border-slate-100 bg-slate-50/70 p-3">
        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={onBack}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            title="返回工作区"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <Network className="h-4 w-4 text-violet-600" />
          <h2 className="text-sm font-semibold text-slate-800">执行中心</h2>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto">
          {loading && executionJobs.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : executionJobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-5 text-center">
              <Network className="mx-auto mb-2 h-5 w-5 text-slate-300" />
              <p className="text-sm text-slate-500">暂无执行任务</p>
              <p className="mt-1 text-xs text-slate-400">
                确认需求后会自动进入这里
              </p>
            </div>
          ) : (
            executionJobs.map((job) => (
              <button
                key={job.id}
                onClick={() => setSelectedJobId(job.id)}
                className={`w-full rounded-lg border border-l-2 p-2.5 text-left transition ${
                  selectedJob?.id === job.id
                    ? "border-violet-100 border-l-violet-500 bg-white shadow-sm"
                    : "border-transparent border-l-slate-200 bg-white/70 hover:border-slate-200 hover:border-l-slate-300 hover:bg-white"
                }`}
              >
                <div className="mb-1.5 flex items-start justify-between gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                    {job.title || job.originalRequirement.slice(0, 32)}
                  </h3>
                  <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                    {STATUS_LABELS[job.status] || job.status}
                  </span>
                </div>
                <p className="line-clamp-2 text-xs leading-5 text-slate-500">
                  {job.originalRequirement}
                </p>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="min-w-0 bg-white p-4">
        {loadingDetail && selectedJob ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-violet-500" />
            <span className="text-sm text-slate-400">加载执行详情...</span>
          </div>
        ) : !selectedJob || !jobDetail ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Network className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500">选择左侧任务查看执行 DAG</p>
            </div>
          </div>
        ) : (
          <DagPanel
            nodes={jobDetail.dagNodes}
            edges={jobDetail.dagEdges}
            artifacts={jobDetail.taskArtifacts}
            jobStatus={jobDetail.job.status}
            streamMessages={streamMessages}
            messages={jobDetail.messages}
            onReplan={handleReplan}
            replanning={replanning}
            isFullscreen={isFullscreen}
            onFullscreenChange={setIsFullscreen}
            onResume={handleResume}
            resuming={resuming}
          />
        )}
      </section>
    </div>
  );
}
