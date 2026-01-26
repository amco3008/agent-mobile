# RTS Manager

A Factorio-style web dashboard for managing tmux sessions, Claude Code Ralph loops, and Docker containers.

## Features

- **Container Management**: Detect, start, stop, restart agent-mobile containers via Docker API
- **Session Grid**: View all tmux sessions with pane previews
- **Terminal Embedding**: Click any pane to open an interactive terminal
- **Ralph Loop Monitoring**: Track iteration progress, status, and steering (persistent and fresh modes)
- **Production Chain**: Visualize the prompt → Claude → output flow
- **Resource Monitor**: Real-time CPU, memory, and process stats
- **Throughput Stats**: Track active loops and iterations
- **Mini-map**: Quick navigation between sessions and loops
- **Industrial Theme**: Dark Factorio-inspired aesthetic

## Quick Start

```bash
# Install dependencies
npm install

# Start development servers (frontend + backend)
npm run dev

# Access the dashboard
open http://localhost:5173
```

## Architecture

```
Frontend (Vite + React)     Backend (Express + Socket.io)
         │                            │
         └──── Socket.io + REST ──────┘
                      │
    ┌─────────────────┼─────────────────┐
    │         │            │            │
ContainerMgr TmuxService  RalphWatcher  SystemMonitor
    │
Docker Socket (/var/run/docker.sock)
    │
    └──→ agent-mobile containers
```

## Project Structure

```
rts-manager/
├── src/                    # Frontend
│   ├── api/                # API client and hooks
│   ├── components/         # React components
│   │   ├── layout/         # Dashboard layout
│   │   ├── tmux/           # Session/pane components
│   │   ├── ralph/          # Ralph loop components
│   │   ├── containers/     # Docker container management
│   │   ├── system/         # Resource monitoring
│   │   └── factorio/       # Zoom controls, minimap
│   ├── stores/             # Zustand stores
│   └── types/              # TypeScript types
├── server/                 # Backend
│   ├── routes/             # REST API routes
│   ├── services/           # Business logic (TmuxService, RalphWatcher, ContainerManager, etc.)
│   └── socket/             # Socket.io handlers
└── package.json
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/containers` | List agent-mobile containers |
| GET | `/api/containers/:id` | Get container details |
| GET | `/api/containers/:id/stats` | Get container resource stats |
| POST | `/api/containers/:id/start` | Start container |
| POST | `/api/containers/:id/stop` | Stop container |
| POST | `/api/containers/:id/restart` | Restart container |
| GET | `/api/tmux/sessions` | List all tmux sessions |
| GET | `/api/tmux/sessions/:id` | Get session details |
| POST | `/api/tmux/sessions/:id/keys` | Send keystrokes |
| GET | `/api/ralph/loops` | List active Ralph loops |
| POST | `/api/ralph/loops/:id/steer` | Answer steering question |
| GET | `/api/system/stats` | Get system stats |

## Socket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `containers:update` | Server→Client | Container list changed |
| `tmux:sessions:update` | Server→Client | Session list changed |
| `tmux:pane:output` | Server→Client | Terminal output |
| `ralph:loop:update` | Server→Client | Loop state changed |
| `ralph:progress:update` | Server→Client | Ralph progress updated |
| `ralph:steering:pending` | Server→Client | Steering question pending |
| `ralph:steering:answered` | Server→Client | Steering question answered |
| `ralph:summary:created` | Server→Client | Loop completion summary |
| `system:stats` | Server→Client | Resource updates |

## Configuration

Default ports:
- Frontend dev: `5173`
- Backend API: `9091`

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RTS_PORT` | `9091` | Backend server port |
| `RTS_CORS_ORIGINS` | `http://localhost:5173` | Allowed CORS origins (comma-separated) |
| `RTS_API_KEY` | (none) | API key for authentication (optional, disabled if unset) |
| `RTS_RATE_LIMIT` | `100` | Max requests per minute per IP |
| `RTS_ALLOWED_IPS` | (none) | IP whitelist (comma-separated, optional) |

## Security

### Rate Limiting

All API endpoints are rate-limited to 100 requests per minute per IP by default. Configure with `RTS_RATE_LIMIT`.

### API Key Authentication

Optional API key authentication can be enabled by setting `RTS_API_KEY`:

```bash
export RTS_API_KEY="your-secret-key"
```

When enabled, all API requests must include the `X-API-Key` header:

```bash
curl -H "X-API-Key: your-secret-key" http://localhost:9091/api/containers
```

### Input Validation

- Container IDs validated as 12-64 hex characters
- Tmux session/pane IDs validated for safe characters
- Request bodies validated for required fields

## Container Integration

To run inside agent-mobile container:

1. Add to `docker-compose.yml`:
```yaml
ports:
  - "9091:9091"
volumes:
  - /var/run/docker.sock:/var/run/docker.sock  # Required for container management
```

2. Add to `entrypoint.sh`:
```bash
cd /home/agent/rts-manager && npm run dev:server &
```

### Container Detection

The RTS Manager detects containers by:
- Image name containing "agent-mobile"
- Container name containing "agent-mobile"
- Label `com.rts.type=agent`

## Tech Stack

- **Frontend**: Vite, React 19, TypeScript, TanStack Query, Zustand
- **Backend**: Express, Socket.io, node-pty, dockerode
- **Styling**: Tailwind CSS, Framer Motion
- **Terminal**: xterm.js
