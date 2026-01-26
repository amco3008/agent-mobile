import { remoteExecService } from './RemoteExecService'
import type { TmuxSession, TmuxWindow, TmuxPane } from '../../src/types'

/**
 * Service for reading tmux sessions from remote containers via docker exec
 * Mirrors TmuxService but executes commands inside containers
 */
export class RemoteTmuxService {
  /**
   * List all tmux sessions in a container
   */
  async listSessions(containerId: string): Promise<TmuxSession[]> {
    const result = await remoteExecService.execCommand(containerId, [
      'bash',
      '-c',
      'tmux list-sessions -F "#{session_id}|#{session_name}|#{session_created}|#{session_attached}" 2>/dev/null || true',
    ])

    if (!result.success || !result.output?.trim()) {
      return []
    }

    const sessions: TmuxSession[] = []

    for (const line of result.output.trim().split('\n')) {
      if (!line.trim()) continue

      const [id, name, created, attached] = line.split('|')
      if (!id || !name) continue

      // Get windows for this session
      const windows = await this.listWindows(containerId, name)

      sessions.push({
        id: id.replace('$', ''),
        name,
        created: new Date(parseInt(created, 10) * 1000),
        attached: attached === '1',
        windows,
      })
    }

    return sessions
  }

  /**
   * List windows in a session
   */
  async listWindows(containerId: string, sessionName: string): Promise<TmuxWindow[]> {
    const escapedSession = this.escapeShell(sessionName)
    const result = await remoteExecService.execCommand(containerId, [
      'bash',
      '-c',
      `tmux list-windows -t ${escapedSession} -F "#{window_id}|#{window_name}|#{window_active}|#{window_layout}" 2>/dev/null || true`,
    ])

    if (!result.success || !result.output?.trim()) {
      return []
    }

    const windows: TmuxWindow[] = []

    for (const line of result.output.trim().split('\n')) {
      if (!line.trim()) continue

      const [id, name, active, layout] = line.split('|')
      if (!id || !name) continue

      // Get panes for this window
      const panes = await this.listPanes(containerId, sessionName, id)

      windows.push({
        id: id.replace('@', ''),
        name,
        active: active === '1',
        layout: layout || '',
        panes,
      })
    }

    return windows
  }

  /**
   * List panes in a window
   */
  async listPanes(
    containerId: string,
    sessionName: string,
    windowId: string
  ): Promise<TmuxPane[]> {
    const escapedSession = this.escapeShell(sessionName)
    const escapedWindow = windowId.startsWith('@') ? windowId : `@${windowId}`

    const result = await remoteExecService.execCommand(containerId, [
      'bash',
      '-c',
      `tmux list-panes -t ${escapedSession}:${escapedWindow} -F "#{pane_id}|#{pane_active}|#{pane_width}|#{pane_height}|#{pane_current_command}|#{pane_pid}|#{pane_title}" 2>/dev/null || true`,
    ])

    if (!result.success || !result.output?.trim()) {
      return []
    }

    const panes: TmuxPane[] = []

    for (const line of result.output.trim().split('\n')) {
      if (!line.trim()) continue

      const [id, active, width, height, command, pid, title] = line.split('|')
      if (!id) continue

      panes.push({
        id: id.replace('%', ''),
        index: panes.length,
        active: active === '1',
        width: parseInt(width, 10) || 80,
        height: parseInt(height, 10) || 24,
        command: command || '',
        pid: parseInt(pid, 10) || 0,
        title: title || '',
      })
    }

    return panes
  }

  /**
   * Get a specific session by ID or name
   */
  async getSession(containerId: string, sessionId: string): Promise<TmuxSession | null> {
    const sessions = await this.listSessions(containerId)
    return sessions.find((s) => s.id === sessionId || s.name === sessionId) || null
  }

  /**
   * Capture pane content
   */
  async capturePane(
    containerId: string,
    sessionId: string,
    paneId: string,
    lines: number = 50
  ): Promise<string> {
    const escapedSession = this.escapeShell(sessionId)
    const escapedPane = paneId.startsWith('%') ? paneId : `%${paneId}`

    const result = await remoteExecService.execCommand(containerId, [
      'bash',
      '-c',
      `tmux capture-pane -t ${escapedSession}:${escapedPane} -p -S -${lines} 2>/dev/null || true`,
    ])

    return result.success ? result.output || '' : ''
  }

  /**
   * Send keys to a pane in a container
   */
  async sendKeys(
    containerId: string,
    sessionId: string,
    paneId: string,
    keys: string
  ): Promise<boolean> {
    const escapedSession = this.escapeShell(sessionId)
    const escapedPane = paneId.startsWith('%') ? paneId : `%${paneId}`
    const escapedKeys = this.escapeShell(keys)

    const result = await remoteExecService.execCommand(containerId, [
      'bash',
      '-c',
      `tmux send-keys -t ${escapedSession}:${escapedPane} ${escapedKeys}`,
    ])

    return result.success
  }

  /**
   * Escape string for shell
   */
  private escapeShell(str: string): string {
    return `'${str.replace(/'/g, "'\\''")}'`
  }
}

export const remoteTmuxService = new RemoteTmuxService()
