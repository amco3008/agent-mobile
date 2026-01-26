import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import path from 'path'
import { fileURLToPath } from 'url'
import { tmuxRouter } from './routes/tmux'
import { ralphRouter } from './routes/ralph'
import { systemRouter } from './routes/system'
import containersRouter from './routes/containers'
import ralphLaunchRouter from './routes/ralph-launch'
import remoteTmuxRouter from './routes/remote-tmux'
import remoteRalphRouter from './routes/remote-ralph'
import { setupSocketHandlers } from './socket/handlers'
import { config } from './config'
import { optionalApiKey } from './middleware'
import type { ServerToClientEvents, ClientToServerEvents } from '../src/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
app.use(cors({
  origin: config.getCorsOrigins(),
  methods: ['GET', 'POST', 'DELETE'],
  credentials: true
}))
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
app.use('/api/ralph', ralphLaunchRouter)
app.use('/api/system', systemRouter)
app.use('/api/containers', containersRouter)

// Cross-container routes (remote tmux/ralph access)
app.use('/api/containers', remoteTmuxRouter)
app.use('/api/containers', remoteRalphRouter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Serve static frontend files in production
// In development, Vite serves the frontend on a separate port
if (process.env.NODE_ENV === 'production' || !process.env.VITE_DEV_SERVER) {
  // Static files from dist/ (built by Vite)
  const staticPath = path.join(__dirname, '..', '..', 'dist')
  app.use(express.static(staticPath))

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'))
  })
}

// Socket.io handlers
setupSocketHandlers(io)

// Start server
const server = httpServer.listen(config.port, () => {
  console.log(`RTS Manager server running on http://localhost:${config.port}`)
  console.log(`   API: http://localhost:${config.port}/api`)
  console.log(`   Socket.io: ws://localhost:${config.port}`)
  console.log(`   CORS origins: ${config.getCorsOrigins().join(', ')}`)
  console.log(`   Rate limit: ${process.env.RTS_RATE_LIMIT || '100'} req/min`)
  console.log(`   API key auth: ${process.env.RTS_API_KEY ? 'enabled' : 'disabled'}`)
})

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`)

  // Close Socket.io connections
  io.close(() => {
    console.log('Socket.io connections closed')
  })

  // Close HTTP server
  server.close((err) => {
    if (err) {
      console.error('Error closing HTTP server:', err)
      process.exit(1)
    }
    console.log('HTTP server closed')
    process.exit(0)
  })

  // Force exit after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('Forced shutdown after timeout')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

export { io }
