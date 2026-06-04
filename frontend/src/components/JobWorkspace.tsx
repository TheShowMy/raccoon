import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  FileQuestion,
  GitPullRequestDraft,
  ListChecks,
  Loader2,
  MessageSquarePlus,
  Plus,
  RefreshCcw,
  Send,
  Sparkles,
} from "lucide-react";
import {
  confirmJob,
  createJob,
  fetchJobDetail,
  fetchProjectJobs,
  submitClarifications,
} from "../api/client";
import type {
  ClarificationItem,
  ClarificationOption,
  Job,
  JobDetail,
  JobStatus,
  SubmitClarificationAnswer,
  TaskDraft,
} from "../api/client";
import { formatRelativeTime } from "../utils/format";

interface JobWorkspaceProps {
  projectId: number;
}

type Message = { type: "success" | "error"; text: string };
type DraftAnswer = {
  selectedOptions: string[];
  freeText: string;
  customText: string;
};

const OTHER_VALUE = "__other__";

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string; icon: ReactNode }
> = {
  pending: {
    label: "等待中",
    className: "bg-slate-100 text-slate-600",
    icon: <CircleDashed className="h-3 w-3" />,
  },
  clarifying: {
    label: "待澄清",
    className: "bg-amber-100 text-amber-700",
    icon: <FileQuestion className="h-3 w-3" />,
  },
  drafting: {
    label: "草案中",
    className: "bg-sky-100 text-sky-700",
    icon: <GitPullRequestDraft className="h-3 w-3" />,
  },
  draft_ready: {
    label: "待确认",
    className: "bg-indigo-100 text-indigo-700",
    icon: <ClipboardCheck className="h-3 w-3" />,
  },
  confirmed: {
    label: "已确认",
    className: "bg-emerald-100 text-emerald-700",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  running: {
    label: "执行中",
    className: "bg-blue-100 text-blue-700",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  completed: {
    label: "已完成",
    className: "bg-emerald-100 text-emerald-700",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  failed: {
    label: "失败",
    className: "bg-rose-100 text-rose-700",
    icon: <AlertCircle className="h-3 w-3" />,
  },
  cancelled: {
    label: "已取消",
    className: "bg-slate-100 text-slate-500",
    icon: <CircleDashed className="h-3 w-3" />,
  },
};

function createEmptyAnswer(item: ClarificationItem): DraftAnswer {
  return {
    selectedOptions: item.answer?.selectedOptions || [],
    freeText:
      item.questionType === "free_text" ? item.answer?.customText || "" : "",
    customText: item.answer?.customText || "",
  };
}

function createInitialAnswers(items: ClarificationItem[]) {
  const nextAnswers: Record<number, DraftAnswer> = {};
  for (const item of items) {
    nextAnswers[item.id] = createEmptyAnswer(item);
  }
  return nextAnswers;
}

function hasAnswer(item: ClarificationItem, answer?: DraftAnswer) {
  if (!answer) return false;
  if (item.questionType === "free_text")
    return answer.freeText.trim().length > 0;

  const hasOption = answer.selectedOptions.some(
    (option) => option !== OTHER_VALUE,
  );
  const hasCustom =
    answer.selectedOptions.includes(OTHER_VALUE) &&
    answer.customText.trim().length > 0;
  return hasOption || hasCustom;
}

function buildSubmitAnswer(
  item: ClarificationItem,
  answer: DraftAnswer,
): SubmitClarificationAnswer {
  if (item.questionType === "free_text") {
    return {
      clarificationId: item.id,
      selectedOptions: [],
      customText: answer.freeText.trim(),
    };
  }

  return {
    clarificationId: item.id,
    selectedOptions: answer.selectedOptions.filter(
      (option) => option !== OTHER_VALUE,
    ),
    customText: answer.selectedOptions.includes(OTHER_VALUE)
      ? answer.customText.trim()
      : undefined,
  };
}

function getJobTitle(job: Job) {
  return job.title || job.originalRequirement.slice(0, 32) || "未命名任务";
}

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

export function JobWorkspace({ projectId }: JobWorkspaceProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [requirement, setRequirement] = useState("");
  const [answers, setAnswers] = useState<Record<number, DraftAnswer>>({});
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const selectedJob = useMemo(
    () =>
      (jobDetail?.job.id === selectedJobId ? jobDetail.job : null) ||
      jobs.find((job) => job.id === selectedJobId) ||
      jobs[0] ||
      null,
    [jobDetail, jobs, selectedJobId],
  );

  const clarifications = jobDetail?.clarifications || [];
  const taskDrafts = jobDetail?.taskDrafts || [];

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    setMessage(null);
    try {
      const data = await fetchProjectJobs(projectId);
      setJobs(data);
      setSelectedJobId((current) => {
        if (current !== null && data.some((job) => job.id === current)) {
          return current;
        }
        return data[0]?.id || null;
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "加载 Job 失败",
      });
    } finally {
      setLoadingJobs(false);
    }
  }, [projectId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadJobs();
    });
  }, [loadJobs]);

  useEffect(() => {
    if (selectedJobId === null) {
      return;
    }

    let cancelled = false;

    (async () => {
      setLoadingDetail(true);
      setMessage(null);
      try {
        const detail = await fetchJobDetail(selectedJobId);
        if (cancelled) return;
        setJobDetail(detail);
        setAnswers(createInitialAnswers(detail.clarifications));
      } catch (err) {
        if (cancelled) return;
        setMessage({
          type: "error",
          text: err instanceof Error ? err.message : "加载 Job 详情失败",
        });
      } finally {
        if (!cancelled) {
          setLoadingDetail(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedJobId]);

  const applyDetail = (detail: JobDetail) => {
    setJobDetail(detail);
    setAnswers(createInitialAnswers(detail.clarifications));
    setSelectedJobId(detail.job.id);
    setJobs((current) => {
      const exists = current.some((job) => job.id === detail.job.id);
      if (!exists) return [detail.job, ...current];
      return current.map((job) =>
        job.id === detail.job.id ? detail.job : job,
      );
    });
  };

  const handleCreateJob = async () => {
    const trimmed = requirement.trim();
    if (!trimmed) {
      setMessage({ type: "error", text: "请先填写需求内容" });
      return;
    }

    setCreating(true);
    setMessage(null);
    try {
      const detail = await createJob(projectId, trimmed);
      applyDetail(detail);
      setRequirement("");
      setMessage({ type: "success", text: "Job 已创建" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "创建 Job 失败",
      });
    } finally {
      setCreating(false);
    }
  };

  const updateAnswer = (
    clarificationId: number,
    updater: (answer: DraftAnswer) => DraftAnswer,
  ) => {
    setAnswers((current) => ({
      ...current,
      [clarificationId]: updater(
        current[clarificationId] || {
          selectedOptions: [],
          freeText: "",
          customText: "",
        },
      ),
    }));
  };

  const toggleSingleChoice = (clarificationId: number, value: string) => {
    updateAnswer(clarificationId, (answer) => ({
      ...answer,
      selectedOptions: answer.selectedOptions[0] === value ? [] : [value],
    }));
  };

  const toggleMultiChoice = (clarificationId: number, value: string) => {
    updateAnswer(clarificationId, (answer) => {
      const selectedOptions = answer.selectedOptions.includes(value)
        ? answer.selectedOptions.filter((item) => item !== value)
        : [...answer.selectedOptions, value];
      return { ...answer, selectedOptions };
    });
  };

  const handleSubmitAnswers = async () => {
    if (!selectedJob) return;

    const unanswered = clarifications.filter(
      (item) => !item.answeredAt && !hasAnswer(item, answers[item.id]),
    );
    if (unanswered.length > 0) {
      setMessage({ type: "error", text: "请先完成全部待澄清项" });
      return;
    }

    const payload = clarifications
      .filter((item) => !item.answeredAt && hasAnswer(item, answers[item.id]))
      .map((item) => buildSubmitAnswer(item, answers[item.id]));

    if (payload.length === 0) {
      setMessage({ type: "error", text: "没有可提交的澄清答案" });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const detail = await submitClarifications(selectedJob.id, payload);
      applyDetail(detail);
      setMessage({ type: "success", text: "澄清答案已提交" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "提交澄清失败",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDraft = async () => {
    if (!selectedJob) return;

    setConfirming(true);
    setMessage(null);
    try {
      const detail = await confirmJob(selectedJob.id);
      applyDetail(detail);
      setMessage({ type: "success", text: "任务草案已确认" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "确认草案失败",
      });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="grid min-h-[640px] overflow-hidden rounded-xl border border-slate-100 bg-white grid-cols-[260px_minmax(0,1fr)]">
      <aside className="border-r border-slate-100 bg-slate-50/70 p-3">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-slate-800">Job 列表</h2>
          </div>
          <button
            onClick={loadJobs}
            disabled={loadingJobs}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            title="刷新"
          >
            <RefreshCcw
              className={`h-3.5 w-3.5 ${loadingJobs ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        <div className="space-y-2">
          {loadingJobs && jobs.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center">
              <Sparkles className="mx-auto mb-2 h-5 w-5 text-slate-300" />
              <p className="text-sm text-slate-500">暂无 Job</p>
              <p className="mt-1 text-xs text-slate-400">
                输入需求后创建第一个任务
              </p>
            </div>
          ) : (
            jobs.map((job) => {
              const active = selectedJob?.id === job.id;
              return (
                <button
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
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
                  <p className="mt-2 text-[11px] text-slate-400">
                    更新于 {formatRelativeTime(job.updatedAt)}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="min-w-0 overflow-y-auto p-6">
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
                <MessageSquarePlus className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  新建需求
                </h2>
                <p className="text-xs text-slate-400">
                  写清目标、边界和验收，raccoon 会先生成可点选澄清项。
                </p>
              </div>
            </div>
            <button
              onClick={handleCreateJob}
              disabled={creating}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              创建 Job
            </button>
          </div>
          <textarea
            value={requirement}
            onChange={(e) => setRequirement(e.target.value)}
            rows={3}
            placeholder="例如：把需求澄清工作台改得更像 Codex，选项可点选，其他输入明显，任务草案确认更清晰..."
            className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-100"
          />
        </div>

        {message && (
          <div
            className={`mb-4 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${
              message.type === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            {message.text}
          </div>
        )}

        {loadingDetail && selectedJob ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-slate-100 bg-white">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-amber-500" />
            <span className="text-sm text-slate-400">加载 Job 详情...</span>
          </div>
        ) : !selectedJob ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white">
            <div className="text-center">
              <ListChecks className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">
                选择或创建 Job
              </p>
              <p className="mt-1 text-xs text-slate-400">
                工作台会展示澄清问题和任务草案
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-100 bg-white p-5">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2">
                    <h2 className="truncate text-lg font-bold text-slate-900">
                      {getJobTitle(selectedJob)}
                    </h2>
                    <StatusBadge status={selectedJob.status} />
                  </div>
                  <p className="text-xs text-slate-400">
                    创建于 {formatRelativeTime(selectedJob.createdAt)}
                  </p>
                </div>
              </div>
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                {selectedJob.originalRequirement}
              </p>
            </div>

            <ClarificationPanel
              clarifications={clarifications}
              answers={answers}
              submitting={submitting}
              onSubmit={handleSubmitAnswers}
              onSingleChoice={toggleSingleChoice}
              onMultiChoice={toggleMultiChoice}
              onFreeTextChange={(clarificationId, freeText) =>
                updateAnswer(clarificationId, (answer) => ({
                  ...answer,
                  freeText,
                }))
              }
              onCustomTextChange={(clarificationId, customText) =>
                updateAnswer(clarificationId, (answer) => ({
                  ...answer,
                  customText,
                }))
              }
            />

            <TaskDraftPanel
              job={selectedJob}
              taskDrafts={taskDrafts}
              confirming={confirming}
              onConfirm={handleConfirmDraft}
            />
          </div>
        )}
      </section>
    </div>
  );
}

interface ClarificationPanelProps {
  clarifications: ClarificationItem[];
  answers: Record<number, DraftAnswer>;
  submitting: boolean;
  onSubmit: () => void;
  onSingleChoice: (clarificationId: number, value: string) => void;
  onMultiChoice: (clarificationId: number, value: string) => void;
  onFreeTextChange: (clarificationId: number, text: string) => void;
  onCustomTextChange: (clarificationId: number, text: string) => void;
}

function ClarificationPanel({
  clarifications,
  answers,
  submitting,
  onSubmit,
  onSingleChoice,
  onMultiChoice,
  onFreeTextChange,
  onCustomTextChange,
}: ClarificationPanelProps) {
  const pendingItems = clarifications.filter((item) => !item.answeredAt);
  const answeredPendingCount = pendingItems.filter((item) =>
    hasAnswer(item, answers[item.id]),
  ).length;
  const remainingCount = pendingItems.length - answeredPendingCount;
  const canSubmit = pendingItems.length > 0 && remainingCount === 0;
  const answeredCount = clarifications.length - pendingItems.length;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 px-5 pt-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <FileQuestion className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">澄清问题</h3>
            <p className="text-xs text-slate-400">
              已完成 {answeredCount}/{clarifications.length}
              {pendingItems.length > 0 && `，还剩 ${remainingCount} 题`}
            </p>
          </div>
        </div>
      </div>

      {clarifications.length === 0 ? (
        <div className="mx-5 mb-5 rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
          当前没有待回答的澄清问题
        </div>
      ) : (
        <div className="space-y-3 px-5 pb-5">
          {clarifications.map((item, index) => (
            <ClarificationCard
              key={item.id}
              item={item}
              index={index}
              answer={answers[item.id] || createEmptyAnswer(item)}
              onSingleChoice={(value) => onSingleChoice(item.id, value)}
              onMultiChoice={(value) => onMultiChoice(item.id, value)}
              onFreeTextChange={(text) => onFreeTextChange(item.id, text)}
              onCustomTextChange={(text) => onCustomTextChange(item.id, text)}
            />
          ))}
        </div>
      )}

      {pendingItems.length > 0 && (
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-100 bg-white/95 px-5 py-3 backdrop-blur-sm">
          <p className="text-xs text-slate-500">
            {canSubmit
              ? "澄清项已填写完成，可以提交。"
              : `还剩 ${remainingCount} 题未完成`}
          </p>
          <button
            onClick={onSubmit}
            disabled={submitting || !canSubmit}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            提交全部答案
          </button>
        </div>
      )}
    </div>
  );
}

interface ClarificationCardProps {
  item: ClarificationItem;
  index: number;
  answer: DraftAnswer;
  onSingleChoice: (value: string) => void;
  onMultiChoice: (value: string) => void;
  onFreeTextChange: (text: string) => void;
  onCustomTextChange: (text: string) => void;
}

function ClarificationCard({
  item,
  index,
  answer,
  onSingleChoice,
  onMultiChoice,
  onFreeTextChange,
  onCustomTextChange,
}: ClarificationCardProps) {
  const isMulti = item.questionType === "multi_choice";
  const isText = item.questionType === "free_text";
  const disabled = Boolean(item.answeredAt);

  return (
    <div
      className={`rounded-xl border bg-white p-4 transition ${
        disabled ? "border-emerald-100 bg-slate-50/60" : "border-slate-200"
      }`}
    >
      <div className="mb-3 flex items-start gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            disabled
              ? "bg-emerald-50 text-emerald-600"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {disabled ? <Check className="h-4 w-4" /> : `Q${index + 1}`}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-slate-800">
            {item.question}
          </h4>
          <p className="mt-1 text-xs text-slate-400">
            {item.questionType === "single_choice" && "单选"}
            {item.questionType === "multi_choice" && "多选"}
            {item.questionType === "free_text" && "自由文本"}
          </p>
        </div>
      </div>

      {isText ? (
        <textarea
          value={answer.freeText}
          onChange={(e) => onFreeTextChange(e.target.value)}
          disabled={disabled}
          rows={4}
          placeholder="输入你的补充说明..."
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-100 disabled:text-slate-500"
        />
      ) : (
        <div className={`space-y-2 ${disabled ? "pointer-events-none" : ""}`}>
          {item.options.map((option) => (
            <ChoiceOption
              key={option.label}
              option={option}
              active={answer.selectedOptions.includes(option.label)}
              disabled={disabled}
              multi={isMulti}
              onClick={() =>
                isMulti
                  ? onMultiChoice(option.label)
                  : onSingleChoice(option.label)
              }
            />
          ))}

          {item.allowCustom && (
            <>
              <button
                onClick={() =>
                  isMulti
                    ? onMultiChoice(OTHER_VALUE)
                    : onSingleChoice(OTHER_VALUE)
                }
                disabled={disabled}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
                  answer.selectedOptions.includes(OTHER_VALUE)
                    ? "border-slate-800 bg-slate-800 text-white"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <ChoiceMark
                  active={answer.selectedOptions.includes(OTHER_VALUE)}
                  multi={isMulti}
                />
                <span className="text-sm font-medium">其他（手动输入）</span>
              </button>

              <div
                className={`overflow-hidden transition-all duration-200 ${
                  answer.selectedOptions.includes(OTHER_VALUE)
                    ? "max-h-24 opacity-100"
                    : "max-h-0 opacity-0"
                }`}
              >
                <input
                  value={answer.customText}
                  onChange={(e) => onCustomTextChange(e.target.value)}
                  disabled={disabled}
                  placeholder="填写其他答案..."
                  className="mt-2 ml-7 w-[calc(100%-1.75rem)] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-100 disabled:text-slate-500"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface ChoiceOptionProps {
  option: ClarificationOption;
  active: boolean;
  disabled: boolean;
  multi: boolean;
  onClick: () => void;
}

function ChoiceOption({
  option,
  active,
  disabled,
  multi,
  onClick,
}: ChoiceOptionProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-70 ${
        active
          ? "border-slate-800 bg-slate-800 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <ChoiceMark active={active} multi={multi} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{option.label}</span>
        {option.description && (
          <span
            className={`mt-0.5 block text-xs leading-5 ${
              active ? "text-slate-200" : "text-slate-500"
            }`}
          >
            {option.description}
          </span>
        )}
        {option.recommended && (
          <span
            className={`mt-1 inline-flex text-[10px] font-medium ${
              active ? "text-slate-300" : "text-slate-400"
            }`}
          >
            推荐
          </span>
        )}
      </span>
    </button>
  );
}

function ChoiceMark({ active, multi }: { active: boolean; multi: boolean }) {
  return (
    <span
      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border ${
        multi ? "rounded" : "rounded-full"
      } ${
        active
          ? "border-white/80 bg-white text-slate-900"
          : "border-slate-300 bg-white text-transparent"
      }`}
    >
      <Check className="h-3 w-3" />
    </span>
  );
}

interface TaskDraftPanelProps {
  job: Job;
  taskDrafts: TaskDraft[];
  confirming: boolean;
  onConfirm: () => void;
}

function TaskDraftPanel({
  job,
  taskDrafts,
  confirming,
  onConfirm,
}: TaskDraftPanelProps) {
  const confirmed = job.status === "confirmed";

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitPullRequestDraft className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-slate-800">任务草案</h3>
        </div>
        {taskDrafts.length > 0 && (
          <button
            onClick={onConfirm}
            disabled={confirming || confirmed}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {confirming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ClipboardCheck className="h-4 w-4" />
            )}
            {confirmed ? "已确认" : "确认草案"}
          </button>
        )}
      </div>

      {taskDrafts.length === 0 ? (
        <div className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
          任务草案生成后会显示在这里
        </div>
      ) : (
        <div className="space-y-3">
          {taskDrafts.map((draft, index) => (
            <div
              key={draft.id}
              className="rounded-xl border border-slate-100 bg-slate-50 p-4"
            >
              <div className="mb-2 flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-semibold text-slate-500">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-slate-800">
                      {draft.title}
                    </h4>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
                      {draft.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {draft.description}
                  </p>
                </div>
              </div>

              {draft.acceptanceCriteria.length > 0 && (
                <div className="ml-9 mt-3 space-y-1">
                  {draft.acceptanceCriteria.map((item) => (
                    <div
                      key={item}
                      className="flex items-start gap-2 text-xs leading-5 text-slate-500"
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
    </div>
  );
}
