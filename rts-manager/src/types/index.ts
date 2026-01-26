// Re-export container types
export * from './container'

// Tmux types
export interface TmuxSession {
  id: string
  name: string
  created: Date
  attached: boolean
  windows: TmuxWindow[]
  // Container info (for multi-container support)
  containerId?: string
  containerName?: string
}

// Simplified container session info (from remote exec)
export interface ContainerSession {
  id: string
  name: string
  containerId: string
  containerName: string
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

// Ralph spec parsed from ralph-spec-{task-id}.md
export interface RalphSpec {
  taskId: string
  maxIterations: number
  completionPromise: string | null
  mode: 'yolo' | 'review'
  taskContent: string        // The task body (after frontmatter)
  taskSummary: string        // First paragraph for preview
  specFile: string           // Full path to spec file
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
  stateFile: string | null   // null for fresh mode
  progressFile: string | null
  steeringFile: string | null
  steeringStatus: 'none' | 'pending' | 'answered'
  status: 'running' | 'completed' | 'cancelled' | 'max_reached'
  loopType: 'persistent' | 'fresh'  // Which mode the loop is running in
  spec?: RalphSpec           // Parsed spec if available
  logsDir?: string           // For fresh mode: ralph-logs-{task-id}/
}

// Parsed steering question from ralph-steering-{task-id}.md
export interface SteeringQuestion {
  taskId: string
  status: 'pending' | 'answered'
  iteration: number
  timestamp: string
  question: string
  context?: string
  options?: string[]
  response?: string
}

// Parsed progress from ralph-progress-{task-id}.md
export interface RalphProgress {
  taskId: string
  content: string      // Raw markdown content
  summary?: string     // Extracted first paragraph/summary
  lastUpdate: Date
}

// Parsed summary from ralph-summary-{task-id}.md
export interface RalphSummary {
  taskId: string
  content: string      // Raw markdown content
  outcome: 'success' | 'failure' | 'partial' | 'unknown'
  completedAt: Date
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

// Pending spec notification (for auto-launch feature)
export interface PendingSpec {
  taskId: string
  spec: RalphSpec
  projectPath: string
  createdAt: Date
}

// Socket events
export interface ServerToClientEvents {
  'tmux:sessions:update': (sessions: TmuxSession[]) => void
  'tmux:pane:output': (data: { sessionId: string; paneId: string; data: string }) => void
  'ralph:loop:update': (loop: RalphLoop) => void
  'ralph:progress:update': (data: { taskId: string; progress: RalphProgress }) => void
  'ralph:steering:pending': (data: { taskId: string; steering: SteeringQuestion }) => void
  'ralph:steering:answered': (data: { taskId: string; steering: SteeringQuestion }) => void
  'ralph:summary:created': (data: { taskId: string; summary: RalphSummary }) => void
  'ralph:spec:created': (data: { taskId: string; spec: RalphSpec; projectPath: string }) => void
  'system:stats': (stats: SystemStats) => void
  'containers:update': (containers: import('./container').Container[]) => void
}

export interface ClientToServerEvents {
  'tmux:subscribe': (data: { sessionId: string; paneId: string }) => void
  'tmux:unsubscribe': (data: { sessionId: string; paneId: string }) => void
  'tmux:input': (data: { sessionId: string; paneId: string; data: string }) => void
  'tmux:resize': (data: { sessionId: string; paneId: string; cols: number; rows: number }) => void
  'ralph:subscribe': (data: { taskId: string }) => void
  'ralph:unsubscribe': (data: { taskId: string }) => void
}
