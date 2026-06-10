import { create } from "zustand";
import { Window } from "./Window";
import type { WindowState, WindowConfig } from "../types";

/* ─── 常量 ─────────────────────────────────────── */

const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 360;
const OFFSET_STEP = 24;
const OFFSET_INITIAL = 60;

let nextWindowId = 0;

/** 生成自增的窗口 ID */
export function createWindowId(): string {
  nextWindowId += 1;
  return `window-${nextWindowId}`;
}

/* ─── Store ────────────────────────────────────── */

interface WindowStore {
  windows: Record<string, WindowState>;
  nextZIndex: number;
  openWindow: (config: WindowConfig) => void;
  closeWindow: (id: string) => void;
  toggleMinimize: (id: string) => void;
  toggleMaximize: (id: string) => void;
  focusWindow: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
}

export const useWindowStore = create<WindowStore>((set) => ({
  windows: {},
  nextZIndex: 1,

  openWindow: (config) =>
    set((state) => {
      const count = Object.keys(state.windows).length;
      const offset = OFFSET_INITIAL + count * OFFSET_STEP;
      const win: WindowState = {
        id: config.id,
        title: config.title,
        x: offset,
        y: offset,
        width: config.width ?? DEFAULT_WIDTH,
        height: config.height ?? DEFAULT_HEIGHT,
        minimized: false,
        zIndex: state.nextZIndex,
        maximized: false,
        prevX: 0,
        prevY: 0,
        prevWidth: DEFAULT_WIDTH,
        prevHeight: DEFAULT_HEIGHT,
        content: config.content,
      };
      return {
        windows: { ...state.windows, [config.id]: win },
        nextZIndex: state.nextZIndex + 1,
      };
    }),

  closeWindow: (id) =>
    set((state) => {
      const next = { ...state.windows };
      delete next[id];
      return { windows: next };
    }),

  toggleMinimize: (id) =>
    set((state) => {
      const win = state.windows[id];
      if (!win) return state;
      return {
        windows: {
          ...state.windows,
          [id]: { ...win, minimized: !win.minimized },
        },
      };
    }),

  toggleMaximize: (id) =>
    set((state) => {
      const win = state.windows[id];
      if (!win) return state;

      if (win.maximized) {
        // 还原
        return {
          windows: {
            ...state.windows,
            [id]: {
              ...win,
              maximized: false,
              x: win.prevX,
              y: win.prevY,
              width: win.prevWidth,
              height: win.prevHeight,
            },
          },
        };
      }

      // 最大化
      return {
        windows: {
          ...state.windows,
          [id]: {
            ...win,
            maximized: true,
            prevX: win.x,
            prevY: win.y,
            prevWidth: win.width,
            prevHeight: win.height,
            x: 0,
            y: 0,
            width: window.innerWidth,
            height: window.innerHeight,
          },
        },
      };
    }),

  focusWindow: (id) =>
    set((state) => {
      const win = state.windows[id];
      if (!win) return state;
      return {
        windows: {
          ...state.windows,
          [id]: { ...win, zIndex: state.nextZIndex },
        },
        nextZIndex: state.nextZIndex + 1,
      };
    }),

  moveWindow: (id, x, y) =>
    set((state) => {
      const win = state.windows[id];
      if (!win) return state;
      return {
        windows: {
          ...state.windows,
          [id]: { ...win, x, y },
        },
      };
    }),
}));

/* ─── 渲染组件 ─────────────────────────────────── */

/** 渲染所有已打开的窗口 */
export function WindowManager() {
  const windows = useWindowStore((s) => s.windows);
  const closeWindow = useWindowStore((s) => s.closeWindow);
  const toggleMinimize = useWindowStore((s) => s.toggleMinimize);
  const toggleMaximize = useWindowStore((s) => s.toggleMaximize);
  const focusWindow = useWindowStore((s) => s.focusWindow);
  const moveWindow = useWindowStore((s) => s.moveWindow);

  return (
    <>
      {Object.values(windows).map((win) => (
        <Window
          key={win.id}
          id={win.id}
          title={win.title}
          x={win.x}
          y={win.y}
          width={win.width}
          height={win.height}
          zIndex={win.zIndex}
          minimized={win.minimized}
          maximized={win.maximized}
          onClose={closeWindow}
          onMinimize={toggleMinimize}
          onMaximize={toggleMaximize}
          onFocus={focusWindow}
          onMove={moveWindow}
        >
          {win.content}
        </Window>
      ))}
    </>
  );
}
