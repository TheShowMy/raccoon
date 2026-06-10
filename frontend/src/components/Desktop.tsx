import type { ReactNode } from "react";

interface DesktopProps {
  children: ReactNode;
}

/**
 * 全屏桌面壁纸背景组件。
 * 提供 macOS 风格的深色渐变背景，作为应用最外层容器。
 */
export function Desktop({ children }: DesktopProps) {
  return (
    <div
      className="
        relative
        h-screen w-screen
        overflow-hidden
        bg-[var(--bg-primary)]
        select-none
      "
      style={
        {
          /* macOS 风格桌面渐变 */
          backgroundImage:
            "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(10,132,255,0.08), transparent)",
        } as React.CSSProperties
      }
    >
      {/* 壁纸装饰层 — 微弱栅格纹理 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
        aria-hidden="true"
      />
      {children}
    </div>
  );
}
