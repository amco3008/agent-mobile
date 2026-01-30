# Agent Mobile

Docker container for running Claude Code and Gemini CLI from your phone via Tailscale + Termux.

## Features

- **Claude Code CLI** - Full Claude Code access from mobile (runs in autonomous mode by default)
- **Gemini CLI** - Google's Gemini CLI with OAuth
- **Claude SDK** - Anthropic Python SDK for sub-agents and API access
- **Ralph Loops** - Custom fork with multi-ralph support (no plugin required)
- **GitHub CLI (gh)** - Create PRs, manage issues, etc.
- **Platform CLIs** - Vercel, Supabase, and Railway CLIs for deployment management
- **ripgrep (rg)** - Fast text search, auto-allowed for Claude
- **Passwordless sudo** - Agent can install missing packages without prompts
- **Docker access** - Spin up Redis, PostgreSQL, or other containers from within the agent
- **Skills support** - Drop skills into `skills/` folder
- **Pre-integrated Skills** - Includes [awesome-Claude-skills](https://github.com/ComposioHQ/awesome-Claude-skills) by default
- **Dynamic Skill Learning** - Auto-learns skills from usage patterns with versioning
- **Global CLAUDE.md** - Auto-generated config with available skills, persisted across restarts
- **Push Notifications** - Get notified on your phone when Claude needs input (via ntfy.sh)
- **Clawdbot** - Multi-platform AI assistant with Telegram, Discord, Slack, and more
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

### RTS Manager (Web Dashboard)

A Factorio-style web dashboard for managing tmux sessions, Ralph loops, and Docker containers.

**URL:** `http://<tailscale-ip>:9091` (or `http://agent-mobile:9091` or `http://localhost:9091`)

- **Port:** 9091 (configurable via `RTS_PORT`)
- **Features:**
  - View all tmux sessions with pane previews
  - Click any pane to open interactive terminal
  - Monitor Ralph loop progress, steering questions, summaries
  - Start/stop/restart agent-mobile containers
  - Real-time CPU/memory monitoring
  - Industrial Factorio-inspired theme

To disable: Set `RTS_ENABLED=false` in `.env`

See [rts-manager/README.md](./rts-manager/README.md) for full documentation.

### Clawdbot (Telegram/Multi-Platform AI)

Clawdbot connects your Claude agent to messaging platforms like Telegram, Discord, Slack, and more.

**URL:** `http://<tailscale-ip>:18789` (or `http://agent-mobile:18789`)

**Setup:**

1. **Create a Telegram bot**:
   - Open Telegram and message `@BotFather`
   - Send `/newbot` and follow the prompts
   - Copy the bot token (looks like `123456789:ABCdef...`)

2. **Configure in `.env`**:
   ```bash
   CLAWDBOT_ENABLED=true
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   ```

3. **Restart the container**:
   ```bash
   docker-compose up -d
   ```

4. **Run onboarding** (first time only):
   ```bash
   docker exec -it agent-mobile clawdbot onboard
   ```

5. **Test**: Send a message to your bot on Telegram

**Features:**
- Chat with Claude via Telegram from anywhere
- Uses your Claude Pro/Max subscription
- Supports voice messages and images
- DM pairing mode for security (unknown senders get a pairing code)
- **Auto-restart on crash** - Supervisor monitors clawdbot and restarts it automatically (handles config-change restarts too)

To disable: Set `CLAWDBOT_ENABLED=false` in `.env`

### Web Access (webtmux)

You can access your terminal directly from a browser without SSH apps, which is often easier on mobile devices or locked-down machines.

**URL:** `http://<tailscale-ip>:9090` (or `http://agent-mobile:9090` or `http://localhost:9090`)

- **Port:** 9090
- **Session:** Connects directly to the `main` tmux session
- **Auth:** None (run in trusted Tailscale network)
- **Features:**
  - Full write access
  - Resizable terminal (matches browser window)
  - Works on mobile browsers (Safari, Chrome)

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
| `ANTHROPIC_API_KEY` | Optional - Anthropic API key for Claude SDK (sub-agents, programmatic access) |
| `GIT_EMAIL` | Optional - Git commit email (use GitHub email for Vercel) |
| `GIT_NAME` | Optional - Git commit author name |
| `HTTP_PROXY` | Optional - Corporate proxy URL (e.g., `http://proxy:8080`) |
| `HTTPS_PROXY` | Optional - Corporate proxy URL for secure traffic |
| `NO_PROXY` | Optional - Domains to bypass proxy (default: `localhost,127.0.0.1`) |
| `TAILSCALE_EXIT_NODE` | Optional - Tailscale IP of a node to use as a gateway (bypass firewalls) |
| `TAILSCALE_EXIT_NODE_ONLY` | Optional - Comma-separated domains to route through exit node (e.g. `api.anthropic.com,claude.ai`). All other traffic bypasses the exit node. If not set, all traffic goes through exit node. |
| `AGENT_CPUS` | Optional - Max CPU cores (default: `2.0`, recommended: `8.0` for deploys) |
| `AGENT_MEMORY` | Optional - Max RAM limit (default: `3G`) |
| `AGENT_RESERVATION_CPUS` | Optional - Guaranteed CPU cores (default: `0.5`, recommended: `1.0`) |
| `AGENT_NODE_MEMORY` | Optional - Node.js heap size in MB (default: `2048`) |
| `NTFY_ENABLED` | Optional - Enable push notifications (default: `false`) |
| `NTFY_TOPIC` | Optional - Your unique ntfy.sh topic name |
| `NTFY_SERVER` | Optional - ntfy server URL (default: `https://ntfy.sh`) |
| `NTFY_RATE_LIMIT` | Optional - Min seconds between notifications (default: `15`) |
| `WEBTMUX_ENABLED` | Optional - Enable browser-based terminal on port 9090 (default: `false`) |
| `CLAUDE_STARTUP_UPDATE` | Optional - Check for Claude Code updates on container start (default: `true`) |
| `DISABLE_AUTOUPDATER` | Optional - Disable Claude's built-in auto-updater (default: `1`) |
| `RTS_ENABLED` | Optional - Enable RTS Manager dashboard on port 9091 (default: `true`) |
| `RTS_PORT` | Optional - RTS Manager server port (default: `9091`) |
| `RTS_API_KEY` | Optional - API key for RTS Manager authentication (disabled if unset) |
| `CLAWDBOT_ENABLED` | Optional - Enable Clawdbot Telegram gateway on port 18789 (default: `false`) |
| `TELEGRAM_BOT_TOKEN` | Optional - Telegram bot token from @BotFather (required if Clawdbot enabled) |
| `BRAVE_API_KEY` | Optional - Brave Search API key for Clawdbot web search ([get one free](https://brave.com/search/api/)) |
| `GEMINI_API_KEY` | Optional - Gemini API key for Clawdbot AI features (memory, skills like nano-banana-pro image generation) |
| `VERCEL_TOKEN` | Optional - Vercel CLI token ([get one here](https://vercel.com/account/tokens)) |
| `SUPABASE_ACCESS_TOKEN` | Optional - Supabase CLI access token ([get one here](https://supabase.com/dashboard/account/tokens)) |
| `RAILWAY_TOKEN` | Optional - Railway CLI token ([get one here](https://railway.app/account/tokens)) |
| `SUPABASE_SERVICE_ROLE_KEY_*` | Optional - Per-project Supabase service role keys (e.g. `SUPABASE_SERVICE_ROLE_KEY_MYAPP`) |

### Clawdbot Config & Soul Sync

When `GITHUB_TOKEN` is set, clawdbot data is automatically synced to GitHub:

| Directory | Repo | Contents |
|-----------|------|----------|
| `~/.clawdbot/` | `agent-mobile-clawdbot-config` | Config, channel settings |
| `~/clawd/` | `agent-mobile-clawd-soul` | Soul, memory, personality |

- **Auto-commit on shutdown**: When container receives SIGTERM, changes are committed and pushed
- **Auto-pull on startup**: Data is pulled from GitHub when container starts

This ensures your clawdbot configuration and memory persist across all agent-mobile instances.

## Build Arguments

| Argument | Description |
|----------|-------------|
| `CLAUDE_INSTALL_METHOD` | Installation method: `native` (default, recommended) or `npm` |

```bash
# Use native installer (default, recommended by Anthropic)
docker-compose build

# Use npm installer (legacy)
docker-compose build --build-arg CLAUDE_INSTALL_METHOD=npm
```

## Resource Configuration

You can dynamically adjust the agent's resources based on your host machine's specs via the `.env` file.

| Host RAM | AGENT_CPUS | AGENT_MEMORY | AGENT_NODE_MEMORY | Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **8 GB** | `2.0` | `2G` | `1024` | Basic tasks, small repos |
| **16 GB** | `4.0` | `4G` | `2048` | Standard development |
| **32 GB+** | `8.0` | `8G` | `6144` | Large codebases, deploys |

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

### Autonomous Mode

Claude runs with `--dangerously-skip-permissions` by default via bash alias. This means:
- **No permission prompts** - All tools run without asking
- **Fully autonomous** - Ideal for Ralph loops and unattended operation
- **Pre-trusted workspaces** - `/home/agent` and `/home/agent/projects`

To run Claude normally (with permission prompts):
```bash
command claude    # Bypasses the alias
```

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

### Ralph Loops (Autonomous Iteration)

Ralph loops enable autonomous iteration - Claude keeps working until done without manual re-prompting.

> [!IMPORTANT]
> **Uninstall Official Plugin**: If you have the official `ralph-loop@claude-plugins-official` installed, you **MUST** uninstall it to avoid conflicts with this custom fork:
> ```bash
> /plugin uninstall ralph-loop@claude-plugins-official
> ```

> [!NOTE]
> This is a **custom fork** of `ralph-loop@claude-plugins-official`, stored in `skills/ralph-loop/`. It's fully self-contained and does **not** require the official plugin. The fork adds multi-ralph support, fresh-context loops (`/ralph-fresh`), better error handling, and persists with your skills folder.

**Trigger phrases:**
- "start a ralph loop" or "run ralph"
- "keep working until done"
- "iterate until complete"

**Standard Loops (Persistent Context):**
```bash
/ralph-loop "Fix all TypeScript errors" --task-id "type-fixes" --max-iterations 50 --completion-promise "ALL_ERRORS_FIXED"
```

**Fresh Context Loops (New Session per iteration):**
```bash
/ralph-fresh "Research and write documentation" --task-id "docs" --max-iterations 20
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `--task-id` | Unique ID for concurrent loops (enables multi-ralph) |
| `--max-iterations` | Safety limit (recommended: 20-100) |
| `--completion-promise` | Text to output when done: `<promise>TEXT</promise>` |
| `--mode` | `yolo` (autonomous, default) or `review` (asks questions) |

**Multi-Ralph:** Run multiple loops in parallel with different `--task-id` values. Each loop has its own state file at `.claude/ralph-loop-{task-id}.local.md`.

**External Fresh Loops:** For fresh context loops run outside of Claude (e.g., Claude prepares the task, user executes), use the `ralph` command:
```bash
# Claude creates spec at .claude/ralph-spec-myfeature.md
ralph myfeature    # Run in separate terminal
```

**Interactive Planning:** The `ralph-invoke` skill requires Claude to research and plan before starting. It will explicitly ask if you want **Persistent** vs **Fresh** context to prevent history confusion on long tasks.

> [!WARNING]
> Autonomous loops consume tokens rapidly. Always use `--max-iterations` as a safety net.

### System Health (`/health`)

Quick health check for all agent-mobile systems. Run `/health` or say "system health" to see:

```
╭─────────────────────────────────────────────────────────╮
│  AGENT-MOBILE STATUS                                    │
╰─────────────────────────────────────────────────────────╯

Credentials:     ✓ Valid (backup: 5 min ago)
Skills Sync:     ✓ Clean (last commit: 2h ago)
Tailscale:       ✓ Connected (agent-mobile.tail1234.ts.net)
Notifications:   ✓ Enabled (topic: my-topic)

Active Ralph Loops:
  • task-abc123 @ myproject (iteration 5/50)

Deployed Services:
  ● app-api (up 2h, port 3001)
  ● redis (up 2h, port 6379)

Backups:
  • credentials: 5 min ago
  • config: 5 min ago
  • settings.local: 5 min ago
```

> [!TIP]
> **Always check `/health` before deploying services** to avoid conflicts when multiple Claude sessions are running. The "Deployed Services" section shows what's already running.

### Claude SDK (Sub-Agents)

The Anthropic Python SDK is pre-installed for programmatic API access:

```python
from anthropic import Anthropic

client = Anthropic()  # Uses ANTHROPIC_API_KEY env var

# Spawn a sub-agent for a focused task
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=4096,
    system="You are a focused sub-agent.",
    messages=[{"role": "user", "content": "Review this code for bugs"}]
)
print(response.content[0].text)
```

See `skills/claude-sdk/SKILL.md` for parallel processing and advanced patterns.

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
| `home/.claude-settings-local-backup.json` | User-granted command permissions |

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
