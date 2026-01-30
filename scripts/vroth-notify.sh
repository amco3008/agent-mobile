#!/bin/bash
# vroth-notify.sh — Auto-notify other instances on cross-domain events
# Usage:
#   vroth-notify.sh <event-type> <message> [target]
#
# Event types:
#   code-push      Code pushed to GitHub (notify all)
#   risk-alert     Risk/security alert (notify all)
#   signal-found   Trading signal found (notify core)
#   deployment     Deployment event (notify all)
#   health-issue   Health check failure (notify all)
#   task-complete  Task completion (notify creator)
#
# Target: core, markets, collective (default: auto-detect from event type)

set -euo pipefail

EVENT_TYPE="${1:-}"
MESSAGE="${2:-}"
TARGET="${3:-}"

if [[ -z "$EVENT_TYPE" || -z "$MESSAGE" ]]; then
  echo "Usage: vroth-notify.sh <event-type> <message> [target]"
  echo ""
  echo "Event types:"
  echo "  code-push      - Code pushed to GitHub (notify all)"
  echo "  risk-alert     - Risk/security alert (notify all)"
  echo "  signal-found   - Trading signal found (notify core)"
  echo "  deployment     - Deployment event (notify all)"
  echo "  health-issue   - Health check failure (notify all)"
  echo "  task-complete  - Task completion (notify creator)"
  echo ""
  echo "Examples:"
  echo "  vroth-notify.sh code-push 'Pushed 3 commits to vroth branch'"
  echo "  vroth-notify.sh risk-alert 'Position concentration >50%'"
  echo "  vroth-notify.sh signal-found 'SOL edge: 2.3% arb opportunity' core"
  exit 1
fi

TARGETS_FILE="/home/agent/clawd/collective/bridge-targets.json"
INSTANCE_NAME=$(jq -r '.self // "unknown"' "$TARGETS_FILE" 2>/dev/null || echo "unknown")

# Auto-detect target based on event type
if [[ -z "$TARGET" ]]; then
  case "$EVENT_TYPE" in
    code-push|risk-alert|deployment|health-issue)
      TARGET="collective"
      ;;
    signal-found)
      TARGET="core"
      ;;
    task-complete)
      # Try to extract task creator from message or default to collective
      TARGET="collective"
      ;;
    *)
      TARGET="collective"
      ;;
  esac
fi

# Format message with event type prefix
FORMATTED_MSG="🔔 [$EVENT_TYPE from $INSTANCE_NAME] $MESSAGE"

# Check if vroth-bridge is available
if ! command -v vroth-bridge &>/dev/null; then
  echo "❌ vroth-bridge not found in PATH"
  echo "   Install: ln -sf /home/agent/projects/agent-mobile/scripts/vroth-bridge.sh /usr/local/bin/vroth-bridge"
  exit 1
fi

# Send notification
echo "📤 Notifying '$TARGET' about $EVENT_TYPE..."
vroth-bridge "$TARGET" "$FORMATTED_MSG"

# Log to local notification history
LOG_DIR="/home/agent/clawd/collective/notifications"
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
echo "[$TIMESTAMP] $EVENT_TYPE → $TARGET: $MESSAGE" >> "$LOG_DIR/$INSTANCE_NAME.log"
