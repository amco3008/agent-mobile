#!/bin/bash
set -e

# Trap shutdown signals to gracefully stop Claude and backup data
cleanup_and_backup() {
    echo ""
    echo "╭─────────────────────────────────────────────────────────╮"
    echo "│  CONTAINER SHUTTING DOWN                                │"
    echo "│  Attempting to gracefully stop Claude processes...      │"
    echo "╰─────────────────────────────────────────────────────────╯"

    # Find and gracefully terminate any running Claude processes
    # SIGTERM allows Claude to flush transcripts before exiting
    if pgrep -u agent -f "claude" > /dev/null 2>&1; then
        echo "[shutdown] Found running Claude processes, sending SIGTERM..."
        pkill -TERM -u agent -f "claude" 2>/dev/null

        # Wait up to 5 seconds for Claude to flush and exit
        for i in 1 2 3 4 5; do
            if ! pgrep -u agent -f "claude" > /dev/null 2>&1; then
                echo "[shutdown] Claude processes exited cleanly"
                break
            fi
            echo "[shutdown] Waiting for Claude to flush transcripts... ($i/5)"
            sleep 1
        done

        # Force kill if still running
        if pgrep -u agent -f "claude" > /dev/null 2>&1; then
            echo "[shutdown] Force killing remaining Claude processes"
            pkill -KILL -u agent -f "claude" 2>/dev/null
        fi
    else
        echo "[shutdown] No Claude processes running"
    fi

    # Backup credentials
    echo "[shutdown] Backing up data..."
    if [ -f "/home/agent/.claude/.credentials.json" ] && [ -s "/home/agent/.claude/.credentials.json" ]; then
        cp "/home/agent/.claude/.credentials.json" "/home/agent/projects/.claude-credentials-backup.json" 2>/dev/null && \
            echo "[shutdown] Credentials backed up"
    fi
    if [ -f "/home/agent/.claude.json" ] && [ -s "/home/agent/.claude.json" ]; then
        cp "/home/agent/.claude.json" "/home/agent/projects/.claude-config-backup.json" 2>/dev/null && \
            echo "[shutdown] Config backed up"
    fi

    echo "[shutdown] Cleanup complete"
    exit 0
}
trap cleanup_and_backup SIGTERM SIGINT

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
# Credential Persistence
# ==========================================

# Backup/restore Claude credentials AND config to bind-mounted folder
# Uses ./home/ (projects) as PRIMARY backup - direct mount, not nested
# Legacy backup in skills is checked as fallback
persist_credentials() {
    local CREDS_FILE="/home/agent/.claude/.credentials.json"
    local BACKUP_FILE="/home/agent/projects/.claude-credentials-backup.json"  # PRIMARY
    local LEGACY_BACKUP="/home/agent/.claude/skills/.skill-system/.credentials-backup.json"
    local MAX_RETRIES=5
    local RETRY_DELAY=1

    echo "[credentials] Starting credential persistence check..."

    # Wait for bind mount to be ready (WSL2/Docker Desktop timing issue)
    local attempt=0
    while [ $attempt -lt $MAX_RETRIES ]; do
        if [ -d "/home/agent/projects" ] && [ -w "/home/agent/projects" ]; then
            echo "[credentials] Projects directory ready (attempt $((attempt+1)))"
            break
        fi
        attempt=$((attempt+1))
        echo "[credentials] Waiting for projects mount... ($attempt/$MAX_RETRIES)"
        sleep $RETRY_DELAY
    done

    if [ ! -d "/home/agent/projects" ] || [ ! -w "/home/agent/projects" ]; then
        echo "[credentials] WARNING: Projects directory not accessible after $MAX_RETRIES attempts"
    fi

    # Ensure .claude directory exists in named volume
    mkdir -p "/home/agent/.claude"
    chown agent:agent "/home/agent/.claude" 2>/dev/null || true

    # CASE 1: Credentials exist in volume - backup them
    if [ -f "$CREDS_FILE" ] && [ -s "$CREDS_FILE" ]; then
        echo "[credentials] Found existing credentials, creating backup..."
        if cp "$CREDS_FILE" "$BACKUP_FILE" 2>/dev/null; then
            chown agent:agent "$BACKUP_FILE" 2>/dev/null || true
            chmod 600 "$BACKUP_FILE" 2>/dev/null || true
            echo "[credentials] Backup created ($(wc -c < "$CREDS_FILE") bytes)"
        else
            echo "[credentials] WARNING: Failed to create backup"
        fi
        return 0
    fi

    # CASE 2: No credentials, try to restore from primary backup (projects)
    echo "[credentials] No credentials in volume, checking backups..."

    if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
        echo "[credentials] Found backup at $BACKUP_FILE, restoring..."
        if cp "$BACKUP_FILE" "$CREDS_FILE"; then
            chown agent:agent "$CREDS_FILE"
            chmod 600 "$CREDS_FILE"
            echo "[credentials] Restored from projects backup ($(wc -c < "$CREDS_FILE") bytes)"
            return 0
        else
            echo "[credentials] ERROR: Failed to restore from projects backup"
        fi
    fi

    # CASE 3: Try legacy backup location (skills folder - nested mount)
    if [ -f "$LEGACY_BACKUP" ] && [ -s "$LEGACY_BACKUP" ]; then
        echo "[credentials] Found legacy backup at $LEGACY_BACKUP, restoring..."
        if cp "$LEGACY_BACKUP" "$CREDS_FILE"; then
            chown agent:agent "$CREDS_FILE"
            chmod 600 "$CREDS_FILE"
            echo "[credentials] Restored from legacy backup ($(wc -c < "$CREDS_FILE") bytes)"
            # Also copy to new primary location for future use
            cp "$CREDS_FILE" "$BACKUP_FILE" 2>/dev/null || true
            chown agent:agent "$BACKUP_FILE" 2>/dev/null || true
            chmod 600 "$BACKUP_FILE" 2>/dev/null || true
            return 0
        else
            echo "[credentials] ERROR: Failed to restore from legacy backup"
        fi
    fi

    echo "[credentials] No backup found - OAuth will be required on first use"
    return 0
}

