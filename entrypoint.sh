#!/bin/bash
set -e

echo "Starting agent-mobile container..."

# Import corporate CA certificates if provided
if [ -d "/usr/local/share/ca-certificates/extra" ] && [ "$(ls -A /usr/local/share/ca-certificates/extra)" ]; then
    echo "Importing custom CA certificates..."
    update-ca-certificates
fi

# Auto-detect and trust corporate proxy certificates
auto_trust_proxy() {
    # Check if we have internet access or if SSL is being intercepted
    # We use Google because it's reliable and often intercepted
    echo "Checking for SSL interception..."
    if curl -I https://google.com >/dev/null 2>&1; then
        echo "SSL connection to google.com successful. No interception detected (or cert already trusted)."
        return
    fi
    
    # Check if it's specifically an SSL error (curl 60)
    local curl_exit=$?
    if [ $curl_exit -eq 60 ]; then
        echo "SSL Certificate error detected! Attempting to fetch and trust intercepting proxy..."
        
        MKDIR_CMD="mkdir -p /usr/local/share/ca-certificates/extra"
        FETCH_CMD="echo -n | openssl s_client -connect google.com:443 -showcerts 2>/dev/null | sed -ne '/-BEGIN CERTIFICATE-/,/-END CERTIFICATE-/p' > /usr/local/share/ca-certificates/extra/auto-proxy.crt"
        
        # Try to run these commands
        eval "$MKDIR_CMD"
        if eval "$FETCH_CMD"; then
             if [ -s "/usr/local/share/ca-certificates/extra/auto-proxy.crt" ]; then
                 echo "Proxy certificate fetched. Updating trust store..."
                 update-ca-certificates
                 echo "Proxy certificate trust updated."
             else
                 echo "Warning: Failed to capture proxy certificate (empty file)."
             fi
        else
            echo "Warning: Failed to fetch proxy certificate."
        fi
    else
        echo "Network check failed with code $curl_exit (not purely SSL). Skipping auto-trust."
    fi
}

auto_trust_proxy

