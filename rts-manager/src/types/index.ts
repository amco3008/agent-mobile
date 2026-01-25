// Tmux types
export interface TmuxSession {
  id: string
  name: string
  created: Date
  attached: boolean
  windows: TmuxWindow[]
}

export interface TmuxWindow {
  id: number
  name: string
  active: boolean
  panes: TmuxPane[]
  layout: string
}

export interface TmuxPane {
  id: number
  active: boolean
  width: number
  height: number
  command: string
  pid: number
  title: string
}

// Ralph types
export interface RalphLoop {
  taskId: string
  projectPath: string
  iteration: number
  maxIterations: number
  completionPromise: string | null
  mode: 'yolo' | 'review'
  startedAt: Date
  stateFile: string
  progressFile: string | null
  steeringFile: string | null
  steeringStatus: 'none' | 'pending' | 'answered'
  status: 'running' | 'completed' | 'cancelled' | 'max_reached'
}

// System types
export interface SystemStats {
  cpu: {
    usage: number
    cores: number
  }
  memory: {
    used: number
    total: number
    percent: number
  }
  uptime: number
  claudeProcesses: ProcessInfo[]
}

export interface ProcessInfo {
  name: string
  pid: number
  cpu: number
  memory: number
}

// Socket events
export interface ServerToClientEvents {
  'tmux:sessions:update': (sessions: TmuxSession[]) => void
  'tmux:pane:output': (data: { sessionId: string; paneId: string; data: string }) => void
  'ralph:loop:update': (loop: RalphLoop) => void
  'ralph:iteration': (data: { taskId: string; iteration: number; max: number }) => void
  'system:stats': (stats: SystemStats) => void
}

export interface ClientToServerEvents {
  'tmux:subscribe': (data: { sessionId: string; paneId: string }) => void
  'tmux:unsubscribe': (data: { sessionId: string; paneId: string }) => void
  'tmux:input': (data: { sessionId: string; paneId: string; data: string }) => void
  'ralph:subscribe': (data: { taskId: string }) => void
}
