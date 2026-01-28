import { Server, Socket } from 'socket.io'
import { RateLimiterMemory } from 'rate-limiter-flexible'
import {
  tmuxService,
  ralphWatcher,
  systemMonitor,
  terminalManager,
  containerManager,
  remoteTmuxService,
  remoteRalphService,
} from '../services'
import { config } from '../config'
import { validateSocketTmuxParams, validateSocketInputData } from '../middleware/validate'
import type { ServerToClientEvents, ClientToServerEvents } from '../../src/types'

type IOServer = Server<ClientToServerEvents, ServerToClientEvents>
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>

// Timeout for remote polling operations (10 seconds)
const REMOTE_POLL_TIMEOUT_MS = 10000

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ])
}

// Rate limiter for high-frequency socket events (per socket ID)
// 50 events per second is generous for terminal input
const socketRateLimiter = new RateLimiterMemory({
  points: 50, // 50 events
  duration: 1, // per second
})

// Track if Ralph listeners are registered to prevent duplicates
let ralphListenersRegistered = false

// Track container subscriptions for cross-container monitoring
// Map: containerId -> Set of socket IDs subscribed to that container
const containerSubscriptions = new Map<string, Set<string>>()

// Track which containers each socket is subscribed to (for cleanup)
const socketContainerSubs = new Map<string, Set<string>>()

