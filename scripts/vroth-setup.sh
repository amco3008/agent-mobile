#!/bin/bash
# vroth-setup.sh — Auto-setup for new Vroth Collective instances
# Usage:
#   vroth-setup.sh <instance-name> [tailscale-hostname]
#
# Sets up:
# 1. Clawdbot gateway binding (tailnet mode)
# 2. Chat completions enabled
# 3. Bridge scripts installed to PATH
# 4. Instance registered in bridge-targets.json
# 5. Self-identifier set in bridge-targets.json
#
# This script should be run ONCE when bringing up a new instance

set -euo pipefail

INSTANCE_NAME="${1:-}"
TAILSCALE_HOSTNAME="${2:-}"

if [[ -z "$INSTANCE_NAME" ]]; then
  echo "Usage: vroth-setup.sh <instance-name> [tailscale-hostname]"
  echo ""
  echo "Examples:"
  echo "  vroth-setup.sh core agent-mobile"
  echo "  vroth-setup.sh markets agent-mobile-1"
  echo "  vroth-setup.sh analytics agent-mobile-2"
  echo ""
  exit 1
fi

# Auto-detect Tailscale hostname if not provided
if [[ -z "$TAILSCALE_HOSTNAME" ]]; then
  if command -v tailscale &>/dev/null; then
    TAILSCALE_HOSTNAME=$(tailscale status --json 2>/dev/null | jq -r '.Self.DNSName' | sed 's/\.$//')
    if [[ -z "$TAILSCALE_HOSTNAME" || "$TAILSCALE_HOSTNAME" == "null" ]]; then
      echo "❌ Could not auto-detect Tailscale hostname"
      echo "   Make sure Tailscale is running: tailscale status"
      echo "   Or provide manually: vroth-setup.sh $INSTANCE_NAME <hostname>"
      exit 1
    fi
    echo "Auto-detected Tailscale hostname: $TAILSCALE_HOSTNAME"
  else
    echo "❌ Tailscale not found and no hostname provided"
    exit 1
  fi
fi

# Get Tailscale IP
TAILSCALE_IP=""
if command -v tailscale &>/dev/null; then
  TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")
fi

if [[ -z "$TAILSCALE_IP" ]]; then
  echo "⚠️  Warning: Could not detect Tailscale IP (will use hostname only)"
fi

CLAWDBOT_CONFIG="/home/agent/.clawdbot/clawdbot.json"
BRIDGE_TARGETS="/home/agent/clawd/collective/bridge-targets.json"
GATEWAY_PORT=18789

echo "=== Vroth Collective Instance Setup ==="
echo "Instance name:       $INSTANCE_NAME"
echo "Tailscale hostname:  $TAILSCALE_HOSTNAME"
echo "Tailscale IP:        ${TAILSCALE_IP:-N/A}"
echo "Gateway port:        $GATEWAY_PORT"
echo ""

# Step 1: Configure Clawdbot gateway binding
echo "Step 1: Configuring Clawdbot gateway..."

if [[ ! -f "$CLAWDBOT_CONFIG" ]]; then
  echo "  Creating clawdbot.json..."
  mkdir -p "$(dirname "$CLAWDBOT_CONFIG")"
  cat > "$CLAWDBOT_CONFIG" << EOF
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-opus-4-5"
      },
      "thinkingDefault": "high"
    }
  },
  "channels": {
    "telegram": {
      "enabled": true
    }
  },
  "gateway": {
    "mode": "local",
    "bind": "tailnet",
    "port": $GATEWAY_PORT,
    "chat": {
      "completions": {
        "enabled": true
      }
    }
  }
}
EOF
  chown agent:agent "$CLAWDBOT_CONFIG"
  echo "  ✅ Created clawdbot.json with tailnet binding"
else
  # Update existing config using jq
  if command -v jq &>/dev/null; then
    jq --arg port "$GATEWAY_PORT" \
       '.gateway.mode = "local" | .gateway.bind = "tailnet" | .gateway.port = ($port | tonumber) | .gateway.chat.completions.enabled = true' \
       "$CLAWDBOT_CONFIG" > "${CLAWDBOT_CONFIG}.tmp" && mv "${CLAWDBOT_CONFIG}.tmp" "$CLAWDBOT_CONFIG"
    chown agent:agent "$CLAWDBOT_CONFIG"
    echo "  ✅ Updated gateway config (bind=tailnet, chat completions=enabled)"
  else
    echo "  ⚠️  jq not found, skipping config update"
    echo "     Manually set: gateway.bind='tailnet', gateway.chat.completions.enabled=true"
  fi
fi

# Step 2: Install bridge scripts to PATH
echo ""
echo "Step 2: Installing bridge scripts to PATH..."

SCRIPTS_DIR="/home/agent/projects/agent-mobile/scripts"
declare -a SCRIPTS=("vroth-bridge.sh" "vroth-tasks.sh" "vroth-notify.sh" "vroth-health.sh")

