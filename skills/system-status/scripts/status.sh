#!/bin/bash

# Agent-Mobile System Status Script
# Shows health of all systems at a glance

set -euo pipefail

# Colors (if terminal supports them)
if [[ -t 1 ]] && command -v tput &>/dev/null; then
    GREEN=$(tput setaf 2)
    RED=$(tput setaf 1)
    YELLOW=$(tput setaf 3)
    RESET=$(tput sgr0)
else
    GREEN=""
    RED=""
    YELLOW=""
    RESET=""
fi

# Helper: format time ago
time_ago() {
    local file="$1"
    if [[ ! -f "$file" ]]; then
        echo "missing"
        return
    fi
    local mtime
    mtime=$(stat -c %Y "$file" 2>/dev/null || stat -f %m "$file" 2>/dev/null)
    local now
    now=$(date +%s)
    local diff=$((now - mtime))

    if [[ $diff -lt 60 ]]; then
        echo "${diff}s ago"
    elif [[ $diff -lt 3600 ]]; then
        echo "$((diff / 60))m ago"
    elif [[ $diff -lt 86400 ]]; then
        echo "$((diff / 3600))h ago"
    else
        echo "$((diff / 86400))d ago"
    fi
}

# Header
echo "╭─────────────────────────────────────────────────────────╮"
echo "│  AGENT-MOBILE STATUS                                    │"
echo "╰─────────────────────────────────────────────────────────╯"
echo ""

# 1. Credentials
CREDS_FILE="$HOME/.claude/.credentials.json"
CREDS_BACKUP="$HOME/projects/.claude-credentials-backup.json"

if [[ -f "$CREDS_FILE" ]] && [[ -s "$CREDS_FILE" ]]; then
    backup_age=$(time_ago "$CREDS_BACKUP")
    echo "Credentials:     ${GREEN}✓${RESET} Valid (backup: $backup_age)"
else
    echo "Credentials:     ${RED}✗${RESET} Missing or empty"
fi

# 2. Skills Sync
SKILLS_DIR="$HOME/.claude/skills"

if [[ -d "$SKILLS_DIR/.git" ]]; then
    cd "$SKILLS_DIR"
    git_status=$(git status --porcelain 2>/dev/null | wc -l)
    last_commit=$(git log -1 --format="%cr" 2>/dev/null || echo "unknown")

    if [[ $git_status -eq 0 ]]; then
        echo "Skills Sync:     ${GREEN}✓${RESET} Clean (last commit: $last_commit)"
    else
        echo "Skills Sync:     ${YELLOW}!${RESET} $git_status uncommitted changes"
    fi
    cd - > /dev/null
else
    echo "Skills Sync:     ${YELLOW}!${RESET} Not a git repo"
fi

# 3. Tailscale
if command -v tailscale &>/dev/null; then
    ts_status=$(tailscale status --json 2>/dev/null || echo "{}")
    ts_self=$(echo "$ts_status" | jq -r '.Self.DNSName // empty' 2>/dev/null | sed 's/\.$//')
    ts_online=$(echo "$ts_status" | jq -r '.Self.Online // false' 2>/dev/null)

    if [[ "$ts_online" == "true" ]] && [[ -n "$ts_self" ]]; then
        echo "Tailscale:       ${GREEN}✓${RESET} Connected ($ts_self)"
    elif [[ -n "$ts_self" ]]; then
        echo "Tailscale:       ${YELLOW}!${RESET} Offline ($ts_self)"
    else
        echo "Tailscale:       ${RED}✗${RESET} Not connected"
    fi
else
    echo "Tailscale:       ${YELLOW}!${RESET} Not installed"
fi

# 4. Notifications
NTFY_CONF="$HOME/.claude/ntfy.conf"

if [[ -f "$NTFY_CONF" ]]; then
    ntfy_topic=$(grep -E "^topic=" "$NTFY_CONF" 2>/dev/null | cut -d= -f2 || echo "")
    ntfy_enabled=$(grep -E "^enabled=" "$NTFY_CONF" 2>/dev/null | cut -d= -f2 || echo "false")

    if [[ "$ntfy_enabled" == "true" ]] && [[ -n "$ntfy_topic" ]]; then
        echo "Notifications:   ${GREEN}✓${RESET} Enabled (topic: $ntfy_topic)"
    elif [[ -n "$ntfy_topic" ]]; then
        echo "Notifications:   ${YELLOW}!${RESET} Disabled (topic: $ntfy_topic)"
    else
        echo "Notifications:   ${RED}✗${RESET} No topic configured"
    fi
else
    echo "Notifications:   ${YELLOW}!${RESET} Config not found"
fi

# 5. Active Ralph Loops
echo ""
RALPH_FILES=$(ls "$HOME/.claude/ralph-loop"*.local.md 2>/dev/null || true)

if [[ -n "$RALPH_FILES" ]]; then
    echo "Active Ralph Loops:"
    for file in $RALPH_FILES; do
        if [[ -f "$file" ]]; then
            task_id=$(grep '^task_id:' "$file" 2>/dev/null | sed 's/task_id: *//' | sed 's/^"\(.*\)"$/\1/' || echo "unknown")
            iteration=$(grep '^iteration:' "$file" 2>/dev/null | sed 's/iteration: *//' || echo "?")
            max_iter=$(grep '^max_iterations:' "$file" 2>/dev/null | sed 's/max_iterations: *//' || echo "?")

            if [[ "$max_iter" == "0" ]]; then
                echo "  • $task_id (iteration $iteration/∞)"
            else
                echo "  • $task_id (iteration $iteration/$max_iter)"
            fi
        fi
    done
else
    echo "Active Ralph Loops: none"
fi

# 6. Backups
echo ""
echo "Backups:"

creds_backup_age=$(time_ago "$HOME/projects/.claude-credentials-backup.json")
config_backup_age=$(time_ago "$HOME/projects/.claude-config-backup.json")
settings_backup_age=$(time_ago "$HOME/projects/.claude-settings-local-backup.json")

echo "  • credentials: $creds_backup_age"
echo "  • config: $config_backup_age"
echo "  • settings.local: $settings_backup_age"

echo ""
