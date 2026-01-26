import Docker from 'dockerode'

/**
 * Result type for remote exec operations
 */
export interface ExecResult {
  success: boolean
  output?: string
  error?: string
}

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

      // Collect output
      let output = ''
      return new Promise((resolve) => {
        stream.on('data', (chunk: Buffer) => {
          output += chunk.toString()
        })

        stream.on('end', () => {
          resolve({ success: true, output })
        })

        stream.on('error', (err: Error) => {
          resolve({ success: false, error: err.message })
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

      // Build the tmux command
      // If workingDir provided, cd to it first
      const cdPrefix = workingDir ? `cd ${this.escapeShell(workingDir)} && ` : ''

      // Create detached tmux session running the command
      // Using bash -c to handle the cd && command properly
      const tmuxCmd = `tmux new-session -d -s ${this.escapeShell(sessionName)} bash -c '${cdPrefix}${command}'`

      const exec = await container.exec({
        Cmd: ['bash', '-c', tmuxCmd],
        AttachStdout: true,
        AttachStderr: true,
        User: 'agent', // Run as agent user in container
      })

      const stream = await exec.start({ Detach: false })

      // Wait for command to complete
      let output = ''
      let errorOutput = ''

      return new Promise((resolve) => {
        stream.on('data', (chunk: Buffer) => {
          // Docker multiplexes stdout/stderr - first byte indicates stream type
          const data = chunk.toString()
          output += data
        })

        stream.on('end', async () => {
          // Check if session was created successfully
          const checkResult = await this.checkTmuxSession(containerId, sessionName)

          if (checkResult.exists) {
            resolve({
              success: true,
              output: `Session '${sessionName}' created successfully`,
            })
          } else {
            resolve({
              success: false,
              error: `Failed to create tmux session: ${output || errorOutput || 'Unknown error'}`,
            })
          }
        })

        stream.on('error', (err: Error) => {
          resolve({ success: false, error: err.message })
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
