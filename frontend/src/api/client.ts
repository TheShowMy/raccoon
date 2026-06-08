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

export async function fetchProject(id: number): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`);
  return handleResponse<Project>(res);
}

export async function fetchProjectFiles(
  projectId: number,
  query?: string,
): Promise<string[]> {
  const params = query ? `?query=${encodeURIComponent(query)}` : "";
  const res = await fetch(`/api/projects/${projectId}/files${params}`);
  return handleResponse<string[]>(res);
}

export async function closeJobAgent(jobId: number): Promise<boolean> {
  const res = await fetch(`/api/jobs/${jobId}/close-agent`, {
    method: "POST",
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

// ===== System Config API =====

export interface SystemConfig {
  id: number;
  coordinatorProvider: string;
  coordinatorModel: string;
  updatedAt: string;
}

export async function fetchSystemConfig(): Promise<SystemConfig> {
  const res = await fetch("/api/system-config");
  return handleResponse<SystemConfig>(res);
}

export async function updateSystemConfig(
  config: Omit<SystemConfig, "id" | "updatedAt">,
): Promise<boolean> {
  const res = await fetch("/api/system-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  return handleResponse<boolean>(res);
}

// ===== Worker Model Tier API =====

export interface WorkerModelTier {
  id: number;
  identity: string;
  tierLevel: number;
  provider: string;
  model: string;
  description: string;
  createdAt: string;
}

export async function fetchWorkerTiers(): Promise<WorkerModelTier[]> {
  const res = await fetch("/api/worker-tiers");
  return handleResponse<WorkerModelTier[]>(res);
}

export async function createWorkerTier(
  tier: Omit<WorkerModelTier, "id" | "createdAt">,
): Promise<WorkerModelTier> {
  const res = await fetch("/api/worker-tiers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tier),
  });
  return handleResponse<WorkerModelTier>(res);
}

export async function updateWorkerTier(
  id: number,
  tier: Omit<WorkerModelTier, "id" | "createdAt">,
): Promise<boolean> {
  const res = await fetch(`/api/worker-tiers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tier),
  });
  return handleResponse<boolean>(res);
}

export async function deleteWorkerTier(id: number): Promise<boolean> {
  const res = await fetch(`/api/worker-tiers/${id}`, {
    method: "DELETE",
  });
  return handleResponse<boolean>(res);
}

// ===== Task Thinking Policies API =====

export interface TaskThinkingPolicy {
  taskType: string;
  defaultLevel: string;
}

export async function fetchThinkingPolicies(): Promise<TaskThinkingPolicy[]> {
  const res = await fetch("/api/thinking-policies");
  return handleResponse<TaskThinkingPolicy[]>(res);
}

// ===== Job / Clarification API =====

export type JobStatus =
  | "analyzing"
  | "clarifying"
  | "draft_ready"
  | "archived"
  | "failed"
  | string;

export interface Job {
  id: number;
  projectId: number;
  title: string;
  originalRequirement: string;
  status: JobStatus;
  currentStage: string;
  coordinatorSessionId?: string | null;
  coordinatorSessionFile?: string | null;
  clarificationRound: number;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobMessage {
  id: number;
  jobId: number;
  role: "user" | "coordinator" | "system" | string;
  content: string;
  metadataJson?: string;
  createdAt: string;
}

export interface ClarificationOption {
  label: string;
  description: string;
  recommended: boolean;
}

export interface ClarificationAnswer {
  selectedOptions: string[];
  customText?: string;
}

export interface ClarificationItem {
  id: number;
  jobId: number;
  question: string;
  questionType: "single_choice" | "multi_choice" | "free_text" | string;
  options: ClarificationOption[];
  allowCustom: boolean;
  answer?: ClarificationAnswer;
  answeredAt?: string;
  createdAt: string;
}

export interface TaskDraft {
  id: number;
  jobId: number;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  status: string;
  createdAt: string;
}

export interface JobDetail {
  job: Job;
  messages: JobMessage[];
  clarifications: ClarificationItem[];
  taskDrafts: TaskDraft[];
}

export interface SubmitClarificationAnswer {
  clarificationId: number;
  selectedOptions: string[];
  customText?: string;
}

export async function fetchProjectJobs(
  projectId: number,
  includeArchived = false,
): Promise<Job[]> {
  const params = includeArchived ? "?includeArchived=true" : "";
  const res = await fetch(`/api/projects/${projectId}/jobs${params}`);
  return handleResponse<Job[]>(res);
}

export async function createJob(
  projectId: number,
  requirement: string,
): Promise<JobDetail> {
  const res = await fetch(`/api/projects/${projectId}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requirement }),
  });
  return handleResponse<JobDetail>(res);
}

export async function fetchJobDetail(jobId: number): Promise<JobDetail> {
  const res = await fetch(`/api/jobs/${jobId}`);
  return handleResponse<JobDetail>(res);
}

export async function submitClarifications(
  jobId: number,
  answers: SubmitClarificationAnswer[],
): Promise<JobDetail> {
  const res = await fetch(`/api/jobs/${jobId}/clarifications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  return handleResponse<JobDetail>(res);
}

export async function confirmJob(jobId: number): Promise<JobDetail> {
  const res = await fetch(`/api/jobs/${jobId}/confirm`, {
    method: "POST",
  });
  return handleResponse<JobDetail>(res);
}

export async function deleteJob(jobId: number): Promise<boolean> {
  const res = await fetch(`/api/jobs/${jobId}`, {
    method: "DELETE",
  });
  return handleResponse<boolean>(res);
}

export async function appendJobMessage(
  jobId: number,
  content: string,
): Promise<JobDetail> {
  const res = await fetch(`/api/jobs/${jobId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  return handleResponse<JobDetail>(res);
}