# Backup/restore .claude.json (user settings, workspace trust, cached config)
# This file is NOT in the claude-config volume - it's at /home/agent/.claude.json
persist_claude_config() {
    local CONFIG_FILE="/home/agent/.claude.json"
    local BACKUP_FILE="/home/agent/projects/.claude-config-backup.json"

    echo "[config] Checking .claude.json persistence..."

    # Restore from backup if exists and local file doesn't
    if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
        if [ ! -f "$CONFIG_FILE" ] || [ ! -s "$CONFIG_FILE" ]; then
            echo "[config] Restoring .claude.json from backup..."
            cp "$BACKUP_FILE" "$CONFIG_FILE"
            chown agent:agent "$CONFIG_FILE"
            chmod 600 "$CONFIG_FILE"
            echo "[config] Restored ($(wc -c < "$CONFIG_FILE") bytes)"
            return 0
        fi
    fi

    # If config exists, back it up
    if [ -f "$CONFIG_FILE" ] && [ -s "$CONFIG_FILE" ]; then
        cp "$CONFIG_FILE" "$BACKUP_FILE" 2>/dev/null || true
        chown agent:agent "$BACKUP_FILE" 2>/dev/null || true
        chmod 600 "$BACKUP_FILE" 2>/dev/null || true
    fi
}

# Background daemon that periodically backs up credentials AND config
start_credential_backup_daemon() {
    local CREDS_FILE="/home/agent/.claude/.credentials.json"
    local CREDS_BACKUP="/home/agent/projects/.claude-credentials-backup.json"
    local CONFIG_FILE="/home/agent/.claude.json"
    local CONFIG_BACKUP="/home/agent/projects/.claude-config-backup.json"
    local INTERVAL=300  # 5 minutes

    (
        while true; do
            sleep $INTERVAL
            # Backup credentials if changed
            if [ -f "$CREDS_FILE" ] && [ -s "$CREDS_FILE" ]; then
                if ! cmp -s "$CREDS_FILE" "$CREDS_BACKUP" 2>/dev/null; then
                    cp "$CREDS_FILE" "$CREDS_BACKUP" 2>/dev/null
                    chown agent:agent "$CREDS_BACKUP" 2>/dev/null || true
                    chmod 600 "$CREDS_BACKUP" 2>/dev/null || true
                fi
            fi
            # Backup .claude.json if changed
            if [ -f "$CONFIG_FILE" ] && [ -s "$CONFIG_FILE" ]; then
                if ! cmp -s "$CONFIG_FILE" "$CONFIG_BACKUP" 2>/dev/null; then
                    cp "$CONFIG_FILE" "$CONFIG_BACKUP" 2>/dev/null
                    chown agent:agent "$CONFIG_BACKUP" 2>/dev/null || true
                    chmod 600 "$CONFIG_BACKUP" 2>/dev/null || true
                fi
            fi
        done
    ) &
    echo "[backup] Background daemon started (interval: ${INTERVAL}s)"
}

persist_credentials
persist_claude_config
start_credential_backup_daemon

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
# Docker Daemon Setup
# ==========================================

# Start Docker daemon if socket not available from host
start_docker_daemon() {
    # Fix permissions on mounted Docker socket (host socket is typically root:docker)
    if [ -S /var/run/docker.sock ]; then
        chmod 666 /var/run/docker.sock 2>/dev/null || true
    fi

    # Check if Docker is already accessible (via host socket mount)
    if docker info &>/dev/null; then
        echo "Docker accessible via host socket"
        return 0
    fi

    echo "Starting Docker daemon..."
    # Try multiple methods (Ubuntu container doesn't have systemd)
    if command -v dockerd &>/dev/null; then
        dockerd &>/dev/null &
        # Wait for Docker to be ready
        local attempts=0
        while [ $attempts -lt 30 ]; do
            if docker info &>/dev/null; then
                echo "Docker daemon started successfully"
                return 0
            fi
            sleep 1
            attempts=$((attempts + 1))
        done
        echo "Warning: Docker daemon start timed out"
    else
        echo "Warning: dockerd not found"
    fi
}

