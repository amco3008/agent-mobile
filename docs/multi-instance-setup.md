# Multi-Instance Setup Guide

Complete guide for running multiple specialized agent-mobile instances from a single soul repo.

## Overview

The soul repo (`agent-mobile-clawd-soul`) can have multiple branches, each containing a different personality/specialization. By setting `CLAWD_SOUL_BRANCH` in `.env`, you control which personality loads on startup.

## Prerequisites

- Working agent-mobile installation
- GitHub account with agent-mobile-clawd-soul repo
- One Telegram bot per instance (from @BotFather)

## Example: Spinning Up Vroth-Markets (Trading Monitor)

This example shows how to run a second instance specialized for 24/7 trading monitoring alongside your main instance.

### Step 1: Create Soul Branch (One-Time Setup)

The `markets` branch already exists on the soul repo with specialized files:
- `SOUL.md` — Trading-focused personality (data-driven, terse, risk-first)
- `AGENTS.md` — Markets-specific workspace rules
- `HEARTBEAT.md` — Every heartbeat checks bot health, P&L, market opportunities
- `USER.md` — Trading context

To create additional branches for other specializations:

```bash
cd ~/agent-mobile-clawd-soul
git checkout -b my-specialization
# Edit SOUL.md, AGENTS.md, etc. for your use case
git add -A && git commit -m "Add my-specialization soul"
git push -u origin my-specialization
```

### Step 2: Create Telegram Bot

1. Open Telegram, message **@BotFather**
2. Send `/newbot`
3. Choose a name: `Vroth Markets` (or whatever you like)
4. Choose a username: `vroth_markets_bot` (must be unique)
5. Copy the bot token (format: `1234567890:ABCdef...`)
6. **Important:** Disable Group Privacy so bot can read all messages:
   - @BotFather → `/mybots` → select your bot
   - **Bot Settings** → **Group Privacy** → **Turn Off**

### Step 3: Create Telegram Group (Optional)

If you want multiple instances to collaborate:

1. Create new Telegram group: **"Vroth Collective"** (or any name)
2. Add yourself
3. Add **all** your bot instances to the group
4. Make all bots **admins** (so they can read all messages)
5. Get the group chat ID:
   - Send a test message in the group
   - Visit: `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`
   - Find `"chat":{"id":-1001234567890}` (negative number)
   - Note the `id` value

### Step 4: Clone and Configure Second Instance

```bash
# Clone agent-mobile to a new directory
cp -r ~/agent-mobile ~/agent-mobile-markets

cd ~/agent-mobile-markets

# Copy and edit .env
cp .env.example .env
```

Edit `.env`:

```bash
# Soul configuration
CLAWD_SOUL_BRANCH=markets   # ← Load trading personality

# Telegram bot (REQUIRED - different from main instance!)
TELEGRAM_BOT_TOKEN=your_markets_bot_token_here
CLAWDBOT_ENABLED=true

# API keys (same as main instance)
ANTHROPIC_API_KEY=your_key
GITHUB_TOKEN=your_token
BRAVE_API_KEY=your_key
GEMINI_API_KEY=your_key

# Optional: Use cheaper model for monitoring tasks
# (in clawdbot config, not .env)
# Markets can run on Sonnet 4.5 instead of Opus 4.5 to save $$
```

### Step 5: Adjust Port Mappings

Edit `docker-compose.yml` to avoid conflicts with the main instance:

```yaml
services:
  agent-mobile:
    container_name: agent-mobile-markets
    hostname: agent-mobile-markets
    
    ports:
      - "2223:22"           # SSH (main uses 2222)
      - "9092:9090"         # webtmux (main uses 9090)
      - "9093:9091"         # RTS Manager (main uses 9091)
      - "18790:18789"       # Clawdbot gateway (main uses 18789)
```

### Step 6: Configure Clawdbot

After first boot, configure Clawdbot for the Markets instance:

```bash
docker exec -it agent-mobile-markets bash
clawdbot configure
```

Key settings:
- **Agent workspace:** `/home/agent/clawd` (auto-set)
- **Model:** `anthropic/claude-sonnet-4-5` (cheaper than Opus for monitoring)
- **Heartbeat interval:** `5m` (less frequent than main instance to save costs)
- **Thinking level:** `low` (monitoring doesn't need deep reasoning)
- **Telegram bot token:** (already set from .env)

**Optional: Add group chat to allowlist**

If you created a group chat in Step 3:

```bash
clawdbot config channel telegram --add-group <GROUP_CHAT_ID>
```

### Step 7: Launch

```bash
cd ~/agent-mobile-markets
docker compose up -d --build
```

Monitor startup:
```bash
docker logs -f agent-mobile-markets
```

Look for:
- `[clawd-git] Soul branch: markets` — confirms correct branch loaded
- `[clawd-git] Cloned from GitHub (branch: markets)` — soul files synced
- `Clawdbot gateway listening on :18789` — gateway running

### Step 8: Test

Send a message to your Markets bot on Telegram. It should respond with its specialized personality (data-driven, terse, trading-focused).

If you set up a group chat, all instances can see each other's messages and coordinate.

## Cost Optimization

### Model Selection by Instance

| Instance | Model | Thinking | Use Case | Est. Cost/Month |
|----------|-------|----------|----------|-----------------|
| Core | Opus 4.5 | High | General assistant, complex reasoning | $100-150 |
| Markets | Sonnet 4.5 | Low | Trading monitoring, alerts | $30-50 |
| Dev | Opus 4.5 | High | Code review, PRs, complex debugging | $80-120 |
| Research | Sonnet 4.5 | Medium | Analysis, documentation, summaries | $40-60 |

Configure in Clawdbot config (`~/.clawdbot/clawdbot.json`):

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-5"
      },
      "thinkingDefault": "low",
      "heartbeat": {
        "every": "5m",
        "model": "anthropic/claude-sonnet-4-5"
      }
    }
  }
}
```

### Heartbeat Frequency

More frequent heartbeats = more API calls = higher cost:

| Interval | Calls/Day | Suitable For |
|----------|-----------|--------------|
| 2min | 720 | Critical monitoring (trading) |
| 5min | 288 | Standard monitoring |
| 10min | 144 | Low-priority background tasks |
| 30min | 48 | Periodic checks |

## Managing Multiple Instances

### SSH Access

Each instance has its own SSH port:

```bash
ssh agent@agent-mobile -p 2222        # Main instance
ssh agent@agent-mobile-markets -p 2223  # Markets instance
```

Or via Tailscale hostnames:
```bash
ssh agent@agent-mobile
ssh agent@agent-mobile-markets
```

### Logs

```bash
docker logs -f agent-mobile              # Main
docker logs -f agent-mobile-markets      # Markets
```

### Health Checks

```bash
# Main instance
curl http://localhost:18789/health

