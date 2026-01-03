# Agent Mobile

Docker container for running Claude Code and Gemini CLI from your phone via Tailscale + Termux.

## Features

- **Claude Code CLI** - Full Claude Code access from mobile
- **Gemini CLI** - Google's Gemini CLI with OAuth
- **GitHub CLI (gh)** - Create PRs, manage issues, etc.
- **ripgrep (rg)** - Fast text search, auto-allowed for Claude
- **Passwordless sudo** - Agent can install missing packages without prompts
- **Docker access** - Spin up Redis, PostgreSQL, or other containers from within the agent
- **Skills support** - Drop skills into `skills/` folder
- **Pre-integrated Skills** - Includes [awesome-Claude-skills](https://github.com/ComposioHQ/awesome-Claude-skills) by default
- **Dynamic Skill Learning** - Auto-learns skills from usage patterns with versioning
- **Global CLAUDE.md** - Auto-generated config with available skills, persisted across restarts
- **Push Notifications** - Get notified on your phone when Claude needs input (via ntfy.sh)
- **Tailscale** - Secure mesh networking, access from anywhere
- **Multi-stage build** - Robust installation even behind restricted networks
- **Corporate Proxy Support** - Auto-detects and trusts corporate proxies (Cisco/Zscaler)
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
   ssh agent@agent-mobile    # MagicDNS hostname (recommended)
   # Or use IP: ssh agent@<tailscale-ip>
   # Password: agent
   ```

5. **First time auth**
   ```bash
   claude    # OAuth with Anthropic
   gemini    # OAuth with Google
   ```

## Using tmux

tmux keeps your session alive when you disconnect - essential for mobile use since Android suspends Termux when backgrounded.

### Session Picker

On SSH login, you'll see an interactive session picker:

```
╭─────────────────────────────────╮
│      tmux Session Picker        │
╰─────────────────────────────────╯

Existing sessions:
  1) main: 2 windows
  2) dev: 1 windows

  n) New session
  s) Skip (no tmux)

Select [1]:
```

- Press **Enter** to attach to session 1 (default)
- Type a number to attach to that session
- Type **n** to create a new named session
- Type **s** to skip tmux

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
| `GITHUB_TOKEN` | Optional - GitHub PAT for git and gh CLI (needs `repo`, `read:org`, `workflow` scopes). Also enables auto-backup of skills folder to GitHub. |
| `GIT_EMAIL` | Optional - Git commit email (use GitHub email for Vercel) |
| `GIT_NAME` | Optional - Git commit author name |
| `HTTP_PROXY` | Optional - Corporate proxy URL (e.g., `http://proxy:8080`) |
| `HTTPS_PROXY` | Optional - Corporate proxy URL for secure traffic |
| `NO_PROXY` | Optional - Domains to bypass proxy (default: `localhost,127.0.0.1`) |
| `TAILSCALE_EXIT_NODE` | Optional - Tailscale IP of a node to use as a gateway (bypass firewalls) |
| `AGENT_CPUS` | Optional - Max CPU cores (default: `2.0`) |
| `AGENT_MEMORY` | Optional - Max RAM limit (default: `3G`) |
| `AGENT_NODE_MEMORY` | Optional - Node.js heap size in MB (default: `2048`) |
| `NTFY_ENABLED` | Optional - Enable push notifications (default: `false`) |
| `NTFY_TOPIC` | Optional - Your unique ntfy.sh topic name |
| `NTFY_SERVER` | Optional - ntfy server URL (default: `https://ntfy.sh`) |
| `NTFY_RATE_LIMIT` | Optional - Min seconds between notifications (default: `15`) |

## Resource Configuration

You can dynamically adjust the agent's resources based on your host machine's specs via the `.env` file.

| Host RAM | AGENT_MEMORY | AGENT_NODE_MEMORY | Use Case |
| :--- | :--- | :--- | :--- |
| **8 GB** | `2G` | `1024` | Basic tasks, small repos |
| **16 GB** | `4G` | `2048` | Standard development |
| **32 GB+** | `8G` | `6144` | Large codebases, high performance |

> [!NOTE]
> Changes to these variables require a container restart: `docker-compose up -d`.

## Agent Environment

When Claude Code runs inside this container, it has access to:

### GitHub Access
- `GITHUB_TOKEN` environment variable available for API calls
- `gh` CLI pre-authenticated
- Git credentials configured for private repos

### Tailscale Network
- Container runs on a Tailscale VPN mesh
- MagicDNS hostname: `agent-mobile` (or get IP with `tailscale ip -4`)
- When Claude deploys local services (web servers, APIs), connect via `http://agent-mobile:<port>`

