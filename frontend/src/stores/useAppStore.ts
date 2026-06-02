import { create } from "zustand";

export interface Project {
  id: number;
  name: string;
  git_url: string;
  created_at: string;
}

interface AppState {
  piInstalled: boolean | null;
  projects: Project[];
  currentProjectId: number | null;
  showAddModal: boolean;
  showSettings: boolean;

  setPiInstalled: (v: boolean) => void;
  setProjects: (p: Project[]) => void;
  addProject: (p: Project) => void;
  removeProject: (id: number) => void;
  setCurrentProject: (id: number | null) => void;
  openAddModal: () => void;
  closeAddModal: () => void;
  openSettings: () => void;
  closeSettings: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  piInstalled: null,
  projects: [],
  currentProjectId: null,
  showAddModal: false,
  showSettings: false,

  setPiInstalled: (v) => set({ piInstalled: v }),
  setProjects: (p) => set({ projects: p }),
  addProject: (p) => set((state) => ({ projects: [p, ...state.projects] })),
  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProjectId:
        state.currentProjectId === id ? null : state.currentProjectId,
    })),
  setCurrentProject: (id) => set({ currentProjectId: id }),
  openAddModal: () => set({ showAddModal: true }),
  closeAddModal: () => set({ showAddModal: false }),
  openSettings: () => set({ showSettings: true }),
  closeSettings: () => set({ showSettings: false }),
}));
