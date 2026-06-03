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

// ===== Pi Config API =====

export interface PiSettings {
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: string;
}

export interface PiAuthEntryPublic {
  type: string;
}

export interface PiConfigResponse {
  settings: PiSettings;
  auth: Record<string, PiAuthEntryPublic>;
}

export async function fetchPiConfig(): Promise<PiConfigResponse> {
  const res = await fetch("/api/pi-config");
  return handleResponse<PiConfigResponse>(res);
}

export async function updatePiSettings(settings: PiSettings): Promise<boolean> {
  const res = await fetch("/api/pi-config/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  return handleResponse<boolean>(res);
}

export async function updatePiAuth(
  provider: string,
  authType: string,
  key: string,
): Promise<boolean> {
  const res = await fetch("/api/pi-config/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, type: authType, key }),
  });
  return handleResponse<boolean>(res);
}

export async function deletePiAuth(provider: string): Promise<boolean> {
  const res = await fetch(`/api/pi-config/auth/${provider}`, {
    method: "DELETE",
  });
  return handleResponse<boolean>(res);
}
