import si from 'systeminformation'
import type { SystemStats, ProcessInfo } from '../../src/types'

export class SystemMonitor {
  /**
   * Get system statistics
   */
  async getStats(): Promise<SystemStats> {
    const [cpu, mem, time, processes] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.time(),
      this.getClaudeProcesses(),
    ])

    return {
      cpu: {
        usage: cpu.currentLoad,
        cores: cpu.cpus.length,
      },
      memory: {
        used: mem.used,
        total: mem.total,
        percent: (mem.used / mem.total) * 100,
      },
      uptime: time.uptime,
      claudeProcesses: processes,
    }
  }

  /**
   * Get Claude-related processes
   */
  async getClaudeProcesses(): Promise<ProcessInfo[]> {
    try {
      const processes = await si.processes()

      // Filter for Claude-related processes
      const claudeProcesses = processes.list.filter(
        (p) =>
          p.name.toLowerCase().includes('claude') ||
          p.name.toLowerCase().includes('node') ||
          p.command?.toLowerCase().includes('claude')
      )

      return claudeProcesses.slice(0, 10).map((p) => ({
        name: p.name,
        pid: p.pid,
        cpu: p.cpu,
        memory: p.mem,
      }))
    } catch {
      return []
    }
  }
}
