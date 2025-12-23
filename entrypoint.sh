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

# Wait for tailscaled to be ready
sleep 2

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