### System Access
- Passwordless sudo for installing packages
- Python 3, pip, and common build tools available

### Docker Access
- Full access to host Docker daemon via socket mount
- Run containers: `docker run -d --name redis -p 6379:6379 redis:latest`
- Manage containers: `docker ps`, `docker stop`, `docker rm`, `docker logs`
- Useful for spinning up Redis, PostgreSQL, or other dev services

### Workspace Trust
- `/home/agent` and `/home/agent/projects` are pre-trusted (no trust dialog)
- Custom folders you trust are **persisted** across container restarts
- Safe commands (git, ls, cat, etc.) run without prompts
- Dangerous commands (rm, chmod, etc.) still require approval

### Custom Directives (CLAUDE.local.md)

Edit `skills/CLAUDE.local.md` to add persistent instructions for Claude:

```markdown
## Preferences
- Use kebab-case for file names
- Before commit, update docs

## Style
- Keep responses concise
```

These get merged into `~/.claude/CLAUDE.md` on container start.

Drop Claude Code skills into the `skills/` folder. They're mounted at `~/.claude/skills/`.

### Pre-integrated Skills

The container comes pre-integrated with the [awesome-Claude-skills](https://github.com/ComposioHQ/awesome-Claude-skills) repository. These skills are automatically synchronized to your `skills/awesome-claude-skills` folder on first start and available to Claude Code immediately.

### Custom Skills

You can also add your own skills:

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
| `scan` | Scan transcripts for usage patterns |
| `learn` | Analyze scanned patterns, generate candidates |
| `preferences` | Learn user preferences from prompts (`--force` to update CLAUDE.md) |
| `prompts [N]` | View captured user prompts (default: 20) |
| `candidates` | Show pending skill candidates |
| `approve <id>` | Approve a candidate |
| `reject <id>` | Reject a candidate |
| `history <skill>` | Show version history |
| `rollback <skill> <ver>` | Restore previous version |
| `stats` | Show usage analytics |
| `improve <skill>` | Force auto-improvement analysis |

### Example Workflow

```bash
# Use Claude Code normally - patterns are captured in transcripts

# Scan transcripts for patterns
python3 ~/.claude/skills/_skill-manager/scripts/manage.py scan

# Learn user preferences (workflows, style) and update CLAUDE.md
python3 ~/.claude/skills/_skill-manager/scripts/manage.py preferences --force

# Or generate skill candidates from patterns
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

### Skills Version Control

When `GITHUB_TOKEN` is set, the skills folder is automatically version-controlled:

- **Repo**: `agent-mobile-claude-skills` (private, created on your GitHub account)
- **Auto-commit on shutdown**: When container receives SIGTERM, all skill changes are committed and pushed
- **Auto-commit on startup**: Catches any uncommitted changes from previous unclean shutdown
- **Commit format**: `Auto-commit from agent-mobile: YYYY-MM-DD HH:MM:SS`

This ensures your custom skills, learned preferences, and skill system data are backed up to GitHub automatically.

```bash
# Manual commands (inside container)
cd ~/.claude/skills
git status              # Check for changes
git log --oneline -5    # View recent commits
git add -A && git commit -m "Manual commit"
git push origin master
```

## Push Notifications (ntfy.sh)

Get notified on your phone when Claude needs your input - no more waiting around!

### Notification Events

| Event | Title | Body |
|-------|-------|------|
| **Permission Required** | `[myproject] update docs...` | `$ rm -rf /tmp/old-files` |
| **User Input Needed** | `[myproject] add feature...` | `Which database? → PostgreSQL \| MySQL` |
| **Session Ended** | `[myproject] fix bug...` | `Claude session has ended` |

Notifications include:
- **Session context** - Working directory in brackets (useful when running multiple Claude sessions)
- **Prompt preview** - First ~15 characters of your prompt
- **Action details** - The actual command, question with options, or completion status

### Setup

1. **Install ntfy app** on your phone:
   - [Android (Play Store)](https://play.google.com/store/apps/details?id=io.heckel.ntfy)
   - [iOS (App Store)](https://apps.apple.com/app/ntfy/id1625396347)

2. **Subscribe to a topic**: Open the app and subscribe to a unique, hard-to-guess topic name (e.g., `my-claude-agent-abc123`)

3. **Configure the agent** in your `.env`:
   ```bash
   NTFY_ENABLED=true
   NTFY_TOPIC=my-claude-agent-abc123
   ```

4. **Restart the container**:
   ```bash
   docker-compose up -d --build
   ```

### Self-Hosted ntfy

For privacy, you can [self-host ntfy](https://docs.ntfy.sh/install/):

```bash
NTFY_SERVER=https://ntfy.your-domain.com
```

## Phone Setup (Android)

1. Install **Tailscale** from Play Store
2. Login with same account as container
3. Install **Termux** from F-Droid
4. In Termux:
   ```bash
   pkg install openssh
   ssh agent@agent-mobile    # MagicDNS hostname
   # Or: ssh agent@<tailscale-ip>
   # Password: agent
   ```

> [!NOTE]
> **Android suspends Termux when backgrounded**, causing SSH to eventually disconnect. The tmux session picker ensures you always use tmux, so Claude keeps running - just reattach when you reconnect.

> [!TIP]
> **Use voice dictation** - typing long prompts on a phone gets tiring (your thumbs will thank you). Use your keyboard's microphone button (Gboard, SwiftKey, etc.) to dictate prompts to Claude.

## Corporate Proxy / SSL Setup

If you are behind a corporate firewall that intercepts SSL traffic:

1. **Proxy Settings**: Add your proxy URLs to the [.env](file:///.env) file.
2. **CA Certificates**:
   - Create a `certs/` directory in the project root.
   - Drop your corporate Root CA certificate (in `.crt` format) inside.
   - The container will automatically import it on startup via `update-ca-certificates`.
3. **Docker Desktop**: Remember to also set your proxy in **Docker Desktop Settings > Resources > Proxies** so it can pull the base images.

> [!TIP]
> **Automatic Proxy Detection**: The container now attempts to automatically detect if an intercepting proxy (like Cisco Umbrella or Zscaler) is blocking SSL connections on startup. If detected, it will try to fetch and trust the proxy's certificate automatically.

## Bypassing Corporate Firewalls (Exit Nodes)

If your corporate network blocks access to the AI APIs directly (e.g., `anthropic.com`), you can route the agent's traffic through an **Exit Node**:

1. **Setup an Exit Node**: Enable "Run as Exit Node" on your phone's Tailscale app or another node outside the firewall (e.g., Home PC or VPS).
2. **Authorize**: In the Tailscale Admin Console, edit the machine's route settings and check "Use as exit node".
3. **Configure Agent**: Set the `TAILSCALE_EXIT_NODE` environment variable in your [.env](file:///.env) file to that machine's Tailscale IP.
4. **Restart**: `docker-compose up -d`.

Traffic will now bypass the corporate firewall entirely.

### Troubleshooting

**SSL Handshake Failure (Initial Setup)**
If you see SSL/TLS handshake failures even with an exit node configured, your corporate firewall might be blocking the *initial* connection to Tailscale.
1. **Switch Network**: Briefly connect your computer to a mobile hotspot or non-corporate Wi-Fi.
2. **Start Container**: Run `docker-compose up -d` to let Tailscale authenticate and connect.
3. **Switch Back**: Once connected, you can switch back to corporate Wi-Fi. The established tunnel (or the exit node configuration) should allow it to reconnect.

## Volumes

Data persists across container restarts and rebuilds:

| Volume | Host Path | Container Path | Purpose |
|--------|-----------|----------------|---------|
| Docker socket | `/var/run/docker.sock` | `/var/run/docker.sock` | Docker daemon access |
| `tailscale-state` | - | `/var/lib/tailscale` | Tailscale auth |
| `claude-config` | - | `~/.claude` | Claude settings and auth |
| `config` | - | `~/.config` | Git and gh CLI config |
| `ssh-keys` | - | `/etc/ssh/ssh_host_keys` | SSH host keys |
| `./home` | `agent-mobile/home/` | `~/projects` | Projects (easy file access) |
| `./skills` | `agent-mobile/skills/` | `~/.claude/skills` | Skills + skill system data |
| `./certs` | `agent-mobile/certs/` | `/usr/local/share/ca-certificates/extra` | Custom CA certificates |

**Bind mounts** (`./home`, `./skills`) are accessible from your host PC - drop files directly into these folders.

### Credential & Config Backup

Claude OAuth credentials and user config are automatically backed up to `./home/` on each container start:

| Backup File | Contents |
|-------------|----------|
| `home/.claude-credentials-backup.json` | OAuth tokens (access/refresh) |
| `home/.claude-config-backup.json` | Workspace trust, user settings |

Backups are also created:
- Every 5 minutes (background daemon)
- On each user prompt (via hook)
- On container shutdown (SIGTERM trap)

## Rebuilding

```bash
docker-compose down
docker-compose up -d --build
```

Everything persists - no need to re-auth or clear SSH keys.

> **Note**: If you run `docker-compose down -v` (with `-v` flag), volumes are deleted. Credentials and config will be restored from the backups in `./home/` on next start.
