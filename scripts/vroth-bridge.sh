#!/bin/bash
# vroth-bridge.sh — Send a message to another Vroth instance
# Usage: vroth-bridge.sh <target> <message>
#   vroth-bridge.sh markets "Found a high-edge signal on SOL"
#   vroth-bridge.sh core "Risk alert: position concentration too high"
#   vroth-bridge.sh collective "Shift report: analyzed 5 markets"
#
# Targets: core, markets (or any defined in bridge-targets.json)
# "collective" sends to ALL other instances

set -euo pipefail

TARGET="${1:-}"
MESSAGE="${2:-}"

if [[ -z "$TARGET" || -z "$MESSAGE" ]]; then
  echo "Usage: vroth-bridge.sh <target> <message>"
  echo "Targets: core, markets, collective (all)"
  exit 1
fi

TARGETS_FILE="/home/agent/clawd/collective/bridge-targets.json"

if [[ ! -f "$TARGETS_FILE" ]]; then
  echo "Error: Bridge targets not found: $TARGETS_FILE"
  exit 1
fi

SELF=$(jq -r '.self // empty' "$TARGETS_FILE")

send_to() {
  local name="$1"
  local msg="$2"
  
  local hostname=$(jq -r ".instances.${name}.hostname // empty" "$TARGETS_FILE")
  local host=$(jq -r ".instances.${name}.host // empty" "$TARGETS_FILE")
  local port=$(jq -r ".instances.${name}.port // 18789" "$TARGETS_FILE")
  local token=$(jq -r ".instances.${name}.token // empty" "$TARGETS_FILE")

  if [[ -z "$token" ]]; then
    echo "❌ Target '$name' not found or missing token"
    return 1
  fi

  # Try hostname first (Tailscale MagicDNS), fall back to IP
  local target="${hostname:-$host}"
  if [[ -z "$target" ]]; then
    echo "❌ Target '$name' has no hostname or host configured"
    return 1
  fi

  local url="http://${target}:${port}/v1/chat/completions"
  local payload=$(jq -n \
    --arg msg "$msg" \
    '{model:"anthropic/claude-sonnet-4-5",messages:[{role:"user",content:$msg}],max_tokens:500}')

  local response=$(curl -s --connect-timeout 5 --max-time 30 \
    -X POST \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "$url" 2>&1)

  local reply=$(echo "$response" | jq -r '.choices[0].message.content // empty' 2>/dev/null)

  if [[ -n "$reply" ]]; then
    echo "✅ → ${name}: ${reply}"
  else
    # If hostname failed, try IP fallback
    if [[ -n "$hostname" && -n "$host" && "$target" == "$hostname" ]]; then
      echo "⚠️  Hostname '$hostname' failed, trying IP fallback..."
      url="http://${host}:${port}/v1/chat/completions"
      response=$(curl -s --connect-timeout 5 --max-time 30 \
        -X POST \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$url" 2>&1)
      reply=$(echo "$response" | jq -r '.choices[0].message.content // empty' 2>/dev/null)
      if [[ -n "$reply" ]]; then
        echo "✅ → ${name} (via IP): ${reply}"
      else
        echo "❌ → ${name}: ${response}"
        return 1
      fi
    else
      echo "❌ → ${name}: ${response}"
      return 1
    fi
  fi
}

if [[ "$TARGET" == "collective" || "$TARGET" == "all" ]]; then
  for name in $(jq -r '.instances | keys[]' "$TARGETS_FILE"); do
    if [[ "$name" != "$SELF" ]]; then
      send_to "$name" "$MESSAGE"
    fi
  done
else
  send_to "$TARGET" "$MESSAGE"
fi
