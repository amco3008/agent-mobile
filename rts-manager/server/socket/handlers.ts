import { Server, Socket } from 'socket.io'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import { TmuxService } from '../services/TmuxService'
import { RalphWatcher } from '../services/RalphWatcher'
import { SystemMonitor } from '../services/SystemMonitor'
import { terminalManager } from '../services/TerminalManager'
import { containerManager } from '../services/ContainerManager'
import { config } from '../config'
import type { ServerToClientEvents, ClientToServerEvents } from '../../src/types'

type IOServer = Server<ClientToServerEvents, ServerToClientEvents>
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>

const tmuxService = new TmuxService()
const ralphWatcher = new RalphWatcher()
const systemMonitor = new SystemMonitor()

// Rate limiter for high-frequency socket events (per socket ID)
// 50 events per second is generous for terminal input
const socketRateLimiter = new RateLimiterMemory({
  points: 50, // 50 events
  duration: 1, // per second
})

// Track if Ralph listeners are registered to prevent duplicates
let ralphListenersRegistered = false

// Store listener references for cleanup
type RalphListeners = {
  loopUpdate: (loop: any) => void
  loopRemoved: (taskId: string) => void
  progressUpdate: (taskId: string, progress: any) => void
  steeringPending: (taskId: string, steering: any) => void
  steeringAnswered: (taskId: string, steering: any) => void
  summaryCreated: (taskId: string, summary: any) => void
  specCreated: (data: any) => void
}
let ralphListenerRefs: RalphListeners | null = null