# Markets instance  
curl http://localhost:18790/health
```

### Stopping Instances

```bash
docker compose down                      # Main
cd ~/agent-mobile-markets && docker compose down  # Markets
```

## Group Chat Communication Patterns

When multiple instances share a Telegram group:

### Example Workflow: Issue Detection → Fix → Deploy

```
[Vroth-Markets] 🚨 Arb bot error detected
Position stuck, can't exit market 1234567
Error: "Insufficient liquidity"

[Vroth-Core] @VrothDev can you check the exit logic?

[Vroth-Dev] 🔄 Reviewing exit_position() code...

[Vroth-Dev] Found it - missing fallback for low-liquidity markets
Creating PR with fix

[Vroth-Dev] ✅ PR #42 ready
https://github.com/user/eth-arb-bot/pull/42

[Vroth-Core] @Matthew PR ready for review when you're free
```

### Coordination Protocols

- **Tagging:** Use `@VrothCore`, `@VrothMarkets`, `@VrothDev` to route tasks
- **Emojis:** 🚨 (urgent), ✅ (done), 🔄 (in progress), 📊 (report)
- **Handoffs:** Clearly state what's needed from the next agent
- **Status updates:** Keep group informed of progress

## Shared Memory

All instances can read/write to `/home/agent/projects/shared/`:

```bash
/home/agent/projects/shared/
├── memory/
│   ├── collective-memory.md       # Shared long-term memory
│   ├── daily-logs/                # Each instance's daily logs
│   │   ├── core-2026-01-30.md
│   │   ├── markets-2026-01-30.md
│   │   └── dev-2026-01-30.md
│   └── handoffs/                  # Task handoff notes
└── files/                         # Shared work files
    ├── specs/
    ├── analyses/
    └── reports/
```

Create the shared folder on first run:

```bash
docker exec -it agent-mobile bash
mkdir -p ~/projects/shared/{memory/daily-logs,memory/handoffs,files/{specs,analyses,reports}}
```

## Troubleshooting

### Issue: Bot can't read group messages

**Solution:** Disable Group Privacy in @BotFather:
```
/mybots → select bot → Bot Settings → Group Privacy → Turn Off
```

### Issue: Both bots respond to every message

**Symptom:** Double replies in group chat

**Solution:** Each bot should check if it's being addressed:
- Respond when mentioned: `@VrothMarkets status`
- Respond to direct questions in its domain
- Stay quiet on general chatter

### Issue: Port conflicts

**Symptom:** `address already in use`

**Solution:** Change ports in second instance's `docker-compose.yml`:
```yaml
ports:
  - "2223:22"      # Change first number only
  - "9092:9090"
  - "18790:18789"
```

### Issue: Wrong soul loaded

**Symptom:** Markets instance has Core personality

**Solution:** Check logs for soul branch:
```bash
docker logs agent-mobile-markets | grep "Soul branch"
```

Should show: `[clawd-git] Soul branch: markets`

If it shows `master`, check `CLAWD_SOUL_BRANCH` in `.env`

### Issue: High API costs

**Solution:** Tune each instance's model and heartbeat frequency:
- Use Sonnet 4.5 for simple tasks (monitoring, alerts)
- Use Opus 4.5 only for complex reasoning (coding, strategy)
- Increase heartbeat interval for non-critical tasks
- Set `thinkingDefault: "low"` for monitoring instances

## Advanced: Four-Instance Collective

For maximum parallel execution:

| Instance | Branch | Model | Heartbeat | Role |
|----------|--------|-------|-----------|------|
| Core | `master` | Opus 4.5 | 2min | Coordinator, human interface |
| Markets | `markets` | Sonnet 4.5 | 5min | Trading monitor, risk alerts |
| Dev | `dev` | Opus 4.5 | 10min | Code, PRs, security |
| Research | `research` | Sonnet 4.5 | 10min | Analysis, docs, strategy |

Port mappings:
- Core: 2222, 9090, 9091, 18789
- Markets: 2223, 9092, 9093, 18790
- Dev: 2224, 9094, 9095, 18791
- Research: 2225, 9096, 9097, 18792

Estimated total cost: ~$250-350/month for 24/7 four-instance operation

---

**Ready to build your collective 🐉**
