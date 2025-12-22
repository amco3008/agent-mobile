# Agent Mobile

Docker container for running Claude Code and Gemini CLI from your phone via Tailscale + Termux.

## Features

- **Claude Code CLI** - Full Claude Code access from mobile
- **Gemini CLI** - Google's Gemini CLI with OAuth
- **Skills support** - Drop skills into `skills/` folder (optional)
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

## Skills (Optional)

Drop Claude Code skills into the `skills/` folder. They're mounted at `~/.claude/skills/`.

```bash
# Example: Install gemini-manager skill
cd skills
git clone https://github.com/alchemiststudiosDOTai/claude-code-gemini-manager-skill.git
docker-compose restart
```

Then use:
```
> Manage the implementation of X using Gemini
```

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

Data persists across container restarts and rebuilds:

| Volume | Host Path | Container Path | Purpose |
|--------|-----------|----------------|---------|
| `tailscale-state` | - | `/var/lib/tailscale` | Tailscale auth |
| `claude-config` | - | `~/.claude` | Claude settings and auth |
| `git-config` | - | `~/.config/git` | Git credentials |
| `ssh-keys` | - | `/etc/ssh/ssh_host_keys` | SSH host keys |
| `./home` | `agent-mobile/home/` | Agent home (easy file access) |
| `./skills` | `agent-mobile/skills/` | `~/.claude/skills` | Skills folder |

**Bind mounts** (`./home`, `./skills`) are accessible from your host PC - drop files directly into these folders.

## Rebuilding

```bash
docker-compose down
docker-compose up -d --build
```

Everything persists - no need to re-auth or clear SSH keys.
