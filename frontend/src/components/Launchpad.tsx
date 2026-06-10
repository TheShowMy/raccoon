import { useCallback, useEffect, useRef, useState } from "react";
import {
  Terminal,
  ImageIcon,
  Monitor,
  Globe,
  Settings,
  Calculator,
  Notebook,
  Calendar,
  type LucideIcon,
} from "lucide-react";

/* ─── 类型 ─────────────────────────────────────── */

export interface LaunchpadApp {
  id: string;
  title: string;
  icon: LucideIcon;
}

export interface LaunchpadProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 启动应用回调 */
  onAppLaunch?: (appId: string) => void;
}

/* ─── 内置应用列表 ─────────────────────────────── */

const BUILTIN_APPS: LaunchpadApp[] = [
  { id: "terminal", title: "终端", icon: Terminal },
  { id: "photos", title: "照片", icon: ImageIcon },
  { id: "about-this-mac", title: "关于本机", icon: Monitor },
  { id: "safari", title: "Safari", icon: Globe },
  { id: "settings", title: "系统设置", icon: Settings },
  { id: "calculator", title: "计算器", icon: Calculator },
  { id: "notes", title: "备忘录", icon: Notebook },
  { id: "calendar", title: "日历", icon: Calendar },
];

/* ─── 应用图标卡片 ─────────────────────────────── */

interface AppIconProps {
  app: LaunchpadApp;
  onClick: () => void;
}

function AppIcon({ app: { title, icon: Icon }, onClick }: AppIconProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center gap-2 p-2 rounded-2xl
                 transition-all duration-150
                 hover:bg-white/10
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      {/* 图标容器 */}
      <div
        className="flex items-center justify-center w-20 h-20 rounded-2xl
                    bg-white/10 backdrop-blur-sm
                    group-hover:bg-white/15 group-hover:scale-105
                    transition-all duration-200"
      >
        <Icon className="w-10 h-10 text-white/90" />
      </div>

      {/* 应用名称 */}
      <span className="text-xs text-white/80 font-medium truncate max-w-20 text-center drop-shadow-sm">
        {title}
      </span>
    </button>
  );
}

/* ─── Launchpad 主组件 ─────────────────────────── */

/**
 * Launchpad 全屏应用启动器。
 *
 * 提供 macOS 风格的全屏应用网格，支持：
 * - 深色半透明模糊背景
 * - 淡入淡出 + 缩放过渡动画
 * - 点击空白处 / 关闭按钮关闭
 * - onAppLaunch 通知回调
 */
export function Launchpad({ isOpen, onClose, onAppLaunch }: LaunchpadProps) {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  /* ── 打开/关闭动画状态机 ── */
  useEffect(() => {
    if (isOpen) {
      // 打开：先挂载 DOM，再触发 visible
      setAnimating(true);
      // 用 requestAnimationFrame 确保浏览器完成布局后再触发动画
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true);
        });
      });
      return () => cancelAnimationFrame(raf);
    } else {
      // 关闭：先隐藏，等动画结束后卸载 DOM
      setVisible(false);
      const timer = setTimeout(() => {
        setAnimating(false);
      }, 300); // 与 CSS transition 时长匹配
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  /* ── 点击空白处关闭 ── */
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  /* ── Escape 键关闭 ── */
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  /* ── 启动应用 ── */
  const handleAppLaunch = useCallback(
    (appId: string) => {
      onAppLaunch?.(appId);
      onClose();
    },
    [onAppLaunch, onClose],
  );

  /* 既不是打开也不是关闭动画中，不渲染任何内容 */
  if (!isOpen && !animating) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className={`
        fixed inset-0 z-[9999]
        flex flex-col items-center justify-center
        transition-all duration-300 ease-out
        ${
          visible
            ? "opacity-100 scale-100"
            : "opacity-0 scale-95"
        }
      `}
      style={{
        /* 深色半透明模糊背景 */
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(48px) saturate(1.4)",
        WebkitBackdropFilter: "blur(48px) saturate(1.4)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="应用启动器"
    >
      {/* ── 顶部关闭按钮 ── */}
      <div className="absolute top-6 right-6">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-9 h-9 rounded-full
                     bg-white/10 backdrop-blur-sm
                     hover:bg-white/20 active:bg-white/25
                     transition-colors duration-150
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          aria-label="关闭 Launchpad"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="3" y1="3" x2="13" y2="13" />
            <line x1="13" y1="3" x2="3" y2="13" />
          </svg>
        </button>
      </div>

      {/* ── 搜索框 ── */}
      <div className="mb-10 w-full max-w-md px-4">
        <div
          className="flex items-center gap-3 px-4 h-11 rounded-xl
                      bg-white/10 backdrop-blur-sm
                      border border-white/[0.08]
                      text-white/50 text-sm"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="shrink-0"
          >
            <circle cx="7" cy="7" r="4.5" />
            <line x1="10.5" y1="10.5" x2="14" y2="14" />
          </svg>
          <span className="text-white/40">搜索应用</span>
        </div>
      </div>

      {/* ── 应用图标网格 ── */}
      <div
        className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-4 md:gap-6 px-8 max-w-4xl"
        style={{
          transitionDelay: visible ? "50ms" : "0ms",
        }}
      >
        {BUILTIN_APPS.map((app) => (
          <AppIcon
            key={app.id}
            app={app}
            onClick={() => handleAppLaunch(app.id)}
          />
        ))}
      </div>

      {/* ── 底部页码提示 ── */}
      <div className="absolute bottom-10 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-white/60 transition-colors" />
        <div className="w-2 h-2 rounded-full bg-white/20 transition-colors" />
      </div>
    </div>
  );
}
