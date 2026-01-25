import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { tmuxRouter } from './routes/tmux'
import { ralphRouter } from './routes/ralph'
import { systemRouter } from './routes/system'
import { setupSocketHandlers } from './socket/handlers'
import type { ServerToClientEvents, ClientToServerEvents } from '../src/types'

const PORT = process.env.PORT || 9091

const app = express()
const httpServer = createServer(app)

// Socket.io setup with typed events
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:9091'],
    methods: ['GET', 'POST'],
  },
})

// Middleware
app.use(cors())
app.use(express.json())

// API routes
app.use('/api/tmux', tmuxRouter)
app.use('/api/ralph', ralphRouter)
app.use('/api/system', systemRouter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Socket.io handlers
setupSocketHandlers(io)

// Start server
httpServer.listen(PORT, () => {
  console.log(`🎮 RTS Manager server running on http://localhost:${PORT}`)
  console.log(`   API: http://localhost:${PORT}/api`)
  console.log(`   Socket.io: ws://localhost:${PORT}`)
})

export { io }
