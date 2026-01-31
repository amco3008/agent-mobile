#!/bin/bash
set -e

# Ensure skills repo tracks everything (overriding parent ignores) via .git/info/exclude
# This stays local to the inner repo and doesn't pollute parent repo behavior
configure_skills_git_excludes() {
    local EXCLUDE_FILE="/home/agent/.claude/skills/.git/info/exclude"
    local GITIGNORE_FILE="/home/agent/.claude/skills/.gitignore"
    
    # 1. Ensure .gitignore has basic secret protection (if missing or incomplete)
    local NEEDS_UPDATE=false
    if [ ! -f "$GITIGNORE_FILE" ]; then
        NEEDS_UPDATE=true
    elif ! grep -q "tmpclaude-" "$GITIGNORE_FILE" 2>/dev/null; then
        NEEDS_UPDATE=true
    fi

    if [ "$NEEDS_UPDATE" = true ]; then
        echo "[skills-git] Updating .gitignore..."
        cat > "$GITIGNORE_FILE" << EOF
# Ignore secrets
.credentials-backup.json
.env
.env.*
*.log

# Ignore temp files
tmpclaude-*
*.tmp
*.bak
EOF
        chown agent:agent "$GITIGNORE_FILE"
    fi

    # 2. Force inclusion of everything else via local exclude file
    if [ -d "$(dirname "$EXCLUDE_FILE")" ]; then
        # Check if !* is present
        if ! grep -q "!*" "$EXCLUDE_FILE" 2>/dev/null; then
            echo "[skills-git] OTA: Configuring local exclusion to track all files..."
            # Append !* to the end to ensure it wins
            echo "" >> "$EXCLUDE_FILE"
            echo "# Force track everything (added by entrypoint)" >> "$EXCLUDE_FILE"
            echo "!*" >> "$EXCLUDE_FILE"
            chown agent:agent "$EXCLUDE_FILE"
        fi
    fi
}

# Commit skills repo to GitHub (called on shutdown)
commit_skills_repo() {
    # Skip if no GITHUB_TOKEN
    if [ -z "$GITHUB_TOKEN" ]; then
        return 0
    fi

    local SKILLS_DIR="/home/agent/.claude/skills"

    if [ ! -d "$SKILLS_DIR/.git" ]; then
        echo "[skills-git] Skills directory not a git repo, skipping"
        return 0
    fi

    cd "$SKILLS_DIR" || return 1

    # Commit any uncommitted changes
    if [ -n "$(git status --porcelain)" ]; then
        echo "[skills-git] Committing skills changes..."
        configure_skills_git_excludes
        git add -A
        git commit -m "Auto-commit from $(hostname): $(date '+%Y-%m-%d %H:%M:%S') [shutdown]" || true
    fi

    # Always try to push (in case startup push failed)
    echo "[skills-git] Pushing to remote..."
    if git push origin master 2>&1; then
        echo "[skills-git] Push successful"
    else
        echo "[skills-git] Push failed (network issue or remote doesn't exist)"
    fi

    cd - >/dev/null
}

# Commit clawdbot config to GitHub (called on shutdown)
commit_clawdbot_repo() {
    # Skip if no GITHUB_TOKEN
    if [ -z "$GITHUB_TOKEN" ]; then
        return 0
    fi

    local CLAWDBOT_DIR="/home/agent/.clawdbot"

    if [ ! -d "$CLAWDBOT_DIR/.git" ]; then
        echo "[clawdbot-git] Clawdbot directory not a git repo, skipping"
        return 0
    fi

    cd "$CLAWDBOT_DIR" || return 1

    # Set git identity for commits (use env vars or defaults)
    git config user.email "${GIT_EMAIL:-agent@mobile.local}"
    git config user.name "${GIT_NAME:-Agent Mobile}"

    # Commit any uncommitted changes
    if [ -n "$(git status --porcelain)" ]; then
        echo "[clawdbot-git] Committing clawdbot config changes..."
        git add -A
        git commit -m "Auto-commit from $(hostname): $(date '+%Y-%m-%d %H:%M:%S') [shutdown]" || true
    fi

    # Always try to push (in case startup push failed)
    local BRANCH="${CLAWD_SOUL_BRANCH:-master}"
    echo "[clawdbot-git] Pushing to remote (branch: $BRANCH)..."
    if git push origin "$BRANCH" 2>&1; then
        echo "[clawdbot-git] Push successful"
    else
        echo "[clawdbot-git] Push failed (network issue or remote doesn't exist)"
    fi

    cd - >/dev/null
}

# Commit clawd soul/memory to GitHub (called on shutdown)
commit_clawd_repo() {
    # Skip if no GITHUB_TOKEN
    if [ -z "$GITHUB_TOKEN" ]; then
        return 0
    fi

    local CLAWD_DIR="/home/agent/clawd"

    if [ ! -d "$CLAWD_DIR/.git" ]; then
        echo "[clawd-git] Clawd directory not a git repo, skipping"
        return 0
    fi

    cd "$CLAWD_DIR" || return 1

    # Set git identity for commits (use env vars or defaults)
    git config user.email "${GIT_EMAIL:-agent@mobile.local}"
    git config user.name "${GIT_NAME:-Agent Mobile}"

    # Commit any uncommitted changes
    if [ -n "$(git status --porcelain)" ]; then
        echo "[clawd-git] Committing clawd soul/memory changes..."
        git add -A
        git commit -m "Auto-commit from $(hostname): $(date '+%Y-%m-%d %H:%M:%S') [shutdown]" || true
    fi

    # Always try to push (in case startup push failed)
    local BRANCH="${CLAWD_SOUL_BRANCH:-master}"
    echo "[clawd-git] Pushing to remote (branch: $BRANCH)..."
    if git push origin "$BRANCH" 2>&1; then
        echo "[clawd-git] Push successful"
    else
        echo "[clawd-git] Push failed (network issue or remote doesn't exist)"
    fi

    cd - >/dev/null
}

# Commit shared notes to GitHub (called on shutdown)
commit_shared_notes() {
    if [ -z "$GITHUB_TOKEN" ]; then
        return 0
    fi

    local SHARED_DIR="/home/agent/projects/shared"

    if [ ! -d "$SHARED_DIR/.git" ]; then
        return 0
    fi

    cd "$SHARED_DIR" || return 1

    git config user.email "${GIT_EMAIL:-agent@mobile.local}"
    git config user.name "${GIT_NAME:-Agent Mobile}"

    if [ -n "$(git status --porcelain)" ]; then
        echo "[shared-notes] Committing shared notes changes..."
        git add -A
        git commit -m "Auto-commit from $(hostname): $(date '+%Y-%m-%d %H:%M:%S') [shutdown]" || true
    fi

    echo "[shared-notes] Pushing to remote..."
    git push origin main 2>/dev/null || git push origin master 2>/dev/null || echo "[shared-notes] Push failed"

    cd - >/dev/null
}

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

    # Commit skills repo before shutdown
    commit_skills_repo

    # Commit clawdbot config before shutdown
    commit_clawdbot_repo

    # Commit clawd soul/memory before shutdown
    commit_clawd_repo

    # Commit shared notes before shutdown
    commit_shared_notes

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
    if [ -f "/home/agent/.claude/settings.local.json" ] && [ -s "/home/agent/.claude/settings.local.json" ]; then
        cp "/home/agent/.claude/settings.local.json" "/home/agent/projects/.claude-settings-local-backup.json" 2>/dev/null && \
            echo "[shutdown] Settings.local backed up"
    fi
    # Backup native installer XDG config if exists (~/.config/claude/)
    if [ -d "/home/agent/.config/claude" ]; then
        cp -r "/home/agent/.config/claude" "/home/agent/projects/.claude-native-config-backup" 2>/dev/null && \
            echo "[shutdown] Native config (~/.config/claude/) backed up"
    fi
    # Backup conversation history (~/.claude/projects/)
    if [ -d "/home/agent/.claude/projects" ] && [ "$(ls -A /home/agent/.claude/projects 2>/dev/null)" ]; then
        mkdir -p "/home/agent/projects/.claude-conversations-backup"
        cp -r "/home/agent/.claude/projects"/. "/home/agent/projects/.claude-conversations-backup"/ 2>/dev/null && \
            echo "[shutdown] Conversations backed up"
    fi

    echo "[shutdown] Cleanup complete"
    exit 0
}
trap cleanup_and_backup SIGTERM SIGINT EXIT

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
# Fix Volume Permissions
# ==========================================
# Ensure agent owns config directories (critical for claude CLI state)
echo "Fixing permissions for persistent volumes..."
mkdir -p /home/agent/.config
mkdir -p /home/agent/.local
mkdir -p /home/agent/.claude

