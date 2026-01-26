import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '../types'
import { useSocketStore } from '../stores/socketStore'

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>

// Singleton socket instance
let socket: TypedSocket | null = null
let initialized = false

export function getSocket(): TypedSocket {
  if (!socket) {
    socket = io({
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })
  }

  // Set up event listeners only once
  if (!initialized && socket) {
    initialized = true
    setupSocketListeners(socket)
  }

  return socket
}

function setupSocketListeners(socket: TypedSocket) {
  const store = useSocketStore.getState()

  // Connection events
  socket.on('connect', () => {
    console.log('Socket connected:', socket.id)
    store.setConnected(true)
    store.setConnectionError(null)
  })

  socket.on('disconnect', () => {
    console.log('Socket disconnected')
    store.setConnected(false)
    // Clear stale data - will be refreshed on reconnect
    store.clearStaleData()
  })

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error)
    store.setConnectionError(error.message)
  })

  // Tmux events
  socket.on('tmux:sessions:update', (sessions) => {
    store.setTmuxSessions(sessions)
  })

  // Ralph events
  socket.on('ralph:loop:update', (loop) => {
    // Handle the "removed" state (cancelled with empty data)
    if (loop.status === 'cancelled' && loop.iteration === 0 && loop.maxIterations === 0) {
      store.removeRalphLoop(loop.taskId)
    } else {
      store.updateRalphLoop(loop)
    }
  })

  socket.on('ralph:progress:update', ({ taskId, progress }) => {
    store.updateRalphProgress(taskId, progress)
  })

  socket.on('ralph:steering:pending', ({ taskId, steering }) => {
    store.updateRalphSteering(steering)
    // Also update the loop's steering status
    const loops = useSocketStore.getState().ralphLoops
    const loop = loops.get(taskId)
    if (loop) {
      store.updateRalphLoop({ ...loop, steeringStatus: 'pending' })
    }
  })

  socket.on('ralph:steering:answered', ({ taskId, steering }) => {
    store.updateRalphSteering(steering)
    // Also update the loop's steering status
    const loops = useSocketStore.getState().ralphLoops
    const loop = loops.get(taskId)
    if (loop) {
      store.updateRalphLoop({ ...loop, steeringStatus: 'answered' })
    }
  })

  socket.on('ralph:summary:created', ({ taskId, summary }) => {
    store.updateRalphSummary(taskId, summary)
  })

  // System stats
  socket.on('system:stats', (stats) => {
    store.setSystemStats(stats)
  })

  // Container events
  socket.on('containers:update', (containers) => {
    store.setContainers(containers)
  })
}

// Initialize socket on module load to start receiving events immediately
// This ensures we don't miss any initial data pushed by the server
if (typeof window !== 'undefined') {
  getSocket()
}

export function subscribeToTerminal(sessionId: string, paneId: string) {
  const s = getSocket()
  s.emit('tmux:subscribe', { sessionId, paneId })
}

export function unsubscribeFromTerminal(sessionId: string, paneId: string) {
  const s = getSocket()
  s.emit('tmux:unsubscribe', { sessionId, paneId })
}

export function sendTerminalInput(sessionId: string, paneId: string, data: string) {
  const s = getSocket()
  s.emit('tmux:input', { sessionId, paneId, data })
}

export function sendTerminalResize(sessionId: string, paneId: string, cols: number, rows: number) {
  const s = getSocket()
  s.emit('tmux:resize', { sessionId, paneId, cols, rows })
}

export function subscribeToRalphLoop(taskId: string) {
  const s = getSocket()
  s.emit('ralph:subscribe', { taskId })
}

export function unsubscribeFromRalphLoop(taskId: string) {
  const s = getSocket()
  s.emit('ralph:unsubscribe', { taskId })
}
