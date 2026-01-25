import { create } from 'zustand'

interface DashboardState {
  zoomLevel: 1 | 2 | 3
  selectedSession: string | null
  selectedPane: string | null
  setZoomLevel: (level: 1 | 2 | 3) => void
  setSelectedSession: (sessionId: string | null) => void
  setSelectedPane: (paneId: string | null) => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  zoomLevel: 1,
  selectedSession: null,
  selectedPane: null,
  setZoomLevel: (level) => set({ zoomLevel: level }),
  setSelectedSession: (sessionId) => set({ selectedSession: sessionId }),
  setSelectedPane: (paneId) => set({ selectedPane: paneId }),
}))