# Symlink potential config paths to the one we persist (~/.claude.json)
# This handles ambiguity where CLI might look in ~/.claude/ but we backup ~/.claude.json
if [ -f "/home/agent/.claude.json" ]; then
    echo "Symlinking Claude config paths..."
    ln -sf /home/agent/.claude.json /home/agent/.claude/claude.json
    ln -sf /home/agent/.claude.json /home/agent/.claude/config.json
fi

chown -R agent:agent /home/agent/.config 2>/dev/null || true
chown -R agent:agent /home/agent/.local 2>/dev/null || true
chown -R agent:agent /home/agent/.claude 2>/dev/null || true

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

# Backup/restore settings.local.json (user-granted command permissions)
# This file stores permissions like Bash(curl:*), Bash(tree:*) etc that user grants during sessions
persist_settings_local() {
    local SETTINGS_FILE="/home/agent/.claude/settings.local.json"
    local BACKUP_FILE="/home/agent/projects/.claude-settings-local-backup.json"

    echo "[settings.local] Checking settings.local.json persistence..."

    # Restore from backup if exists and local file doesn't
    if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
        if [ ! -f "$SETTINGS_FILE" ] || [ ! -s "$SETTINGS_FILE" ]; then
            echo "[settings.local] Restoring from backup..."
            cp "$BACKUP_FILE" "$SETTINGS_FILE"
            chown agent:agent "$SETTINGS_FILE"
            chmod 600 "$SETTINGS_FILE"
            echo "[settings.local] Restored ($(wc -c < "$SETTINGS_FILE") bytes)"
            return 0
        fi
    fi

    # If settings.local.json exists, back it up
    if [ -f "$SETTINGS_FILE" ] && [ -s "$SETTINGS_FILE" ]; then
        cp "$SETTINGS_FILE" "$BACKUP_FILE" 2>/dev/null || true
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
    local SETTINGS_LOCAL_FILE="/home/agent/.claude/settings.local.json"
    local SETTINGS_LOCAL_BACKUP="/home/agent/projects/.claude-settings-local-backup.json"
    local NATIVE_CONFIG_DIR="/home/agent/.config/claude"
    local NATIVE_CONFIG_BACKUP="/home/agent/projects/.claude-native-config-backup"
    local INTERVAL=60  # 1 minute - frequent backups to survive unexpected shutdowns

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
            # Backup settings.local.json if changed (user-granted permissions)
            if [ -f "$SETTINGS_LOCAL_FILE" ] && [ -s "$SETTINGS_LOCAL_FILE" ]; then
                if ! cmp -s "$SETTINGS_LOCAL_FILE" "$SETTINGS_LOCAL_BACKUP" 2>/dev/null; then
                    cp "$SETTINGS_LOCAL_FILE" "$SETTINGS_LOCAL_BACKUP" 2>/dev/null
                    chown agent:agent "$SETTINGS_LOCAL_BACKUP" 2>/dev/null || true
                    chmod 600 "$SETTINGS_LOCAL_BACKUP" 2>/dev/null || true
                fi
            fi
            # Backup native installer config if changed (~/.config/claude/)
            if [ -d "$NATIVE_CONFIG_DIR" ] && [ "$(ls -A "$NATIVE_CONFIG_DIR" 2>/dev/null)" ]; then
                mkdir -p "$NATIVE_CONFIG_BACKUP"
                cp -r "$NATIVE_CONFIG_DIR"/. "$NATIVE_CONFIG_BACKUP"/ 2>/dev/null || true
                chown -R agent:agent "$NATIVE_CONFIG_BACKUP" 2>/dev/null || true
            fi
            # Backup conversation history (~/.claude/projects/)
            if [ -d "/home/agent/.claude/projects" ] && [ "$(ls -A /home/agent/.claude/projects 2>/dev/null)" ]; then
                mkdir -p "/home/agent/projects/.claude-conversations-backup"
                cp -r "/home/agent/.claude/projects"/. "/home/agent/projects/.claude-conversations-backup"/ 2>/dev/null || true
                chown -R agent:agent "/home/agent/projects/.claude-conversations-backup" 2>/dev/null || true
            fi
        done
    ) &
    echo "[backup] Background daemon started (interval: ${INTERVAL}s)"
}

