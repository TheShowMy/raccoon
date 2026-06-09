import { useMemo } from "react";
import type { JobMessage, StreamEvent } from "./types";
import { TraceBubble } from "./TraceBubble";
import {
  traceFromMessage,
  buildBubbleStreamFromEvents,
  buildBubbleStreamFromTrace,
} from "./traceRuntime";

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
  const liveBubbles = useMemo(
    () =>
      analyzing && streamMessages.length > 0
        ? buildBubbleStreamFromEvents(streamMessages)
        : null,
    [analyzing, streamMessages],
  );

  const displayEvents = streamMessages.filter((e) => e.event !== "pi_event");

  const hasLiveBubbles = liveBubbles && liveBubbles.length > 0;

  if (
    messages.length === 0 &&
    displayEvents.length === 0 &&
    !hasLiveBubbles &&
    !analyzing
  ) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* 历史消息 */}
      {messages.map((message) => {
        const trace = traceFromMessage(message);
        if (trace) {
          const bubbles = buildBubbleStreamFromTrace(trace);
          if (bubbles.length > 0) {
            return (
              <TraceBubble key={message.id} bubbles={bubbles} isLive={false} />
            );
          }
        }
        return <ChatBubble key={message.id} message={message} />;
      })}

      {/* 实时流事件（非 pi_event） */}
      {displayEvents.map((message, index) => (
        <SystemBubble
          key={`${message.event}-${index}`}
          text={message.message}
        />
      ))}

      {/* 实时气泡流 */}
      {hasLiveBubbles && <TraceBubble bubbles={liveBubbles} isLive={true} />}
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
