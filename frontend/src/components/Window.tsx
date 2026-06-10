import { useCallback } from "react";
import { X, Minus, Square } from "lucide-react";
import { useDraggable } from "../hooks/useDraggable";
import type { WindowProps } from "../types";

export function Window({
  id,
  title,
  x,
  y,
  width,
  height,
  zIndex,
  minimized,
  maximized,
  onClose,
  onMinimize,
  onMaximize,
  onFocus,
  onMove,
  children,
}: WindowProps) {
  const { onMouseDown } = useDraggable(
    useCallback(
      (newX: number, newY: number) => onMove(id, newX, newY),
      [id, onMove],
    ),
  );

  if (minimized) return null;

  return (
    <div
      className="absolute rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col bg-white"
      style={{ left: x, top: y, width, height, zIndex }}
      onMouseDown={() => onFocus(id)}
    >
      {/* 标题栏（拖拽手柄） */}
      <div
        className="flex items-center h-10 bg-slate-800 text-white select-none cursor-grab active:cursor-grabbing shrink-0"
        onMouseDown={(e) => onMouseDown(e, x, y)}
      >
        <span className="flex-1 text-xs font-medium px-3 truncate">
          {title}
        </span>

        {/* 最小化 */}
        <button
          type="button"
          className="flex items-center justify-center w-9 h-9 hover:bg-slate-600 transition-colors shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onMinimize(id);
          }}
          title="最小化"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        {/* 最大化 / 还原 */}
        <button
          type="button"
          className="flex items-center justify-center w-9 h-9 hover:bg-slate-600 transition-colors shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onMaximize(id);
          }}
          title={maximized ? "还原" : "最大化"}
        >
          <Square className="w-3 h-3" />
        </button>

        {/* 关闭 */}
        <button
          type="button"
          className="flex items-center justify-center w-9 h-9 hover:bg-red-500 transition-colors shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onClose(id);
          }}
          title="关闭"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 min-h-0 overflow-auto bg-white">{children}</div>
    </div>
  );
}
