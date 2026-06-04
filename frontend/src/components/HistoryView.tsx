import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileQuestion,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { fetchJobDetail, fetchProjectJobs } from "../api/client";
import type { Job, JobDetail } from "../api/client";

interface HistoryViewProps {
  projectId: number;
  onBack: () => void;
}

export function HistoryView({ projectId, onBack }: HistoryViewProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const archivedJobs = jobs.filter((job) => job.status === "archived");
  const selectedJob = jobs.find((job) => job.id === selectedJobId) || null;

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProjectJobs(projectId, true);
      setJobs(data);
      const archived = data.filter((job) => job.status === "archived");
      if (archived.length > 0 && selectedJobId === null) {
        setSelectedJobId(archived[0].id);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedJobId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadJobs();
    });
  }, [loadJobs]);

  const loadDetail = useCallback(async (jobId: number) => {
    setLoadingDetail(true);
    try {
      const detail = await fetchJobDetail(jobId);
      setJobDetail(detail);
    } catch {
      // ignore
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (selectedJobId !== null) {
      queueMicrotask(() => {
        void loadDetail(selectedJobId);
      });
    }
  }, [loadDetail, selectedJobId]);

  return (
    <div className="grid min-h-[680px] overflow-hidden rounded-xl border border-slate-100 bg-white grid-cols-[280px_minmax(0,1fr)]">
      {/* 左侧：已归档 job 列表 */}
      <aside className="border-r border-slate-100 bg-slate-50/70 p-3 flex flex-col">
        <div className="mb-4 flex items-center gap-2">
          <button
            onClick={onBack}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            title="返回工作区"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <ClipboardCheck className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-slate-800">历史记录</h2>
        </div>

        <div className="space-y-2 flex-1 overflow-y-auto">
          {loading && archivedJobs.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : archivedJobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-5 text-center">
              <ClipboardCheck className="mx-auto mb-2 h-5 w-5 text-slate-300" />
              <p className="text-sm text-slate-500">暂无归档记录</p>
              <p className="mt-1 text-xs text-slate-400">
                确认需求后会自动归档到这里
              </p>
            </div>
          ) : (
            archivedJobs.map((job) => (
              <button
                key={job.id}
                onClick={() => setSelectedJobId(job.id)}
                className={`w-full rounded-lg border border-l-2 p-2.5 text-left transition ${
                  selectedJob?.id === job.id
                    ? "border-emerald-100 border-l-emerald-500 bg-white shadow-sm"
                    : "border-transparent border-l-slate-200 bg-white/70 hover:border-slate-200 hover:border-l-slate-300 hover:bg-white"
                }`}
              >
                <div className="mb-1.5 flex items-start justify-between gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                    {job.title || job.originalRequirement.slice(0, 32)}
                  </h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    已确认
                  </span>
                </div>
                <p className="line-clamp-2 text-xs leading-5 text-slate-500">
                  {job.originalRequirement}
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Clock className="h-3 w-3" />
                  <span>
                    {job.archivedAt
                      ? new Date(job.archivedAt).toLocaleDateString()
                      : "未知时间"}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* 右侧：选中 job 的完整结果 */}
      <section className="flex min-w-0 flex-col bg-white">
        {loadingDetail && selectedJob ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-emerald-500" />
            <span className="text-sm text-slate-400">加载详情...</span>
          </div>
        ) : !selectedJob || !jobDetail ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <ClipboardCheck className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500">
                选择左侧记录查看最终澄清结果
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {/* 标题区 */}
            <div className="mb-6 border-b border-slate-100 pb-4">
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  {selectedJob.title || "未命名需求"}
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  已确认
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span>
                  创建于 {new Date(selectedJob.createdAt).toLocaleString()}
                </span>
                {selectedJob.archivedAt && (
                  <span>
                    归档于 {new Date(selectedJob.archivedAt).toLocaleString()}
                  </span>
                )}
              </div>
            </div>

            {/* 原始需求卡片 */}
            <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-700">
                  原始需求
                </h3>
              </div>
              <p className="text-sm leading-6 text-slate-600 whitespace-pre-wrap">
                {selectedJob.originalRequirement}
              </p>
            </div>

            {/* 最终确认卡片 */}
            {jobDetail.taskDrafts.length > 0 && (
              <div className="mb-6 rounded-lg border border-emerald-100 bg-emerald-50/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-semibold text-slate-800">
                    最终确认结果
                  </h3>
                </div>
                {jobDetail.taskDrafts.map((draft) => (
                  <div key={draft.id} className="space-y-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800">
                        {draft.title}
                      </h4>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {draft.description}
                      </p>
                    </div>
                    {draft.acceptanceCriteria.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-slate-500">
                          验收标准
                        </p>
                        {draft.acceptanceCriteria.map((item) => (
                          <div
                            key={item}
                            className="flex items-start gap-2 text-sm leading-5 text-slate-600"
                          >
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 澄清历史 */}
            {jobDetail.clarifications.length > 0 && (
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <FileQuestion className="h-4 w-4 text-amber-600" />
                  <h3 className="text-sm font-semibold text-slate-700">
                    澄清历史
                  </h3>
                  <span className="text-xs text-slate-400">
                    共 {jobDetail.clarifications.length} 条
                  </span>
                </div>
                <div className="space-y-3">
                  {jobDetail.clarifications.map((item, index) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-slate-100 bg-white p-3"
                    >
                      <div className="mb-2 flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-semibold text-amber-700">
                          {index + 1}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-800">
                            {item.question}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {item.questionType === "single_choice" && "单选"}
                            {item.questionType === "multi_choice" && "多选"}
                            {item.questionType === "free_text" && "自由文本"}
                          </p>
                        </div>
                      </div>
                      {item.answer ? (
                        <div className="ml-7 rounded-md bg-slate-50 px-2.5 py-1.5">
                          <p className="text-xs text-slate-600">
                            {item.answer.selectedOptions.length > 0
                              ? item.answer.selectedOptions.join("、 ")
                              : item.answer.customText || "已回答"}
                          </p>
                        </div>
                      ) : (
                        <p className="ml-7 text-xs text-slate-400">未回答</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