# Backup/restore native installer XDG config (~/.config/claude/)
# Native installer may store additional auth data here
persist_native_config() {
    local CONFIG_DIR="/home/agent/.config/claude"
    local BACKUP_DIR="/home/agent/projects/.claude-native-config-backup"

    echo "[native-config] Checking ~/.config/claude/ persistence..."

    # Restore from backup if exists and local doesn't
    if [ -d "$BACKUP_DIR" ] && [ "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
        if [ ! -d "$CONFIG_DIR" ] || [ -z "$(ls -A "$CONFIG_DIR" 2>/dev/null)" ]; then
            echo "[native-config] Restoring from backup..."
            mkdir -p "$CONFIG_DIR"
            cp -r "$BACKUP_DIR"/. "$CONFIG_DIR"/ 2>/dev/null || true
            chown -R agent:agent "$CONFIG_DIR"
            echo "[native-config] Restored"
            return 0
        fi
    fi

    # If config exists, back it up
    if [ -d "$CONFIG_DIR" ] && [ "$(ls -A "$CONFIG_DIR" 2>/dev/null)" ]; then
        mkdir -p "$BACKUP_DIR"
        cp -r "$CONFIG_DIR"/. "$BACKUP_DIR"/ 2>/dev/null || true
        chown -R agent:agent "$BACKUP_DIR" 2>/dev/null || true
    fi
}

# Backup/restore conversation history (~/.claude/projects/)
# Conversations are stored as .jsonl files per working directory
persist_conversations() {
    local CONV_DIR="/home/agent/.claude/projects"
    local BACKUP_DIR="/home/agent/projects/.claude-conversations-backup"

    echo "[conversations] Checking conversation history persistence..."

    # Restore from backup if exists and local is empty
    if [ -d "$BACKUP_DIR" ] && [ "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
        if [ ! -d "$CONV_DIR" ] || [ -z "$(ls -A "$CONV_DIR" 2>/dev/null)" ]; then
            echo "[conversations] Restoring from backup..."
            mkdir -p "$CONV_DIR"
            cp -r "$BACKUP_DIR"/. "$CONV_DIR"/ 2>/dev/null || true
            chown -R agent:agent "$CONV_DIR"
            echo "[conversations] Restored $(find "$CONV_DIR" -name "*.jsonl" 2>/dev/null | wc -l) session files"
            return 0
        fi
    fi

    # If conversations exist, back them up
    if [ -d "$CONV_DIR" ] && [ "$(ls -A "$CONV_DIR" 2>/dev/null)" ]; then
        mkdir -p "$BACKUP_DIR"
        cp -r "$CONV_DIR"/. "$BACKUP_DIR"/ 2>/dev/null || true
        chown -R agent:agent "$BACKUP_DIR" 2>/dev/null || true
    fi
}

persist_credentials
persist_claude_config
persist_settings_local
persist_native_config
persist_conversations
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

# Initialize skills git repo and sync with GitHub (called on startup)
init_skills_git() {
    local SKILLS_DIR="/home/agent/.claude/skills"

    # Mark skills directory as safe (fixes ownership issues with mounted volumes)
    git config --global --add safe.directory "$SKILLS_DIR" 2>/dev/null || true

    # Skip if no GITHUB_TOKEN
    if [ -z "$GITHUB_TOKEN" ]; then
        echo "[skills-git] GITHUB_TOKEN not set, skipping skills repo sync"
        return 0
    fi

    local REPO_NAME="agent-mobile-claude-skills"
    local GITHUB_USER="${_CACHED_GITHUB_USER:-$(gh api user --jq '.login' 2>/dev/null || echo "")}"

    if [ -z "$GITHUB_USER" ]; then
        echo "[skills-git] Could not get GitHub username, skipping"
        return 0
    fi

    local REMOTE_URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO_NAME}.git"

    cd "$SKILLS_DIR" || return 1

    # Remove stale git lock files from previous crash/unclean shutdown
    if [ -f ".git/index.lock" ]; then
        echo "[skills-git] Removing stale index.lock from previous crash"
        rm -f ".git/index.lock"
    fi

    # Initialize git if needed
    if [ ! -d ".git" ]; then
        echo "[skills-git] Initializing git repository..."
        git init
        git branch -M master
    fi

    # Set git identity for commits (use env vars or defaults)
    git config user.email "${GIT_EMAIL:-agent@mobile.local}"
    git config user.name "${GIT_NAME:-Agent Mobile}"

    # Set/update remote origin
    if git remote get-url origin &>/dev/null; then
        git remote set-url origin "$REMOTE_URL"
    else
        git remote add origin "$REMOTE_URL"
    fi

    # Create repo if doesn't exist
    if ! git ls-remote origin &>/dev/null; then
        echo "[skills-git] Creating private repo ${REPO_NAME}..."
        gh repo create "$REPO_NAME" --private --source=. --push 2>/dev/null || true
    fi

    # IMPORTANT: Commit local changes FIRST to preserve them before pulling remote
    # This ensures skills edited on the host machine are never overwritten by remote
    if [ -n "$(git status --porcelain)" ]; then
        echo "[skills-git] Committing local changes first (preserves host edits)..."
        configure_skills_git_excludes
        git add -A
        git commit -m "Auto-commit from $(hostname): $(date '+%Y-%m-%d %H:%M:%S') [local changes]" || true
    fi

    # Pull remote with merge (preserves both local and remote history - no data loss)
    echo "[skills-git] Pulling from remote (merge strategy)..."
    git fetch origin master 2>/dev/null || true

    # Check if branches have diverged
    LOCAL_COMMITS=$(git rev-list --count origin/master..HEAD 2>/dev/null || echo "0")
    REMOTE_COMMITS=$(git rev-list --count HEAD..origin/master 2>/dev/null || echo "0")

    if [ "$REMOTE_COMMITS" = "0" ]; then
        echo "[skills-git] Already up to date with remote"
    elif [ "$LOCAL_COMMITS" = "0" ]; then
        echo "[skills-git] Fast-forward merge possible"
        git merge origin/master --no-edit 2>/dev/null || true
    else
        echo "[skills-git] Branches diverged (local: $LOCAL_COMMITS, remote: $REMOTE_COMMITS) - merging..."
        # Use theirs strategy for conflicts (remote wins), allow unrelated histories, keep history
        if git merge origin/master --no-edit -X theirs --allow-unrelated-histories 2>&1; then
            echo "[skills-git] Merge successful (remote changes preserved for conflicts)"
        else
            echo "[skills-git] Merge failed, resolving conflicts..."
            # Abort any in-progress merge and try again with manual resolution
            git merge --abort 2>/dev/null || true
            git merge origin/master --no-commit --no-edit -X theirs --allow-unrelated-histories 2>/dev/null || true
            git checkout --theirs . 2>/dev/null || true
            git add -A 2>/dev/null || true
            git commit -m "Merge remote: remote changes preserved for conflicts" 2>/dev/null || true
        fi
    fi

    # Push (never force - preserves remote history)
    echo "[skills-git] Pushing to remote..."
    if git push -u origin master 2>&1; then
        echo "[skills-git] Push successful"
    else
        echo "[skills-git] Push failed, will retry on shutdown"
    fi

    cd - >/dev/null
    echo "[skills-git] Skills repo initialized"
}

# Initialize clawdbot config git repo and sync with GitHub (called on startup)
init_clawdbot_git() {
    local CLAWDBOT_DIR="/home/agent/.clawdbot"

    # Mark clawdbot directory as safe (fixes ownership issues with mounted volumes)
    git config --global --add safe.directory "$CLAWDBOT_DIR" 2>/dev/null || true

    # Skip if no GITHUB_TOKEN
    if [ -z "$GITHUB_TOKEN" ]; then
        echo "[clawdbot-git] GITHUB_TOKEN not set, skipping clawdbot config sync"
        return 0
    fi

    local REPO_NAME="agent-mobile-clawdbot-config"
    local GITHUB_USER="${_CACHED_GITHUB_USER:-$(gh api user --jq '.login' 2>/dev/null || echo "")}"

    if [ -z "$GITHUB_USER" ]; then
        echo "[clawdbot-git] Could not get GitHub username, skipping"
        return 0
    fi

    local REMOTE_URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO_NAME}.git"

    local BRANCH="${CLAWD_SOUL_BRANCH:-master}"
    echo "[clawdbot-git] Config branch: $BRANCH"

    # If directory doesn't exist, try to clone from GitHub
    if [ ! -d "$CLAWDBOT_DIR" ]; then
        echo "[clawdbot-git] Directory doesn't exist, checking for remote repo..."
        if gh repo view "${GITHUB_USER}/${REPO_NAME}" &>/dev/null; then
            echo "[clawdbot-git] Found remote repo, cloning..."
            git clone -b "$BRANCH" "$REMOTE_URL" "$CLAWDBOT_DIR" 2>/dev/null || \
                git clone "$REMOTE_URL" "$CLAWDBOT_DIR"
            chown -R agent:agent "$CLAWDBOT_DIR" 2>/dev/null || true
            echo "[clawdbot-git] Cloned from GitHub (branch: $BRANCH)"
            return 0
        else
            echo "[clawdbot-git] No remote repo found, will be created on first run"
            return 0
        fi
    fi

    cd "$CLAWDBOT_DIR" || return 1

    # Remove stale git lock files from previous crash/unclean shutdown
    if [ -f ".git/index.lock" ]; then
        echo "[clawdbot-git] Removing stale index.lock from previous crash"
        rm -f ".git/index.lock"
    fi

    # Initialize git if needed
    if [ ! -d ".git" ]; then
        echo "[clawdbot-git] Initializing git repository..."
        git init
        git branch -M "$BRANCH"

        # Create .gitignore for sensitive files
        cat > .gitignore << EOF
# Ignore logs
*.log

# Ignore temp files
*.tmp
*.bak
EOF
        chown agent:agent .gitignore
    fi

    # Set git identity for commits (use env vars or defaults)
    git config user.email "${GIT_EMAIL:-agent@mobile.local}"
    git config user.name "${GIT_NAME:-Agent Mobile}"

    # Set/update remote origin
    if git remote get-url origin &>/dev/null; then
        git remote set-url origin "$REMOTE_URL"
    else
        git remote add origin "$REMOTE_URL"
    fi

    # Commit local changes FIRST to preserve them before pulling remote
    if [ -n "$(git status --porcelain)" ]; then
        echo "[clawdbot-git] Committing local changes first..."
        git add -A
        git commit -m "Auto-commit from $(hostname): $(date '+%Y-%m-%d %H:%M:%S') [local changes]" || true
    fi

    # Create repo if doesn't exist (check via gh api, not git ls-remote which needs the repo to exist)
    if ! gh repo view "${GITHUB_USER}/${REPO_NAME}" &>/dev/null; then
        echo "[clawdbot-git] Creating private repo ${REPO_NAME}..."
        if gh repo create "$REPO_NAME" --private 2>&1; then
            echo "[clawdbot-git] Repo created successfully"
        else
            echo "[clawdbot-git] Repo creation failed (may already exist or permission issue)"
        fi
    else
        echo "[clawdbot-git] Repo ${REPO_NAME} already exists"
    fi

    # Pull remote with merge (if remote has commits)
    echo "[clawdbot-git] Fetching from remote..."
    if git fetch origin "$BRANCH" 2>/dev/null; then
        # Check if branches have diverged
        LOCAL_COMMITS=$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo "0")
        REMOTE_COMMITS=$(git rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo "0")

        if [ "$REMOTE_COMMITS" = "0" ]; then
            echo "[clawdbot-git] Already up to date with remote"
        elif [ "$LOCAL_COMMITS" = "0" ]; then
            echo "[clawdbot-git] Fast-forward merge possible"
            git merge "origin/$BRANCH" --no-edit 2>/dev/null || true
        else
            echo "[clawdbot-git] Branches diverged - merging..."
            git merge "origin/$BRANCH" --no-edit -X theirs --allow-unrelated-histories 2>/dev/null || true
        fi
    elif [ "$BRANCH" != "master" ]; then
        # Branch doesn't exist on remote yet, create from master
        echo "[clawdbot-git] Branch '$BRANCH' not found on remote, creating from master..."
        if git fetch origin master 2>/dev/null; then
            git checkout -b "$BRANCH" origin/master 2>/dev/null || git checkout -b "$BRANCH" 2>/dev/null || true
        fi
    else
        echo "[clawdbot-git] Remote is empty or fetch failed, will push to initialize"
    fi

    # Push
    echo "[clawdbot-git] Pushing to remote..."
    if git push -u origin "$BRANCH" 2>&1; then
        echo "[clawdbot-git] Push successful"
    else
        echo "[clawdbot-git] Push failed, will retry on shutdown"
    fi

    cd - >/dev/null

    # Fix ownership after git operations (git runs as root, clawdbot runs as agent)
    chown -R agent:agent "$CLAWDBOT_DIR" 2>/dev/null || true

    echo "[clawdbot-git] Clawdbot config repo initialized"
}

