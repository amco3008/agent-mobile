# Agent Mobile

Docker container for running Claude Code and Gemini CLI from your phone via Tailscale + Termux.

## Features

- **Claude Code CLI** - Full Claude Code access from mobile
- **Gemini CLI** - Google's Gemini CLI with OAuth
- **GitHub CLI (gh)** - Create PRs, manage issues, etc.
- **ripgrep (rg)** - Fast text search, auto-allowed for Claude
- **Skills support** - Drop skills into `skills/` folder (optional)
- **Dynamic Skill Learning** - Auto-learns skills from usage patterns with versioning
- **Tailscale** - Secure mesh networking, access from anywhere
- **Multi-stage build** - Robust installation even behind restricted networks
- **Corporate Proxy Support** - Built-in handling for proxies and custom CA certs
- **tmux** - Persistent sessions that survive disconnects
- **Git + GitHub** - Full git operations with token auth

> [!TIP]
> **Windows Users**: It is highly recommended to run this project inside **WSL2** (Ubuntu) rather than directly in Windows PowerShell/CMD. This avoids volume mount permission issues and provides better performance.

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

# Or simply
tmux new 
tmux attach
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
| `TAILSCALE_AUTHKEY` | Recommended - Tailscale authkey for automated Tailscale auth https://login.tailscale.com/admin/settings/keys |
| `GITHUB_TOKEN` | Optional - GitHub PAT for git and gh CLI (needs `repo`, `read:org`, `workflow` scopes) |
| `GIT_EMAIL` | Optional - Git commit email (use GitHub email for Vercel) |
| `GIT_NAME` | Optional - Git commit author name |
| `HTTP_PROXY` | Optional - Corporate proxy URL (e.g., `http://proxy:8080`) |
| `HTTPS_PROXY` | Optional - Corporate proxy URL for secure traffic |
| `NO_PROXY` | Optional - Domains to bypass proxy (default: `localhost,127.0.0.1`) |

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

## Skill System (Auto-Learning) [BETA]

The container includes a **dynamic skill learning system** that automatically detects usage patterns and generates reusable skills.

### How It Works

1. **Observation** - Hooks capture tool usage, domain keywords, and success/failure signals
2. **Learning** - Pattern analysis detects repeated workflows (e.g., Grep → Read → Edit → Bash)
3. **Generation** - High-scoring patterns become skill candidates for approval
4. **Versioning** - Each skill is a Git repository with rollback capability
5. **Auto-Improvement** - Skills evolve based on effectiveness metrics (≥90% confidence = auto-apply)

### Commands

Run inside the container:

```bash
# Skill management CLI
python3 ~/.claude/skills/_skill-manager/scripts/manage.py <command>
```

| Command | Description |
|---------|-------------|
| `list` | List all skills with status & effectiveness |
| `learn` | Analyze patterns, generate candidates |
| `candidates` | Show pending skill candidates |
| `approve <id>` | Approve a candidate |
| `reject <id>` | Reject a candidate |
| `history <skill>` | Show version history |
| `rollback <skill> <ver>` | Restore previous version |
| `stats` | Show usage analytics |
| `improve <skill>` | Force auto-improvement analysis |

### Example Workflow

```bash
# Use Claude Code normally - patterns are captured automatically

# Check for learnable patterns
python3 ~/.claude/skills/_skill-manager/scripts/manage.py learn

# Review candidates
python3 ~/.claude/skills/_skill-manager/scripts/manage.py candidates

# Approve a useful pattern
python3 ~/.claude/skills/_skill-manager/scripts/manage.py approve candidate-abc123

# The skill is now active and versioned
python3 ~/.claude/skills/_skill-manager/scripts/manage.py list
```

### Supported Domains

Skills are auto-tagged with domains based on detected keywords:

- **devops** - docker, kubernetes, terraform, ci/cd
- **security** - audit, vulnerability, owasp, encryption
- **data_science** - pandas, numpy, model, tensorflow
- **frontend** - react, vue, css, webpack
- **backend** - api, rest, database, orm
- **git** - merge, rebase, branch, pr

### Configuration

Edit `skills/.skill-system/config.json` to customize:

```json
{
  "learning": {
    "auto_suggest": true,
    "min_frequency": 2,
    "score_threshold": 0.6
  },
  "improvement": {
    "enabled": true,
    "auto_apply_threshold": 0.9,
    "success_rate_trigger": 0.7
  }
}
```

## Phone Setup (Android)

1. Install **Tailscale** from Play Store
2. Login with same account as container
3. Install **Termux** from F-Droid
4. In Termux:
   ```bash
   pkg install openssh
   ssh agent@<tailscale-ip>
   # Password: agent
   ```

## Corporate Proxy / SSL Setup

If you are behind a corporate firewall that intercepts SSL traffic:

1. **Proxy Settings**: Add your proxy URLs to the [.env](file:///.env) file.
2. **CA Certificates**:
   - Create a `certs/` directory in the project root.
   - Drop your corporate Root CA certificate (in `.crt` format) inside.
   - The container will automatically import it on startup via `update-ca-certificates`.
3. **Docker Desktop**: Remember to also set your proxy in **Docker Desktop Settings > Resources > Proxies** so it can pull the base images.

## Volumes

Data persists across container restarts and rebuilds:

| Volume | Host Path | Container Path | Purpose |
|--------|-----------|----------------|---------|
| `tailscale-state` | - | `/var/lib/tailscale` | Tailscale auth |
| `claude-config` | - | `~/.claude` | Claude settings and auth |
| `config` | - | `~/.config` | Git and gh CLI config |
| `ssh-keys` | - | `/etc/ssh/ssh_host_keys` | SSH host keys |
| `./home` | `agent-mobile/home/` | `~/projects` | Projects (easy file access) |
| `./skills` | `agent-mobile/skills/` | `~/.claude/skills` | Skills + skill system data |
| `./certs` | `agent-mobile/certs/` | `/usr/local/share/ca-certificates/extra` | Custom CA certificates |

**Bind mounts** (`./home`, `./skills`) are accessible from your host PC - drop files directly into these folders.

## Rebuilding

```bash
docker-compose down
docker-compose up -d --build
```

Everything persists - no need to re-auth or clear SSH keys.
