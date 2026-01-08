---
name: system-status
description: Show agent-mobile system health when user asks "status", "show status", "system health", "check status", or runs /status
allowed-tools:
  - Bash
---

# System Status Skill

Shows the health of all agent-mobile systems at a glance.

## Trigger Phrases

- "status" or "/status"
- "show status"
- "system health"
- "check status"
- "what's the system status"

## Usage

When triggered, run the status script:

```bash
$HOME/.claude/skills/system-status/scripts/status.sh
```

## What It Checks

1. **Credentials** - OAuth token backup exists and is recent
2. **Skills Sync** - Git status of skills folder (clean/dirty, last commit)
3. **Tailscale** - Connection status and hostname
4. **Notifications** - ntfy config and topic
5. **Ralph Loops** - Active loops with iteration counts
6. **Backups** - Age of credential, config, and settings backups

## Output Format

```
╭─────────────────────────────────────────────────────────╮
│  AGENT-MOBILE STATUS                                    │
╰─────────────────────────────────────────────────────────╯

Credentials:     ✓ Valid (backup: 5 min ago)
Skills Sync:     ✓ Clean (last commit: 2h ago)
Tailscale:       ✓ Connected (agent-mobile.tail1234.ts.net)
Notifications:   ✓ Enabled (topic: my-claude-xyz)

Active Ralph Loops:
  • trading (iteration 12/50)
  • zones (iteration 3/20)

Backups:
  • credentials: 5 min ago
  • config: 5 min ago
  • settings.local: 5 min ago
```
