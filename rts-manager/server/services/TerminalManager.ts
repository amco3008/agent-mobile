import { spawn, IPty } from 'node-pty'
import { Server } from 'socket.io'
import type { ServerToClientEvents, ClientToServerEvents } from '../../src/types'

type IOServer = Server<ClientToServerEvents, ServerToClientEvents>

interface TerminalInstance {
  pty: IPty
  sessionId: string
  paneId: string
  subscribers: Set<string> // socket IDs
}

export class TerminalManager {
  private terminals: Map<string, TerminalInstance> = new Map()
  private io: IOServer | null = null
  private pendingCreations: Set<string> = new Set() // Mutex for PTY creation

  setIO(io: IOServer) {
    this.io = io
  }

  private getKey(sessionId: string, paneId: string): string {
    return `${sessionId}:${paneId}`
  }

  /**
   * Subscribe a socket to a terminal
   */
  subscribe(socketId: string, sessionId: string, paneId: string): void {
    const key = this.getKey(sessionId, paneId)
    let terminal = this.terminals.get(key)

    if (!terminal) {
      // Check if another subscribe is already creating this terminal
      if (this.pendingCreations.has(key)) {
        // Wait and retry after a short delay
        setTimeout(() => this.subscribe(socketId, sessionId, paneId), 100)
        return
      }

      // Mark as being created
      this.pendingCreations.add(key)
      // Create new PTY attached to tmux pane
      try {
        const pty = spawn('tmux', ['attach-session', '-t', sessionId, '-r'], {
          name: 'xterm-256color',
          cols: 120,
          rows: 40,
          cwd: process.env.HOME || '/home/agent',
          env: process.env as { [key: string]: string },
        })

        terminal = {
          pty,
          sessionId,
          paneId,
          subscribers: new Set(),
        }

        // Handle PTY output
        pty.onData((data) => {
          if (this.io) {
            // Send to all subscribers
            for (const sid of terminal!.subscribers) {
              this.io.to(sid).emit('tmux:pane:output', {
                sessionId,
                paneId,
                data,
              })
            }
          }
        })

        pty.onExit(() => {
          console.log(`Terminal ${key} exited`)
          this.terminals.delete(key)
        })

        this.terminals.set(key, terminal)
        this.pendingCreations.delete(key)
        console.log(`Created terminal for ${key}`)
      } catch (error) {
        this.pendingCreations.delete(key)
        console.error(`Failed to create terminal for ${key}:`, error)
        return
      }
    }

    terminal.subscribers.add(socketId)
    console.log(`Socket ${socketId} subscribed to ${key}`)
  }

  /**
   * Unsubscribe a socket from a terminal
   */
  unsubscribe(socketId: string, sessionId: string, paneId: string): void {
    const key = this.getKey(sessionId, paneId)
    const terminal = this.terminals.get(key)

    if (terminal) {
      terminal.subscribers.delete(socketId)
      console.log(`Socket ${socketId} unsubscribed from ${key}`)

      // Clean up terminal if no subscribers
      if (terminal.subscribers.size === 0) {
        terminal.pty.kill()
        this.terminals.delete(key)
        console.log(`Cleaned up terminal ${key}`)
      }
    }
  }

  /**
   * Send input to a terminal
   */
  write(sessionId: string, paneId: string, data: string): void {
    const key = this.getKey(sessionId, paneId)
    const terminal = this.terminals.get(key)

    if (terminal) {
      terminal.pty.write(data)
    } else {
      console.warn(`No terminal found for ${key}`)
    }
  }

  /**
   * Resize a terminal
   */
  resize(sessionId: string, paneId: string, cols: number, rows: number): void {
    const key = this.getKey(sessionId, paneId)
    const terminal = this.terminals.get(key)

    if (terminal) {
      terminal.pty.resize(cols, rows)
    }
  }

  /**
   * Clean up a specific socket's subscriptions
   */
  cleanupSocket(socketId: string): void {
    for (const [key, terminal] of this.terminals.entries()) {
      terminal.subscribers.delete(socketId)
      if (terminal.subscribers.size === 0) {
        terminal.pty.kill()
        this.terminals.delete(key)
        console.log(`Cleaned up terminal ${key} after socket ${socketId} disconnect`)
      }
    }
  }

  /**
   * Clean up all terminals
   */
  cleanup(): void {
    for (const [key, terminal] of this.terminals.entries()) {
      terminal.pty.kill()
      console.log(`Cleaned up terminal ${key}`)
    }
    this.terminals.clear()
  }
}

// Singleton instance
export const terminalManager = new TerminalManager()
