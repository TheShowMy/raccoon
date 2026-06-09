import type { JobMessage, StreamEvent, TraceData } from "./types";

export function buildRuntimeTrace(
  events: StreamEvent[],
  analyzing: boolean,
): TraceData | null {
  const trace: TraceData = {
    thinking: "",
    output: "",
    tools: [],
    statuses: [],
    completed: false,
    live: true,
  };

  for (const event of events) {
    if (
      event.event === "coordinator_started" ||
      event.event === "coordinator_progress"
    ) {
      trace.statuses.push({ type: event.event, message: event.message });
      continue;
    }
    if (event.event !== "pi_event") continue;
    collectPiEvent(trace, event);
  }

  if (analyzing && trace.statuses.length === 0 && events.length === 0) {
    trace.statuses.push({
      type: "coordinator_started",
      message: "Coordinator 正在分析当前需求。",
    });
  }

  const hasTraceContent =
    trace.thinking ||
    trace.output ||
    trace.tools.length > 0 ||
    trace.statuses.length > 0;
  return hasTraceContent ? trace : null;
}

export function traceFromMessage(message: JobMessage): TraceData | null {
  if (message.role !== "trace" || !message.metadataJson) return null;
  try {
    const metadata = JSON.parse(message.metadataJson) as {
      type?: string;
      trace?: Partial<TraceData>;
    };
    if (metadata.type !== "pi_trace" || !metadata.trace) return null;
    return {
      thinking: String(metadata.trace.thinking ?? ""),
      output: String(metadata.trace.output ?? ""),
      tools: Array.isArray(metadata.trace.tools) ? metadata.trace.tools : [],
      statuses: Array.isArray(metadata.trace.statuses)
        ? metadata.trace.statuses
        : [],
      completed: true,
      live: false,
    };
  } catch {
    return null;
  }
}

function collectPiEvent(trace: TraceData, event: StreamEvent) {
  const payload = asRecord(event.payload);
  if (!payload) {
    addStatus(trace, event.piType || "pi_event", event.message);
    return;
  }

  if (event.piType === "message_update") {
    collectMessageUpdate(trace, payload);
    return;
  }
  if (
    event.piType === "tool_execution_start" ||
    event.piType === "tool_execution_update" ||
    event.piType === "tool_execution_end"
  ) {
    upsertTool(trace, payload, event.piType);
    return;
  }
  if (event.piType === "agent_end") {
    trace.completed = true;
  }
  addStatus(trace, event.piType || "pi_event", event.message);
}

function collectMessageUpdate(
  trace: TraceData,
  payload: Record<string, unknown>,
) {
  const assistantEvent = asRecord(payload.assistantMessageEvent);
  if (!assistantEvent) return;
  const deltaType = String(assistantEvent.type ?? "");
  const delta = String(assistantEvent.delta ?? assistantEvent.text ?? "");
  if (deltaType === "thinking_delta") {
    trace.thinking += delta;
  } else if (deltaType === "text_delta") {
    trace.output += delta;
  }
}

function upsertTool(
  trace: TraceData,
  payload: Record<string, unknown>,
  piType: string,
) {
  const toolCallId = String(
    payload.toolCallId ?? payload.tool_call_id ?? "unknown",
  );
  const toolName = String(payload.toolName ?? payload.tool_name ?? "tool");
  const status = piType === "tool_execution_end" ? "done" : "running";
  const output = extractToolOutput(payload);
  const isError = Boolean(payload.isError ?? payload.is_error ?? false);
  const existing = trace.tools.find((tool) => tool.toolCallId === toolCallId);
  if (existing) {
    existing.toolName = toolName;
    existing.status = status;
    existing.isError = isError;
    if (output) existing.output = output;
  } else {
    trace.tools.push({
      toolCallId,
      toolName,
      status,
      output: output ?? "",
      isError,
    });
  }
}

function extractToolOutput(payload: Record<string, unknown>): string | null {
  const result = asRecord(
    payload.partialResult ?? payload.partial_result ?? payload.result,
  );
  const content = Array.isArray(result?.content) ? result.content : [];
  const text = content
    .map((item) => asRecord(item)?.text)
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  return text || null;
}

function addStatus(trace: TraceData, type: string, message: string) {
  const last = trace.statuses.at(-1);
  if (last?.type === type && last.message === message) return;
  trace.statuses.push({ type, message });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}