# Initialize clawd soul/memory git repo and sync with GitHub (called on startup)
init_clawd_git() {
    local CLAWD_DIR="/home/agent/clawd"

    # Mark clawd directory as safe (fixes ownership issues with mounted volumes)
    git config --global --add safe.directory "$CLAWD_DIR" 2>/dev/null || true

    # Skip if no GITHUB_TOKEN
    if [ -z "$GITHUB_TOKEN" ]; then
        echo "[clawd-git] GITHUB_TOKEN not set, skipping clawd soul sync"
        return 0
    fi

    local REPO_NAME="agent-mobile-clawd-soul"
    local GITHUB_USER="${_CACHED_GITHUB_USER:-$(gh api user --jq '.login' 2>/dev/null || echo "")}"

    if [ -z "$GITHUB_USER" ]; then
        echo "[clawd-git] Could not get GitHub username, skipping"
        return 0
    fi

    local REMOTE_URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO_NAME}.git"

    local BRANCH="${CLAWD_SOUL_BRANCH:-master}"
    echo "[clawd-git] Soul branch: $BRANCH"

    # If directory doesn't exist, try to clone from GitHub
    if [ ! -d "$CLAWD_DIR" ]; then
        echo "[clawd-git] Directory doesn't exist, checking for remote repo..."
        if gh repo view "${GITHUB_USER}/${REPO_NAME}" &>/dev/null; then
            echo "[clawd-git] Found remote repo, cloning..."
            git clone -b "$BRANCH" "$REMOTE_URL" "$CLAWD_DIR" 2>/dev/null || \
                git clone "$REMOTE_URL" "$CLAWD_DIR"
            chown -R agent:agent "$CLAWD_DIR" 2>/dev/null || true
            echo "[clawd-git] Cloned from GitHub (branch: $BRANCH)"
            return 0
        else
            echo "[clawd-git] No remote repo found, will be created on first run"
            return 0
        fi
    fi

    cd "$CLAWD_DIR" || return 1

    # Remove stale git lock files from previous crash/unclean shutdown
    if [ -f ".git/index.lock" ]; then
        echo "[clawd-git] Removing stale index.lock from previous crash"
        rm -f ".git/index.lock"
    fi

    # Initialize git if needed
    if [ ! -d ".git" ]; then
        echo "[clawd-git] Initializing git repository..."
        git init
        git branch -M master

        # Create .gitignore for sensitive files
        cat > .gitignore << EOF
# Ignore logs
*.log

# Ignore temp files
*.tmp
*.bak
EOF
        chown agent:agent .gitignore
    fi

    # Set git identity for commits (use env vars or defaults)
    git config user.email "${GIT_EMAIL:-agent@mobile.local}"
    git config user.name "${GIT_NAME:-Agent Mobile}"

    # Set/update remote origin
    if git remote get-url origin &>/dev/null; then
        git remote set-url origin "$REMOTE_URL"
    else
        git remote add origin "$REMOTE_URL"
    fi

    # Commit local changes FIRST to preserve them before pulling remote
    if [ -n "$(git status --porcelain)" ]; then
        echo "[clawd-git] Committing local changes first..."
        git add -A
        git commit -m "Auto-commit from $(hostname): $(date '+%Y-%m-%d %H:%M:%S') [local changes]" || true
    fi

    # Create repo if doesn't exist (check via gh api, not git ls-remote which needs the repo to exist)
    if ! gh repo view "${GITHUB_USER}/${REPO_NAME}" &>/dev/null; then
        echo "[clawd-git] Creating private repo ${REPO_NAME}..."
        if gh repo create "$REPO_NAME" --private 2>&1; then
            echo "[clawd-git] Repo created successfully"
        else
            echo "[clawd-git] Repo creation failed (may already exist or permission issue)"
        fi
    else
        echo "[clawd-git] Repo ${REPO_NAME} already exists"
    fi

    # Checkout the right branch if not already on it
    local CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "master")
    if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
        echo "[clawd-git] Switching from $CURRENT_BRANCH to $BRANCH..."
        if git checkout "$BRANCH" 2>/dev/null; then
            echo "[clawd-git] Switched to $BRANCH"
        elif git checkout -b "$BRANCH" "origin/$BRANCH" 2>/dev/null; then
            echo "[clawd-git] Created local $BRANCH from remote"
        else
            echo "[clawd-git] Branch $BRANCH not found locally or remotely, staying on $CURRENT_BRANCH"
            BRANCH="$CURRENT_BRANCH"
        fi
    fi

    # Pull remote with merge (if remote has commits)
    echo "[clawd-git] Fetching from remote..."
    if git fetch origin "$BRANCH" 2>/dev/null; then
        # Check if branches have diverged
        LOCAL_COMMITS=$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo "0")
        REMOTE_COMMITS=$(git rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo "0")

        if [ "$REMOTE_COMMITS" = "0" ]; then
            echo "[clawd-git] Already up to date with remote"
        elif [ "$LOCAL_COMMITS" = "0" ]; then
            echo "[clawd-git] Fast-forward merge possible"
            git merge "origin/$BRANCH" --no-edit 2>/dev/null || true
        else
            echo "[clawd-git] Branches diverged - merging..."
            git merge "origin/$BRANCH" --no-edit -X theirs --allow-unrelated-histories 2>/dev/null || true
        fi
    else
        echo "[clawd-git] Remote is empty or fetch failed, will push to initialize"
    fi

    # Push
    echo "[clawd-git] Pushing to remote..."
    if git push -u origin "$BRANCH" 2>&1; then
        echo "[clawd-git] Push successful"
    else
        echo "[clawd-git] Push failed, will retry on shutdown"
    fi

    cd - >/dev/null

    # Fix ownership after git operations (git runs as root, clawd runs as agent)
    chown -R agent:agent "$CLAWD_DIR" 2>/dev/null || true

    echo "[clawd-git] Clawd soul repo initialized"
}

