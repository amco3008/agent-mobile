import { create } from 'zustand'
import { subscribeToContainer, unsubscribeFromContainer } from '../api/socket'

interface DashboardState {
  zoomLevel: 1 | 2 | 3
  selectedSession: string | null
  selectedPane: string | null
  // Container filtering - null means "All Containers"
  selectedContainerId: string | null
  // Track previously selected container for cleanup
  previousContainerId: string | null
  setZoomLevel: (level: 1 | 2 | 3) => void
  setSelectedSession: (sessionId: string | null) => void
  setSelectedPane: (paneId: string | null) => void
  setSelectedContainer: (containerId: string | null) => void
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  zoomLevel: 1,
  selectedSession: null,
  selectedPane: null,
  selectedContainerId: null, // null = "All Containers"
  previousContainerId: null,
  setZoomLevel: (level) => set({ zoomLevel: level }),
  setSelectedSession: (sessionId) => set({ selectedSession: sessionId }),
  setSelectedPane: (paneId) => set({ selectedPane: paneId }),
  setSelectedContainer: (containerId) => {
    const current = get().selectedContainerId

    // Unsubscribe from previous container if it was a specific one
    if (current && current !== containerId) {
      unsubscribeFromContainer(current)
    }

    // Subscribe to new container if it's specific (not "All")
    if (containerId && containerId !== current) {
      subscribeToContainer(containerId)
    }

    set({
      selectedContainerId: containerId,
      previousContainerId: current,
    })
  },
}))
