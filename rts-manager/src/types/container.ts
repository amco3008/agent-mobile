// Container types for Docker management

export interface Container {
  id: string           // Docker container ID (short, 12 chars)
  name: string         // Container name (without leading /)
  image: string        // Image name
  status: ContainerStatus
  state: string        // Raw state string from Docker
  health?: ContainerHealth
  created: Date
  ports: ContainerPort[]
  tailscaleIp?: string // Tailscale IP if available
}

export type ContainerStatus =
  | 'running'
  | 'paused'
  | 'exited'
  | 'created'
  | 'restarting'
  | 'removing'
  | 'dead'

export type ContainerHealth =
  | 'healthy'
  | 'unhealthy'
  | 'starting'
  | 'none'

export interface ContainerPort {
  private: number
  public?: number
  type: 'tcp' | 'udp'
}

export interface ContainerStats {
  containerId: string
  cpu: number          // CPU percentage (0-100)
  memory: {
    used: number       // bytes
    limit: number      // bytes
    percent: number    // 0-100
  }
  network: {
    rxBytes: number
    txBytes: number
  }
}
