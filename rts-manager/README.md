# RTS Manager

A Factorio-style web dashboard for managing tmux sessions, Claude Code Ralph loops, and Docker containers.

## Features

### Container Management
- **Detect, start, stop, restart** agent-mobile containers via Docker API
- **Container selector** in sidebar with "All Containers" aggregated view
- **Status indicators** for running/stopped/paused states
- **Health monitoring** with CPU/memory stats per container

### Cross-Container Monitoring
- **Subscribe to remote containers** to monitor their tmux sessions and Ralph loops
- **Aggregated dashboard** shows sessions/loops from all subscribed containers
- **Container badges** distinguish remote items from local ones
- **Real-time updates** via Socket.io subscriptions per container

### Tmux Session Management
- **Session Grid**: View all tmux sessions with pane previews
- **Terminal Embedding**: Click any pane to open an interactive terminal
- **Remote terminal access**: Monitor and interact with sessions in other containers

### Ralph Loop Monitoring
- **Track iteration progress**, status, and steering (persistent and fresh modes)
- **Steering panel** for review mode questions with context and options
- **Progress display** shows real-time Claude work updates
- **Summary display** on loop completion
- **Spec preview** in loop cards

### Factorio-Style UI
- **Production Chain**: Visualize the prompt → Claude → output flow with animations
- **Resource Monitor**: Real-time CPU, memory, and process stats
- **Throughput Stats**: Track active loops, iterations, and averages
- **Mini-map**: Quick navigation between sessions and loops
- **Zoom Controls**: 3 levels (overview, session, terminal)
- **Industrial Theme**: Dark Factorio-inspired aesthetic with belt animations

## Quick Start (Development)

```bash
# Install dependencies
npm install

# Start development servers (frontend + backend)
npm run dev

# Access the dashboard
open http://localhost:5173
```

> **Note**: In production (inside agent-mobile container), the dashboard is pre-built and accessible at `http://agent-mobile:9091`.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     RTS Manager Dashboard (Browser)                      │
│  ┌───────────┐ ┌──────────────┐ ┌─────────────┐ ┌───────────────────┐  │
│  │ Container │ │ SessionGrid  │ │ LoopList    │ │ ResourceMonitor   │  │
│  │ Selector  │ │ (all/filter) │ │ (all/filter)│ │ + ThroughputStats │  │
│  └─────┬─────┘ └──────────────┘ └─────────────┘ └───────────────────┘  │
└────────┼────────────────────────────────────────────────────────────────┘
         │
   Socket.io + REST
         │
┌────────┼────────────────────────────────────────────────────────────────┐
│        ▼              RTS Manager Server (Node.js)                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │
│  │ Container   │ │ TmuxService │ │ RalphWatcher│ │ SystemMonitor   │   │
│  │ Manager     │ │ (local)     │ │ (local)     │ │                 │   │
│  └──────┬──────┘ └─────────────┘ └─────────────┘ └─────────────────┘   │
│         │                                                               │
│  ┌──────┴──────┐ ┌──────────────────────────────────────────────────┐  │
│  │ Docker API  │ │ Remote Services (cross-container monitoring)     │  │
│  │ (dockerode) │ │ ┌─────────────────┐ ┌─────────────────────────┐  │  │
│  └──────┬──────┘ │ │ RemoteTmuxSvc   │ │ RemoteRalphSvc          │  │  │
│         │        │ │ (docker exec)   │ │ (docker exec)           │  │  │
│         │        │ └────────┬────────┘ └────────────┬────────────┘  │  │
└─────────┼────────┴──────────┼───────────────────────┼───────────────────┘
          │                   │                       │
          ▼                   ▼                       ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ agent-mobile-1  │  │ agent-mobile-2  │  │ agent-mobile-N  │
│ (container)     │  │ (container)     │  │ (container)     │
│ • tmux sessions │  │ • tmux sessions │  │ • tmux sessions │
│ • Ralph loops   │  │ • Ralph loops   │  │ • Ralph loops   │
│ • Claude Code   │  │ • Claude Code   │  │ • Claude Code   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
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

### Container Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/containers` | List agent-mobile containers |
| GET | `/api/containers/:id` | Get container details |
| GET | `/api/containers/:id/stats` | Get container resource stats |
| POST | `/api/containers/:id/start` | Start container |
| POST | `/api/containers/:id/stop` | Stop container |
| POST | `/api/containers/:id/restart` | Restart container |

### Cross-Container Tmux (Remote)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/containers/:id/tmux/sessions` | List tmux sessions in container |
| GET | `/api/containers/:id/tmux/sessions/:sid` | Get session details |
| GET | `/api/containers/:id/tmux/sessions/:sid/capture` | Capture pane output |
| POST | `/api/containers/:id/tmux/sessions/:sid/keys` | Send keystrokes to container |

