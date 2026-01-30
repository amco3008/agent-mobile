# Vroth-Markets Setup Guide

## Overview
Spin up a second agent-mobile container running Vroth-Markets — a specialized trading monitor.

## Prerequisites
- agent-mobile running (Vroth-Core)
- Anthropic API key
- Brave API key (optional, for market research)

## Step-by-Step

### 1. Create Telegram Bot (2 min)
1. Open Telegram, message @BotFather
2. `/newbot`
3. Name: `Vroth Markets`
4. Username: `vroth_markets_bot` (or similar available name)
5. Copy the bot token

### 2. Create Telegram Group (1 min)
1. Create new Telegram group: "Vroth Collective"
2. Add yourself (Matthew)
3. Add the existing Vroth bot (`@your_existing_vroth_bot`)
4. Add the new Vroth-Markets bot (`@vroth_markets_bot`)
5. Make both bots admins (so they can read all messages)
6. Get the group chat ID:
   - Send a message in the group
   - Visit: `https://api.telegram.org/bot<MARKETS_BOT_TOKEN>/getUpdates`
   - Find the `chat.id` (negative number like `-1001234567890`)

### 3. Configure Environment (1 min)
```bash
cd /path/to/agent-mobile
cp .env vroth-markets/.env
```

Edit `vroth-markets/.env`:
```env
# Override for Markets instance
TELEGRAM_BOT_TOKEN=<your new markets bot token>
# Keep same API keys
ANTHROPIC_API_KEY=<same key>
BRAVE_API_KEY=<same key>
GEMINI_API_KEY=<same key>
```

### 4. Set Up Soul Repo
The Markets instance needs its own clawd workspace:
```bash
# Option A: Clone the soul repo to a markets branch
cd /tmp
git clone https://github.com/amco3008/agent-mobile-clawd-soul.git clawd-markets
cd clawd-markets
git checkout -b markets
# Copy the specialized files
cp /path/to/agent-mobile/vroth-markets/SOUL.md .
cp /path/to/agent-mobile/vroth-markets/AGENTS.md .
cp /path/to/agent-mobile/vroth-markets/HEARTBEAT.md .
cp /path/to/agent-mobile/vroth-markets/USER.md .
git add -A && git commit -m "Vroth-Markets soul initialization"
git push -u origin markets
```

### 5. Update Clawdbot Config
Copy `clawdbot-config-template.json` and fill in:
- `<MARKETS_BOT_TOKEN>` → your new bot token
- `<GROUP_CHAT_ID>` → the Vroth Collective group ID
- `<BRAVE_API_KEY>` → your Brave API key

Place the config at the appropriate path inside the container.

### 6. Launch
```bash
cd /path/to/agent-mobile

# Option A: Docker compose overlay
docker compose -f docker-compose.yml -f vroth-markets/docker-compose.markets.yml up -d

# Option B: Standalone (if you prefer separate management)
# Adjust docker-compose.markets.yml to be standalone and run:
docker compose -f vroth-markets/docker-compose.markets.yml up -d
```

### 7. Verify
- Check container is running: `docker ps | grep markets`
- SSH in: `ssh agent@agent-mobile-markets -p 2223`
- Check Clawdbot: `curl http://localhost:18790/health`
- Send a message in the Vroth Collective group — Markets should respond

### 8. Configure Group Chat in Both Instances
Update Vroth-Core's Clawdbot config to also listen to the group:
- Add the group chat ID to Core's Telegram allowlist
- Both bots should be able to read/write in the group

## Cost Estimates
- **Sonnet 4.5** for Markets (not Opus) — cheaper for monitoring tasks
- **5 min heartbeats** — less frequent than Core (2 min)
- **Thinking: low** — Markets doesn't need deep reasoning for status checks
- Estimated: ~$30-50/month for Markets instance API costs

## Architecture
```
┌─────────────────────┐     ┌──────────────────────┐
│   agent-mobile      │     │ agent-mobile-markets  │
│   (Vroth-Core)      │     │ (Vroth-Markets)       │
│                     │     │                       │
│ Port 18789 (CBot)   │     │ Port 18790 (CBot)     │
│ Port 2222 (SSH)     │     │ Port 2223 (SSH)       │
│ Port 9090 (web)     │     │ Port 9092 (web)       │
│                     │     │                       │
│ Soul: clawd/        │     │ Soul: clawd-markets/  │
│ Model: Opus 4.5     │     │ Model: Sonnet 4.5     │
│ HB: 2min            │     │ HB: 5min              │
└────────┬────────────┘     └────────┬───────────────┘
         │                           │
         └─────────┬─────────────────┘
                   │
         ┌─────────▼─────────┐
         │  Vroth Collective  │
         │  (Telegram Group)  │
         │                    │
         │  Matthew + Bots    │
         └────────────────────┘
```

## Troubleshooting
- **Bots can't read group messages:** Make sure "Group Privacy" is OFF in BotFather (`/mybots` → Bot Settings → Group Privacy → Turn Off)
- **Port conflicts:** Check no other services use 2223, 9092, 9093, 18790
- **Tailscale auth:** Markets container needs its own Tailscale auth key
- **Both bots responding:** Each bot has its own token, so they operate independently

---
*Ready to build the collective 🐉📊*
