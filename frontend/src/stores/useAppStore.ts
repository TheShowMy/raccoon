import { create } from "zustand";

const STORAGE_KEY = "raccoon:currentProjectId";
const SEND_WITH_ENTER_KEY = "raccoon:sendWithEnter";
const SIDEBAR_COLLAPSED_KEY = "raccoon:sidebarCollapsed";

function loadStoredProjectId(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const id = Number(raw);
    return Number.isNaN(id) ? null : id;
  } catch {
    return null;
  }
}

function saveStoredProjectId(id: number | null) {
  try {
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, String(id));
    }
  } catch {
    // ignore localStorage errors
  }
}

function loadSendWithEnter(): boolean {
  try {
    const raw = localStorage.getItem(SEND_WITH_ENTER_KEY);
    return raw === "true";
  } catch {
    return false;
  }
}

function saveSendWithEnter(value: boolean) {
  try {
    localStorage.setItem(SEND_WITH_ENTER_KEY, String(value));
  } catch {
    // ignore localStorage errors
  }
}

function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function saveSidebarCollapsed(value: boolean) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(value));
  } catch {
    // ignore localStorage errors
  }
}

function resolveCurrentProjectId(
  projects: Project[],
  preferredId: number | null,
): number | null {
  if (projects.length === 0) return null;

  // If preferred ID exists in the list, use it
  if (preferredId !== null && projects.some((p) => p.id === preferredId)) {
    return preferredId;
  }

  // Otherwise select the first project
  return projects[0].id;
}

export interface Project {
  id: number;
  name: string;
  gitUrl: string;
  localPath?: string | null;
  cloneStatus?: "pending" | "cloning" | "ready" | "failed" | string;
  cloneError?: string | null;
  lastSyncedAt?: string | null;
  prEnabled?: boolean;
  prAutoMerge?: boolean;
  prTargetBranch?: string;
  prMergeStrategy?: string;
  githubToken?: string | null;
  createdAt: string;
}

interface AppState {
  piInstalled: boolean | null;
  projects: Project[];
  currentProjectId: number | null;
  showAddModal: boolean;
  showSettings: boolean;
  sendWithEnter: boolean;
  sidebarCollapsed: boolean;

  setPiInstalled: (v: boolean) => void;
  setProjects: (p: Project[]) => void;
  addProject: (p: Project) => void;
  updateProject: (p: Project) => void;
  removeProject: (id: number) => void;
  setCurrentProject: (id: number | null) => void;
  openAddModal: () => void;
  closeAddModal: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  setSendWithEnter: (v: boolean) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  piInstalled: null,
  projects: [],
  currentProjectId: null,
  showAddModal: false,
  showSettings: false,
  sendWithEnter: loadSendWithEnter(),
  sidebarCollapsed: loadSidebarCollapsed(),

  setPiInstalled: (v) => set({ piInstalled: v }),

  setProjects: (projects) => {
    const preferredId = loadStoredProjectId();
    const currentProjectId = resolveCurrentProjectId(projects, preferredId);
    if (currentProjectId !== null) {
      saveStoredProjectId(currentProjectId);
    }
    set({ projects, currentProjectId });
  },

  addProject: (p) =>
    set((state) => {
      const projects = [p, ...state.projects];
      // If this is the first project, auto-select it
      const currentProjectId =
        state.currentProjectId === null ? p.id : state.currentProjectId;
      if (currentProjectId !== null) {
        saveStoredProjectId(currentProjectId);
      }
      return { projects, currentProjectId };
    }),

  updateProject: (p) =>
    set((state) => {
      const exists = state.projects.some((project) => project.id === p.id);
      const projects = exists
        ? state.projects.map((project) => (project.id === p.id ? p : project))
        : [p, ...state.projects];
      const currentProjectId =
        state.currentProjectId === null ? p.id : state.currentProjectId;
      if (state.currentProjectId === null) {
        saveStoredProjectId(currentProjectId);
      }
      return { projects, currentProjectId };
    }),

  removeProject: (id) =>
    set((state) => {
      const projects = state.projects.filter((p) => p.id !== id);
      let currentProjectId = state.currentProjectId;

      if (currentProjectId === id) {
        // Select the first remaining project, or null if empty
        currentProjectId = projects.length > 0 ? projects[0].id : null;
        saveStoredProjectId(currentProjectId);
      }

      return { projects, currentProjectId };
    }),

  setCurrentProject: (id) => {
    saveStoredProjectId(id);
    set({ currentProjectId: id });
  },

  openAddModal: () => set({ showAddModal: true }),
  closeAddModal: () => set({ showAddModal: false }),
  openSettings: () => set({ showSettings: true }),
  closeSettings: () => set({ showSettings: false }),
  setSendWithEnter: (v) => {
    saveSendWithEnter(v);
    set({ sendWithEnter: v });
  },
  toggleSidebar: () =>
    set((state) => {
      const sidebarCollapsed = !state.sidebarCollapsed;
      saveSidebarCollapsed(sidebarCollapsed);
      return { sidebarCollapsed };
    }),
  setSidebarCollapsed: (v) => {
    saveSidebarCollapsed(v);
    set({ sidebarCollapsed: v });
  },
}));
