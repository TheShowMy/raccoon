/** 深色模式预设 */
export type ThemeMode = "dark" | "light";

/** RPC 连接状态 */
export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

/** 任务节点 DAG 状态 */
export type NodeStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "skipped";

/** 通用分页参数 */
export interface PaginationParams {
  page: number;
  pageSize: number;
}

/** 通用 API 响应包装 */
export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

/** 时间戳（ISO 8601 字符串） */
export type Timestamp = string;

import type { ReactNode } from "react";

/** 窗口状态 */
export interface WindowState {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  zIndex: number;
  maximized: boolean;
  prevX: number;
  prevY: number;
  prevWidth: number;
  prevHeight: number;
  content?: ReactNode;
}

/** 窗口配置项（不含运行时状态） */
export interface WindowConfig {
  id: string;
  title: string;
  width?: number;
  height?: number;
  content?: ReactNode;
}

/** 窗口组件 Props */
export interface WindowProps {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
  maximized: boolean;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
  onMaximize: (id: string) => void;
  onFocus: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  children?: ReactNode;
}

/** 应用层共享常量 */
export const APP_NAME = "raccoon";
export const APP_VERSION = "0.0.1";
