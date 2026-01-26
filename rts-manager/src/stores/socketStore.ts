import { create } from 'zustand'
import type { TmuxSession, RalphLoop, SystemStats, SteeringQuestion, RalphProgress, RalphSummary, Container, PendingSpec } from '../types'

interface SocketState {
  // Connection state
  connected: boolean
  connectionError: string | null

  // Server-pushed data (local container)
  tmuxSessions: TmuxSession[]
  ralphLoops: Map<string, RalphLoop>
  systemStats: SystemStats | null
  containers: Container[]

  // Ralph progress/steering/summary (keyed by taskId) - now using parsed types
  ralphProgress: Map<string, RalphProgress>
  ralphSteering: Map<string, SteeringQuestion>
  ralphSummaries: Map<string, RalphSummary>

  // Pending specs for auto-launch notifications
  pendingSpecs: PendingSpec[]

  // Cross-container data (remote containers)
  // Key format: containerId
  containerTmuxSessions: Map<string, TmuxSession[]>
  containerRalphLoops: Map<string, Map<string, RalphLoop>>
  containerSteering: Map<string, Map<string, SteeringQuestion>>

  // Currently selected container for viewing (null = local/all)
  selectedContainerId: string | null

  // Set of container IDs we're subscribed to
  subscribedContainers: Set<string>

  // Actions
  setConnected: (connected: boolean) => void
  setConnectionError: (error: string | null) => void
  setTmuxSessions: (sessions: TmuxSession[]) => void
  updateRalphLoop: (loop: RalphLoop) => void
  removeRalphLoop: (taskId: string) => void
  setSystemStats: (stats: SystemStats) => void
  setContainers: (containers: Container[]) => void
  updateRalphProgress: (taskId: string, progress: RalphProgress) => void
  updateRalphSteering: (steering: SteeringQuestion) => void
  updateRalphSteeringAndLoop: (steering: SteeringQuestion) => void
  updateRalphSummary: (taskId: string, summary: RalphSummary) => void
  addPendingSpec: (spec: PendingSpec) => void
  removePendingSpec: (taskId: string) => void
  clearStaleData: () => void

  // Cross-container actions
  setContainerTmuxSessions: (containerId: string, sessions: TmuxSession[]) => void
  setContainerRalphLoops: (containerId: string, loops: RalphLoop[]) => void
  updateContainerSteering: (containerId: string, steering: SteeringQuestion) => void
  setSelectedContainer: (containerId: string | null) => void
  addSubscribedContainer: (containerId: string) => void
  removeSubscribedContainer: (containerId: string) => void

  // Selectors - memoized
  getRalphLoopsArray: () => RalphLoop[]
  getContainerLoopsArray: (containerId: string) => RalphLoop[]
  getAllLoopsArray: () => RalphLoop[]
}

// Memoized selector cache
let cachedLoopsArray: RalphLoop[] = []
let cachedLoopsMap: Map<string, RalphLoop> | null = null
let cachedAllLoopsArray: RalphLoop[] = []
let cachedAllLoopsVersion = 0
let currentAllLoopsVersion = 0

