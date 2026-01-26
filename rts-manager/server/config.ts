/**
 * Server configuration with environment variable support
 */

export const config = {
  // Server port
  port: parseInt(process.env.RTS_PORT || process.env.PORT || '9091', 10),

  // Frontend dev server port (for CORS)
  frontendPort: parseInt(process.env.RTS_FRONTEND_PORT || '5173', 10),

  // Allowed CORS origins (comma-separated in env)
  corsOrigins: (process.env.RTS_CORS_ORIGINS || '')
    .split(',')
    .filter(Boolean)
    .map(s => s.trim()),

  // Home directory for searching Ralph files
  homeDir: process.env.HOME || process.env.USERPROFILE || '/home/agent',

  // Projects directory (relative to home or absolute)
  projectsDir: process.env.RTS_PROJECTS_DIR || 'projects',

  // Polling intervals (in milliseconds)
  polling: {
    tmux: parseInt(process.env.RTS_TMUX_POLL_MS || '2000', 10),
    system: parseInt(process.env.RTS_SYSTEM_POLL_MS || '5000', 10),
    containers: parseInt(process.env.RTS_CONTAINERS_POLL_MS || '5000', 10),
  },

  // Get default CORS origins if none specified
  getCorsOrigins(): string[] {
    if (this.corsOrigins.length > 0) {
      return this.corsOrigins
    }

    // Default origins for development
    return [
      `http://localhost:${this.frontendPort}`,
      `http://localhost:${this.port}`,
    ]
  },
}

export type Config = typeof config
