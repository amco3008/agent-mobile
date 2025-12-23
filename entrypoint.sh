#!/bin/bash
set -e

echo "Starting agent-mobile container..."

# Import corporate CA certificates if provided
if [ -d "/usr/local/share/ca-certificates/extra" ] && [ "$(ls -A /usr/local/share/ca-certificates/extra)" ]; then
    echo "Importing custom CA certificates..."
    update-ca-certificates
fi

# Persist SSH host keys across rebuilds
SSH_KEY_DIR="/etc/ssh/ssh_host_keys"
if [ -f "$SSH_KEY_DIR/ssh_host_rsa_key" ]; then
    echo "Restoring SSH host keys from volume..."
    cp $SSH_KEY_DIR/* /etc/ssh/
else
    echo "Saving SSH host keys to volume..."
    mkdir -p $SSH_KEY_DIR
    for key in /etc/ssh/ssh_host_*; do
        [ -f "$key" ] && cp "$key" $SSH_KEY_DIR/
    done
fi

# Start Tailscale daemon
echo "Starting Tailscale daemon..."
tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock &

# Wait for tailscaled socket (replaces hardcoded sleep 2)
echo "Waiting for Tailscale daemon..."
WAIT_COUNT=0
while [ ! -S /var/run/tailscale/tailscaled.sock ] && [ $WAIT_COUNT -lt 20 ]; do
    sleep 0.5
    WAIT_COUNT=$((WAIT_COUNT + 1))
done
[ -S /var/run/tailscale/tailscaled.sock ] && echo "Tailscale ready (${WAIT_COUNT}00ms)" || echo "Warning: Tailscale socket timeout"

# Authenticate Tailscale
if [ -n "$TAILSCALE_AUTHKEY" ]; then
    echo "Authenticating Tailscale with authkey..."
    if ! tailscale up --authkey="$TAILSCALE_AUTHKEY" --hostname=agent-mobile; then
        echo "Tailscale authkey failed (may be expired). Run 'tailscale up' manually."
    fi
else
    echo "No TAILSCALE_AUTHKEY set. Run 'tailscale up' manually to authenticate."
    tailscale up --hostname=agent-mobile || true
fi

# Show Tailscale status
echo "Tailscale status:"
tailscale status || echo "Tailscale not yet authenticated"

# Setup git credentials and export GITHUB_TOKEN for Claude
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Configuring git with GITHUB_TOKEN..."
    git config --global credential.helper store
    echo "https://oauth2:${GITHUB_TOKEN}@github.com" > /home/agent/.git-credentials
    chown agent:agent /home/agent/.git-credentials
    chmod 600 /home/agent/.git-credentials

    # Export GITHUB_TOKEN for SSH sessions (Claude needs this)
    if ! grep -q "GITHUB_TOKEN" /home/agent/.bashrc 2>/dev/null; then
        echo "export GITHUB_TOKEN='${GITHUB_TOKEN}'" >> /home/agent/.bashrc
    fi

    # Auth gh CLI with GITHUB_TOKEN (requires read:org scope)
    # Skip if already authenticated (persisted in volume)
    if su - agent -c "gh auth status" &>/dev/null; then
        echo "gh CLI already authenticated"
    else
        echo "Authenticating gh CLI..."
        if echo "$GITHUB_TOKEN" | su - agent -c "gh auth login --with-token" 2>/dev/null; then
            echo "gh CLI authenticated"
        else
            echo "gh CLI auth failed (token may need read:org scope). Run 'gh auth login' manually."
        fi
    fi
fi

# Set git config (use env vars or defaults)
git config --global --add safe.directory '*'
su - agent -c "git config --global user.email '${GIT_EMAIL:-agent@mobile.local}'"
su - agent -c "git config --global user.name '${GIT_NAME:-Agent Mobile}'"

# Setup skill system hooks (merge into Claude settings without replacing existing config)
setup_skill_hooks() {
    local CLAUDE_DIR="/home/agent/.claude"
    local SETTINGS_FILE="$CLAUDE_DIR/settings.local.json"
    local HOOKS_TEMPLATE="$CLAUDE_DIR/skills/_skill-manager/hooks.json"

    # Ensure .claude directory exists
    mkdir -p "$CLAUDE_DIR"
    chown agent:agent "$CLAUDE_DIR"

    # Check if hooks template exists
    if [ ! -f "$HOOKS_TEMPLATE" ]; then
        echo "Skill hooks template not found, skipping hooks setup..."
        return
    fi

    # If settings file doesn't exist, create minimal one
    if [ ! -f "$SETTINGS_FILE" ]; then
        echo '{}' > "$SETTINGS_FILE"
        chown agent:agent "$SETTINGS_FILE"
    fi

    # Merge hooks into settings using Python (preserves existing settings)
    if command -v python3 &>/dev/null; then
        python3 << 'PYTHON_SCRIPT'
import json
from pathlib import Path

settings_file = Path("/home/agent/.claude/settings.local.json")
hooks_file = Path("/home/agent/.claude/skills/_skill-manager/hooks.json")

# Load existing settings
settings = {}
if settings_file.exists():
    try:
        content = settings_file.read_text().strip()
        if content:
            settings = json.loads(content)
    except Exception as e:
        print(f"Warning: Could not parse existing settings: {e}")
        settings = {}

# Load hooks template
try:
    hooks = json.loads(hooks_file.read_text())
except Exception as e:
    print(f"Error loading hooks template: {e}")
    exit(1)

# Merge hooks (replace hooks section only, keep everything else)
settings["hooks"] = hooks

# Write back with proper formatting
settings_file.write_text(json.dumps(settings, indent=2))
print("Skill system hooks configured successfully")
PYTHON_SCRIPT
        chown agent:agent "$SETTINGS_FILE"
    else
        echo "Python3 not available, skipping skill hooks setup"
    fi
}

echo "Setting up skill system hooks..."
setup_skill_hooks

# Start SSH server
echo "Starting SSH server..."
/usr/sbin/sshd

echo ""
echo "============================================"
echo "Agent Mobile Container Ready!"
echo "============================================"
echo ""
echo "Tailscale IP: $(tailscale ip -4 2>/dev/null || echo 'Not authenticated yet')"
echo ""
echo "To connect from Termux:"
echo "  ssh agent@<tailscale-ip>"
echo "  Password: agent"
echo ""
echo "First time setup (run after SSH):"
echo "  1. claude          # Will prompt OAuth with Anthropic on first run"
echo "  2. gemini          # Will prompt OAuth with Google on first run"
echo ""
echo "============================================"

# Keep container running
tail -f /dev/null
