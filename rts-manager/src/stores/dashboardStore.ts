import { create } from 'zustand'

interface DashboardState {
  zoomLevel: 1 | 2 | 3
  selectedSession: string | null
  selectedPane: string | null
  // Container filtering - null means "All Containers"
  selectedContainerId: string | null
  setZoomLevel: (level: 1 | 2 | 3) => void
  setSelectedSession: (sessionId: string | null) => void
  setSelectedPane: (paneId: string | null) => void
  setSelectedContainer: (containerId: string | null) => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  zoomLevel: 1,
  selectedSession: null,
  selectedPane: null,
  selectedContainerId: null, // null = "All Containers"
  setZoomLevel: (level) => set({ zoomLevel: level }),
  setSelectedSession: (sessionId) => set({ selectedSession: sessionId }),
  setSelectedPane: (paneId) => set({ selectedPane: paneId }),
  setSelectedContainer: (containerId) => set({ selectedContainerId: containerId }),
}))
