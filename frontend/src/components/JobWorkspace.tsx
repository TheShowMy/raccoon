import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  Archive,
  Check,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  FileQuestion,
  History,
  Loader2,
  MessageSquare,
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
  JobMessage,
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
type StreamEvent = {
  jobId: number;
  event: string;
  message: string;
};

const OTHER_VALUE = "__other__";

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string; icon: ReactNode }
> = {
  analyzing: {
    label: "分析中",
    className: "bg-sky-100 text-sky-700",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  clarifying: {
    label: "待澄清",
    className: "bg-amber-100 text-amber-700",
    icon: <FileQuestion className="h-3 w-3" />,
  },
  draft_ready: {
    label: "待确认",
    className: "bg-indigo-100 text-indigo-700",
    icon: <ClipboardCheck className="h-3 w-3" />,
  },
  archived: {
    label: "已归档",
    className: "bg-slate-100 text-slate-500",
    icon: <Archive className="h-3 w-3" />,
  },
  confirmed: {
    label: "已确认",
    className: "bg-emerald-100 text-emerald-700",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  failed: {
    label: "失败",
    className: "bg-rose-100 text-rose-700",
    icon: <AlertCircle className="h-3 w-3" />,
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
  if (item.questionType === "free_text") {
    return answer.freeText.trim().length > 0;
  }
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
  const [streamMessages, setStreamMessages] = useState<StreamEvent[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const selectedJob = useMemo(
    () =>
      (jobDetail?.job.id === selectedJobId ? jobDetail.job : null) ||
      jobs.find((job) => job.id === selectedJobId) ||
      null,
    [jobDetail, jobs, selectedJobId],
  );

  const clarifications = jobDetail?.clarifications || [];
  const taskDrafts = jobDetail?.taskDrafts || [];
  const pendingItems = clarifications.filter((item) => !item.answeredAt);
  const activeClarifications =
    selectedJob?.status === "clarifying" ? pendingItems : [];

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    setMessage(null);
    try {
      const data = await fetchProjectJobs(projectId, includeArchived);
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
        text: err instanceof Error ? err.message : "加载会话失败",
      });
    } finally {
      setLoadingJobs(false);
    }
  }, [includeArchived, projectId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadJobs();
    });
  }, [loadJobs]);

  const loadDetail = useCallback(async (jobId: number) => {
    setLoadingDetail(true);
    setMessage(null);
    try {
      const detail = await fetchJobDetail(jobId);
      setJobDetail(detail);
      setAnswers(createInitialAnswers(detail.clarifications));
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "加载会话详情失败",
      });
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (selectedJobId === null) {
      return;
    }
    queueMicrotask(() => {
      void loadDetail(selectedJobId);
    });
  }, [loadDetail, selectedJobId]);

  useEffect(() => {
    if (selectedJobId === null) return;

    const source = new EventSource(`/api/jobs/${selectedJobId}/events`);
    const handleStreamEvent = (event: MessageEvent) => {
      const parsed = JSON.parse(event.data) as StreamEvent;
      setStreamMessages((current) => [...current, parsed]);
      void loadDetail(selectedJobId);
      void loadJobs();
    };
    source.onmessage = handleStreamEvent;
    source.addEventListener("coordinator_started", handleStreamEvent);
    source.addEventListener("coordinator_progress", handleStreamEvent);
    source.addEventListener("clarifications_ready", handleStreamEvent);
    source.addEventListener("task_draft_ready", handleStreamEvent);
    source.addEventListener("archived", handleStreamEvent);
    source.addEventListener("error", (event) => {
      const maybeMessage = event as MessageEvent;
      if (typeof maybeMessage.data === "string" && maybeMessage.data) {
        handleStreamEvent(maybeMessage);
      }
    });

    return () => source.close();
  }, [loadDetail, loadJobs, selectedJobId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: "end" });
  }, [
    jobDetail,
    streamMessages,
    activeClarifications.length,
    taskDrafts.length,
  ]);

  const applyDetail = (detail: JobDetail) => {
    setJobDetail(detail);
    setAnswers(createInitialAnswers(detail.clarifications));
    setSelectedJobId(detail.job.id);
    setJobs((current) => {
      const visible =
        includeArchived ||
        detail.job.archivedAt === undefined ||
        !detail.job.archivedAt;
      const exists = current.some((job) => job.id === detail.job.id);
      if (!visible) {
        return current.filter((job) => job.id !== detail.job.id);
      }
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
      setStreamMessages([]);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "创建会话失败",
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

    const unanswered = activeClarifications.filter(
      (item) => !hasAnswer(item, answers[item.id]),
    );
    if (unanswered.length > 0) {
      setMessage({ type: "error", text: "请先完成全部待澄清项" });
      return;
    }

    const payload = activeClarifications.map((item) =>
      buildSubmitAnswer(item, answers[item.id]),
    );
    if (payload.length === 0) {
      setMessage({ type: "error", text: "没有可提交的澄清答案" });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const detail = await submitClarifications(selectedJob.id, payload);
      applyDetail(detail);
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
      setSelectedJobId(null);
      setJobDetail(null);
      setAnswers({});
      setStreamMessages([]);
      setMessage({ type: "success", text: "需求已确认，会话已归档" });
      void loadJobs();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "确认需求失败",
      });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="grid min-h-[680px] overflow-hidden rounded-xl border border-slate-100 bg-white grid-cols-[280px_minmax(0,1fr)]">
      <aside className="border-r border-slate-100 bg-slate-50/70 p-3">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-slate-800">需求会话</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIncludeArchived((value) => !value)}
              className={`rounded-lg p-1.5 transition ${
                includeArchived
                  ? "bg-slate-900 text-white"
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              }`}
              title="历史会话"
            >
              <History className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={loadJobs}
              disabled={loadingJobs}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
              title="刷新"
            >
              <RefreshCcw
                className={`h-3.5 w-3.5 ${loadingJobs ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>

        <button
          onClick={() => {
            setSelectedJobId(null);
            setJobDetail(null);
            setStreamMessages([]);
          }}
          className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" />
          新建空会话
        </button>

        <div className="space-y-2">
          {loadingJobs && jobs.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : jobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-5 text-center">
              <Sparkles className="mx-auto mb-2 h-5 w-5 text-slate-300" />
              <p className="text-sm text-slate-500">暂无会话</p>
              <p className="mt-1 text-xs text-slate-400">
                在右侧输入需求开始澄清
              </p>
            </div>
          ) : (
            jobs.map((job) => {
              const active = selectedJob?.id === job.id;
              return (
                <button
                  key={job.id}
                  onClick={() => {
                    setSelectedJobId(job.id);
                    setStreamMessages([]);
                  }}
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

      <section className="flex min-w-0 flex-col bg-white">
        {message && (
          <div
            className={`mx-5 mt-4 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {loadingDetail && selectedJob ? (
            <div className="flex min-h-[420px] items-center justify-center">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-amber-500" />
              <span className="text-sm text-slate-400">加载会话...</span>
            </div>
          ) : !selectedJob || !jobDetail ? (
            <EmptyChat />
          ) : (
            <div className="space-y-4">
              <ChatHeader job={selectedJob} />
              <MessageList
                messages={jobDetail.messages}
                streamMessages={streamMessages}
                analyzing={selectedJob.status === "analyzing"}
              />
              {activeClarifications.length > 0 && (
                <ClarificationMessage
                  clarifications={activeClarifications}
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
              )}
              {taskDrafts.length > 0 &&
                selectedJob.status === "draft_ready" && (
                  <ConfirmRequirementCard
                    taskDrafts={taskDrafts}
                    confirming={confirming}
                    onConfirm={handleConfirmDraft}
                  />
                )}
              {selectedJob.status === "archived" && (
                <SystemBubble text="该需求会话已归档，可从历史会话中查看。" />
              )}
              <div ref={scrollRef} />
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 bg-white px-5 py-4">
          <div className="flex gap-3">
            <textarea
              value={requirement}
              onChange={(event) => setRequirement(event.target.value)}
              disabled={
                creating ||
                Boolean(selectedJob && selectedJob.status !== "archived")
              }
              rows={2}
              placeholder={
                selectedJob && selectedJob.status !== "archived"
                  ? "当前会话进行中，请先完成澄清或确认需求。"
                  : "描述你的需求，Coordinator 会用聊天形式澄清并生成确认卡片..."
              }
              className="min-h-12 flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
            />
            <button
              onClick={handleCreateJob}
              disabled={
                creating ||
                !requirement.trim() ||
                Boolean(selectedJob && selectedJob.status !== "archived")
              }
              className="flex w-24 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              发送
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function EmptyChat() {
  return (
    <div className="flex min-h-[460px] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white">
          <MessageSquare className="h-5 w-5" />
        </div>
        <p className="text-sm font-semibold text-slate-700">新的需求会话</p>
        <p className="mt-1 text-sm text-slate-400">
          在底部输入需求，Coordinator 会边分析边推进澄清。
        </p>
      </div>
    </div>
  );
}

function ChatHeader({ job }: { job: Job }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="truncate text-lg font-bold text-slate-900">
            {getJobTitle(job)}
          </h2>
          <StatusBadge status={job.status} />
        </div>
        <p className="text-xs text-slate-400">
          创建于 {formatRelativeTime(job.createdAt)}
        </p>
      </div>
    </div>
  );
}

function MessageList({
  messages,
  streamMessages,
  analyzing,
}: {
  messages: JobMessage[];
  streamMessages: StreamEvent[];
  analyzing: boolean;
}) {
  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <ChatBubble key={message.id} message={message} />
      ))}
      {streamMessages.map((message, index) => (
        <SystemBubble
          key={`${message.event}-${index}`}
          text={message.message}
        />
      ))}
      {analyzing && (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Coordinator 正在分析...
        </div>
      )}
    </div>
  );
}