# Initialize shared notes repo (vroth-shared-notes)
init_shared_notes() {
    local SHARED_DIR="/home/agent/projects/shared"

    git config --global --add safe.directory "$SHARED_DIR" 2>/dev/null || true

    if [ -z "$GITHUB_TOKEN" ]; then
        echo "[shared-notes] GITHUB_TOKEN not set, skipping"
        return 0
    fi

    local GITHUB_USER="${_CACHED_GITHUB_USER:-$(gh api user --jq '.login' 2>/dev/null || echo "")}"
    if [ -z "$GITHUB_USER" ]; then
        echo "[shared-notes] Could not get GitHub username, skipping"
        return 0
    fi

    local REPO_NAME="vroth-shared-notes"
    local REMOTE_URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO_NAME}.git"

    if [ ! -d "$SHARED_DIR" ]; then
        echo "[shared-notes] Cloning shared notes repo..."
        if gh repo view "${GITHUB_USER}/${REPO_NAME}" &>/dev/null; then
            git clone "$REMOTE_URL" "$SHARED_DIR" 2>/dev/null
            chown -R agent:agent "$SHARED_DIR" 2>/dev/null || true
            echo "[shared-notes] Cloned from GitHub"
        else
            echo "[shared-notes] Repo not found, creating..."
            mkdir -p "$SHARED_DIR"
            cd "$SHARED_DIR"
            git init
            git branch -M main
            echo "# Vroth Shared Notes" > README.md
            git add README.md
            git config user.email "${GIT_EMAIL:-agent@mobile.local}"
            git config user.name "${GIT_NAME:-Agent Mobile}"
            git commit -m "Initial commit"
            gh repo create "$REPO_NAME" --private --source=. --push 2>/dev/null || true
            chown -R agent:agent "$SHARED_DIR" 2>/dev/null || true
            echo "[shared-notes] Created new repo"
        fi
        return 0
    fi

    cd "$SHARED_DIR" || return 1

    # Remove stale lock
    [ -f ".git/index.lock" ] && rm -f ".git/index.lock"

    # Set git identity
    git config user.email "${GIT_EMAIL:-agent@mobile.local}"
    git config user.name "${GIT_NAME:-Agent Mobile}"

    # Set/update remote
    if git remote get-url origin &>/dev/null; then
        git remote set-url origin "$REMOTE_URL"
    else
        git remote add origin "$REMOTE_URL"
    fi

    # Pull latest
    echo "[shared-notes] Pulling latest..."
    git pull origin main --rebase 2>/dev/null || git pull origin master --rebase 2>/dev/null || true

    echo "[shared-notes] Shared notes repo initialized"

    # Set up vroth-bridge if agent-mobile repo exists
    if [ -f "/home/agent/projects/agent-mobile/scripts/vroth-bridge.sh" ]; then
        ln -sf /home/agent/projects/agent-mobile/scripts/vroth-bridge.sh /usr/local/bin/vroth-bridge
        echo "[shared-notes] vroth-bridge installed to PATH"
    fi
}

# Periodic shared notes sync daemon (runs in background)
start_shared_notes_sync() {
    local INTERVAL="${SHARED_NOTES_SYNC_INTERVAL:-300}"
    local SHARED_DIR="/home/agent/projects/shared"

    echo "[shared-notes-sync] Background sync daemon started (interval: ${INTERVAL}s)"

    while true; do
        sleep "$INTERVAL"
        if [ -d "$SHARED_DIR/.git" ]; then
            cd "$SHARED_DIR" || continue

            # Set git identity (needed for merge commits)
            git config user.email "${GIT_EMAIL:-agent@mobile.local}" 2>/dev/null
            git config user.name "${GIT_NAME:-Agent Mobile}" 2>/dev/null

            # Remove stale lock if present
            [ -f ".git/index.lock" ] && rm -f ".git/index.lock"

            # Pull remote changes
            git fetch origin 2>/dev/null
            git merge origin/main --no-edit -X theirs 2>/dev/null || \
                git merge origin/master --no-edit -X theirs 2>/dev/null || true

            # Commit & push local changes
            if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
                git add -A
                git commit -m "Auto-sync from $(hostname): $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null || true
                git push origin main 2>/dev/null || git push origin master 2>/dev/null || true
            fi

            cd - >/dev/null
        fi
    done
}

# Initialize agent-mobile repo and sync with GitHub (called on startup)
init_agent_mobile_git() {
    local AGENT_MOBILE_DIR="/home/agent/projects/agent-mobile"

    # Mark agent-mobile directory as safe (fixes ownership issues with mounted volumes)
    git config --global --add safe.directory "$AGENT_MOBILE_DIR" 2>/dev/null || true

    # Skip if no GITHUB_TOKEN
    if [ -z "$GITHUB_TOKEN" ]; then
        echo "[agent-mobile-git] GITHUB_TOKEN not set, skipping agent-mobile repo sync"
        return 0
    fi

    local REPO_NAME="agent-mobile"
    local GITHUB_USER="${_CACHED_GITHUB_USER:-$(gh api user --jq '.login' 2>/dev/null || echo "")}"

    if [ -z "$GITHUB_USER" ]; then
        echo "[agent-mobile-git] Could not get GitHub username, skipping"
        return 0
    fi

    local REMOTE_URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO_NAME}.git"
    local BRANCH="vroth"
    echo "[agent-mobile-git] Target branch: $BRANCH"

    # If directory doesn't exist, try to clone from GitHub
    if [ ! -d "$AGENT_MOBILE_DIR" ]; then
        echo "[agent-mobile-git] Directory doesn't exist, checking for remote repo..."
        if gh repo view "${GITHUB_USER}/${REPO_NAME}" &>/dev/null; then
            echo "[agent-mobile-git] Found remote repo, cloning..."
            mkdir -p /home/agent/projects
            git clone -b "$BRANCH" "$REMOTE_URL" "$AGENT_MOBILE_DIR" 2>/dev/null || \
                git clone "$REMOTE_URL" "$AGENT_MOBILE_DIR"
            chown -R agent:agent "$AGENT_MOBILE_DIR" 2>/dev/null || true
            echo "[agent-mobile-git] Cloned from GitHub (branch: $BRANCH)"
            
            # Install vroth-bridge to PATH
            if [ -f "$AGENT_MOBILE_DIR/scripts/vroth-bridge.sh" ]; then
                ln -sf "$AGENT_MOBILE_DIR/scripts/vroth-bridge.sh" /usr/local/bin/vroth-bridge
                echo "[agent-mobile-git] vroth-bridge installed to PATH"
            fi
            
            return 0
        else
            echo "[agent-mobile-git] No remote repo found, will be created on first run"
            return 0
        fi
    fi

    cd "$AGENT_MOBILE_DIR" || return 1

    # Remove stale git lock files from previous crash/unclean shutdown
    if [ -f ".git/index.lock" ]; then
        echo "[agent-mobile-git] Removing stale index.lock from previous crash"
        rm -f ".git/index.lock"
    fi

    # Set git identity for commits (use env vars or defaults)
    git config user.email "${GIT_EMAIL:-agent@mobile.local}"
    git config user.name "${GIT_NAME:-Agent Mobile}"

    # Set/update remote origin
    if git remote get-url origin &>/dev/null; then
        git remote set-url origin "$REMOTE_URL"
    else
        git remote add origin "$REMOTE_URL"
    fi

    # Checkout the vroth branch if not already on it
    local CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "master")
    if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
        echo "[agent-mobile-git] Switching from $CURRENT_BRANCH to $BRANCH..."
        if git checkout "$BRANCH" 2>/dev/null; then
            echo "[agent-mobile-git] Switched to $BRANCH"
        elif git checkout -b "$BRANCH" "origin/$BRANCH" 2>/dev/null; then
            echo "[agent-mobile-git] Created local $BRANCH from remote"
        else
            echo "[agent-mobile-git] Branch $BRANCH not found, staying on $CURRENT_BRANCH"
            BRANCH="$CURRENT_BRANCH"
        fi
    fi

    # Pull remote with merge (if remote has commits)
    echo "[agent-mobile-git] Fetching from remote..."
    if git fetch origin "$BRANCH" 2>/dev/null; then
        # Check if branches have diverged
        LOCAL_COMMITS=$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo "0")
        REMOTE_COMMITS=$(git rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo "0")

        if [ "$REMOTE_COMMITS" = "0" ]; then
            echo "[agent-mobile-git] Already up to date with remote"
        elif [ "$LOCAL_COMMITS" = "0" ]; then
            echo "[agent-mobile-git] Fast-forward merge possible"
            git merge "origin/$BRANCH" --no-edit 2>/dev/null || true
        else
            echo "[agent-mobile-git] Branches diverged - merging..."
            git merge "origin/$BRANCH" --no-edit -X theirs --allow-unrelated-histories 2>/dev/null || true
        fi
    else
        echo "[agent-mobile-git] Remote is empty or fetch failed, will push to initialize"
    fi

    cd - >/dev/null

    # Fix ownership after git operations
    chown -R agent:agent "$AGENT_MOBILE_DIR" 2>/dev/null || true

    echo "[agent-mobile-git] Agent-mobile repo initialized"

    # Install vroth-bridge to PATH
    if [ -f "$AGENT_MOBILE_DIR/scripts/vroth-bridge.sh" ]; then
        ln -sf "$AGENT_MOBILE_DIR/scripts/vroth-bridge.sh" /usr/local/bin/vroth-bridge
        echo "[agent-mobile-git] vroth-bridge installed to PATH"
    fi
}

