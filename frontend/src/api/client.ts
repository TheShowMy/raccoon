import type { Project } from "../stores/useAppStore";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) {
    throw new Error(json.error || "请求失败");
  }
  if (json.data === undefined) {
    throw new Error("响应中缺少 data 字段");
  }
  return json.data;
}

export async function fetchPiStatus(): Promise<boolean> {
  const res = await fetch("/api/pi-status");
  const json = await res.json();
  return json.installed as boolean;
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch("/api/projects");
  return handleResponse<Project[]>(res);
}

export async function createProject(
  name: string,
  gitUrl: string,
): Promise<Project> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, git_url: gitUrl }),
  });
  return handleResponse<Project>(res);
}

export async function deleteProject(id: number): Promise<boolean> {
  const res = await fetch(`/api/projects/${id}`, {
    method: "DELETE",
  });
  return handleResponse<boolean>(res);
}

// ===== Pi Models API =====

export interface PiModel {
  id: string;
  name: string;
  api: string;
  provider: string;
  baseUrl?: string;
  reasoning: boolean;
  input: string[];
  contextWindow: number;
  maxTokens: number;
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

export async function fetchPiModels(): Promise<PiModel[]> {
  const res = await fetch("/api/models");
  return handleResponse<PiModel[]>(res);
}

// ===== Model Identity API =====

export interface ModelIdentity {
  id: number;
  name: string;
  provider: string;
  model: string;
  thinkingLevel: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
}

export async function fetchModelIdentities(): Promise<ModelIdentity[]> {
  const res = await fetch("/api/model-identities");
  return handleResponse<ModelIdentity[]>(res);
}

export async function createModelIdentity(
  identity: Omit<ModelIdentity, "id" | "sortOrder" | "createdAt">,
): Promise<ModelIdentity> {
  const res = await fetch("/api/model-identities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(identity),
  });
  return handleResponse<ModelIdentity>(res);
}

export async function updateModelIdentity(
  id: number,
  identity: Omit<ModelIdentity, "id" | "sortOrder" | "createdAt">,
): Promise<boolean> {
  const res = await fetch(`/api/model-identities/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(identity),
  });
  return handleResponse<boolean>(res);
}

export async function deleteModelIdentity(id: number): Promise<boolean> {
  const res = await fetch(`/api/model-identities/${id}`, {
    method: "DELETE",
  });
  return handleResponse<boolean>(res);
}

// ===== Model Settings API =====

export interface ModelSetting {
  provider: string;
  model: string;
  enabled: boolean;
}

export async function fetchModelSettings(): Promise<ModelSetting[]> {
  const res = await fetch("/api/model-settings");
  return handleResponse<ModelSetting[]>(res);
}

export async function updateModelSetting(
  setting: ModelSetting,
): Promise<ModelSetting> {
  const res = await fetch("/api/model-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(setting),
  });
  return handleResponse<ModelSetting>(res);
}