start_docker_daemon

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
NTFY_RATE_LIMIT=${NTFY_RATE_LIMIT:-15}
EOF
    chown agent:agent /home/agent/.claude/ntfy.conf
    chmod 600 /home/agent/.claude/ntfy.conf
    echo "Push notifications enabled for topic: ${NTFY_TOPIC}"
fi

# Set git config (use env vars or defaults)
git config --global --add safe.directory '*'
su - agent -c "git config --global user.email '${GIT_EMAIL:-agent@mobile.local}'"
su - agent -c "git config --global user.name '${GIT_NAME:-Agent Mobile}'"

# Add tmux session picker to bashrc (runs on SSH login)
if ! grep -q "tmux-picker" /home/agent/.bashrc 2>/dev/null; then
    echo "" >> /home/agent/.bashrc
    echo "# Auto-launch tmux session picker on SSH login" >> /home/agent/.bashrc
    echo "source ~/.tmux-picker.sh" >> /home/agent/.bashrc
fi

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

# Set permissions to allow safe tools without prompts
# Note: Bash is NOT blanket-allowed - only specific safe patterns
settings["permissions"] = {
    "allow": [
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
        "Bash(git:*)",
        "Bash(npm:*)",
        "Bash(node:*)",
        "Bash(python3:*)",
        "Bash(pip:*)",
        "Bash(ls:*)",
        "Bash(cat:*)",
        "Bash(head:*)",
        "Bash(tail:*)",
        "Bash(grep:*)",
        "Bash(find:*)",
        "Bash(echo:*)",
        "Bash(pwd:*)",
        "Bash(cd:*)",
        "Bash(mkdir:*)",
        "Bash(touch:*)",
        "Bash(cp:*)",
        "Bash(mv:*)"
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
# This MERGES with existing config to preserve user's custom folder trust
setup_workspace_trust() {
    local CLAUDE_JSON="/home/agent/.claude.json"

    echo "Configuring workspace trust..."

    # Use Python to merge trust settings (preserves existing project trust)
    python3 << 'PYTHON_SCRIPT'
import json
from pathlib import Path

CLAUDE_JSON = Path("/home/agent/.claude.json")

# Default allowed tools (no blanket Bash - rm, chmod etc require approval)
ALLOWED_TOOLS = [
    "Read", "Write", "Edit", "Glob", "Grep", "WebFetch", "WebSearch",
    "Task", "TodoWrite", "AskUserQuestion", "NotebookEdit", "LSP",
    "Bash(rg:*)", "Bash(git:*)", "Bash(npm:*)", "Bash(node:*)",
    "Bash(python3:*)", "Bash(pip:*)", "Bash(ls:*)", "Bash(cat:*)",
    "Bash(head:*)", "Bash(tail:*)", "Bash(grep:*)", "Bash(find:*)",
    "Bash(echo:*)", "Bash(pwd:*)", "Bash(cd:*)", "Bash(mkdir:*)",
    "Bash(touch:*)", "Bash(cp:*)", "Bash(mv:*)"
]

# Default project trust settings
DEFAULT_TRUST = {
    "hasTrustDialogAccepted": True,
    "allowedTools": ALLOWED_TOOLS
}

# Paths to ensure trust for
DEFAULT_PATHS = ["/home/agent", "/home/agent/projects"]

# Load existing config or create new
config = {}
if CLAUDE_JSON.exists():
    try:
        config = json.loads(CLAUDE_JSON.read_text())
    except:
        config = {}

# Ensure projects dict exists
if "projects" not in config:
    config["projects"] = {}

# Merge default trust (don't overwrite existing projects)
for path in DEFAULT_PATHS:
    if path not in config["projects"]:
        # New path - add full trust config
        config["projects"][path] = DEFAULT_TRUST.copy()
    else:
        # Existing path - only ensure trust is accepted, preserve other settings
        config["projects"][path]["hasTrustDialogAccepted"] = True
        if "allowedTools" not in config["projects"][path]:
            config["projects"][path]["allowedTools"] = ALLOWED_TOOLS

# Write back
CLAUDE_JSON.write_text(json.dumps(config, indent=2))
print(f"Trust configured for {len(config['projects'])} project(s)")
PYTHON_SCRIPT

    chown agent:agent "$CLAUDE_JSON"
    chmod 600 "$CLAUDE_JSON"
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
echo "Connect via MagicDNS:  ssh agent@agent-mobile"
echo "Connect via IP:        ssh agent@$(tailscale ip -4 2>/dev/null || echo '<pending>')"
echo "Password:              agent"
echo ""
echo "First time setup (run after SSH):"
echo "  1. claude          # OAuth with Anthropic"
echo "  2. gemini          # OAuth with Google"
echo ""
echo "============================================"

# Keep container running with proper signal handling
# Using wait allows the SIGTERM trap to work properly
while true; do
    sleep 86400 &  # Sleep for 24 hours in background
    wait $!        # Wait for sleep, allowing signals to be caught
done