### Cross-Container Ralph (Remote)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/containers/:id/ralph/loops` | List Ralph loops in container |
| GET | `/api/containers/:id/ralph/loops/:taskId` | Get loop details |
| GET | `/api/containers/:id/ralph/loops/:taskId/progress` | Get loop progress |
| GET | `/api/containers/:id/ralph/loops/:taskId/steering` | Get steering question |
| POST | `/api/containers/:id/ralph/loops/:taskId/steer` | Answer steering question |

### Local Tmux & Ralph
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tmux/sessions` | List all local tmux sessions |
| GET | `/api/tmux/sessions/:id` | Get session details |
| POST | `/api/tmux/sessions/:id/keys` | Send keystrokes |
| GET | `/api/ralph/loops` | List active Ralph loops |
| POST | `/api/ralph/loops/:id/steer` | Answer steering question |
| GET | `/api/system/stats` | Get system stats |

## Socket Events

### Local Events
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
| `ralph:spec:created` | Server→Client | New spec file detected |
| `system:stats` | Server→Client | Resource updates |

### Cross-Container Events
| Event | Direction | Description |
|-------|-----------|-------------|
| `container:subscribe` | Client→Server | Subscribe to container updates |
| `container:unsubscribe` | Client→Server | Unsubscribe from container |
| `container:tmux:update` | Server→Client | Tmux sessions for subscribed container |
| `container:ralph:update` | Server→Client | Ralph loops for subscribed container |
| `container:ralph:steering` | Server→Client | Steering question in container |

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
| `RTS_REMOTE_POLL_MS` | `3000` | Polling interval for cross-container monitoring |
| `RTS_CONTAINERS_POLL_MS` | `5000` | Polling interval for container list |
| `RTS_ALLOWED_IPS` | (none) | IP whitelist (comma-separated, optional) |

## Multi-Container Monitoring

RTS Manager can monitor tmux sessions and Ralph loops across multiple agent-mobile containers.

### How It Works

1. **Container Detection**: RTS Manager detects containers via Docker API (image/name containing "agent-mobile" or label `com.rts.type=agent`)

2. **Subscription Model**: The frontend subscribes to specific containers via Socket.io:
   - Select a container in the sidebar to subscribe
   - "All Containers" shows aggregated data from all subscribed containers

3. **Remote Execution**: Commands are executed inside containers via `docker exec`:
   - `tmux list-sessions` for session discovery
   - Reading `.claude/` files for Ralph loop state
   - Sending keystrokes to remote panes

4. **Real-time Updates**: The server polls subscribed containers (configurable interval) and emits updates via Socket.io

### Container Selector

The sidebar shows a container selector:
- **All Containers**: Aggregated view of local + all subscribed containers
- **Individual containers**: Filter to show only that container's sessions/loops

### Container Badges

When viewing "All Containers", items from remote containers show a blue badge with the container name.

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

## Production Deployment

RTS Manager is automatically built into the agent-mobile Docker image and starts on container boot.

### How It Works

1. **Build Time**: The main `Dockerfile` builds RTS Manager:
   - Compiles frontend (Vite) to `dist/`
   - Compiles server (TypeScript) to `dist/server/`
   - Installs production dependencies
   - Output: `/opt/rts-manager/`

2. **Runtime**: `entrypoint.sh` starts the server:
   - Enabled by default (`RTS_ENABLED=true`)
   - Serves on port 9091 (`RTS_PORT`)
   - Health check with retry on startup
   - Logs to `~/rts-manager.log`

### Configuration

Set these in your `.env` file:

```bash
# Enable/disable RTS Manager (default: true)
RTS_ENABLED=true

# Server port (default: 9091)
RTS_PORT=9091

# Optional: API key for authentication
RTS_API_KEY=your-secret-key
```

### Accessing the Dashboard

- **Via Tailscale**: `http://agent-mobile:9091`
- **Via Port Forward**: `http://localhost:9091`
- **Direct IP**: `http://<tailscale-ip>:9091`

### Container Detection

The RTS Manager detects containers by:
- Image name containing "agent-mobile"
- Container name containing "agent-mobile"
- Label `com.rts.type=agent`

## Development

For local development without Docker:

## Standalone Docker Image

RTS Manager can also be built as a standalone container:

```bash
cd rts-manager
docker build -t rts-manager .
docker run -d \
  -p 9091:9091 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e RTS_API_KEY=your-secret-key \
  rts-manager
```

This is useful for:
- Running RTS Manager on a dedicated host
- Orchestrating multiple agent-mobile containers from outside

## Tech Stack

- **Frontend**: Vite, React 19, TypeScript, TanStack Query, Zustand
- **Backend**: Express, Socket.io, node-pty, dockerode
- **Styling**: Tailwind CSS, Framer Motion
- **Terminal**: xterm.js