function ChatBubble({ message }: { message: JobMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  if (isSystem) {
    return <SystemBubble text={message.content} />;
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-lg px-4 py-3 text-sm leading-6 ${
          isUser
            ? "bg-slate-900 text-white"
            : "border border-slate-100 bg-slate-50 text-slate-700"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

function SystemBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-center">
      <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
        {text}
      </div>
    </div>
  );
}

interface ClarificationMessageProps {
  clarifications: ClarificationItem[];
  answers: Record<number, DraftAnswer>;
  submitting: boolean;
  onSubmit: () => void;
  onSingleChoice: (clarificationId: number, value: string) => void;
  onMultiChoice: (clarificationId: number, value: string) => void;
  onFreeTextChange: (clarificationId: number, text: string) => void;
  onCustomTextChange: (clarificationId: number, text: string) => void;
}

function ClarificationMessage({
  clarifications,
  answers,
  submitting,
  onSubmit,
  onSingleChoice,
  onMultiChoice,
  onFreeTextChange,
  onCustomTextChange,
}: ClarificationMessageProps) {
  const completeCount = clarifications.filter((item) =>
    hasAnswer(item, answers[item.id]),
  ).length;
  const canSubmit = completeCount === clarifications.length;

  return (
    <div className="max-w-[86%] rounded-lg border border-amber-100 bg-amber-50/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileQuestion className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-slate-900">需要你确认</h3>
        </div>
        <span className="text-xs text-slate-500">
          {completeCount}/{clarifications.length}
        </span>
      </div>

      <div className="space-y-3">
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

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-amber-100 pt-3">
        <p className="text-xs text-slate-500">
          {canSubmit ? "澄清项已填写完成。" : "请完成全部问题后提交。"}
        </p>
        <button
          onClick={onSubmit}
          disabled={submitting || !canSubmit}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          提交答案
        </button>
      </div>
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

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
          Q{index + 1}
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
          onChange={(event) => onFreeTextChange(event.target.value)}
          rows={3}
          placeholder="输入你的补充说明..."
          className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
        />
      ) : (
        <div className="space-y-2">
          {item.options.map((option) => (
            <ChoiceOption
              key={option.label}
              option={option}
              active={answer.selectedOptions.includes(option.label)}
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
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
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

              {answer.selectedOptions.includes(OTHER_VALUE) && (
                <input
                  value={answer.customText}
                  onChange={(event) => onCustomTextChange(event.target.value)}
                  placeholder="填写其他答案..."
                  className="ml-7 w-[calc(100%-1.75rem)] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ChoiceOption({
  option,
  active,
  multi,
  onClick,
}: {
  option: ClarificationOption;
  active: boolean;
  multi: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
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

function ConfirmRequirementCard({
  taskDrafts,
  confirming,
  onConfirm,
}: {
  taskDrafts: TaskDraft[];
  confirming: boolean;
  onConfirm: () => void;
}) {
  const primary = taskDrafts[0];

  return (
    <div className="sticky bottom-0 rounded-lg border border-indigo-100 bg-white p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-indigo-600" />
          <h3 className="text-sm font-semibold text-slate-900">确认需求</h3>
        </div>
        <button
          onClick={onConfirm}
          disabled={confirming}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {confirming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          确认并归档
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-800">
            {primary?.title || "确认后的需求"}
          </h4>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {primary?.description || "Coordinator 已整理当前需求范围。"}
          </p>
        </div>
        {primary?.acceptanceCriteria.length > 0 && (
          <div className="space-y-1">
            {primary.acceptanceCriteria.map((item) => (
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
    </div>
  );
}