for script in "${SCRIPTS[@]}"; do
  local script_path="$SCRIPTS_DIR/$script"
  local bin_name=$(basename "$script" .sh)
  
  if [[ -f "$script_path" ]]; then
    ln -sf "$script_path" "/usr/local/bin/$bin_name"
    echo "  ✅ Installed $bin_name"
  else
    echo "  ⚠️  Script not found: $script_path"
  fi
done

# Step 3: Register instance in bridge-targets.json
echo ""
echo "Step 3: Registering instance in bridge-targets..."

if [[ ! -f "$BRIDGE_TARGETS" ]]; then
  echo "  Creating bridge-targets.json..."
  mkdir -p "$(dirname "$BRIDGE_TARGETS")"
  cat > "$BRIDGE_TARGETS" << EOF
{
  "self": "$INSTANCE_NAME",
  "defaultSession": "agent:main:main",
  "instances": {
    "$INSTANCE_NAME": {
      "hostname": "$TAILSCALE_HOSTNAME",
      "host": "${TAILSCALE_IP:-unknown}",
      "port": $GATEWAY_PORT,
      "token": "$(openssl rand -hex 24)"
    }
  }
}
EOF
  chown agent:agent "$BRIDGE_TARGETS"
  echo "  ✅ Created bridge-targets.json"
else
  # Update existing targets
  if command -v jq &>/dev/null; then
    # Set self identifier
    jq --arg name "$INSTANCE_NAME" '.self = $name' "$BRIDGE_TARGETS" > "${BRIDGE_TARGETS}.tmp" && mv "${BRIDGE_TARGETS}.tmp" "$BRIDGE_TARGETS"
    
    # Add/update instance entry
    local token=$(jq -r ".instances.${INSTANCE_NAME}.token // empty" "$BRIDGE_TARGETS")
    if [[ -z "$token" ]]; then
      token=$(openssl rand -hex 24)
    fi
    
    jq --arg name "$INSTANCE_NAME" \
       --arg hostname "$TAILSCALE_HOSTNAME" \
       --arg host "${TAILSCALE_IP:-unknown}" \
       --arg port "$GATEWAY_PORT" \
       --arg token "$token" \
       '.instances[$name] = {hostname: $hostname, host: $host, port: ($port | tonumber), token: $token}' \
       "$BRIDGE_TARGETS" > "${BRIDGE_TARGETS}.tmp" && mv "${BRIDGE_TARGETS}.tmp" "$BRIDGE_TARGETS"
    
    chown agent:agent "$BRIDGE_TARGETS"
    echo "  ✅ Updated bridge-targets.json (self=$INSTANCE_NAME)"
  else
    echo "  ⚠️  jq not found, skipping bridge-targets update"
    echo "     Manually add instance to $BRIDGE_TARGETS"
  fi
fi

# Step 4: Commit changes to collective repo
echo ""
echo "Step 4: Committing changes to collective repo..."

if [[ -d "/home/agent/clawd/.git" ]]; then
  cd /home/agent/clawd
  
  if [[ -n "$(git status --porcelain collective/)" ]]; then
    git add collective/
    git commit -m "collective: register $INSTANCE_NAME instance" || true
    
    if git push origin master 2>/dev/null; then
      echo "  ✅ Pushed changes to GitHub"
    else
      echo "  ⚠️  Push failed (will sync on next heartbeat)"
    fi
  else
    echo "  ℹ️  No changes to commit"
  fi
  
  cd - >/dev/null
else
  echo "  ⚠️  /home/agent/clawd is not a git repo, skipping commit"
fi

# Step 5: Test gateway connectivity
echo ""
echo "Step 5: Testing gateway connectivity..."

sleep 2  # Give gateway time to bind

if curl -s "http://localhost:$GATEWAY_PORT/health" > /dev/null 2>&1; then
  echo "  ✅ Gateway is running and accessible"
else
  echo "  ⚠️  Gateway not responding (may need restart)"
  echo "     Check logs: tail /home/agent/clawdbot.log"
fi

# Summary
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Instance '$INSTANCE_NAME' is configured!"
echo ""
echo "Next steps:"
echo "  1. Restart clawdbot gateway to apply changes:"
echo "     pkill -f 'clawdbot gateway' && clawdbot gateway --port $GATEWAY_PORT &"
echo ""
echo "  2. Share your instance token with other instances:"
echo "     Token: $(jq -r ".instances.${INSTANCE_NAME}.token" "$BRIDGE_TARGETS" 2>/dev/null || echo 'N/A')"
echo ""
echo "  3. Test connectivity from another instance:"
echo "     vroth-bridge $INSTANCE_NAME 'Hello from the collective!'"
echo ""
echo "  4. Run health check:"
echo "     vroth-health"
echo ""
