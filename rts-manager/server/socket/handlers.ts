import { Server, Socket } from 'socket.io'
import { TmuxService } from '../services/TmuxService'
import { RalphWatcher } from '../services/RalphWatcher'
import { SystemMonitor } from '../services/SystemMonitor'
import type { ServerToClientEvents, ClientToServerEvents } from '../../src/types'

type IOServer = Server<ClientToServerEvents, ServerToClientEvents>
type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents>

const tmuxService = new TmuxService()
const ralphWatcher = new RalphWatcher()
const systemMonitor = new SystemMonitor()

// Polling intervals
const TMUX_POLL_INTERVAL = 2000
const RALPH_POLL_INTERVAL = 3000
const SYSTEM_POLL_INTERVAL = 5000

export function setupSocketHandlers(io: IOServer) {
  // Start background polling for all connected clients
  let tmuxInterval: NodeJS.Timeout
  let ralphInterval: NodeJS.Timeout
  let systemInterval: NodeJS.Timeout

  function startPolling() {
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
    }, TMUX_POLL_INTERVAL)

    // Ralph loops polling
    ralphInterval = setInterval(async () => {
      if (io.engine.clientsCount > 0) {
        try {
          const loops = await ralphWatcher.listLoops()
          for (const loop of loops) {
            io.emit('ralph:loop:update', loop)
          }
        } catch (error) {
          console.error('Error polling ralph:', error)
        }
      }
    }, RALPH_POLL_INTERVAL)

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
    }, SYSTEM_POLL_INTERVAL)
  }

  function stopPolling() {
    clearInterval(tmuxInterval)
    clearInterval(ralphInterval)
    clearInterval(systemInterval)
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
    })

    // Handle terminal subscription
    socket.on('tmux:subscribe', ({ sessionId, paneId }) => {
      const room = `terminal:${sessionId}:${paneId}`
      socket.join(room)
      console.log(`Client ${socket.id} subscribed to ${room}`)
    })

    socket.on('tmux:unsubscribe', ({ sessionId, paneId }) => {
      const room = `terminal:${sessionId}:${paneId}`
      socket.leave(room)
      console.log(`Client ${socket.id} unsubscribed from ${room}`)
    })

    socket.on('tmux:input', async ({ sessionId, paneId, data }) => {
      try {
        await tmuxService.sendKeys(sessionId, paneId, data)
      } catch (error) {
        console.error('Error sending keys:', error)
      }
    })

    socket.on('ralph:subscribe', ({ taskId }) => {
      const room = `ralph:${taskId}`
      socket.join(room)
      console.log(`Client ${socket.id} subscribed to ${room}`)
    })

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`)
    })
  })

  // Start polling
  startPolling()

  // Cleanup on server shutdown
  process.on('SIGTERM', stopPolling)
  process.on('SIGINT', stopPolling)
}
