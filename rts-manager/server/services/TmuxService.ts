import { execSync, exec } from 'child_process'
import { promisify } from 'util'
import type { TmuxSession, TmuxWindow, TmuxPane } from '../../src/types'

const execAsync = promisify(exec)

export class TmuxService {
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
    try {
      const { stdout: windowsRaw } = await execAsync(
        `tmux list-windows -t "${sessionName}" -F "#{window_id}|#{window_name}|#{window_active}|#{window_layout}"`
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
    try {
      const { stdout: panesRaw } = await execAsync(
        `tmux list-panes -t "${sessionName}:${windowId}" -F "#{pane_id}|#{pane_active}|#{pane_width}|#{pane_height}|#{pane_current_command}|#{pane_pid}|#{pane_title}"`
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
    try {
      const target = paneId ? `${sessionId}:${paneId}` : sessionId
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
   */
  async sendKeys(sessionId: string, paneId: string, keys: string): Promise<void> {
    await execAsync(
      `tmux send-keys -t "${sessionId}:${paneId}" "${keys}"`
    )
  }

  /**
   * Create a new session
   */
  async createSession(name?: string): Promise<TmuxSession> {
    const sessionName = name || `session-${Date.now()}`
    await execAsync(`tmux new-session -d -s "${sessionName}"`)
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
    await execAsync(`tmux kill-session -t "${sessionId}"`)
  }
}
