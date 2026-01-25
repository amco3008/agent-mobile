# RTS Manager

A Factorio-style web dashboard for managing tmux sessions and Claude Code Ralph loops.

## Features

- **Session Grid**: View all tmux sessions with pane previews
- **Terminal Embedding**: Click any pane to open an interactive terminal
- **Ralph Loop Monitoring**: Track iteration progress, status, and steering
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
         ┌────────────┼────────────┐
         │            │            │
    TmuxService  RalphWatcher  SystemMonitor
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
│   │   ├── system/         # Resource monitoring
│   │   └── factorio/       # Zoom controls, minimap
│   ├── stores/             # Zustand stores
│   └── types/              # TypeScript types
├── server/                 # Backend
│   ├── routes/             # REST API routes
│   ├── services/           # Business logic
│   └── socket/             # Socket.io handlers
└── package.json
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tmux/sessions` | List all tmux sessions |
| GET | `/api/tmux/sessions/:id` | Get session details |
| POST | `/api/tmux/sessions/:id/keys` | Send keystrokes |
| GET | `/api/ralph/loops` | List active Ralph loops |
| POST | `/api/ralph/loops/:id/steer` | Answer steering question |
| GET | `/api/system/stats` | Get system stats |

## Socket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `tmux:sessions:update` | Server→Client | Session list changed |
| `tmux:pane:output` | Server→Client | Terminal output |
| `ralph:loop:update` | Server→Client | Loop state changed |
| `system:stats` | Server→Client | Resource updates |

## Configuration

Default ports:
- Frontend dev: `5173`
- Backend API: `9091`

## Container Integration

To run inside agent-mobile container:

1. Add to `docker-compose.yml`:
```yaml
ports:
  - "9091:9091"
```

2. Add to `entrypoint.sh`:
```bash
cd /home/agent/rts-manager && npm run dev:server &
```

## Tech Stack

- **Frontend**: Vite, React 18, TypeScript, TanStack Query, Zustand
- **Backend**: Express, Socket.io, node-pty
- **Styling**: Tailwind CSS, Framer Motion
- **Terminal**: xterm.js
