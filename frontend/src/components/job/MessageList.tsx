import { Loader2 } from "lucide-react";
import type { JobMessage, StreamEvent } from "./types";

interface MessageListProps {
  messages: JobMessage[];
  streamMessages: StreamEvent[];
  analyzing: boolean;
}

export function MessageList({
  messages,
  streamMessages,
  analyzing,
}: MessageListProps) {
  // 过滤掉已显示在 AnalysisStepper 中的 progress 事件
  const displayEvents = streamMessages.filter(
    (e) =>
      e.event !== "coordinator_started" &&
      e.event !== "coordinator_progress" &&
      e.event !== "pi_event",
  );

  // 如果没有历史消息和流消息，不渲染
  if (messages.length === 0 && displayEvents.length === 0 && !analyzing) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* 历史消息 */}
      {messages.map((message) => (
        <ChatBubble key={message.id} message={message} />
      ))}

      {/* 实时流事件（非 progress 类型） */}
      {displayEvents.map((message, index) => (
        <SystemBubble
          key={`${message.event}-${index}`}
          text={message.message}
        />
      ))}

      {/* 分析中指示器 */}
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

export function SystemBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-center">
      <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
        {text}
      </div>
    </div>
  );
}
