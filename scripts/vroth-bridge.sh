#!/bin/bash
# vroth-bridge.sh — Send a message to another Vroth instance
# Usage: vroth-bridge.sh <target> <message>
#   vroth-bridge.sh markets "Found a high-edge signal on SOL"
#   vroth-bridge.sh core "Risk alert: position concentration too high"
#   vroth-bridge.sh collective "Shift report: analyzed 5 markets"
#
# Targets: core, markets (or any defined in bridge-targets.json)
# "collective" sends to ALL other instances
# Messages are delivered to the target's group chat session by default

set -euo pipefail

TARGET="${1:-}"
MESSAGE="${2:-}"

if [[ -z "$TARGET" || -z "$MESSAGE" ]]; then
  echo "Usage: vroth-bridge.sh <target> <message>"
  echo "Targets: core, markets, collective (all)"
  exit 1
fi

# Config locations
TARGETS_FILE="/home/agent/clawd/collective/bridge-targets.json"
SESSIONS_FILE="/home/agent/clawd/collective/bridge-sessions.json"

if [[ ! -f "$TARGETS_FILE" ]]; then
  echo "Error: Bridge targets not found: $TARGETS_FILE"
  exit 1
fi

# Determine who I am (skip self when sending to collective)
SELF=$(jq -r '.self // empty' "$TARGETS_FILE")

send_to() {
  local name="$1"
  local msg="$2"
  
  local host=$(jq -r ".instances.${name}.host // empty" "$TARGETS_FILE")
  local port=$(jq -r ".instances.${name}.port // 18789" "$TARGETS_FILE")
  local token=$(jq -r ".instances.${name}.token // empty" "$TARGETS_FILE")
  local session=$(jq -r ".defaultSession // empty" "$TARGETS_FILE")

  if [[ -z "$host" || -z "$token" ]]; then
    echo "❌ Target '$name' not found or missing host/token"
    return 1
  fi

  local url="http://${host}:${port}/api/sessions/send"
  local response=$(curl -s --connect-timeout 5 --max-time 15 \
    -X POST \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -d "{\"sessionKey\": \"${session}\", \"message\": \"${msg}\"}" \
    "$url" 2>&1)

  if echo "$response" | jq -e '.ok' >/dev/null 2>&1; then
    echo "✅ → ${name}"
  else
    echo "❌ → ${name}: ${response}"
    return 1
  fi
}

if [[ "$TARGET" == "collective" || "$TARGET" == "all" ]]; then
  # Send to everyone except self
  for name in $(jq -r '.instances | keys[]' "$TARGETS_FILE"); do
    if [[ "$name" != "$SELF" ]]; then
      send_to "$name" "$MESSAGE"
    fi
  done
else
  send_to "$TARGET" "$MESSAGE"
fi
