import { useState, type ReactNode } from "react";
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Wrench,
} from "lucide-react";
import type { TraceData, TraceTool } from "./types";

interface TraceBubbleProps {
  trace: TraceData;
}

export function TraceBubble({ trace }: TraceBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const summary = buildTraceSummary(trace);
  const preview = buildTracePreview(trace);
  const latestStatus = getLatestStatus(trace);
  const subtitle =
    trace.live && !trace.completed && latestStatus ? latestStatus : summary;
  const showPreview = !expanded && preview && trace.live && !trace.completed;
  const hasDetails = Boolean(
    trace.thinking.trim() || trace.tools.length > 0 || trace.output.trim(),
  );

  return (
    <div className="flex justify-start">
      <div className="w-fit max-w-md rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm text-slate-700 shadow-sm">
        <button
          type="button"
          onClick={() => hasDetails && setExpanded((value) => !value)}
          className="flex w-full items-center gap-2 text-left"
          disabled={!hasDetails}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {trace.live && !trace.completed ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            )}
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-slate-700">
                {trace.live && !trace.completed ? "正在思考" : "运行过程"}
              </span>
              <span className="block truncate text-[11px] leading-4 text-slate-400">
                {subtitle}
              </span>
            </span>
          </span>
          {hasDetails && (
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${
                expanded ? "rotate-180" : ""
              }`}
            />
          )}
        </button>

        {showPreview && (
          <p className="mt-1 max-h-5 overflow-hidden text-xs leading-5 text-slate-500">
            {preview}
          </p>
        )}

        {expanded && (
          <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
            {trace.thinking.trim() && (
              <TraceText
                icon={<Brain className="h-3.5 w-3.5" />}
                title="思考"
                text={trace.thinking}
                maxHeightClass="max-h-28"
              />
            )}

            {trace.tools.length > 0 && (
              <div className="space-y-1.5">
                <TraceLabel
                  icon={<Wrench className="h-3.5 w-3.5" />}
                  title="工具"
                />
                {trace.tools.map((tool) => (
                  <ToolTrace key={tool.toolCallId} tool={tool} />
                ))}
              </div>
            )}

            {trace.output.trim() && (
              <TraceText
                title="输出片段"
                text={trace.output}
                maxHeightClass="max-h-24"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TraceLabel({ icon, title }: { icon?: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
      {icon}
      {title}
    </div>
  );
}

function TraceText({
  icon,
  title,
  text,
  maxHeightClass,
}: {
  icon?: ReactNode;
  title: string;
  text: string;
  maxHeightClass: string;
}) {
  return (
    <div className="space-y-1.5">
      <TraceLabel icon={icon} title={title} />
      <pre
        className={`${maxHeightClass} overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-white/70 px-2 py-1.5 font-sans text-xs leading-5 text-slate-600`}
      >
        {text}
      </pre>
    </div>
  );
}

function ToolTrace({ tool }: { tool: TraceTool }) {
  const preview = compactText(tool.output);

  return (
    <div className="rounded-md bg-white/70 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs text-slate-700">
          {tool.toolName || "tool"}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
            tool.isError
              ? "bg-rose-100 text-rose-600"
              : tool.status === "done"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-sky-100 text-sky-700"
          }`}
        >
          {tool.isError ? "出错" : tool.status === "done" ? "完成" : "运行中"}
        </span>
      </div>
      {preview && (
        <p className="mt-1 max-h-16 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 text-slate-500">
          {preview}
        </p>
      )}
    </div>
  );
}

function buildTraceSummary(trace: TraceData): string {
  const parts = [];
  if (trace.thinking.trim()) parts.push("已思考");
  if (trace.tools.length > 0) parts.push(`${trace.tools.length} 个工具`);
  if (trace.output.trim()) parts.push("已生成输出");
  if (parts.length === 0) return trace.live ? "处理中" : "无详细记录";
  return parts.join(" / ");
}

function buildTracePreview(trace: TraceData): string {
  const thinking = compactText(trace.thinking);
  if (thinking) return thinking;
  const activeTool = [...trace.tools].reverse().find((tool) => tool.output);
  if (activeTool?.output) {
    return `${activeTool.toolName || "tool"}：${compactText(activeTool.output)}`;
  }
  const output = compactText(trace.output);
  if (output) return output;
  return "";
}

function getLatestStatus(trace: TraceData): string {
  const latest = [...trace.statuses]
    .reverse()
    .find((status) => status.message.trim());
  if (!latest) return "";
  if (latest.type === "extension_error") return `错误：${latest.message}`;
  return latest.message;
}

function compactText(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join("\n");
}
