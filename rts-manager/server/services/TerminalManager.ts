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
  // Promise-based mutex for PTY creation to prevent race conditions
  private pendingCreations: Map<string, Promise<TerminalInstance | null>> = new Map()

  setIO(io: IOServer) {
    this.io = io
  }

  private getKey(sessionId: string, paneId: string): string {
    return `${sessionId}:${paneId}`
  }

  /**
   * Create a terminal instance for a tmux session/pane
   */
  private createTerminal(sessionId: string, paneId: string, key: string): Promise<TerminalInstance | null> {
    return new Promise((resolve) => {
      try {
        const pty = spawn('tmux', ['attach-session', '-t', sessionId, '-r'], {
          name: 'xterm-256color',
          cols: 120,
          rows: 40,
          cwd: process.env.HOME || '/home/agent',
          env: process.env as { [key: string]: string },
        })

        const terminal: TerminalInstance = {
          pty,
          sessionId,
          paneId,
          subscribers: new Set(),
        }

        // Handle PTY output
        pty.onData((data) => {
          if (this.io) {
            // Send to all subscribers
            for (const sid of terminal.subscribers) {
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
        console.log(`Created terminal for ${key}`)
        resolve(terminal)
      } catch (error) {
        console.error(`Failed to create terminal for ${key}:`, error)
        resolve(null)
      }
    })
  }

  /**
   * Subscribe a socket to a terminal
   */
  async subscribe(socketId: string, sessionId: string, paneId: string): Promise<void> {
    const key = this.getKey(sessionId, paneId)
    let terminal = this.terminals.get(key)

    if (!terminal) {
      // Check if another subscribe is already creating this terminal
      const pendingPromise = this.pendingCreations.get(key)
      if (pendingPromise) {
        // Wait for the existing creation to complete
        terminal = await pendingPromise
        if (!terminal) {
          console.error(`Failed to get terminal for ${key} - creation failed`)
          return
        }
      } else {
        // Start creating the terminal and store the promise
        const creationPromise = this.createTerminal(sessionId, paneId, key)
        this.pendingCreations.set(key, creationPromise)

        try {
          terminal = await creationPromise
        } finally {
          // Clean up pending promise after creation completes
          this.pendingCreations.delete(key)
        }

        if (!terminal) {
          return
        }
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
