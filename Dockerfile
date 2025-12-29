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
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
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

# Install Claude Code CLI and Gemini CLI
RUN npm install -g @anthropic-ai/claude-code @google/gemini-cli \
    && npm cache clean --force

# Install Docker CLI (for container management from within the agent)
RUN curl -fsSL https://get.docker.com | sh

# Create user for SSH access
RUN useradd -m -s /bin/bash agent && \
    echo "agent:agent" | chpasswd && \
    usermod -aG sudo agent

# Clone awesome-Claude-skills repository (must be after user creation for chown)
RUN git clone https://github.com/ComposioHQ/awesome-Claude-skills /opt/awesome-claude-skills \
    && chown -R agent:agent /opt/awesome-claude-skills

# Allow agent user to run sudo without password
RUN echo "agent ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/agent && \
    chmod 0440 /etc/sudoers.d/agent

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