echo "Initializing skill system (local only - remote sync happens after network setup)..."
# Mark skills directory as safe early (fixes ownership issues with mounted volumes)
git config --global --add safe.directory /home/agent/.claude/skills 2>/dev/null || true
sync_default_skills

# Fix Windows CRLF line endings on all skill scripts (common when mounted from Windows host)
fix_skill_line_endings() {
    local SKILLS_DIR="/home/agent/.claude/skills"
    if [ -d "$SKILLS_DIR" ]; then
        find "$SKILLS_DIR" -type f \( -name "*.sh" -o -name "*.py" -o -name "ralph" \) -exec sed -i 's/\r$//' {} \; 2>/dev/null || true
        echo "Fixed line endings for skill scripts"
    fi
}
fix_skill_line_endings

update_claude_md
# NOTE: init_skills_git is called AFTER Tailscale/GitHub auth to avoid race condition

# NOTE: ralph-wiggum plugin must be installed interactively via:
#   /plugin install ralph-loop@claude-plugins-official
#   /plugin enable ralph-loop@claude-plugins-official
# The skill `ralph-invoke` will instruct users to do this if the plugin is missing.

# ==========================================
# Webtmux Setup
# ==========================================

start_webtmux() {
    if [ "${WEBTMUX_ENABLED:-false}" != "true" ]; then
        echo "webtmux disabled (set WEBTMUX_ENABLED=true to enable)"
        return
    fi

    if ! command -v webtmux &>/dev/null; then
        echo "webtmux not found, skipping..."
        return
    fi

    echo "Starting webtmux on port 9090..."
    # Start as agent user in background
    # Use -w for write access, --no-auth for easy access (dev env), -p 9090
    # We use nohup to ensure it stays running
    su - agent -c "nohup webtmux -p 9090 -w --no-auth tmux new-session -A -s main > /home/agent/webtmux.log 2>&1 &"
    
    echo "webtmux started at http://localhost:9090 (log: /home/agent/webtmux.log)"
}

start_webtmux

# ==========================================
# RTS Manager Setup (Factorio-style Dashboard)
# ==========================================

start_rts_manager() {
    if [ "${RTS_ENABLED:-true}" != "true" ]; then
        echo "RTS Manager disabled (set RTS_ENABLED=true to enable)"
        return
    fi

    local RTS_DIR="/opt/rts-manager"
    if [ ! -d "$RTS_DIR" ]; then
        echo "RTS Manager not found at $RTS_DIR, skipping..."
        return
    fi

    local RTS_PORT="${RTS_PORT:-9091}"
    echo "Starting RTS Manager on port $RTS_PORT..."

    # Set environment variables for RTS Manager
    export PORT="$RTS_PORT"
    export CLAUDE_DIR="/home/agent/.claude"

    # Start as agent user in background
    # Uses nohup to ensure it stays running
    # Server is compiled to dist/server/ by npm run build
    su - agent -c "cd $RTS_DIR && PORT=$RTS_PORT CLAUDE_DIR=/home/agent/.claude nohup node dist/server/server/index.js > /home/agent/rts-manager.log 2>&1 &"

    # Wait briefly and check if it started
    sleep 2
    if curl -s "http://localhost:$RTS_PORT/api/health" > /dev/null 2>&1; then
        echo "RTS Manager started at http://localhost:$RTS_PORT"
        echo "  Dashboard: http://localhost:$RTS_PORT"
        echo "  Log file: /home/agent/rts-manager.log"
    else
        echo "Warning: RTS Manager may have failed to start. Check /home/agent/rts-manager.log"
    fi
}

start_rts_manager

# ==========================================
# Health Server (HTTP health endpoint)
# ==========================================

echo "Starting health server on port ${HEALTH_PORT:-18790}..."
nohup /opt/agent-mobile/health-server.sh > /dev/null 2>&1 &
echo "Health server started — curl http://localhost:${HEALTH_PORT:-18790}"

# ==========================================
# Clawdbot Setup (Telegram/Multi-Platform AI)
# ==========================================

start_clawdbot() {
    if [ "${CLAWDBOT_ENABLED:-false}" != "true" ]; then
        echo "Clawdbot disabled (set CLAWDBOT_ENABLED=true to enable)"
        return
    fi

    if ! command -v clawdbot &>/dev/null; then
        echo "Clawdbot not found, skipping..."
        return
    fi

    if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
        echo "Warning: CLAWDBOT_ENABLED=true but TELEGRAM_BOT_TOKEN not set"
        echo "Get a bot token from @BotFather on Telegram"
        return
    fi

    echo "Starting Clawdbot gateway on port 18789..."

    # Install fetch guard script (prevents crash on transient Telegram API failures)
    # Guard script lives in projects/ bind mount, persisted across container rebuilds
    local GUARD_SRC="/home/agent/projects/clawdbot-fetch-guard.js"
    if [ -f "$GUARD_SRC" ]; then
        cp "$GUARD_SRC" /home/agent/clawdbot-fetch-guard.js
        chown agent:agent /home/agent/clawdbot-fetch-guard.js
    fi

    # Create clawdbot config if it doesn't exist
    local CLAWDBOT_DIR="/home/agent/.clawdbot"
    local CLAWDBOT_CONFIG="$CLAWDBOT_DIR/clawdbot.json"

    mkdir -p "$CLAWDBOT_DIR"
    chown agent:agent "$CLAWDBOT_DIR"

    if [ ! -f "$CLAWDBOT_CONFIG" ]; then
        cat > "$CLAWDBOT_CONFIG" << EOF
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-opus-4-5"
      },
      "thinkingDefault": "high",
      "memorySearch": {
        "provider": "gemini",
        "model": "gemini-embedding-001"
      }
    }
  },
  "channels": {
    "telegram": {
      "enabled": true
    }
  },
  "gateway": {
    "mode": "local"
  }
}
EOF
        chown agent:agent "$CLAWDBOT_CONFIG"
        chmod 600 "$CLAWDBOT_CONFIG"
    fi

    # Ensure gateway.mode is set in existing config (may be missing after git sync)
    if [ -f "$CLAWDBOT_CONFIG" ] && ! grep -q '"gateway"' "$CLAWDBOT_CONFIG"; then
        echo "[clawdbot] Adding gateway.mode to config..."
        # Use jq if available, otherwise sed
        if command -v jq &>/dev/null; then
            jq '. + {gateway: {mode: "local"}}' "$CLAWDBOT_CONFIG" > "$CLAWDBOT_CONFIG.tmp" && mv "$CLAWDBOT_CONFIG.tmp" "$CLAWDBOT_CONFIG"
        fi
    fi

    # Inject TELEGRAM_BOT_TOKEN from env into config (overrides git-synced token)
    # This ensures each instance uses its own bot token from .env
    if [ -f "$CLAWDBOT_CONFIG" ] && [ -n "$TELEGRAM_BOT_TOKEN" ] && command -v jq &>/dev/null; then
        echo "[clawdbot] Injecting TELEGRAM_BOT_TOKEN from environment into config..."
        jq --arg token "$TELEGRAM_BOT_TOKEN" \
           '.channels.telegram.botToken = $token' \
           "$CLAWDBOT_CONFIG" > "$CLAWDBOT_CONFIG.tmp" && mv "$CLAWDBOT_CONFIG.tmp" "$CLAWDBOT_CONFIG"
        chown agent:agent "$CLAWDBOT_CONFIG"
    fi

    # Inject TELEGRAM_GROUP_IDS from env into config (comma-separated group chat IDs)
    # Example: TELEGRAM_GROUP_IDS="-5159563342,-1001234567890"
    if [ -f "$CLAWDBOT_CONFIG" ] && [ -n "$TELEGRAM_GROUP_IDS" ] && command -v jq &>/dev/null; then
        echo "[clawdbot] Injecting TELEGRAM_GROUP_IDS from environment into config..."
        # Build groups object from comma-separated IDs
        GROUPS_JSON="{}"
        IFS=',' read -ra GROUP_ARRAY <<< "$TELEGRAM_GROUP_IDS"
        for gid in "${GROUP_ARRAY[@]}"; do
            gid=$(echo "$gid" | xargs)  # trim whitespace
            [ -n "$gid" ] && GROUPS_JSON=$(echo "$GROUPS_JSON" | jq --arg id "$gid" '. + {($id): {"enabled": true, "requireMention": false}}')
        done
        jq --argjson groups "$GROUPS_JSON" \
           '.channels.telegram.groups = $groups | .channels.telegram.groupPolicy = "allowlist"' \
           "$CLAWDBOT_CONFIG" > "$CLAWDBOT_CONFIG.tmp" && mv "$CLAWDBOT_CONFIG.tmp" "$CLAWDBOT_CONFIG"
        chown agent:agent "$CLAWDBOT_CONFIG"
    fi

    # Start clawdbot gateway with supervisor loop (restarts on crash or config-change restart)
    # --allow-unconfigured allows startup even if gateway.mode not set in config
    cat > /home/agent/clawdbot-supervisor.sh << 'SUPERVISOR_EOF'
