import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";
import {
  appendJobMessage,
  closeJobAgent,
  deleteJob,
  confirmJob,
  createJob,
  fetchJobDetail,
  fetchProjectFiles,
  fetchProjectJobs,
  submitClarifications,
} from "../api/client";
import type { Job, JobDetail } from "../api/client";
import { AnalysisStepper } from "./job/AnalysisStepper";
import { ChatHeader } from "./job/ChatHeader";
import { ClarificationWizard } from "./job/ClarificationWizard";
import { ConfirmDialog } from "./ConfirmDialog";
import { ConfirmPanel } from "./job/ConfirmPanel";
import { EmptyChat } from "./job/EmptyChat";
import { MessageList } from "./job/MessageList";
import {
  type DraftAnswer,
  type MessageType,
  type StreamEvent,
  buildSubmitAnswer,
  createEmptyAnswer,
  hasAnswer,
} from "./job/types";
import { useAppStore } from "../stores/useAppStore";

interface JobWorkspaceProps {
  projectId: number;
}

export function JobWorkspace({ projectId }: JobWorkspaceProps) {
  const { sendWithEnter } = useAppStore();
  const isMac = useMemo(
    () => navigator.platform.toLowerCase().includes("mac"),
    [],
  );
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [requirement, setRequirement] = useState("");
  const [answers, setAnswers] = useState<Record<number, DraftAnswer>>({});
  const [streamMessages, setStreamMessages] = useState<StreamEvent[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [appending, setAppending] = useState(false);
  const [message, setMessage] = useState<MessageType | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fileSuggestions, setFileSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const suggestionsRef = useRef<HTMLDivElement | null>(null);
  const prevRoundRef = useRef<number>(0);

  const selectedJob = useMemo(
    () =>
      (jobDetail?.job.id === selectedJobId ? jobDetail.job : null) ||
      jobs.find((job) => job.id === selectedJobId) ||
      null,
    [jobDetail, jobs, selectedJobId],
  );

  // 只显示活跃 job（仅排除归档的）
  const activeJobs = useMemo(
    () => jobs.filter((job) => job.status !== "archived"),
    [jobs],
  );

  const clarifications = jobDetail?.clarifications || [];
  const taskDrafts = jobDetail?.taskDrafts || [];
  const pendingItems = clarifications.filter((item) => !item.answeredAt);
  const activeClarifications =
    selectedJob?.status === "clarifying" ? pendingItems : [];

  // 加载活跃 job，自动选中最近更新的一个
  const loadJobs = useCallback(async () => {
    setMessage(null);
    try {
      const data = await fetchProjectJobs(projectId, true);
      setJobs(data);
      const active = data.filter((job) => job.status !== "archived");
      if (active.length > 0 && selectedJobId === null) {
        // 选中最近更新的活跃 job
        const latest = active.reduce((a, b) =>
          new Date(a.updatedAt) > new Date(b.updatedAt) ? a : b,
        );
        setSelectedJobId(latest.id);
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "加载会话失败",
      });
    }
  }, [projectId, selectedJobId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadJobs();
    });
  }, [loadJobs]);

  const loadDetail = useCallback(async (jobId: number, showLoading = true) => {
    if (showLoading) setLoadingDetail(true);
    setMessage(null);
    try {
      const detail = await fetchJobDetail(jobId);
      setJobDetail(detail);
      setAnswers((current) => {
        const next: Record<number, DraftAnswer> = { ...current };
        for (const item of detail.clarifications) {
          if (!next[item.id] || item.answeredAt) {
            next[item.id] = createEmptyAnswer(item);
          }
        }
        return next;
      });
      // 数据库已加载最新持久消息，清空临时 SSE 流事件
      setStreamMessages([]);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "加载会话详情失败",
      });
    } finally {
      if (showLoading) setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (selectedJobId === null) {
      queueMicrotask(() => setJobDetail(null));
      return;
    }
    queueMicrotask(() => {
      void loadDetail(selectedJobId);
    });
  }, [loadDetail, selectedJobId]);

  // SSE 事件监听
  useEffect(() => {
    if (selectedJobId === null) return;

    const source = new EventSource(`/api/jobs/${selectedJobId}/events`);
    const handleStreamEvent = (event: MessageEvent) => {
      const parsed = JSON.parse(event.data) as StreamEvent;
      setStreamMessages((current) => [...current, parsed]);
      // progress 事件只作为临时提示，不触发 loadDetail（避免闪烁和滚动丢失）
      if (
        parsed.event !== "coordinator_started" &&
        parsed.event !== "coordinator_progress"
      ) {
        void loadDetail(selectedJobId, false);
      }
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

  // 跟踪澄清轮次变化，用于判断是否需要重置相关状态
  useEffect(() => {
    prevRoundRef.current = jobDetail?.job.clarificationRound ?? 0;
  }, [jobDetail?.job.clarificationRound]);

  // 切换项目或选中 job 变化时，关闭之前 job 的 Pi Agent
  const prevSelectedJobIdRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevSelectedJobIdRef.current;
    if (prev !== null && prev !== selectedJobId) {
      void closeJobAgent(prev);
    }
    prevSelectedJobIdRef.current = selectedJobId;

    return () => {
      if (selectedJobId !== null) {
        void closeJobAgent(selectedJobId);
      }
    };
  }, [selectedJobId]);

  // 自动滚动
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ block: "end" });
  }, [streamMessages, activeClarifications.length, taskDrafts.length]);

  const applyDetail = (detail: JobDetail) => {
    setJobDetail(detail);
    setAnswers((current) => {
      const next: Record<number, DraftAnswer> = { ...current };
      for (const item of detail.clarifications) {
        if (!next[item.id] || item.answeredAt) {
          next[item.id] = createEmptyAnswer(item);
        }
      }
      return next;
    });
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
      setStreamMessages([]);
      prevRoundRef.current = 0;
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "创建会话失败",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleAppendMessage = async () => {
    if (!selectedJob) return;
    const trimmed = requirement.trim();
    if (!trimmed) {
      setMessage({ type: "error", text: "请先填写消息内容" });
      return;
    }

    setAppending(true);
    setMessage(null);
    try {
      const detail = await appendJobMessage(selectedJob.id, trimmed);
      applyDetail(detail);
      setRequirement("");
      // 开始新一轮分析，清空旧的临时 SSE 流事件
      setStreamMessages([]);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "发送消息失败",
      });
    } finally {
      setAppending(false);
    }
  };

  // ---- @ file mention autocomplete ----
  const fetchSuggestions = useCallback(
    async (query: string) => {
      try {
        const files = await fetchProjectFiles(projectId, query);
        setFileSuggestions(files);
        setSuggestionIndex(0);
        setShowSuggestions(files.length > 0);
      } catch {
        setFileSuggestions([]);
        setShowSuggestions(false);
      }
    },
    [projectId],
  );

  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    const cursor = event.target.selectionStart ?? value.length;
    setRequirement(value);

    // Find the nearest '@' before cursor
    const beforeCursor = value.slice(0, cursor);
    const atIndex = beforeCursor.lastIndexOf("@");
    if (atIndex === -1) {
      setShowSuggestions(false);
      setMentionStart(-1);
      return;
    }

    // Make sure there's no whitespace between '@' and cursor
    const query = beforeCursor.slice(atIndex + 1);
    if (/\s/.test(query)) {
      setShowSuggestions(false);
      setMentionStart(-1);
      return;
    }

    setMentionStart(atIndex);
    void fetchSuggestions(query);
  };

  const insertSuggestion = (filePath: string) => {
    if (mentionStart === -1) return;
    const before = requirement.slice(0, mentionStart);
    const after = requirement.slice(
      textareaRef.current?.selectionStart ?? requirement.length,
    );
    const next = `${before}@${filePath} ${after}`;
    setRequirement(next);
    setShowSuggestions(false);
    setMentionStart(-1);
    queueMicrotask(() => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = before.length + filePath.length + 2; // +2 for '@' and ' '
      el.setSelectionRange(pos, pos);
      el.focus();
    });
  };

  const triggerSend = () => {
    if (inputDisabled || !requirement.trim()) return;
    if (canAppend) {
      void handleAppendMessage();
    } else {
      void handleCreateJob();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 文件自动补全优先
    if (showSuggestions && fileSuggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSuggestionIndex((i) => (i + 1) % fileSuggestions.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSuggestionIndex(
          (i) => (i - 1 + fileSuggestions.length) % fileSuggestions.length,
        );
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const selected = fileSuggestions[suggestionIndex];
        if (selected) insertSuggestion(selected);
      } else if (event.key === "Escape") {
        setShowSuggestions(false);
      }
      return;
    }

    // 发送快捷键
    const isEnter = event.key === "Enter";
    const isShiftEnter = isEnter && event.shiftKey;
    const isPlainEnter =
      isEnter && !event.shiftKey && !event.ctrlKey && !event.metaKey;
    const isModifierEnter = isEnter && (event.ctrlKey || event.metaKey);

    // Ctrl/Cmd+Enter 始终发送（跨平台备选）
    if (isModifierEnter) {
      event.preventDefault();
      triggerSend();
      return;
    }

    if (!sendWithEnter) {
      // 默认模式: Enter 换行, Shift+Enter 发送
      if (isShiftEnter) {
        event.preventDefault();
        triggerSend();
      }
    } else {
      // 反转模式: Enter 发送, Shift+Enter 换行
      if (isPlainEnter) {
        event.preventDefault();
        triggerSend();
      }
    }
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (
        suggestionsRef.current?.contains(event.target as Node) ??
        textareaRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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
      prevRoundRef.current = 0;
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

  const handleDeleteJob = () => {
    if (!selectedJob) return;
    setShowDeleteConfirm(true);
  };

  const doDeleteJob = async () => {
    if (!selectedJob) return;
    setShowDeleteConfirm(false);
    setMessage(null);
    try {
      await deleteJob(selectedJob.id);
      setSelectedJobId(null);
      setJobDetail(null);
      setAnswers({});
      setStreamMessages([]);
      prevRoundRef.current = 0;
      setRequirement("");
      setMessage({ type: "success", text: "会话已删除" });
      void loadJobs();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "删除会话失败",
      });
    }
  };

  // 当前是否有活跃 job 正在处理或处于需要用户操作面板的状态
  const isProcessing = selectedJob?.status === "analyzing";
  const isAwaitingUserAction =
    selectedJob?.status === "clarifying" ||
    selectedJob?.status === "draft_ready";
  const canAppend = selectedJob && selectedJob.status !== "archived";
  const inputDisabled =
    creating || appending || isProcessing || isAwaitingUserAction;

  // 空状态：没有活跃 job
  const showEmptyState = activeJobs.length === 0 && !selectedJob;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-100 bg-white">
      {/* 顶部固定：消息提示 */}
      {message && (
        <div
          className={`flex shrink-0 items-center gap-2 px-5 py-2 text-sm ${
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

      {/* 顶部固定：Header + 分析进度 */}
      {selectedJob && jobDetail && (
        <div className="shrink-0 border-b border-slate-50 px-5 pt-3 pb-2">
          <div className="mx-auto w-full max-w-3xl">
            <ChatHeader
              job={selectedJob}
              round={jobDetail.job.clarificationRound}
              onClose={handleDeleteJob}
            />
            <AnalysisStepper
              events={streamMessages}
              isActive={selectedJob.status === "analyzing"}
            />
          </div>
        </div>
      )}

      {/* 中部滚动：消息列表 + 交互卡片 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto w-full max-w-3xl">
          {showEmptyState ? (
            <EmptyChat />
          ) : loadingDetail && selectedJob ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-amber-500" />
              <span className="text-sm text-slate-400">加载会话...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {selectedJob && jobDetail && (
                <>
                  <MessageList
                    messages={jobDetail.messages}
                    streamMessages={streamMessages}
                    analyzing={selectedJob.status === "analyzing"}
                  />

                  {activeClarifications.length > 0 && (
                    <ClarificationWizard
                      key={`round-${jobDetail.job.clarificationRound}`}
                      round={jobDetail.job.clarificationRound}
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
                      <ConfirmPanel
                        taskDrafts={taskDrafts}
                        confirming={confirming}
                        onConfirm={handleConfirmDraft}
                      />
                    )}
                </>
              )}

              <div ref={scrollRef} />
            </div>
          )}
        </div>
      </div>

      {/* 底部固定：输入框 */}
      <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-3">
        <div className="mx-auto w-full max-w-3xl">
          {isProcessing && (
            <p className="mb-1.5 text-xs text-slate-400">
              Coordinator 正在分析当前需求，请稍候...
            </p>
          )}
          {selectedJob?.status === "failed" && (
            <p className="mb-1.5 text-xs text-rose-500">
              ⚠️
              当前会话分析失败，补充说明后可继续分析，或清空输入框创建新会话。
            </p>
          )}
          <div className="relative flex gap-3">
            <div className="relative flex-1">
              <textarea
                ref={textareaRef}
                value={requirement}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                disabled={inputDisabled}
                rows={2}
                placeholder={
                  selectedJob?.status === "failed"
                    ? "补充说明你的需求，将恢复并重新分析..."
                    : canAppend
                      ? "补充说明你的需求，Coordinator 会继续分析..."
                      : "描述你的需求，Coordinator 会用聊天形式澄清并生成确认卡片..."
                }
                className="min-h-12 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
              />
              <span className="absolute bottom-2 right-3 text-[10px] text-slate-400 pointer-events-none select-none">
                {sendWithEnter
                  ? isMac
                    ? "⌘+Enter 发送"
                    : "Ctrl+Enter 发送"
                  : isMac
                    ? "⇧+Enter 发送"
                    : "Shift+Enter 发送"}
              </span>
              {showSuggestions && fileSuggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="absolute bottom-full left-0 mb-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                >
                  {fileSuggestions.map((file, index) => (
                    <button
                      key={file}
                      type="button"
                      onClick={() => insertSuggestion(file)}
                      className={`w-full px-3 py-1.5 text-left text-xs ${
                        index === suggestionIndex
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {file}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={canAppend ? handleAppendMessage : handleCreateJob}
              disabled={inputDisabled || !requirement.trim()}
              title={
                sendWithEnter
                  ? isMac
                    ? "按 Enter 发送，Shift+Enter 换行"
                    : "按 Enter 发送，Shift+Enter 换行"
                  : isMac
                    ? "按 ⇧+Enter 发送，Enter 换行"
                    : "按 Shift+Enter 发送，Enter 换行"
              }
              className="flex w-24 shrink-0 items-center justify-center gap-1.5 self-stretch rounded-lg bg-slate-900 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating || appending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              发送
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        show={showDeleteConfirm}
        title="删除会话"
        message="确定要删除此会话吗？删除后无法恢复。"
        confirmText="删除"
        cancelText="取消"
        danger
        onConfirm={doDeleteJob}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
