import { useCallback, useRef } from "react";

interface DragSnapshot {
  startMouseX: number;
  startMouseY: number;
  startX: number;
  startY: number;
}

/**
 * 标题栏拖拽 Hook。
 * 返回 onMouseDown 处理器，调用时传入当前窗口位置 (currentX, currentY)。
 */
export function useDraggable(onMove: (x: number, y: number) => void) {
  const snapshot = useRef<DragSnapshot | null>(null);

  const onMouseDown = useCallback(
    (
      e: { button: number; clientX: number; clientY: number; preventDefault: () => void },
      currentX: number,
      currentY: number,
    ) => {
      if (e.button !== 0) return;
      e.preventDefault();

      snapshot.current = {
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startX: currentX,
        startY: currentY,
      };

      const handleMouseMove = (ev: globalThis.MouseEvent) => {
        const snap = snapshot.current;
        if (!snap) return;
        onMove(
          snap.startX + ev.clientX - snap.startMouseX,
          snap.startY + ev.clientY - snap.startMouseY,
        );
      };

      const handleMouseUp = () => {
        snapshot.current = null;
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [onMove],
  );

  return { onMouseDown };
}
