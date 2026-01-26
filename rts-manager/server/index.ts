import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { tmuxRouter } from './routes/tmux'
import { ralphRouter } from './routes/ralph'
import { systemRouter } from './routes/system'
import containersRouter from './routes/containers'
import { setupSocketHandlers } from './socket/handlers'
import { config } from './config'
import { optionalApiKey } from './middleware'
import type { ServerToClientEvents, ClientToServerEvents } from '../src/types'

const app = express()
const httpServer = createServer(app)

// Socket.io setup with typed events
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: config.getCorsOrigins(),
    methods: ['GET', 'POST'],
  },
})

// Middleware
app.use(cors())
app.use(express.json())

// Rate limiting (100 requests per minute per IP)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.RTS_RATE_LIMIT || '100', 10),
  message: { error: 'Too many requests', message: 'Please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/api/', apiLimiter)

// Optional API key authentication (set RTS_API_KEY to enable)
app.use('/api/', optionalApiKey)

// API routes
app.use('/api/tmux', tmuxRouter)
app.use('/api/ralph', ralphRouter)
app.use('/api/system', systemRouter)
app.use('/api/containers', containersRouter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Socket.io handlers
setupSocketHandlers(io)

// Start server
httpServer.listen(config.port, () => {
  console.log(`RTS Manager server running on http://localhost:${config.port}`)
  console.log(`   API: http://localhost:${config.port}/api`)
  console.log(`   Socket.io: ws://localhost:${config.port}`)
  console.log(`   CORS origins: ${config.getCorsOrigins().join(', ')}`)
  console.log(`   Rate limit: ${process.env.RTS_RATE_LIMIT || '100'} req/min`)
  console.log(`   API key auth: ${process.env.RTS_API_KEY ? 'enabled' : 'disabled'}`)
})

export { io }
