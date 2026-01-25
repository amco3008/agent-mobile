import { create } from 'zustand'
import type { TmuxSession, RalphLoop, SystemStats, SteeringQuestion, RalphProgress, RalphSummary } from '../types'

interface SocketState {
  // Connection state
  connected: boolean
  connectionError: string | null

  // Server-pushed data
  tmuxSessions: TmuxSession[]
  ralphLoops: Map<string, RalphLoop>
  systemStats: SystemStats | null

  // Ralph progress/steering/summary (keyed by taskId) - now using parsed types
  ralphProgress: Map<string, RalphProgress>
  ralphSteering: Map<string, SteeringQuestion>
  ralphSummaries: Map<string, RalphSummary>

  // Actions
  setConnected: (connected: boolean) => void
  setConnectionError: (error: string | null) => void
  setTmuxSessions: (sessions: TmuxSession[]) => void
  updateRalphLoop: (loop: RalphLoop) => void
  removeRalphLoop: (taskId: string) => void
  setSystemStats: (stats: SystemStats) => void
  updateRalphProgress: (taskId: string, progress: RalphProgress) => void
  updateRalphSteering: (steering: SteeringQuestion) => void
  updateRalphSummary: (taskId: string, summary: RalphSummary) => void

  // Selectors
  getRalphLoopsArray: () => RalphLoop[]
}

export const useSocketStore = create<SocketState>((set, get) => ({
  // Initial state
  connected: false,
  connectionError: null,
  tmuxSessions: [],
  ralphLoops: new Map(),
  systemStats: null,
  ralphProgress: new Map(),
  ralphSteering: new Map(),
  ralphSummaries: new Map(),

  // Actions
  setConnected: (connected) => set({ connected, connectionError: connected ? null : get().connectionError }),

  setConnectionError: (error) => set({ connectionError: error }),

  setTmuxSessions: (sessions) => set({ tmuxSessions: sessions }),

  updateRalphLoop: (loop) => set((state) => {
    const newLoops = new Map(state.ralphLoops)
    newLoops.set(loop.taskId, loop)
    return { ralphLoops: newLoops }
  }),

  removeRalphLoop: (taskId) => set((state) => {
    const newLoops = new Map(state.ralphLoops)
    newLoops.delete(taskId)
    return { ralphLoops: newLoops }
  }),

  setSystemStats: (stats) => set({ systemStats: stats }),

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

  updateRalphSummary: (taskId, summary) => set((state) => {
    const newSummaries = new Map(state.ralphSummaries)
    newSummaries.set(taskId, summary)
    return { ralphSummaries: newSummaries }
  }),

  // Selectors
  getRalphLoopsArray: () => Array.from(get().ralphLoops.values()),
}))