# Persist SSH host keys across rebuilds
SSH_KEY_DIR="/etc/ssh/ssh_host_keys"
if [ -f "$SSH_KEY_DIR/ssh_host_rsa_key" ]; then
    echo "Restoring SSH host keys from volume..."
    cp $SSH_KEY_DIR/* /etc/ssh/ 2>/dev/null || true
else
    echo "Saving SSH host keys to volume..."
    mkdir -p $SSH_KEY_DIR
    for key in /etc/ssh/ssh_host_*; do
        [ -f "$key" ] && cp "$key" $SSH_KEY_DIR/ 2>/dev/null || true
    done
fi

# ==========================================
# Skill System Initialization
# ==========================================

# Synchronize default skills from image to volume
sync_default_skills() {
    local DEST_DIR="/home/agent/.claude/skills/awesome-claude-skills"
    local SRC_DIR="/opt/awesome-claude-skills"

    if [ -d "$SRC_DIR" ]; then
        if [ ! -d "$DEST_DIR" ] || [ -z "$(ls -A "$DEST_DIR")" ]; then
            echo "Synchronizing awesome-claude-skills to volume..."
            mkdir -p "$DEST_DIR"
            cp -r "$SRC_DIR"/. "$DEST_DIR"/ 2>/dev/null || true
            chown -R agent:agent "/home/agent/.claude/skills" 2>/dev/null || true
        else
            echo "Default skills already present in volume, skipping sync."
        fi
    fi
}

# Update global CLAUDE.md with discovered skills
update_claude_md() {
    local CLAUDE_DIR="/home/agent/.claude"
    local CLAUDEMD_SCRIPT="$CLAUDE_DIR/skills/_skill-manager/scripts/claudemd.py"

    # Ensure .claude directory exists
    mkdir -p "$CLAUDE_DIR"
    chown agent:agent "$CLAUDE_DIR" 2>/dev/null || true

    # Check if the script exists
    if [ ! -f "$CLAUDEMD_SCRIPT" ]; then
        echo "CLAUDE.md maintenance script not found, skipping..."
        return
    fi

    # Run the update script
    if command -v python3 &>/dev/null; then
        echo "Running CLAUDE.md update script..."
        python3 "$CLAUDEMD_SCRIPT" --quiet || echo "Warning: CLAUDE.md update failed"
        chown agent:agent "$CLAUDE_DIR/CLAUDE.md" 2>/dev/null || true
    else
        echo "Python3 not available, skipping CLAUDE.md update"
    fi
}

echo "Initializing skill system..."
sync_default_skills
update_claude_md

# ==========================================
# Network & Identity Setup
# ==========================================

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

# Authenticate Tailscale (Non-blocking with timeout)
LOGIN_FLAGS="--hostname=agent-mobile"
if [ -n "$TAILSCALE_EXIT_NODE" ]; then
    echo "Configuring exit node: $TAILSCALE_EXIT_NODE"
    LOGIN_FLAGS="$LOGIN_FLAGS --exit-node=$TAILSCALE_EXIT_NODE --exit-node-allow-lan-access"
fi

if [ -n "$TAILSCALE_AUTHKEY" ]; then
    echo "Authenticating Tailscale with authkey..."
    # Use timeout to prevent blocking the rest of the script if connectivity is poor
    if ! timeout 30s tailscale up --authkey="$TAILSCALE_AUTHKEY" $LOGIN_FLAGS; then
        echo "Tailscale authkey failed or timed out. Run 'tailscale up' manually."
    fi
else
    echo "No TAILSCALE_AUTHKEY set. Initializing Tailscale in background..."
    tailscale up $LOGIN_FLAGS >/dev/null 2>&1 &
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

# Configure push notifications (ntfy.sh)
# Write config file that hooks can read (env vars don't propagate to hook subprocesses)
if [ -n "$NTFY_ENABLED" ] && [ "$NTFY_ENABLED" = "true" ]; then
    echo "Configuring push notifications..."
    cat > /home/agent/.claude/ntfy.conf << EOF
NTFY_ENABLED=${NTFY_ENABLED}
NTFY_TOPIC=${NTFY_TOPIC}
NTFY_SERVER=${NTFY_SERVER:-https://ntfy.sh}
NTFY_RATE_LIMIT=${NTFY_RATE_LIMIT:-30}
EOF
    chown agent:agent /home/agent/.claude/ntfy.conf
    chmod 600 /home/agent/.claude/ntfy.conf
    echo "Push notifications enabled for topic: ${NTFY_TOPIC}"
fi

# Set git config (use env vars or defaults)
git config --global --add safe.directory '*'
su - agent -c "git config --global user.email '${GIT_EMAIL:-agent@mobile.local}'"
su - agent -c "git config --global user.name '${GIT_NAME:-Agent Mobile}'"

# Setup skill system hooks (merge into Claude settings without replacing existing config)
setup_skill_hooks() {
    local CLAUDE_DIR="/home/agent/.claude"
    local SETTINGS_FILE="$CLAUDE_DIR/settings.json"
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

settings_file = Path("/home/agent/.claude/settings.json")
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

# Set permissions to allow all common tools without prompts
settings["permissions"] = {
    "allow": [
        "Bash",
        "Read",
        "Write",
        "Edit",
        "Glob",
        "Grep",
        "WebFetch",
        "WebSearch",
        "Task",
        "TodoWrite",
        "AskUserQuestion",
        "NotebookEdit",
        "LSP",
        "Bash(rg:*)",
        "Bash(git:*)"
    ]
}

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

# Pre-configure workspace trust for common working directories
# Trust is stored in ~/.claude.json with projects object keyed by absolute path
# This allows hooks to execute without interactive trust prompt
setup_workspace_trust() {
    local CLAUDE_JSON="/home/agent/.claude.json"

    echo "Configuring workspace trust..."

    # Create ~/.claude.json with pre-trusted workspaces
    # Format: { "projects": { "/absolute/path": { "allowedTools": [...] } } }
    cat > "$CLAUDE_JSON" << 'EOF'
{
  "projects": {
    "/home/agent": {
      "allowedTools": ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch", "Task", "TodoWrite", "AskUserQuestion", "NotebookEdit", "LSP", "Bash(git:*)", "Bash(rg:*)"]
    },
    "/home/agent/projects": {
      "allowedTools": ["Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch", "Task", "TodoWrite", "AskUserQuestion", "NotebookEdit", "LSP", "Bash(git:*)", "Bash(rg:*)"]
    }
  }
}
EOF

    chown agent:agent "$CLAUDE_JSON"
    chmod 600 "$CLAUDE_JSON"
    echo "Workspace trust configured in ~/.claude.json"
}

setup_workspace_trust

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
