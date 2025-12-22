FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install base packages
RUN apt-get update && apt-get install -y \
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
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Tailscale
RUN curl -fsSL https://tailscale.com/install.sh | sh

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Install Gemini CLI
RUN npm install -g @google/gemini-cli

# Create user for SSH access
RUN useradd -m -s /bin/bash agent && \
    echo "agent:agent" | chpasswd && \
    usermod -aG sudo agent

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

# Copy tmux config
COPY --chown=agent:agent .tmux.conf /home/agent/.tmux.conf   

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose SSH port (optional, Tailscale handles networking)
EXPOSE 22

WORKDIR /home/agent

ENTRYPOINT ["/entrypoint.sh"]
