import { create } from 'zustand'
import type { TmuxSession, RalphLoop, SystemStats } from '../types'

interface SocketState {
  // Connection state
  connected: boolean
  connectionError: string | null

  // Server-pushed data
  tmuxSessions: TmuxSession[]
  ralphLoops: Map<string, RalphLoop>
  systemStats: SystemStats | null

  // Ralph progress/steering content (keyed by taskId)
  ralphProgress: Map<string, string>
  ralphSteering: Map<string, { status: 'pending' | 'answered'; content: string }>
  ralphSummaries: Map<string, string>

  // Actions
  setConnected: (connected: boolean) => void
  setConnectionError: (error: string | null) => void
  setTmuxSessions: (sessions: TmuxSession[]) => void
  updateRalphLoop: (loop: RalphLoop) => void
  removeRalphLoop: (taskId: string) => void
  setSystemStats: (stats: SystemStats) => void
  updateRalphProgress: (taskId: string, content: string) => void
  updateRalphSteering: (taskId: string, status: 'pending' | 'answered', content: string) => void
  updateRalphSummary: (taskId: string, content: string) => void

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

  updateRalphProgress: (taskId, content) => set((state) => {
    const newProgress = new Map(state.ralphProgress)
    newProgress.set(taskId, content)
    return { ralphProgress: newProgress }
  }),

  updateRalphSteering: (taskId, status, content) => set((state) => {
    const newSteering = new Map(state.ralphSteering)
    newSteering.set(taskId, { status, content })
    return { ralphSteering: newSteering }
  }),

  updateRalphSummary: (taskId, content) => set((state) => {
    const newSummaries = new Map(state.ralphSummaries)
    newSummaries.set(taskId, content)
    return { ralphSummaries: newSummaries }
  }),

  // Selectors
  getRalphLoopsArray: () => Array.from(get().ralphLoops.values()),
}))