// Track ralph room subscriptions for cleanup on disconnect
const socketRalphSubs = new Map<string, Set<string>>()

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
  let remotePollingInterval: NodeJS.Timeout | null = null
  let subscriptionCleanupInterval: NodeJS.Timeout | null = null

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

    // Remote container polling (for cross-container monitoring)
    // Only polls containers that have active subscriptions
    remotePollingInterval = setInterval(async () => {
      if (containerSubscriptions.size === 0) return

      for (const [containerId, subscribers] of containerSubscriptions) {
        if (subscribers.size === 0) {
          containerSubscriptions.delete(containerId)
          continue
        }

        try {
          // Verify container is still running (with timeout)
          const container = await withTimeout(
            containerManager.getContainer(containerId),
            REMOTE_POLL_TIMEOUT_MS,
            `getContainer(${containerId})`
          )
          if (!container || container.status !== 'running') {
            continue
          }

          // Fetch remote tmux sessions (with timeout)
          const sessions = await withTimeout(
            remoteTmuxService.listSessions(containerId),
            REMOTE_POLL_TIMEOUT_MS,
            `listSessions(${containerId})`
          )

          // Fetch remote Ralph loops (with timeout)
          const loops = await withTimeout(
            remoteRalphService.listLoops(containerId),
            REMOTE_POLL_TIMEOUT_MS,
            `listLoops(${containerId})`
          )

          // Emit to all subscribers of this container
          const room = `container:${containerId}`
          io.to(room).emit('container:tmux:update', { containerId, sessions })
          io.to(room).emit('container:ralph:update', { containerId, loops })

          // Check for pending steering in any loop (with timeout)
          for (const loop of loops) {
            if (loop.steeringStatus === 'pending') {
              try {
                const steering = await withTimeout(
                  remoteRalphService.getSteering(containerId, loop.taskId),
                  REMOTE_POLL_TIMEOUT_MS,
                  `getSteering(${containerId}, ${loop.taskId})`
                )
                if (steering) {
                  io.to(room).emit('container:ralph:steering', { containerId, taskId: loop.taskId, steering })
                }
              } catch (steeringError) {
                // Log but don't fail the whole poll for one steering fetch
                console.warn(`Failed to fetch steering for ${loop.taskId}:`, steeringError)
              }
            }
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error)
          console.error(`Error polling remote container ${containerId}: ${errMsg}`)
        }
      }
    }, config.polling.remote || 3000)

    // Periodic cleanup of stale container subscriptions (every 60 seconds)
    // Removes subscriptions for containers that no longer exist
    subscriptionCleanupInterval = setInterval(async () => {
      if (containerSubscriptions.size === 0) return

      try {
        const containers = await containerManager.listContainers()
        const validContainerIds = new Set(containers.map(c => c.id))

        for (const containerId of containerSubscriptions.keys()) {
          if (!validContainerIds.has(containerId)) {
            // Container no longer exists - clean up subscriptions
            const subscribers = containerSubscriptions.get(containerId)
            if (subscribers) {
              console.log(`Cleaning up ${subscribers.size} subscriptions for removed container ${containerId}`)
              for (const socketId of subscribers) {
                socketContainerSubs.get(socketId)?.delete(containerId)
              }
            }
            containerSubscriptions.delete(containerId)
          }
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.warn(`Error during subscription cleanup: ${errMsg}`)
      }
    }, 60000) // Every 60 seconds
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
    if (remotePollingInterval) {
      clearInterval(remotePollingInterval)
      remotePollingInterval = null
    }
    if (subscriptionCleanupInterval) {
      clearInterval(subscriptionCleanupInterval)
      subscriptionCleanupInterval = null
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

    // Send initial data with timeout to prevent hanging on slow services
    const INITIAL_DATA_TIMEOUT_MS = 10000 // 10 seconds

    withTimeout(
      Promise.all([
        tmuxService.listSessions(),
        ralphWatcher.listLoops(),
        systemMonitor.getStats(),
        containerManager.listContainers(),
      ]),
      INITIAL_DATA_TIMEOUT_MS,
      'Initial data fetch'
    ).then(([sessions, loops, stats, containers]) => {
      socket.emit('tmux:sessions:update', sessions)
      loops.forEach((loop) => socket.emit('ralph:loop:update', loop))
      socket.emit('system:stats', stats)
      socket.emit('containers:update', containers)
    }).catch((error) => {
      const errMsg = error instanceof Error ? error.message : String(error)
      console.error(`Error fetching initial data for client ${socket.id}: ${errMsg}`)
      // Still try to send partial data or empty arrays
      socket.emit('tmux:sessions:update', [])
      socket.emit('system:stats', { cpu: { usage: 0, cores: 0 }, memory: { used: 0, total: 0, percent: 0 }, uptime: 0, claudeProcesses: [] })
      socket.emit('containers:update', [])
    })

    // Handle terminal subscription - connects PTY to tmux pane
    socket.on('tmux:subscribe', async (params) => {
      const validation = validateSocketTmuxParams(params)
      if (!validation.valid) {
        socket.emit('error', { message: validation.error || 'Invalid parameters' })
        return
      }
      try {
        await terminalManager.subscribe(socket.id, params.sessionId!, params.paneId!)
      } catch (error) {
        console.error('Error subscribing to terminal:', error)
        socket.emit('error', { message: 'Failed to subscribe to terminal' })
      }
    })

    socket.on('tmux:unsubscribe', (params) => {
      const validation = validateSocketTmuxParams(params)
      if (!validation.valid) {
        socket.emit('error', { message: validation.error || 'Invalid parameters' })
        return
      }
      terminalManager.unsubscribe(socket.id, params.sessionId!, params.paneId!)
    })

    // Track last rate limit warning time per socket to avoid flooding
    let lastRateLimitWarning = 0
    const RATE_LIMIT_WARNING_COOLDOWN = 2000 // 2 seconds between warnings

    // Handle terminal input - writes directly to PTY (rate limited)
    socket.on('tmux:input', async (params) => {
      try {
        const tmuxValidation = validateSocketTmuxParams(params)
        if (!tmuxValidation.valid) {
          socket.emit('error', { message: tmuxValidation.error || 'Invalid parameters' })
          return
        }
        const dataValidation = validateSocketInputData(params.data)
        if (!dataValidation.valid) {
          socket.emit('error', { message: dataValidation.error || 'Invalid data' })
          return
        }
        await socketRateLimiter.consume(socket.id)
        terminalManager.write(params.sessionId!, params.paneId!, params.data as string)
      } catch (error) {
        // Rate limit exceeded - emit warning (throttled)
        const now = Date.now()
        if (now - lastRateLimitWarning > RATE_LIMIT_WARNING_COOLDOWN) {
          lastRateLimitWarning = now
          socket.emit('error', { message: 'Rate limit exceeded - slow down input' })
        }
      }
    })

    // Handle terminal resize (rate limited)
    socket.on('tmux:resize', async (params) => {
      try {
        const validation = validateSocketTmuxParams(params)
        if (!validation.valid) {
          return // Silently ignore invalid resize params
        }
        const { cols, rows } = params as { sessionId: string; paneId: string; cols?: number; rows?: number }
        if (typeof cols !== 'number' || typeof rows !== 'number' || cols < 1 || rows < 1) {
          return // Silently ignore invalid dimensions
        }
        await socketRateLimiter.consume(socket.id)
        terminalManager.resize(params.sessionId!, params.paneId!, cols, rows)
      } catch {
        // Rate limit exceeded - silently drop resize (less important than input)
      }
    })

    socket.on('ralph:subscribe', ({ taskId }) => {
      const room = `ralph:${taskId}`
      socket.join(room)

      // Track subscription for cleanup
      if (!socketRalphSubs.has(socket.id)) {
        socketRalphSubs.set(socket.id, new Set())
      }
      socketRalphSubs.get(socket.id)!.add(taskId)

      console.log(`Client ${socket.id} subscribed to ${room}`)
    })

    socket.on('ralph:unsubscribe', ({ taskId }) => {
      const room = `ralph:${taskId}`
      socket.leave(room)

      // Remove from tracking
      socketRalphSubs.get(socket.id)?.delete(taskId)

      console.log(`Client ${socket.id} unsubscribed from ${room}`)
    })

    // Cross-container subscription - subscribe to a remote container's data
    socket.on('container:subscribe', async ({ containerId }) => {
      // Validate container ID format
      const containerIdRegex = /^[a-f0-9]{12,64}$/i
      if (!containerIdRegex.test(containerId)) {
        socket.emit('error', { message: 'Invalid container ID format' })
        return
      }

      const room = `container:${containerId}`
      socket.join(room)

      // Track subscription
      if (!containerSubscriptions.has(containerId)) {
        containerSubscriptions.set(containerId, new Set())
      }
      containerSubscriptions.get(containerId)!.add(socket.id)

      if (!socketContainerSubs.has(socket.id)) {
        socketContainerSubs.set(socket.id, new Set())
      }
      socketContainerSubs.get(socket.id)!.add(containerId)

      console.log(`Client ${socket.id} subscribed to container ${containerId}`)

      // Send initial data for this container
      try {
        const container = await containerManager.getContainer(containerId)
        if (container && container.status === 'running') {
          const sessions = await remoteTmuxService.listSessions(containerId)
          const loops = await remoteRalphService.listLoops(containerId)

          socket.emit('container:tmux:update', { containerId, sessions })
          socket.emit('container:ralph:update', { containerId, loops })
        }
      } catch (error) {
        console.error(`Error fetching initial data for container ${containerId}:`, error)
      }
    })

    socket.on('container:unsubscribe', ({ containerId }) => {
      const room = `container:${containerId}`
      socket.leave(room)

      // Remove from tracking
      containerSubscriptions.get(containerId)?.delete(socket.id)
      if (containerSubscriptions.get(containerId)?.size === 0) {
        containerSubscriptions.delete(containerId)
      }
      socketContainerSubs.get(socket.id)?.delete(containerId)

      console.log(`Client ${socket.id} unsubscribed from container ${containerId}`)
    })

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`)
      // Clean up any PTY connections for this socket
      terminalManager.cleanupSocket(socket.id)

      // Clean up ralph room subscriptions
      const ralphSubs = socketRalphSubs.get(socket.id)
      if (ralphSubs) {
        for (const taskId of ralphSubs) {
          socket.leave(`ralph:${taskId}`)
        }
        socketRalphSubs.delete(socket.id)
      }

      // Clean up container subscriptions
      const containerSubs = socketContainerSubs.get(socket.id)
      if (containerSubs) {
        for (const containerId of containerSubs) {
          containerSubscriptions.get(containerId)?.delete(socket.id)
          if (containerSubscriptions.get(containerId)?.size === 0) {
            containerSubscriptions.delete(containerId)
          }
        }
        socketContainerSubs.delete(socket.id)
      }
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
