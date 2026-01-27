FROM tailscale/tailscale:stable AS tailscale_src
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install base packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    git \
    openssh-server \
    sudo \
    ca-certificates \
    gnupg \
    iptables \
    iproute2 \
    tmux \
    lsof \
    vim \
    htop \
    lsb-release \
    ripgrep \
    python3-pip \
    jq \
    build-essential \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22.x (required for clawdbot)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Tailscale (Copy from official image to avoid network/SSL issues)
#RUN curl -fsSL https://tailscale.com/install.sh | sh
COPY --from=tailscale_src /usr/local/bin/tailscale /usr/local/bin/tailscale
COPY --from=tailscale_src /usr/local/bin/tailscaled /usr/local/bin/tailscaled

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# Install Gemini CLI (via npm)
RUN npm install -g @google/gemini-cli && npm cache clean --force

# Install Clawdbot (multi-platform AI assistant with Telegram support)
RUN npm install -g clawdbot@latest && npm cache clean --force

# Claude Code install method: "native" (recommended) or "npm"
ARG CLAUDE_INSTALL_METHOD=native

# Install Claude SDK (Python) for programmatic API access
RUN pip3 install --no-cache-dir anthropic

# Install Docker CLI (for container management from within the agent)
RUN curl -fsSL https://get.docker.com | sh

# Create user for SSH access
RUN useradd -m -s /bin/bash agent && \
    echo "agent:agent" | chpasswd && \
    usermod -aG sudo agent

# Install webtmux
RUN git clone https://github.com/chrismccord/webtmux /opt/webtmux \
    && cp /opt/webtmux/builds/webtmux-linux-amd64 /usr/local/bin/webtmux \
    && chmod +x /usr/local/bin/webtmux \
    && rm -rf /opt/webtmux

# Clone awesome-Claude-skills repository (must be after user creation for chown)
RUN git clone https://github.com/ComposioHQ/awesome-Claude-skills /opt/awesome-claude-skills \
    && chown -R agent:agent /opt/awesome-claude-skills

# Build RTS Manager (Factorio-style dashboard for managing Ralph loops and containers)
COPY rts-manager /opt/rts-manager-src
RUN cd /opt/rts-manager-src \
    && npm ci \
    && npm run build \
    && mkdir -p /opt/rts-manager \
    && cp -r dist /opt/rts-manager/ \
    && cp package*.json /opt/rts-manager/ \
    && cd /opt/rts-manager \
    && npm ci --omit=dev \
    && rm -rf /opt/rts-manager-src \
    && chown -R agent:agent /opt/rts-manager
# Note: npm run build compiles frontend (to dist/) and server (to dist/server/server/)

# Allow agent user to run sudo without password
RUN echo "agent ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/agent && \
    chmod 0440 /etc/sudoers.d/agent

# Install Claude Code CLI
# Method controlled by CLAUDE_INSTALL_METHOD build arg: "native" (default) or "npm"
# Native: installs to ~/.local/bin, auto-updates work better
# NPM: installs globally, may need manual updates
RUN if [ "$CLAUDE_INSTALL_METHOD" = "npm" ]; then \
        echo "Installing Claude Code via npm..." && \
        npm install -g @anthropic-ai/claude-code && \
        npm cache clean --force; \
    else \
        echo "Installing Claude Code via native installer..." && \
        su - agent -c "curl -fsSL https://claude.ai/install.sh | bash" && \
        ln -sf /home/agent/.local/bin/claude /usr/local/bin/claude; \
    fi
# Store install method for entrypoint.sh to use correct update command
RUN echo "$CLAUDE_INSTALL_METHOD" > /etc/claude-install-method

# Setup SSH
RUN mkdir /var/run/sshd && \
    sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config && \
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config

# Create directories for Claude config and skills
RUN mkdir -p /home/agent/.claude/skills && \
    chown -R agent:agent /home/agent/.claude

# Setup git config directory
RUN mkdir -p /home/agent/.config/git && \
    chown -R agent:agent /home/agent/.config

# Copy tmux config and session picker
COPY --chown=agent:agent .tmux.conf /home/agent/.tmux.conf
COPY --chown=agent:agent tmux-picker.sh /home/agent/.tmux-picker.sh   

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Node.js performance defaults
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV UV_THREADPOOL_SIZE=8

# Expose SSH port (optional, Tailscale handles networking)
EXPOSE 22

WORKDIR /home/agent

ENTRYPOINT ["/entrypoint.sh"]
