import { Server, Socket } from 'socket.io'
import { TmuxService } from '../services/TmuxService'
import { RalphWatcher } from '../services/RalphWatcher'
import { SystemMonitor } from '../services/SystemMonitor'
import { terminalManager } from '../services/TerminalManager'
import { config } from '../config'
import type { ServerToClientEvents, ClientToServerEvents } from '../../src/types'

type IOServer = Server<ClientToServerEvents, ServerToClientEvents>
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>

const tmuxService = new TmuxService()
const ralphWatcher = new RalphWatcher()
const systemMonitor = new SystemMonitor()

export function setupSocketHandlers(io: IOServer) {
  // Initialize terminal manager with socket.io server
  terminalManager.setIO(io)

  // Start background polling for tmux and system (Ralph uses file watching)
  let tmuxInterval: NodeJS.Timeout | null = null
  let systemInterval: NodeJS.Timeout | null = null

  function startPolling() {
    // Clear any existing intervals to prevent leaks
    if (tmuxInterval) clearInterval(tmuxInterval)
    if (systemInterval) clearInterval(systemInterval)
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
  }

  // Set up Ralph file watching (instant updates instead of polling)
  function startRalphWatching() {
    ralphWatcher.on('loop:update', (loop) => {
      io.emit('ralph:loop:update', loop)
    })

    ralphWatcher.on('loop:removed', (taskId) => {
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
    })

    ralphWatcher.on('progress:update', (taskId, progress) => {
      io.to(`ralph:${taskId}`).emit('ralph:progress:update', { taskId, progress })
    })

    ralphWatcher.on('steering:pending', (taskId, steering) => {
      io.emit('ralph:steering:pending', { taskId, steering })
    })

    ralphWatcher.on('steering:answered', (taskId, steering) => {
      io.emit('ralph:steering:answered', { taskId, steering })
    })

    ralphWatcher.on('summary:created', (taskId, summary) => {
      io.to(`ralph:${taskId}`).emit('ralph:summary:created', { taskId, summary })
    })

    ralphWatcher.startWatching()
  }

  async function stopRalphWatching() {
    await ralphWatcher.stopWatching()
  }

  // Start polling on first connection
  io.on('connection', (socket: IOSocket) => {
    console.log(`Client connected: ${socket.id}`)

    // Send initial data
    Promise.all([
      tmuxService.listSessions(),
      ralphWatcher.listLoops(),
      systemMonitor.getStats(),
    ]).then(([sessions, loops, stats]) => {
      socket.emit('tmux:sessions:update', sessions)
      loops.forEach((loop) => socket.emit('ralph:loop:update', loop))
      socket.emit('system:stats', stats)
    }).catch((error) => {
      console.error('Error fetching initial data for client:', error)
      // Still try to send partial data or empty arrays
      socket.emit('tmux:sessions:update', [])
      socket.emit('system:stats', { cpu: 0, memory: { used: 0, total: 0, percent: 0 }, processes: [] })
    })

    // Handle terminal subscription - connects PTY to tmux pane
    socket.on('tmux:subscribe', ({ sessionId, paneId }) => {
      terminalManager.subscribe(socket.id, sessionId, paneId)
    })

    socket.on('tmux:unsubscribe', ({ sessionId, paneId }) => {
      terminalManager.unsubscribe(socket.id, sessionId, paneId)
    })

    // Handle terminal input - writes directly to PTY
    socket.on('tmux:input', ({ sessionId, paneId, data }) => {
      terminalManager.write(sessionId, paneId, data)
    })

    // Handle terminal resize
    socket.on('tmux:resize', ({ sessionId, paneId, cols, rows }) => {
      terminalManager.resize(sessionId, paneId, cols, rows)
    })

    socket.on('ralph:subscribe', ({ taskId }) => {
      const room = `ralph:${taskId}`
      socket.join(room)
      console.log(`Client ${socket.id} subscribed to ${room}`)
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
