import { Check, Loader2, Sparkles } from "lucide-react";
import type { StreamEvent } from "./types";

interface AnalysisStepperProps {
  events: StreamEvent[];
  isActive: boolean;
}

interface Step {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
}

export function AnalysisStepper({ events, isActive }: AnalysisStepperProps) {
  const steps = buildSteps(events, isActive);

  if (steps.length === 0 && !isActive) return null;

  return (
    <div className="rounded-lg border border-sky-100 bg-sky-50/30 p-4">
      <div className="mb-3 flex items-center gap-2">
        {isActive ? (
          <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
        ) : (
          <Sparkles className="h-4 w-4 text-sky-500" />
        )}
        <h3 className="text-sm font-semibold text-slate-800">
          {isActive ? "Coordinator 分析中" : "分析完成"}
        </h3>
      </div>

      <div className="space-y-0">
        {steps.map((step, index) => (
          <StepItem
            key={step.id}
            step={step}
            isLast={index === steps.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function StepItem({ step, isLast }: { step: Step; isLast: boolean }) {
  return (
    <div className="flex gap-3">
      {/* 左侧指示线 */}
      <div className="flex flex-col items-center">
        <div
          className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
            step.status === "done"
              ? "border-emerald-500 bg-emerald-500 text-white"
              : step.status === "active"
                ? "border-sky-500 bg-sky-500 text-white"
                : "border-slate-300 bg-white text-slate-400"
          }`}
        >
          {step.status === "done" ? (
            <Check className="h-3 w-3" />
          ) : (
            <span>{step.id}</span>
          )}
        </div>
        {!isLast && (
          <div
            className={`mt-1 h-full w-px ${
              step.status === "done" ? "bg-emerald-300" : "bg-slate-200"
            }`}
          />
        )}
      </div>

      {/* 右侧内容 */}
      <div className={`pb-3 ${isLast ? "" : "pb-3"}`}>
        <p
          className={`text-xs leading-5 ${
            step.status === "active"
              ? "font-medium text-slate-800"
              : step.status === "done"
                ? "text-slate-600"
                : "text-slate-400"
          }`}
        >
          {step.label}
        </p>
      </div>
    </div>
  );
}

function buildSteps(events: StreamEvent[], isActive: boolean): Step[] {
  const progressEvents: StreamEvent[] = [];
  let hasMessageUpdate = false;

  for (const event of events) {
    if (
      event.event === "coordinator_progress" ||
      event.event === "coordinator_started"
    ) {
      progressEvents.push(event);
      continue;
    }

    if (event.event !== "pi_event") continue;
    if (!shouldShowPiEvent(event)) continue;
    if (event.piType === "message_update") {
      if (hasMessageUpdate) continue;
      hasMessageUpdate = true;
    }
    progressEvents.push(event);
  }

  if (progressEvents.length === 0) {
    return isActive
      ? [{ id: "1", label: "正在分析需求...", status: "active" }]
      : [];
  }

  const steps: Step[] = progressEvents.map((e, index) => {
    const isLast = index === progressEvents.length - 1;
    return {
      id: String(index + 1),
      label: getEventLabel(e),
      status: isLast && isActive ? "active" : "done",
    };
  });

  // 如果还在分析中，添加一个待定的"即将完成"步骤
  if (isActive) {
    steps.push({
      id: String(steps.length + 1),
      label: "生成结果...",
      status: "pending",
    });
  }

  return steps;
}

function shouldShowPiEvent(event: StreamEvent): boolean {
  return (
    event.piType === "agent_start" ||
    event.piType === "turn_start" ||
    event.piType === "turn_end" ||
    event.piType === "message_update" ||
    event.piType === "tool_execution_start" ||
    event.piType === "tool_execution_end" ||
    event.piType === "auto_retry_start" ||
    event.piType === "auto_retry_end" ||
    event.piType === "extension_error" ||
    event.piType === "agent_end"
  );
}

function getEventLabel(event: StreamEvent): string {
  if (event.event !== "pi_event") return event.message;
  if (event.piType === "message_update") {
    return getMessageUpdateLabel(event.payload) ?? event.message;
  }
  return event.message;
}

function getMessageUpdateLabel(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const assistantEvent = root.assistantMessageEvent;
  if (!assistantEvent || typeof assistantEvent !== "object") return null;
  const deltaType = (assistantEvent as Record<string, unknown>).type;
  if (deltaType === "text_delta") return "正在生成回复文本。";
  if (deltaType === "thinking_delta") return "正在推理。";
  if (deltaType === "tool_call_delta") return "正在生成工具调用。";
  return null;
}