export const useSocketStore = create<SocketState>((set, get) => ({
  // Initial state
  connected: false,
  connectionError: null,
  tmuxSessions: [],
  ralphLoops: new Map(),
  systemStats: null,
  containers: [],
  ralphProgress: new Map(),
  ralphSteering: new Map(),
  ralphSummaries: new Map(),
  pendingSpecs: [],

  // Cross-container state
  containerTmuxSessions: new Map(),
  containerRalphLoops: new Map(),
  containerSteering: new Map(),
  selectedContainerId: null,
  subscribedContainers: new Set(),

  // Actions
  setConnected: (connected) => set({ connected, connectionError: connected ? null : get().connectionError }),

  setConnectionError: (error) => set({ connectionError: error }),

  setTmuxSessions: (sessions) => set({ tmuxSessions: sessions }),

  updateRalphLoop: (loop) => set((state) => {
    const newLoops = new Map(state.ralphLoops)
    newLoops.set(loop.taskId, loop)
    // Invalidate cache
    cachedLoopsMap = null
    return { ralphLoops: newLoops }
  }),

  removeRalphLoop: (taskId) => set((state) => {
    const newLoops = new Map(state.ralphLoops)
    newLoops.delete(taskId)
    // Also clear related progress/steering/summaries
    const newProgress = new Map(state.ralphProgress)
    newProgress.delete(taskId)
    const newSteering = new Map(state.ralphSteering)
    newSteering.delete(taskId)
    const newSummaries = new Map(state.ralphSummaries)
    newSummaries.delete(taskId)
    // Invalidate cache
    cachedLoopsMap = null
    return {
      ralphLoops: newLoops,
      ralphProgress: newProgress,
      ralphSteering: newSteering,
      ralphSummaries: newSummaries,
    }
  }),

  setSystemStats: (stats) => set({ systemStats: stats }),

  setContainers: (containers) => set({ containers }),

  updateRalphProgress: (taskId, progress) => set((state) => {
    const newProgress = new Map(state.ralphProgress)
    newProgress.set(taskId, progress)
    return { ralphProgress: newProgress }
  }),

  updateRalphSteering: (steering) => set((state) => {
    const newSteering = new Map(state.ralphSteering)
    newSteering.set(steering.taskId, steering)
    return { ralphSteering: newSteering }
  }),

  // Atomic update of steering + loop status to prevent race conditions
  updateRalphSteeringAndLoop: (steering) => set((state) => {
    const newSteering = new Map(state.ralphSteering)
    newSteering.set(steering.taskId, steering)

    // Also update the loop's steeringStatus atomically
    const loop = state.ralphLoops.get(steering.taskId)
    if (loop) {
      const newLoops = new Map(state.ralphLoops)
      newLoops.set(steering.taskId, { ...loop, steeringStatus: steering.status })
      // Invalidate cache
      cachedLoopsMap = null
      return { ralphSteering: newSteering, ralphLoops: newLoops }
    }

    return { ralphSteering: newSteering }
  }),

  updateRalphSummary: (taskId, summary) => set((state) => {
    const newSummaries = new Map(state.ralphSummaries)
    newSummaries.set(taskId, summary)
    return { ralphSummaries: newSummaries }
  }),

  addPendingSpec: (spec) => set((state) => {
    // Don't add duplicates
    if (state.pendingSpecs.some(s => s.taskId === spec.taskId)) {
      return state
    }
    return { pendingSpecs: [...state.pendingSpecs, spec] }
  }),

  removePendingSpec: (taskId) => set((state) => ({
    pendingSpecs: state.pendingSpecs.filter(s => s.taskId !== taskId)
  })),

  clearStaleData: () => {
    // Invalidate cache
    cachedLoopsMap = null
    currentAllLoopsVersion++
    set({
      tmuxSessions: [],
      ralphLoops: new Map(),
      systemStats: null,
      containers: [],
      ralphProgress: new Map(),
      ralphSteering: new Map(),
      ralphSummaries: new Map(),
      pendingSpecs: [],
      containerTmuxSessions: new Map(),
      containerRalphLoops: new Map(),
      containerSteering: new Map(),
    })
  },

  // Cross-container actions
  setContainerTmuxSessions: (containerId, sessions) => set((state) => {
    const newMap = new Map(state.containerTmuxSessions)
    newMap.set(containerId, sessions)
    return { containerTmuxSessions: newMap }
  }),

  setContainerRalphLoops: (containerId, loops) => set((state) => {
    const newMap = new Map(state.containerRalphLoops)
    const loopsMap = new Map<string, RalphLoop>()
    for (const loop of loops) {
      loopsMap.set(loop.taskId, loop)
    }
    newMap.set(containerId, loopsMap)
    currentAllLoopsVersion++
    return { containerRalphLoops: newMap }
  }),

  updateContainerSteering: (containerId, steering) => set((state) => {
    const newMap = new Map(state.containerSteering)
    if (!newMap.has(containerId)) {
      newMap.set(containerId, new Map())
    }
    const containerMap = new Map(newMap.get(containerId)!)
    containerMap.set(steering.taskId, steering)
    newMap.set(containerId, containerMap)
    return { containerSteering: newMap }
  }),

  setSelectedContainer: (containerId) => set({ selectedContainerId: containerId }),

  addSubscribedContainer: (containerId) => set((state) => {
    const newSet = new Set(state.subscribedContainers)
    newSet.add(containerId)
    return { subscribedContainers: newSet }
  }),

  removeSubscribedContainer: (containerId) => set((state) => {
    const newSet = new Set(state.subscribedContainers)
    newSet.delete(containerId)
    // Also clean up container data
    const newTmux = new Map(state.containerTmuxSessions)
    newTmux.delete(containerId)
    const newLoops = new Map(state.containerRalphLoops)
    newLoops.delete(containerId)
    const newSteering = new Map(state.containerSteering)
    newSteering.delete(containerId)
    currentAllLoopsVersion++
    return {
      subscribedContainers: newSet,
      containerTmuxSessions: newTmux,
      containerRalphLoops: newLoops,
      containerSteering: newSteering,
    }
  }),

  // Selectors - memoized to avoid new array on each call
  getRalphLoopsArray: () => {
    const currentMap = get().ralphLoops
    // Return cached array if map hasn't changed
    if (cachedLoopsMap === currentMap) {
      return cachedLoopsArray
    }
    // Update cache
    cachedLoopsMap = currentMap
    cachedLoopsArray = Array.from(currentMap.values())
    return cachedLoopsArray
  },

  getContainerLoopsArray: (containerId: string) => {
    const containerLoops = get().containerRalphLoops.get(containerId)
    if (!containerLoops) return []
    return Array.from(containerLoops.values())
  },

  getAllLoopsArray: () => {
    // Return cached if version hasn't changed
    if (cachedAllLoopsVersion === currentAllLoopsVersion) {
      return cachedAllLoopsArray
    }

    const state = get()
    const allLoops: RalphLoop[] = []

    // Add local loops
    for (const loop of state.ralphLoops.values()) {
      allLoops.push(loop)
    }

    // Add container loops
    for (const [containerId, loopsMap] of state.containerRalphLoops) {
      for (const loop of loopsMap.values()) {
        // Add containerId to loop for identification
        allLoops.push({ ...loop, containerId })
      }
    }

    cachedAllLoopsArray = allLoops
    cachedAllLoopsVersion = currentAllLoopsVersion
    return allLoops
  },
}))
