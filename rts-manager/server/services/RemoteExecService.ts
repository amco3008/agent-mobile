import Docker from 'dockerode'

/**
 * Result type for remote exec operations
 */
export interface ExecResult {
  success: boolean
  output?: string
  error?: string
}

// Default timeout for exec operations (30 seconds)
const EXEC_TIMEOUT_MS = 30000

/**
 * Service for executing commands inside Docker containers
 * Used to create tmux sessions and run commands like `claude`
 */
export class RemoteExecService {
  private docker: Docker

  constructor() {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' })
  }

  /**
   * Execute a command inside a container
   */
  async execCommand(
    containerId: string,
    command: string[]
  ): Promise<ExecResult> {
    try {
      const container = this.docker.getContainer(containerId)

      const exec = await container.exec({
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true,
      })

      const stream = await exec.start({ Detach: false })

      // Collect output with timeout
      let output = ''
      let resolved = false
      return new Promise((resolve) => {
        const safeResolve = (result: ExecResult) => {
          if (!resolved) {
            resolved = true
            resolve(result)
          }
        }

        const timeout = setTimeout(() => {
          stream.destroy()
          safeResolve({ success: false, error: `Command execution timeout (${EXEC_TIMEOUT_MS / 1000}s)` })
        }, EXEC_TIMEOUT_MS)

        stream.on('data', (chunk: Buffer) => {
          // Guard against data after stream destroyed
          if (!resolved && !stream.destroyed) {
            output += chunk.toString()
          }
        })

        stream.on('end', () => {
          clearTimeout(timeout)
          safeResolve({ success: true, output })
        })

        stream.on('error', (err: Error) => {
          clearTimeout(timeout)
          safeResolve({ success: false, error: err.message })
        })
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error(`Failed to exec in container ${containerId}:`, message)
      return { success: false, error: message }
    }
  }

  /**
   * Create a new tmux session and run a command inside it
   * This is the main method for launching Claude Code sessions
   */
  async createTmuxSession(
    containerId: string,
    sessionName: string,
    command: string,
    workingDir?: string
  ): Promise<ExecResult> {
    try {
      const container = this.docker.getContainer(containerId)

      // Build the full command to run in bash
      // If workingDir provided, cd to it first, then run the command
      const fullCmd = workingDir
        ? `cd ${this.escapeShell(workingDir)} && ${command}`
        : command

      // Create detached tmux session running the command
      // Escape the entire command string to prevent injection
      const tmuxCmd = `tmux new-session -d -s ${this.escapeShell(sessionName)} bash -c ${this.escapeShell(fullCmd)}`

      const exec = await container.exec({
        Cmd: ['bash', '-c', tmuxCmd],
        AttachStdout: true,
        AttachStderr: true,
        User: 'agent', // Run as agent user in container
      })

      const stream = await exec.start({ Detach: false })

      // Wait for command to complete with timeout
      let output = ''
      let resolved = false

      return new Promise((resolve) => {
        const safeResolve = (result: ExecResult) => {
          if (!resolved) {
            resolved = true
            resolve(result)
          }
        }

        const timeout = setTimeout(() => {
          stream.destroy()
          safeResolve({ success: false, error: `Tmux session creation timeout (${EXEC_TIMEOUT_MS / 1000}s)` })
        }, EXEC_TIMEOUT_MS)

        stream.on('data', (chunk: Buffer) => {
          // Guard against data after stream destroyed
          if (!resolved && !stream.destroyed) {
            // Docker multiplexes stdout/stderr - first byte indicates stream type
            const data = chunk.toString()
            output += data
          }
        })

        stream.on('end', async () => {
          clearTimeout(timeout)
          if (resolved) return

          try {
            // Check if session was created successfully
            const checkResult = await this.checkTmuxSession(containerId, sessionName)

            if (checkResult.exists) {
              safeResolve({
                success: true,
                output: `Session '${sessionName}' created successfully`,
              })
            } else {
              safeResolve({
                success: false,
                error: `Failed to create tmux session: ${output || 'Unknown error'}`,
              })
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            console.error('Error checking tmux session:', message)
            safeResolve({ success: false, error: message })
          }
        })

        stream.on('error', (err: Error) => {
          clearTimeout(timeout)
          safeResolve({ success: false, error: err.message })
        })
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      console.error(`Failed to create tmux session in ${containerId}:`, message)
      return { success: false, error: message }
    }
  }

  /**
   * Check if a tmux session exists in a container
   */
  async checkTmuxSession(
    containerId: string,
    sessionName: string
  ): Promise<{ exists: boolean }> {
    const result = await this.execCommand(containerId, [
      'bash',
      '-c',
      `tmux has-session -t ${this.escapeShell(sessionName)} 2>/dev/null && echo EXISTS || echo NOTFOUND`,
    ])

    return {
      exists: result.success && result.output?.includes('EXISTS') === true,
    }
  }

  /**
   * List tmux sessions in a container
   */
  async listTmuxSessions(containerId: string): Promise<string[]> {
    const result = await this.execCommand(containerId, [
      'bash',
      '-c',
      'tmux list-sessions -F "#{session_name}" 2>/dev/null || true',
    ])

    if (!result.success || !result.output) {
      return []
    }

    return result.output
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  }

  /**
   * Kill a tmux session in a container
   */
  async killTmuxSession(
    containerId: string,
    sessionName: string
  ): Promise<ExecResult> {
    return this.execCommand(containerId, [
      'bash',
      '-c',
      `tmux kill-session -t ${this.escapeShell(sessionName)}`,
    ])
  }

  /**
   * Escape a string for safe use in shell commands
   */
  private escapeShell(str: string): string {
    // Replace single quotes with escaped version
    return `'${str.replace(/'/g, "'\\''")}'`
  }
}

// Export singleton instance
export const remoteExecService = new RemoteExecService()