#!/bin/bash
# Source all platform credentials from /etc/environment
set -a; . /etc/environment 2>/dev/null; set +a
export TELEGRAM_BOT_TOKEN="$1"
export GEMINI_API_KEY="$2"
export BRAVE_API_KEY="$3"
export NODE_OPTIONS="--max-old-space-size=1024"
LOG_FILE="/home/agent/clawdbot.log"
RESTART_DELAY=3
MAX_RAPID_RESTARTS=5
RAPID_RESTART_WINDOW=60  # seconds

rapid_restart_count=0
last_restart_time=0

while true; do
    current_time=$(date +%s)

    # Reset rapid restart counter if enough time has passed
    if [ $((current_time - last_restart_time)) -gt $RAPID_RESTART_WINDOW ]; then
        rapid_restart_count=0
    fi

    # Check for rapid restart loop (crash loop protection)
    if [ $rapid_restart_count -ge $MAX_RAPID_RESTARTS ]; then
        echo "[clawdbot-supervisor] Too many rapid restarts ($rapid_restart_count in ${RAPID_RESTART_WINDOW}s), waiting 60s..." >> "$LOG_FILE"
        sleep 60
        rapid_restart_count=0
    fi

    echo "[clawdbot-supervisor] Starting clawdbot gateway..." >> "$LOG_FILE"
    GUARD_REQUIRE=""
    [ -f /home/agent/clawdbot-fetch-guard.js ] && GUARD_REQUIRE="--require /home/agent/clawdbot-fetch-guard.js"
    NODE_OPTIONS="--max-old-space-size=1024 $GUARD_REQUIRE" clawdbot gateway --port 18789 --verbose --allow-unconfigured >> "$LOG_FILE" 2>&1
    exit_code=$?

    last_restart_time=$(date +%s)
    rapid_restart_count=$((rapid_restart_count + 1))

    echo "[clawdbot-supervisor] Clawdbot exited with code $exit_code, restarting in ${RESTART_DELAY}s..." >> "$LOG_FILE"
    sleep $RESTART_DELAY
done
SUPERVISOR_EOF
    chmod +x /home/agent/clawdbot-supervisor.sh
    chown agent:agent /home/agent/clawdbot-supervisor.sh

    # Start supervisor as agent user in background
    su - agent -c "nohup /home/agent/clawdbot-supervisor.sh '$TELEGRAM_BOT_TOKEN' '$GEMINI_API_KEY' '$BRAVE_API_KEY' > /dev/null 2>&1 &"

    sleep 2
    if curl -s "http://localhost:18789/health" > /dev/null 2>&1; then
        echo "Clawdbot gateway started at http://localhost:18789"
        echo "  Log file: /home/agent/clawdbot.log"
    else
        echo "Clawdbot gateway started (check /home/agent/clawdbot.log for status)"
    fi
}

# NOTE: start_clawdbot moved to after init_clawdbot_git (needs synced config + correct permissions)

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
# Claude Code Update Command
# ==========================================
# Detect install method (set during docker build)
CLAUDE_INSTALL_METHOD=$(cat /etc/claude-install-method 2>/dev/null || echo "native")

create_update_claude_command() {
    cat > /usr/local/bin/update-claude << SCRIPT
#!/bin/bash
# Run as agent user to use correct home directory for credentials
INSTALL_METHOD="$CLAUDE_INSTALL_METHOD"

do_update() {
    if [ "\$INSTALL_METHOD" = "npm" ]; then
        echo "Updating Claude Code via npm..."
        sudo npm install -g @anthropic-ai/claude-code@latest
    else
        echo "Updating Claude Code via native updater..."
        claude update
    fi
    echo "Current version: \$(claude --version 2>/dev/null | head -1)"
}

if [ "\$(id -u)" = "0" ]; then
    exec su - agent -c "\$0"
else
    do_update
fi
SCRIPT
    chmod +x /usr/local/bin/update-claude
}
create_update_claude_command

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

# Add fallback DNS resolver (Tailscale DNS can be intermittent)
add_fallback_dns() {
    if grep -q "100.100.100.100" /etc/resolv.conf 2>/dev/null; then
        if ! grep -q "8.8.8.8" /etc/resolv.conf 2>/dev/null; then
            echo "nameserver 8.8.8.8" >> /etc/resolv.conf
            echo "[dns] Added fallback DNS resolver (8.8.8.8)"
        fi
    fi
}
add_fallback_dns

