# Agent Mobile

Docker container for running Claude Code and Gemini CLI from your phone via Tailscale + Termux.

## Features

- **Claude Code CLI** - Full Claude Code access from mobile
- **Gemini CLI** - Google's Gemini CLI with OAuth
- **gemini-manager skill** - Let Claude delegate implementation to Gemini
- **Tailscale** - Secure mesh networking, access from anywhere
- **tmux** - Persistent sessions that survive disconnects
- **Git + GitHub** - Full git operations with token auth

## Quick Start

1. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your tokens
   ```

2. **Build and run**
   ```bash
   docker-compose up -d --build
   ```

3. **Get Tailscale IP**
   ```bash
   docker logs agent-mobile
   # Look for "Tailscale IP: 100.x.x.x"
   ```

4. **Connect from Termux**
   ```bash
   pkg install openssh
   ssh agent@<tailscale-ip>
   # Password: agent
   ```

5. **First time auth**
   ```bash
   claude    # OAuth with Anthropic
   gemini    # OAuth with Google
   ```

## Using tmux

tmux keeps your session alive when you disconnect.

```bash
# Start a new session
tmux new -s dev

# Detach (Ctrl+a, then d)
# Close Termux, switch apps, lose connection - session persists

# Reconnect later
tmux attach -t dev
```

### Key Bindings

| Keys | Action |
|------|--------|
| `Ctrl+a, d` | Detach session |
| `Ctrl+a, \|` | Split vertical |
| `Ctrl+a, -` | Split horizontal |
| `Ctrl+a, arrow` | Switch panes |
| Mouse/touch | Select, scroll, resize |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub PAT for git operations |
| `TAILSCALE_AUTHKEY` | Optional - for automated Tailscale auth |

## Using the Gemini Manager Skill

Claude can delegate implementation work to Gemini:

```
> Manage the implementation of a login form using Gemini
> Drive Gemini to refactor this function
> Use gemini-manager skill to add tests
```

Claude reads, plans, and verifies. Gemini implements.

## Phone Setup (Android)

1. Install **Tailscale** from Play Store
2. Login with same account as container
3. Install **Termux** from F-Droid
4. In Termux:
   ```bash
   pkg install openssh
   ssh agent@<tailscale-ip>
   ```

## Volumes

Data persists across container restarts:

- `tailscale-state` - Tailscale auth
- `claude-config` - Claude settings and auth
- `agent-home` - Projects directory
- `git-config` - Git credentials

## Rebuilding

```bash
docker-compose down
docker-compose up -d --build
```

Tailscale auth and Claude login persist in volumes.
