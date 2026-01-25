import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '../types'

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>

// Singleton socket instance
let socket: TypedSocket | null = null

export function getSocket(): TypedSocket {
  if (!socket) {
    socket = io({
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    socket.on('connect', () => {
      console.log('Socket connected:', socket?.id)
    })

    socket.on('disconnect', () => {
      console.log('Socket disconnected')
    })

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error)
    })
  }

  return socket
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

export function subscribeToRalphLoop(taskId: string) {
  const s = getSocket()
  s.emit('ralph:subscribe', { taskId })
}
