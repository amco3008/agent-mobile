import { execSync, exec } from 'child_process'
import { promisify } from 'util'
import type { TmuxSession, TmuxWindow, TmuxPane } from '../../src/types'

const execAsync = promisify(exec)

// Valid patterns for tmux identifiers
const SESSION_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/
const PANE_ID_PATTERN = /^[a-zA-Z0-9_%-]+$/
const SESSION_ID_PATTERN = /^[$@%]?[a-zA-Z0-9_-]+$/

export class TmuxService {
  /**
   * Validate a session name/ID to prevent command injection
   */
  private validateSessionId(sessionId: string): void {
    if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
      throw new Error(`Invalid session identifier: ${sessionId}`)
    }
  }

  /**
   * Validate a pane ID
   */
  private validatePaneId(paneId: string): void {
    if (!paneId || !PANE_ID_PATTERN.test(paneId)) {
      throw new Error(`Invalid pane identifier: ${paneId}`)
    }
  }

  /**
   * Validate a session name for creation
   */
  private validateSessionName(name: string): void {
    if (!name || !SESSION_NAME_PATTERN.test(name)) {
      throw new Error(`Invalid session name: ${name}. Must contain only alphanumeric, underscore, and hyphen.`)
    }
  }

  /**
   * Escape a string for use in double quotes in shell
   * Only used for safe, validated strings
   */
  private shellEscape(str: string): string {
    // Replace special chars that could break out of double quotes
    return str.replace(/[`$"\\!]/g, '\\$&')
  }
  /**
   * List all tmux sessions with their windows and panes
   */
  async listSessions(): Promise<TmuxSession[]> {
    try {
      // Check if tmux server is running
      const { stdout: serverCheck } = await execAsync('tmux list-sessions 2>/dev/null || echo ""')
      if (!serverCheck.trim()) {
        return []
      }

      // Get sessions
      const { stdout: sessionsRaw } = await execAsync(
        `tmux list-sessions -F "#{session_id}|#{session_name}|#{session_created}|#{session_attached}"`
      )

      const sessions: TmuxSession[] = []

      for (const line of sessionsRaw.trim().split('\n')) {
        if (!line) continue

        const [id, name, created, attached] = line.split('|')
        const windows = await this.listWindows(name)

        sessions.push({
          id,
          name,
          created: new Date(parseInt(created) * 1000),
          attached: attached === '1',
          windows,
        })
      }

      return sessions
    } catch (error) {
      // tmux not running or not available
      console.log('tmux not available:', error)
      return []
    }
  }

  /**
   * List windows for a session
   */
  async listWindows(sessionName: string): Promise<TmuxWindow[]> {
    this.validateSessionId(sessionName)

    try {
      const { stdout: windowsRaw } = await execAsync(
        `tmux list-windows -t "${this.shellEscape(sessionName)}" -F "#{window_id}|#{window_name}|#{window_active}|#{window_layout}"`
      )

      const windows: TmuxWindow[] = []

      for (const line of windowsRaw.trim().split('\n')) {
        if (!line) continue

        const [id, name, active, layout] = line.split('|')
        const panes = await this.listPanes(sessionName, parseInt(id.replace('@', '')))

        windows.push({
          id: parseInt(id.replace('@', '')),
          name,
          active: active === '1',
          layout,
          panes,
        })
      }

      return windows
    } catch {
      return []
    }
  }

  /**
   * List panes for a window
   */
  async listPanes(sessionName: string, windowId: number): Promise<TmuxPane[]> {
    this.validateSessionId(sessionName)

    // windowId is a number, so it's safe from injection
    if (!Number.isInteger(windowId) || windowId < 0) {
      throw new Error(`Invalid window ID: ${windowId}`)
    }

    try {
      const { stdout: panesRaw } = await execAsync(
        `tmux list-panes -t "${this.shellEscape(sessionName)}:${windowId}" -F "#{pane_id}|#{pane_active}|#{pane_width}|#{pane_height}|#{pane_current_command}|#{pane_pid}|#{pane_title}"`
      )

      const panes: TmuxPane[] = []

      for (const line of panesRaw.trim().split('\n')) {
        if (!line) continue

        const [id, active, width, height, command, pid, title] = line.split('|')

        panes.push({
          id: parseInt(id.replace('%', '')),
          active: active === '1',
          width: parseInt(width),
          height: parseInt(height),
          command,
          pid: parseInt(pid),
          title,
        })
      }

      return panes
    } catch {
      return []
    }
  }

  /**
   * Get a specific session
   */
  async getSession(sessionId: string): Promise<TmuxSession | null> {
    const sessions = await this.listSessions()
    return sessions.find(s => s.id === sessionId || s.name === sessionId) || null
  }

  /**
   * Capture pane content
   */
  async capturePane(sessionId: string, paneId?: string): Promise<string> {
    this.validateSessionId(sessionId)
    if (paneId) {
      this.validatePaneId(paneId)
    }

    try {
      const target = paneId
        ? `${this.shellEscape(sessionId)}:${this.shellEscape(paneId)}`
        : this.shellEscape(sessionId)
      const { stdout } = await execAsync(
        `tmux capture-pane -t "${target}" -p -e`
      )
      return stdout
    } catch {
      return ''
    }
  }

  /**
   * Send keys to a pane
   * Note: This uses tmux's literal key sending, not shell interpolation
   */
  async sendKeys(sessionId: string, paneId: string, keys: string): Promise<void> {
    this.validateSessionId(sessionId)
    this.validatePaneId(paneId)

    // Use tmux send-keys with -l flag for literal interpretation
    // This avoids shell escaping issues by passing keys via stdin
    const target = `${this.shellEscape(sessionId)}:${this.shellEscape(paneId)}`

    // For safety, use spawn with arguments array instead of shell string
    const { spawn } = await import('child_process')
    return new Promise((resolve, reject) => {
      const proc = spawn('tmux', ['send-keys', '-t', target, '-l', keys], {
        stdio: ['ignore', 'ignore', 'pipe'],
      })

      let stderr = ''
      proc.stderr?.on('data', (data) => { stderr += data.toString() })

      proc.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`tmux send-keys failed: ${stderr}`))
        }
      })

      proc.on('error', reject)
    })
  }

  /**
   * Create a new session
   */
  async createSession(name?: string): Promise<TmuxSession> {
    const sessionName = name || `session-${Date.now()}`
    this.validateSessionName(sessionName)

    await execAsync(`tmux new-session -d -s "${this.shellEscape(sessionName)}"`)
    const session = await this.getSession(sessionName)
    if (!session) {
      throw new Error('Failed to create session')
    }
    return session
  }

  /**
   * Kill a session
   */
  async killSession(sessionId: string): Promise<void> {
    this.validateSessionId(sessionId)
    await execAsync(`tmux kill-session -t "${this.shellEscape(sessionId)}"`)
  }
}