export function setupSocketHandlers(io: IOServer) {
  // Initialize terminal manager with socket.io server
  terminalManager.setIO(io)

  // Start background polling for tmux, system, and containers (Ralph uses file watching)
  let tmuxInterval: NodeJS.Timeout | null = null
  let systemInterval: NodeJS.Timeout | null = null
  let containerInterval: NodeJS.Timeout | null = null

  function startPolling() {
    // Clear any existing intervals to prevent leaks
    if (tmuxInterval) clearInterval(tmuxInterval)
    if (systemInterval) clearInterval(systemInterval)
    if (containerInterval) clearInterval(containerInterval)

    // Tmux sessions polling
    tmuxInterval = setInterval(async () => {
      if (io.engine.clientsCount > 0) {
        try {
          const sessions = await tmuxService.listSessions()
          io.emit('tmux:sessions:update', sessions)
        } catch (error) {
          console.error('Error polling tmux:', error)
        }
      }
    }, config.polling.tmux)

    // System stats polling
    systemInterval = setInterval(async () => {
      if (io.engine.clientsCount > 0) {
        try {
          const stats = await systemMonitor.getStats()
          io.emit('system:stats', stats)
        } catch (error) {
          console.error('Error polling system:', error)
        }
      }
    }, config.polling.system)

    // Container polling
    containerInterval = setInterval(async () => {
      if (io.engine.clientsCount > 0) {
        try {
          const containers = await containerManager.listContainers()
          io.emit('containers:update', containers)
        } catch (error) {
          console.error('Error polling containers:', error)
        }
      }
    }, config.polling.containers || 5000)
  }

  function stopPolling() {
    if (tmuxInterval) {
      clearInterval(tmuxInterval)
      tmuxInterval = null
    }
    if (systemInterval) {
      clearInterval(systemInterval)
      systemInterval = null
    }
    if (containerInterval) {
      clearInterval(containerInterval)
      containerInterval = null
    }
  }

  // Set up Ralph file watching (instant updates instead of polling)
  // Listeners registered ONCE to prevent memory leaks
  function startRalphWatching() {
    if (ralphListenersRegistered) {
      console.log('Ralph listeners already registered, skipping')
      return
    }

    // Create named listener functions for cleanup
    ralphListenerRefs = {
      loopUpdate: (loop) => {
        io.emit('ralph:loop:update', loop)
      },
      loopRemoved: (taskId) => {
        // Emit a "removed" state to clients
        io.emit('ralph:loop:update', {
          taskId,
          status: 'cancelled',
          iteration: 0,
          maxIterations: 0,
          completionPromise: null,
          mode: 'yolo',
          startedAt: new Date(),
          stateFile: null,
          projectPath: '',
          progressFile: null,
          steeringFile: null,
          steeringStatus: 'none',
          loopType: 'persistent',
        })
      },
      progressUpdate: (taskId, progress) => {
        io.to(`ralph:${taskId}`).emit('ralph:progress:update', { taskId, progress })
      },
      steeringPending: (taskId, steering) => {
        io.emit('ralph:steering:pending', { taskId, steering })
      },
      steeringAnswered: (taskId, steering) => {
        io.emit('ralph:steering:answered', { taskId, steering })
      },
      summaryCreated: (taskId, summary) => {
        io.to(`ralph:${taskId}`).emit('ralph:summary:created', { taskId, summary })
      },
      specCreated: (data) => {
        // Broadcast to all clients - new spec ready for auto-launch
        io.emit('ralph:spec:created', data)
      },
    }

    // Register listeners
    ralphWatcher.on('loop:update', ralphListenerRefs.loopUpdate)
    ralphWatcher.on('loop:removed', ralphListenerRefs.loopRemoved)
    ralphWatcher.on('progress:update', ralphListenerRefs.progressUpdate)
    ralphWatcher.on('steering:pending', ralphListenerRefs.steeringPending)
    ralphWatcher.on('steering:answered', ralphListenerRefs.steeringAnswered)
    ralphWatcher.on('summary:created', ralphListenerRefs.summaryCreated)
    ralphWatcher.on('spec:created', ralphListenerRefs.specCreated)

    ralphListenersRegistered = true
    ralphWatcher.startWatching()
  }

  async function stopRalphWatching() {
    // Remove listeners to prevent memory leaks
    if (ralphListenerRefs) {
      ralphWatcher.off('loop:update', ralphListenerRefs.loopUpdate)
      ralphWatcher.off('loop:removed', ralphListenerRefs.loopRemoved)
      ralphWatcher.off('progress:update', ralphListenerRefs.progressUpdate)
      ralphWatcher.off('steering:pending', ralphListenerRefs.steeringPending)
      ralphWatcher.off('steering:answered', ralphListenerRefs.steeringAnswered)
      ralphWatcher.off('summary:created', ralphListenerRefs.summaryCreated)
      ralphWatcher.off('spec:created', ralphListenerRefs.specCreated)
      ralphListenerRefs = null
    }
    ralphListenersRegistered = false
    await ralphWatcher.stopWatching()
  }

  // Socket.io authentication middleware (optional - enabled when RTS_API_KEY is set)
  io.use((socket, next) => {
    const apiKey = process.env.RTS_API_KEY
    if (!apiKey) return next() // Dev mode - skip auth when no key configured

    const token = socket.handshake.auth?.token || socket.handshake.headers['x-api-key']
    if (token !== apiKey) {
      console.warn(`Socket auth failed for ${socket.id} - invalid or missing API key`)
      return next(new Error('Authentication required'))
    }
    next()
  })

  // Start polling on first connection
  io.on('connection', (socket: IOSocket) => {
    console.log(`Client connected: ${socket.id}`)

    // Send initial data
    Promise.all([
      tmuxService.listSessions(),
      ralphWatcher.listLoops(),
      systemMonitor.getStats(),
      containerManager.listContainers(),
    ]).then(([sessions, loops, stats, containers]) => {
      socket.emit('tmux:sessions:update', sessions)
      loops.forEach((loop) => socket.emit('ralph:loop:update', loop))
      socket.emit('system:stats', stats)
      socket.emit('containers:update', containers)
    }).catch((error) => {
      console.error('Error fetching initial data for client:', error)
      // Still try to send partial data or empty arrays
      socket.emit('tmux:sessions:update', [])
      socket.emit('system:stats', { cpu: 0, memory: { used: 0, total: 0, percent: 0 }, processes: [] })
      socket.emit('containers:update', [])
    })

    // Handle terminal subscription - connects PTY to tmux pane
    socket.on('tmux:subscribe', ({ sessionId, paneId }) => {
      terminalManager.subscribe(socket.id, sessionId, paneId)
    })

    socket.on('tmux:unsubscribe', ({ sessionId, paneId }) => {
      terminalManager.unsubscribe(socket.id, sessionId, paneId)
    })

    // Handle terminal input - writes directly to PTY (rate limited)
    socket.on('tmux:input', async ({ sessionId, paneId, data }) => {
      try {
        await socketRateLimiter.consume(socket.id)
        terminalManager.write(sessionId, paneId, data)
      } catch {
        // Rate limit exceeded - silently drop input
        // Don't emit error to avoid flooding client
      }
    })

    // Handle terminal resize (rate limited)
    socket.on('tmux:resize', async ({ sessionId, paneId, cols, rows }) => {
      try {
        await socketRateLimiter.consume(socket.id)
        terminalManager.resize(sessionId, paneId, cols, rows)
      } catch {
        // Rate limit exceeded - silently drop resize
      }
    })

    socket.on('ralph:subscribe', ({ taskId }) => {
      const room = `ralph:${taskId}`
      socket.join(room)
      console.log(`Client ${socket.id} subscribed to ${room}`)
    })

    socket.on('ralph:unsubscribe', ({ taskId }) => {
      const room = `ralph:${taskId}`
      socket.leave(room)
      console.log(`Client ${socket.id} unsubscribed from ${room}`)
    })

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`)
      // Clean up any PTY connections for this socket
      terminalManager.cleanupSocket(socket.id)
    })
  })

  // Start polling and file watching
  startPolling()
  startRalphWatching()

  // Cleanup on server shutdown
  process.on('SIGTERM', async () => {
    stopPolling()
    await stopRalphWatching()
    terminalManager.cleanup()
  })
  process.on('SIGINT', async () => {
    stopPolling()
    await stopRalphWatching()
    terminalManager.cleanup()
  })
}
