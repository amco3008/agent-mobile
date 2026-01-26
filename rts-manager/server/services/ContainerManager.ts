import Docker from 'dockerode'
import type {
  Container,
  ContainerStatus,
  ContainerHealth,
  ContainerStats,
} from '../../src/types/container'

export class ContainerManager {
  private docker: Docker

  constructor() {
    // Connect to Docker socket
    // On Linux/Mac: /var/run/docker.sock
    // On Windows: npipe:////./pipe/docker_engine (but we're in container, so use socket)
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' })
  }

  /**
   * Test Docker connection
   */
  async ping(): Promise<boolean> {
    try {
      await this.docker.ping()
      return true
    } catch (error) {
      console.error('Docker ping failed:', error)
      return false
    }
  }

  /**
   * List all agent-mobile containers
   * Filters by image name, container name, or label
   */
  async listContainers(): Promise<Container[]> {
    try {
      const containers = await this.docker.listContainers({ all: true })

      // Filter for agent-mobile containers
      const agentContainers = containers.filter(
        (c) =>
          c.Image.includes('agent-mobile') ||
          c.Names.some((n) => n.toLowerCase().includes('agent-mobile')) ||
          c.Labels?.['com.rts.type'] === 'agent'
      )

      return agentContainers.map((c) => this.mapContainer(c))
    } catch (error) {
      console.error('Error listing containers:', error)
      return []
    }
  }

  /**
   * Get a single container by ID
   */
  async getContainer(id: string): Promise<Container | null> {
    try {
      const container = this.docker.getContainer(id)
      const info = await container.inspect()

      // Check if it's an agent-mobile container
      const isAgent =
        info.Config.Image.includes('agent-mobile') ||
        info.Name.toLowerCase().includes('agent-mobile') ||
        info.Config.Labels?.['com.rts.type'] === 'agent'

      if (!isAgent) {
        return null
      }

      return this.mapInspectInfo(info)
    } catch (error) {
      console.error(`Error getting container ${id}:`, error)
      return null
    }
  }

  /**
   * Start a container
   */
  async startContainer(id: string): Promise<void> {
    const container = this.docker.getContainer(id)
    await container.start()
  }

  /**
   * Stop a container
   */
  async stopContainer(id: string): Promise<void> {
    const container = this.docker.getContainer(id)
    await container.stop()
  }

  /**
   * Restart a container
   */
  async restartContainer(id: string): Promise<void> {
    const container = this.docker.getContainer(id)
    await container.restart()
  }

  /**
   * Get container resource stats
   */
  async getContainerStats(id: string): Promise<ContainerStats | null> {
    try {
      const container = this.docker.getContainer(id)
      const stats = await container.stats({ stream: false })

      // Calculate CPU percentage
      const cpuDelta =
        stats.cpu_stats.cpu_usage.total_usage -
        stats.precpu_stats.cpu_usage.total_usage
      const systemDelta =
        stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage
      const cpuCount = stats.cpu_stats.online_cpus || 1
      const cpuPercent =
        systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0

      // Calculate memory
      const memUsed = stats.memory_stats.usage || 0
      const memLimit = stats.memory_stats.limit || 1
      const memPercent = (memUsed / memLimit) * 100

      // Network stats
      let rxBytes = 0
      let txBytes = 0
      if (stats.networks) {
        for (const net of Object.values(stats.networks)) {
          rxBytes += (net as { rx_bytes: number }).rx_bytes || 0
          txBytes += (net as { tx_bytes: number }).tx_bytes || 0
        }
      }

      return {
        containerId: id,
        cpu: Math.round(cpuPercent * 100) / 100,
        memory: {
          used: memUsed,
          limit: memLimit,
          percent: Math.round(memPercent * 100) / 100,
        },
        network: {
          rxBytes,
          txBytes,
        },
      }
    } catch (error) {
      console.error(`Error getting stats for container ${id}:`, error)
      return null
    }
  }

  /**
   * Map Docker.ContainerInfo to our Container type
   */
  private mapContainer(info: Docker.ContainerInfo): Container {
    return {
      id: info.Id.substring(0, 12),
      name: info.Names[0]?.replace(/^\//, '') || 'unknown',
      image: info.Image,
      status: this.parseStatus(info.State),
      state: info.State,
      health: this.parseHealthFromStatus(info.Status),
      created: new Date(info.Created * 1000),
      ports: info.Ports.map((p) => ({
        private: p.PrivatePort,
        public: p.PublicPort,
        type: (p.Type as 'tcp' | 'udp') || 'tcp',
      })),
      tailscaleIp: undefined, // Could be extracted from network settings
    }
  }

  /**
   * Map container inspect info to our Container type
   */
  private mapInspectInfo(info: Docker.ContainerInspectInfo): Container {
    const ports: Container['ports'] = []

    // Parse port bindings
    if (info.NetworkSettings?.Ports) {
      for (const [portKey, bindings] of Object.entries(
        info.NetworkSettings.Ports
      )) {
        const [port, type] = portKey.split('/')
        const publicPort = bindings?.[0]?.HostPort
        ports.push({
          private: parseInt(port, 10),
          public: publicPort ? parseInt(publicPort, 10) : undefined,
          type: (type as 'tcp' | 'udp') || 'tcp',
        })
      }
    }

    return {
      id: info.Id.substring(0, 12),
      name: info.Name.replace(/^\//, ''),
      image: info.Config.Image,
      status: this.parseStatus(info.State.Status),
      state: info.State.Status,
      health: this.parseHealth(info.State.Health),
      created: new Date(info.Created),
      ports,
      tailscaleIp: this.extractTailscaleIp(info),
    }
  }

  /**
   * Parse container state to our status type
   */
  private parseStatus(state: string): ContainerStatus {
    const normalized = state.toLowerCase()
    if (normalized === 'running') return 'running'
    if (normalized === 'paused') return 'paused'
    if (normalized === 'exited') return 'exited'
    if (normalized === 'created') return 'created'
    if (normalized === 'restarting') return 'restarting'
    if (normalized === 'removing') return 'removing'
    if (normalized === 'dead') return 'dead'
    return 'exited'
  }

  /**
   * Parse health from inspect info
   */
  private parseHealth(
    health?: Docker.ContainerInspectInfo['State']['Health']
  ): ContainerHealth {
    if (!health) return 'none'
    const status = health.Status?.toLowerCase()
    if (status === 'healthy') return 'healthy'
    if (status === 'unhealthy') return 'unhealthy'
    if (status === 'starting') return 'starting'
    return 'none'
  }

  /**
   * Parse health from status string (from listContainers)
   */
  private parseHealthFromStatus(statusStr: string): ContainerHealth {
    const lower = statusStr.toLowerCase()
    if (lower.includes('(healthy)')) return 'healthy'
    if (lower.includes('(unhealthy)')) return 'unhealthy'
    if (lower.includes('(health: starting)')) return 'starting'
    return 'none'
  }

  /**
   * Try to extract Tailscale IP from container network settings
   */
  private extractTailscaleIp(
    info: Docker.ContainerInspectInfo
  ): string | undefined {
    // Check for tailscale network
    const networks = info.NetworkSettings?.Networks
    if (networks) {
      for (const [name, network] of Object.entries(networks)) {
        if (name.toLowerCase().includes('tailscale')) {
          return network.IPAddress || undefined
        }
      }
    }
    return undefined
  }
}

// Export singleton instance
export const containerManager = new ContainerManager()
