/* ─── macOS "关于本机" 虚拟系统信息 ─────────────── */

const SYS_INFO = {
  icon: "macos",
  name: "macOS",
  version: "Sequoia 15.1",
  build: "24B2083",
  processor: "Apple M4 Max",
  memory: "48 GB",
  graphics: "Apple M4 Max (40核)",
  serial: "F2G9H3K7M8N1",
  disk: "1TB",
} as const;

/* ─── macOS Finder 风格图标 ────────────────────── */

function MacIcon() {
  return (
    <svg
      viewBox="0 0 300 300"
      className="w-28 h-28 md:w-32 md:h-32 shrink-0"
      fill="none"
      aria-hidden="true"
    >
      {/* 圆角方形背景 — macOS Finder 风格 */}
      <rect
        x="10"
        y="10"
        width="280"
        height="280"
        rx="60"
        className="fill-[#1d1d1f]"
      />
      {/* 微笑的正面 — 多彩渐变 */}
      <defs>
        <linearGradient id="macFace" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff6b6b" />
          <stop offset="25%" stopColor="#ffa94d" />
          <stop offset="50%" stopColor="#ffd43b" />
          <stop offset="75%" stopColor="#69db7c" />
          <stop offset="100%" stopColor="#74c0fc" />
        </linearGradient>
      </defs>
      {/* 脸庞 */}
      <circle cx="150" cy="155" r="100" fill="url(#macFace)" opacity="0.92" />
      {/* 左眼 */}
      <ellipse cx="115" cy="130" rx="14" ry="16" fill="#1d1d1f" />
      {/* 右眼 */}
      <ellipse cx="185" cy="130" rx="14" ry="16" fill="#1d1d1f" />
      {/* 微笑 */}
      <path
        d="M 115 180 Q 150 215 185 180"
        stroke="#1d1d1f"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      {/* 彩虹围巾装饰 */}
      <path
        d="M 95 185 Q 150 230 205 185"
        stroke="#ff922b"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />
    </svg>
  );
}

/* ─── 信息行 ───────────────────────────────────── */

interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

function InfoRow({ label, value, mono }: InfoRowProps) {
  return (
    <div className="flex items-baseline gap-4 py-1.5 min-w-0">
      <span className="text-xs text-[var(--text-secondary)] w-24 shrink-0 text-right select-none">
        {label}
      </span>
      <span
        className={`text-sm text-[var(--text-primary)] truncate ${
          mono ? "font-mono tracking-tight" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/* ─── 信息行分隔线 ─────────────────────────────── */

function Divider() {
  return (
    <div className="h-px bg-[var(--border-color)] my-2 mx-0" />
  );
}

/* ─── 主组件 ───────────────────────────────────── */

export function AboutThisMac() {
  return (
    <div className="h-full w-full overflow-auto bg-[var(--bg-primary)]">
      {/* 居中卡片 */}
      <div className="flex items-start justify-center min-h-full px-6 py-10">
        <div
          className="w-full max-w-md rounded-2xl border border-[var(--border-color)]
                      bg-[var(--bg-secondary)] shadow-xl overflow-hidden"
        >
          {/* 头部：图标 + 系统名称 */}
          <div className="flex flex-col items-center pt-8 pb-4 px-6 select-none">
            <MacIcon />
            <h1 className="mt-4 text-2xl font-semibold text-[var(--text-primary)] tracking-tight">
              {SYS_INFO.name}
            </h1>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              版本 {SYS_INFO.version}（内部版本 {SYS_INFO.build}）
            </p>
          </div>

          {/* 分隔线 */}
          <div className="mx-8">
            <Divider />
          </div>

          {/* 详细信息 */}
          <div className="px-8 pb-8">
            <div className="py-2">
              <InfoRow label="处理器" value={SYS_INFO.processor} />
              <InfoRow label="内存" value={SYS_INFO.memory} />
              <InfoRow label="图形卡" value={SYS_INFO.graphics} />
              <InfoRow label="存储" value={SYS_INFO.disk} />
              <Divider />
              <InfoRow
                label="序列号"
                value={SYS_INFO.serial}
                mono
              />
            </div>

            {/* 底部说明 */}
            <p className="mt-4 text-xs text-[var(--text-tertiary)] leading-relaxed">
              此为模拟系统信息，用于演示 macOS 风格窗口应用。
              实际硬件信息请通过"系统设置"查看。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
