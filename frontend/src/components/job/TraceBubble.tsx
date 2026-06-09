import { useEffect, useRef, useState } from "react";
import {
  Brain,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Wrench,
} from "lucide-react";
import type { LiveBubble } from "./types";

interface TraceBubbleProps {
  bubbles: LiveBubble[];
  isLive: boolean;
}

export function TraceBubble({ bubbles, isLive }: TraceBubbleProps) {
  const [expanded, setExpanded] = useState(isLive);
  const hasContent = bubbles.length > 0;

  if (!hasContent) return null;

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[78%] overflow-hidden rounded-lg border border-slate-100 bg-slate-50/80 shadow-sm">
        <TraceHeader
          bubbles={bubbles}
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
        />
        {expanded && <BubbleContainer bubbles={bubbles} isLive={isLive} />}
      </div>
    </div>
  );
}

/* ---------- Header ---------- */

function TraceHeader({
  bubbles,
  expanded,
  onToggle,
}: {
  bubbles: LiveBubble[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const running = bubbles.some((b) => b.status === "running");
  const hasError = bubbles.some((b) => b.status === "error");

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-slate-100/50"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {running ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-500" />
        ) : hasError ? (
          <div className="h-4 w-4 shrink-0 rounded-full bg-rose-500" />
        ) : (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
        )}
        <span className="text-xs font-medium text-slate-700">
          {running
            ? "Coordinator 正在分析..."
            : hasError
              ? "执行出错"
              : "分析完成"}
        </span>
      </span>

      <span className="text-[11px] text-slate-400">
        {bubbles.length} 个气泡
      </span>

      <ChevronDown
        className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition ${expanded ? "rotate-180" : ""}`}
      />
    </button>
  );
}

/* ---------- Bubble Container ---------- */

function BubbleContainer({
  bubbles,
  isLive,
}: {
  bubbles: LiveBubble[];
  isLive: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || isUserScrollingRef.current) return;

    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [bubbles]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
    isUserScrollingRef.current = !isAtBottom;
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`space-y-2 overflow-y-auto scroll-smooth px-3 pb-3 ${isLive ? "" : "max-h-[500px]"}`}
    >
      {bubbles.map((bubble) => (
        <BubbleItem key={bubble.id} bubble={bubble} isLive={isLive} />
      ))}
    </div>
  );
}

/* ---------- Bubble Item ---------- */

function BubbleItem({
  bubble,
  isLive,
}: {
  bubble: LiveBubble;
  isLive: boolean;
}) {
  if (bubble.type === "status") {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        {bubble.label}
      </div>
    );
  }

  return (
    <div className="rounded-md bg-white/70 px-3 py-2">
      <BubbleHeader bubble={bubble} isLive={isLive} />
      <BubbleContent bubble={bubble} isLive={isLive} />
    </div>
  );
}

function BubbleHeader({
  bubble,
  isLive,
}: {
  bubble: LiveBubble;
  isLive: boolean;
}) {
  const icon =
    bubble.type === "thinking" ? (
      <Brain className="h-3.5 w-3.5 text-slate-500" />
    ) : bubble.type === "tool" ? (
      <Wrench className="h-3.5 w-3.5 text-slate-500" />
    ) : null;

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
        {icon}
        {bubble.type === "tool" ? (
          <span className="font-mono">{bubble.toolName}</span>
        ) : (
          bubble.label
        )}
      </span>
      {!isLive && <StatusBadge status={bubble.status} />}
    </div>
  );
}

function BubbleContent({
  bubble,
  isLive,
}: {
  bubble: LiveBubble;
  isLive: boolean;
}) {
  const [expanded, setExpanded] = useState(isLive);
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!isLive || !ref.current) return;
    const el = ref.current;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [bubble.content, isLive]);

  if (!bubble.content) return null;

  // 实时：完整展示，无高度限制
  if (isLive) {
    return (
      <pre
        ref={ref}
        className="mt-1.5 whitespace-pre-wrap break-words rounded-md bg-white px-2 py-1.5 font-sans text-xs leading-5 text-slate-600"
      >
        {bubble.content}
      </pre>
    );
  }

  // 完成态：默认折叠，点击展开
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="mt-1 flex w-full items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
      >
        <ChevronDown className="h-3 w-3" />
        查看详情
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="mt-1 flex w-full items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
      >
        <ChevronDown className="h-3 w-3 rotate-180" />
        收起
      </button>
      <pre
        ref={ref}
        className="mt-1 whitespace-pre-wrap break-words rounded-md bg-white px-2 py-1.5 font-sans text-xs leading-5 text-slate-600"
      >
        {bubble.content}
      </pre>
    </>
  );
}

/* ---------- Status Badge ---------- */

function StatusBadge({ status }: { status: "running" | "done" | "error" }) {
  const badgeClass =
    status === "error"
      ? "bg-rose-100 text-rose-600"
      : status === "done"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-sky-100 text-sky-700";

  const badgeText =
    status === "error" ? "出错" : status === "done" ? "完成" : "运行中";

  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${badgeClass}`}
    >
      {badgeText}
    </span>
  );
}
