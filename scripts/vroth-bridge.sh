#!/bin/bash
# vroth-bridge.sh — Send a message to another Vroth instance via their Clawdbot gateway
# Usage: vroth-bridge.sh <target> <session_key> <message>
# Example: vroth-bridge.sh markets "agent:main:telegram:group:-5159563342" "Hey Markets, Core here"
#
# Targets are resolved from VROTH_BRIDGE_TARGETS env or /home/agent/clawd/collective/bridge-targets.json
# Each target needs: host (Tailscale IP/hostname), port, token

set -euo pipefail

TARGET="${1:-}"
SESSION_KEY="${2:-}"
MESSAGE="${3:-}"

if [[ -z "$TARGET" || -z "$SESSION_KEY" || -z "$MESSAGE" ]]; then
  echo "Usage: vroth-bridge.sh <target> <session_key> <message>"
  echo "Targets: core, markets"
  exit 1
fi

# Load bridge targets
TARGETS_FILE="${VROTH_BRIDGE_TARGETS:-/home/agent/clawd/collective/bridge-targets.json}"

if [[ ! -f "$TARGETS_FILE" ]]; then
  echo "Error: Bridge targets file not found: $TARGETS_FILE"
  echo "Create it with: {\"core\": {\"host\": \"100.x.x.x\", \"port\": 18789, \"token\": \"...\"}}"
  exit 1
fi

# Extract target config
HOST=$(jq -r ".${TARGET}.host // empty" "$TARGETS_FILE")
PORT=$(jq -r ".${TARGET}.port // 18789" "$TARGETS_FILE")
TOKEN=$(jq -r ".${TARGET}.token // empty" "$TARGETS_FILE")

if [[ -z "$HOST" || -z "$TOKEN" ]]; then
  echo "Error: Target '$TARGET' not found or missing host/token in $TARGETS_FILE"
  exit 1
fi

# Send message via Clawdbot gateway API
URL="http://${HOST}:${PORT}/api/sessions/send"

RESPONSE=$(curl -s --connect-timeout 5 --max-time 15 \
  -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"sessionKey\": \"${SESSION_KEY}\", \"message\": \"${MESSAGE}\"}" \
  "$URL" 2>&1)

if echo "$RESPONSE" | jq -e '.ok' >/dev/null 2>&1; then
  echo "✅ Message sent to ${TARGET}"
else
  echo "❌ Failed to send to ${TARGET}: ${RESPONSE}"
  exit 1
fi