# Configure exit node to only route specific domains (opt-in)
# When TAILSCALE_EXIT_NODE_ONLY is set, bypass exit node for all traffic
# except the listed domains. Default: route everything through exit node.
configure_exit_node_bypass() {
    if [ -z "$TAILSCALE_EXIT_NODE" ] || [ -z "$TAILSCALE_EXIT_NODE_ONLY" ]; then
        return
    fi

    echo "[exit-node-bypass] Configuring selective exit node routing..."

    # Get the default gateway (Docker bridge)
    local GATEWAY=$(ip route show default | awk '{print $3}')
    local IFACE=$(ip route show default | awk '{print $5}')

    if [ -z "$GATEWAY" ]; then
        echo "[exit-node-bypass] WARNING: Could not determine default gateway"
        return
    fi

    # Add throw routes to bypass exit node for all traffic
    # 0.0.0.0/1 + 128.0.0.0/1 covers all IPv4 without overriding default
    ip route add throw 0.0.0.0/1 table 52 2>/dev/null || true
    ip route add throw 128.0.0.0/1 table 52 2>/dev/null || true

    # For each whitelisted domain, resolve and add explicit routes through tailscale
    IFS=',' read -ra DOMAINS <<< "$TAILSCALE_EXIT_NODE_ONLY"
    for domain in "${DOMAINS[@]}"; do
        domain=$(echo "$domain" | xargs)  # trim whitespace
        [ -z "$domain" ] && continue

        # Resolve domain to IPs
        local ips=$(python3 -c "
import socket
try:
    addrs = socket.getaddrinfo('$domain', 443, socket.AF_INET)
    seen = set()
    for a in addrs:
        ip = a[4][0]
        if ip not in seen:
            print(ip)
            seen.add(ip)
except Exception as e:
    pass
" 2>/dev/null)

        for ip in $ips; do
            ip route add "$ip/32" dev tailscale0 table 52 2>/dev/null && \
                echo "[exit-node-bypass] Route $domain ($ip) -> exit node" || true
        done
    done

    echo "[exit-node-bypass] All other traffic -> direct ($GATEWAY via $IFACE)"
}
configure_exit_node_bypass

# Setup git credentials and export GITHUB_TOKEN for Claude
if [ -n "$GITHUB_TOKEN" ]; then
    echo "Configuring git with GITHUB_TOKEN..."
    git config --global credential.helper store
    echo "https://oauth2:${GITHUB_TOKEN}@github.com" > /home/agent/.git-credentials
    chown agent:agent /home/agent/.git-credentials
    chmod 600 /home/agent/.git-credentials

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

# Export credentials to /etc/environment (visible to all sessions including su - agent -c)
for var in GITHUB_TOKEN VERCEL_TOKEN SUPABASE_ACCESS_TOKEN RAILWAY_TOKEN; do
    val="${!var}"
    if [ -n "$val" ]; then
        sed -i "/^${var}=/d" /etc/environment 2>/dev/null || true
        echo "${var}=${val}" >> /etc/environment
        echo "$var configured (token set)"
    else
        echo "$var: not set"
    fi
done

# Forward all SUPABASE_SERVICE_ROLE_KEY_* env vars dynamically
env | grep '^SUPABASE_SERVICE_ROLE_KEY_' | while IFS= read -r line; do
    varname="${line%%=*}"
    sed -i "/^${varname}=/d" /etc/environment 2>/dev/null || true
    echo "$line" >> /etc/environment
    echo "$varname configured"
done

# ─── Auto-configure CLI auth (Vercel, Supabase) ───
# Vercel CLI doesn't auto-detect VERCEL_TOKEN env var — persist to config
if [ -n "${VERCEL_TOKEN:-}" ]; then
    for VERCEL_AUTH_DIR in "/home/agent/.local/share/com.vercel.cli" "/home/agent/.config/vercel"; do
        mkdir -p "$VERCEL_AUTH_DIR"
        echo "{\"token\":\"$VERCEL_TOKEN\"}" > "$VERCEL_AUTH_DIR/auth.json"
        chown -R agent:agent "$VERCEL_AUTH_DIR" 2>/dev/null || true
    done
    echo "Vercel CLI auth persisted (no --token flag needed)"
fi

# Pre-fetch GitHub username once (avoids 3 redundant API calls during parallel sync)
export _CACHED_GITHUB_USER=""
if [ -n "$GITHUB_TOKEN" ]; then
    _CACHED_GITHUB_USER=$(gh api user --jq '.login' 2>/dev/null || echo "")
    if [ -n "$_CACHED_GITHUB_USER" ]; then
        echo "GitHub user: $_CACHED_GITHUB_USER (cached for parallel sync)"
    fi
fi

# Sync all 4 git repos in parallel for faster startup
echo "Syncing git repos in parallel (post-network init)..."
_git_sync_start=$(date +%s)

init_skills_git &
_pid_skills=$!

init_clawdbot_git &
_pid_clawdbot=$!

init_clawd_git &
_pid_clawd=$!

init_agent_mobile_git &
_pid_agent_mobile=$!

init_shared_notes &
_pid_shared=$!

# Wait for all syncs to complete
wait $_pid_skills  || echo "[parallel-sync] skills sync exited with error (non-fatal)"
wait $_pid_clawdbot || echo "[parallel-sync] clawdbot sync exited with error (non-fatal)"
wait $_pid_clawd   || echo "[parallel-sync] clawd sync exited with error (non-fatal)"
wait $_pid_agent_mobile || echo "[parallel-sync] agent-mobile sync exited with error (non-fatal)"
wait $_pid_shared || echo "[parallel-sync] shared notes sync exited with error (non-fatal)"

_git_sync_end=$(date +%s)
echo "All git repos synced in $((_git_sync_end - _git_sync_start))s (parallel)"

# Start periodic shared notes sync daemon
start_shared_notes_sync &

# Re-discover skills in case remote sync brought new ones
update_claude_md

# Start clawdbot gateway AFTER git sync (needs synced config + correct permissions)
start_clawdbot

# Update Claude Code on startup (after network confirmed ready)
if [ "${CLAUDE_STARTUP_UPDATE:-true}" = "true" ]; then
    echo "Checking for Claude Code updates (method: $CLAUDE_INSTALL_METHOD)..."
    if [ "$CLAUDE_INSTALL_METHOD" = "npm" ]; then
        timeout 60s npm install -g @anthropic-ai/claude-code@latest 2>/dev/null || echo "Update check failed (run 'update-claude' manually)"
    else
        timeout 60s su - agent -c "claude update" || echo "Update check failed (run 'update-claude' manually)"
    fi
fi

# Re-run credential persistence after update (in case update reset credentials)
# This is critical for native installer which may overwrite config during update
echo "Re-checking credential persistence after update..."
persist_credentials
persist_native_config

# Fix Claude infinite scroll issue (requires 256color terminal)
if ! grep -q "TERM=xterm-256color" /home/agent/.bashrc 2>/dev/null; then
    echo "export TERM=xterm-256color" >> /home/agent/.bashrc
fi

# Ensure Claude native installer path is in PATH
if ! grep -q '\.local/bin' /home/agent/.bashrc 2>/dev/null; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> /home/agent/.bashrc
fi

# Disable Claude auto-updater (use 'update-claude' command instead)
if ! grep -q "DISABLE_AUTOUPDATER" /home/agent/.bashrc 2>/dev/null; then
    echo "export DISABLE_AUTOUPDATER=1" >> /home/agent/.bashrc
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

# Add claude alias to skip permissions by default (autonomous agent mode)
if ! grep -q "alias claude=" /home/agent/.bashrc 2>/dev/null; then
    echo "" >> /home/agent/.bashrc
    echo "# Run Claude in autonomous mode (skip permission prompts)" >> /home/agent/.bashrc
    echo "alias claude='claude --dangerously-skip-permissions'" >> /home/agent/.bashrc
fi

# Add ralph command to PATH (fresh context loops)
RALPH_SCRIPT="/home/agent/.claude/skills/ralph-loop/scripts/ralph"
if [ -f "$RALPH_SCRIPT" ]; then
    # Fix Windows CRLF line endings (common when skills folder is mounted from Windows host)
    sed -i 's/\r$//' "$RALPH_SCRIPT" 2>/dev/null || true
    chmod +x "$RALPH_SCRIPT"
    if [ ! -L /usr/local/bin/ralph ]; then
        ln -sf "$RALPH_SCRIPT" /usr/local/bin/ralph
        echo "Ralph command installed: ralph <task-id>"
    fi
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
        python3 << PYTHON_SCRIPT
import json
import os
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

# Configure max output tokens if specified via environment variable
# Must be set in "env" section, and max allowed by Claude Code is 32000
max_tokens = os.environ.get("CLAUDE_CODE_MAX_OUTPUT_TOKENS", "").strip()
if max_tokens:
    try:
        tokens_int = int(max_tokens)
        # Clamp to valid range (1 to 32000 - Claude Code's hard limit)
        tokens_int = max(1, min(32000, tokens_int))
        if "env" not in settings:
            settings["env"] = {}
        settings["env"]["CLAUDE_CODE_MAX_OUTPUT_TOKENS"] = str(tokens_int)
        print(f"Max output tokens configured: {tokens_int}")
    except ValueError:
        print(f"Warning: Invalid CLAUDE_CODE_MAX_OUTPUT_TOKENS value: {max_tokens}")

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

# Fix ownership of skill system files (entrypoint runs as root but hooks run as agent)
chown -R agent:agent /home/agent/.claude/skills 2>/dev/null || true

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

# Set theme and onboarding flags to skip first-run setup screen
# Without these, native installer shows theme picker + sign-in even if OAuth is valid
if "theme" not in config:
    config["theme"] = "dark"
if "hasCompletedOnboarding" not in config:
    config["hasCompletedOnboarding"] = True

# Write back
CLAUDE_JSON.write_text(json.dumps(config, indent=2))
print(f"Trust configured for {len(config['projects'])} project(s), onboarding skipped")
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
[ "${WEBTMUX_ENABLED:-false}" = "true" ] && echo "Webtmux Terminal:      http://localhost:9090"
[ "${RTS_ENABLED:-true}" = "true" ] && echo "RTS Dashboard:         http://localhost:${RTS_PORT:-9091}"
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
