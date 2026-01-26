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
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000, // Max 10s between retries (exponential backoff)
    })
  }

  // Set up event listeners only once
  if (!initialized && socket) {
    initialized = true
    setupSocketListeners(socket)
  }

  return socket
}

/**
 * Safe wrapper for socket event handlers to prevent crashes
 */
function safeHandler<T>(handler: (data: T) => void): (data: T) => void {
  return (data: T) => {
    try {
      handler(data)
    } catch (error) {
      console.error('Socket handler error:', error)
    }
  }
}

function setupSocketListeners(socket: TypedSocket) {
  const store = useSocketStore.getState()

  // Remove any existing listeners to prevent accumulation on hot reload or reconnect edge cases
  socket.removeAllListeners()

  // Connection events (no data passed)
  socket.on('connect', () => {
    try {
      console.log('Socket connected:', socket.id)
      store.setConnected(true)
      store.setConnectionError(null)
    } catch (error) {
      console.error('Socket connect handler error:', error)
    }
  })

  socket.on('disconnect', () => {
    try {
      console.log('Socket disconnected')
      store.setConnected(false)
      // Clear stale data - will be refreshed on reconnect
      store.clearStaleData()
    } catch (error) {
      console.error('Socket disconnect handler error:', error)
    }
  })

  socket.on('connect_error', (error: Error) => {
    try {
      console.error('Socket connection error:', error)
      store.setConnectionError(error.message)
    } catch (err) {
      console.error('Socket connect_error handler error:', err)
    }
  })

  // Tmux events
  socket.on('tmux:sessions:update', safeHandler((sessions) => {
    store.setTmuxSessions(sessions)
  }))

  // Ralph events
  socket.on('ralph:loop:update', safeHandler((loop) => {
    // Handle the "removed" state (cancelled with empty data)
    if (loop.status === 'cancelled' && loop.iteration === 0 && loop.maxIterations === 0) {
      store.removeRalphLoop(loop.taskId)
    } else {
      store.updateRalphLoop(loop)
    }
  }))

  socket.on('ralph:progress:update', safeHandler(({ taskId, progress }) => {
    store.updateRalphProgress(taskId, progress)
  }))

  socket.on('ralph:steering:pending', safeHandler(({ taskId: _taskId, steering }) => {
    // Use atomic update to prevent race conditions
    store.updateRalphSteeringAndLoop(steering)
  }))

  socket.on('ralph:steering:answered', safeHandler(({ taskId: _taskId, steering }) => {
    // Use atomic update to prevent race conditions
    store.updateRalphSteeringAndLoop(steering)
  }))

  socket.on('ralph:summary:created', safeHandler(({ taskId, summary }) => {
    store.updateRalphSummary(taskId, summary)
  }))

  // Spec created (for auto-launch notifications)
  socket.on('ralph:spec:created', safeHandler(({ taskId, spec, projectPath }) => {
    store.addPendingSpec({
      taskId,
      spec,
      projectPath,
      createdAt: new Date(),
    })
  }))

  // System stats
  socket.on('system:stats', safeHandler((stats) => {
    store.setSystemStats(stats)
  }))

  // Container events
  socket.on('containers:update', safeHandler((containers) => {
    store.setContainers(containers)
  }))

  // Cross-container events
  socket.on('container:tmux:update', safeHandler(({ containerId, sessions }) => {
    store.setContainerTmuxSessions(containerId, sessions)
  }))

  socket.on('container:ralph:update', safeHandler(({ containerId, loops }) => {
    store.setContainerRalphLoops(containerId, loops)
  }))

  socket.on('container:ralph:steering', safeHandler(({ containerId, taskId: _taskId, steering }) => {
    store.updateContainerSteering(containerId, steering)
  }))

  socket.on('error', safeHandler(({ message }) => {
    console.error('Socket error:', message)
  }))
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

// Cross-container subscriptions
export function subscribeToContainer(containerId: string) {
  const s = getSocket()
  const store = useSocketStore.getState()
  s.emit('container:subscribe', { containerId })
  store.addSubscribedContainer(containerId)
}

export function unsubscribeFromContainer(containerId: string) {
  const s = getSocket()
  const store = useSocketStore.getState()
  s.emit('container:unsubscribe', { containerId })
  store.removeSubscribedContainer(containerId)
}
