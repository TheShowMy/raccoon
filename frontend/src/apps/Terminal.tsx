import { useState, useRef, useCallback, useEffect } from "react";

/* ─── 类型 ─────────────────────────────────────── */

interface HistoryEntry {
  type: "input" | "output";
  text: string;
}

/* ─── 内置命令 ─────────────────────────────────── */

const USERNAME = "user";
const HOSTNAME = "macbook";

const BUILTIN_COMMANDS: Record<string, (...args: string[]) => string> = {
  help: () =>
    [
      "可用命令:",
      "  help     - 显示此帮助信息",
      "  date     - 显示当前日期时间",
      "  clear    - 清空终端",
      "  echo     - 回显文本",
      "  whoami   - 显示当前用户名",
      "  uname    - 显示系统信息",
      "  pwd      - 显示当前工作目录",
      "  ls       - 列出当前目录内容",
      "  uptime   - 显示运行时间",
      "  hostname - 显示主机名",
    ].join("\n"),
  date: () => new Date().toLocaleString("zh-CN"),
  echo: (...args) => args.join(" "),
  whoami: () => USERNAME,
  uname: () => "Darwin raccoon 24.0.0 arm64",
  pwd: () => "/Users/user",
  hostname: () => HOSTNAME,
  uptime: () => {
    const mins = Math.floor(process.uptime() / 60);
    return `up ${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")}`;
  },
  ls: () => ["Applications", "Desktop", "Documents", "Downloads", "Library", "Music", "Pictures"].join("\n"),
};

/* ─── 主组件 ───────────────────────────────────── */

export function Terminal() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [input, setInput] = useState("");
  const historyEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /** 执行命令 */
  const executeCommand = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    setHistory((prev) => [
      ...prev,
      { type: "input", text: `${USERNAME}@${HOSTNAME} ~ % ${trimmed}` },
    ]);

    const parts = trimmed.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    /* clear 特殊处理：不添加 output，直接清空 */
    if (command === "clear") {
      setHistory([]);
      return;
    }

    const builtin = BUILTIN_COMMANDS[command];
    if (builtin) {
      const output = builtin(...args);
      setHistory((prev) => [...prev, { type: "output", text: output }]);
    } else {
      setHistory((prev) => [
        ...prev,
        {
          type: "output",
          text: `zsh: command not found: ${command}`,
        },
      ]);
    }
  }, []);

  /** 输入框键盘事件 */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        executeCommand(input);
        setInput("");
      }
    },
    [input, executeCommand],
  );

  /* 点击终端区域时自动聚焦输入框 */
  const handleContainerClick = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  /* 自动滚动至最新输出 */
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  return (
    <div
      className="h-full w-full bg-[#1e1e1e] text-[#d4d4d4] font-mono text-sm flex flex-col overflow-hidden cursor-text"
      onClick={handleContainerClick}
    >
      {/* 历史输出区域 */}
      <div className="flex-1 overflow-auto p-3 pb-0">
        {history.map((entry, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap break-all leading-relaxed ${
              entry.type === "input" ? "text-[#9cdcfe]" : ""
            }`}
          >
            {entry.type === "output" ? (
              <span>{entry.text}</span>
            ) : (
              <span>
                <span className="text-[#6a9955]">{`${USERNAME}@${HOSTNAME}`}</span>
                <span className="text-[#d4d4d4]"> </span>
                <span className="text-[#569cd6]">~</span>
                <span className="text-[#d4d4d4]"> % </span>
                <span className="text-[#dcdcaa]">{trimPromptPrefix(entry.text)}</span>
              </span>
            )}
          </div>
        ))}
        <div ref={historyEndRef} />
      </div>

      {/* 输入行 */}
      <div className="shrink-0 flex items-center gap-0 px-3 py-2 border-t border-[#333]">
        <span className="text-[#6a9955] shrink-0">{`${USERNAME}@${HOSTNAME}`}</span>
        <span className="text-[#d4d4d4] shrink-0"> </span>
        <span className="text-[#569cd6] shrink-0">~</span>
        <span className="text-[#d4d4d4] shrink-0"> % </span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-[#dcdcaa] outline-none border-none ml-0"
          spellCheck={false}
          autoComplete="off"
          autoFocus
        />
      </div>
    </div>
  );
}

/* ─── 辅助函数 ─────────────────────────────────── */

/** 从带提示符的行中截取命令部分（用于历史回显时只显示命令内容） */
function trimPromptPrefix(line: string): string {
  const prefix = `${USERNAME}@${HOSTNAME} ~ % `;
  return line.startsWith(prefix) ? line.slice(prefix.length) : line;
}
