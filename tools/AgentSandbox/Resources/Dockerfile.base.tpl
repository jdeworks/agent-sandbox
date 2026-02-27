FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt update && apt install -y \
    curl \
    git \
    build-essential \
    ca-certificates \
    gnupg \
    lsb-release \
    software-properties-common \
    bash \
    unzip \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Node (always included — required for OpenCode plugin runtime)
RUN curl -fsSL https://deb.nodesource.com/setup_{{NODE_VERSION}}.x | bash - \
    && apt install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# OpenCode
RUN curl -fsSL https://opencode.ai/install | bash \
    && mv /root/.opencode /opt/opencode \
    && chmod -R a+rX /opt/opencode \
    && ln -sf /opt/opencode/bin/opencode /usr/local/bin/opencode
ENV PATH="/opt/opencode/bin:${PATH}"

# Oh My OpenCode
RUN npm install -g oh-my-opencode @code-yeongyu/comment-checker

# Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash \
    && ln -sf /root/.claude/bin/claude /usr/local/bin/claude

# Cursor CLI
RUN curl https://cursor.com/install -fsS | bash \
    && ln -sf /root/.cursor/bin/agent /usr/local/bin/agent

# GitHub Copilot CLI
RUN npm install -g @github/copilot \
    && ln -sf /root/.npm-global/bin/gh /usr/local/bin/gh-copilot

# Environment variables for CLI agents
ENV ANTHROPIC_API_KEY=""
ENV CURSOR_API_KEY=""
ENV GITHUB_COPILOT_API_KEY=""

# {{LANGUAGE_LAYERS}}

WORKDIR /workspace

COPY install.sh /install.sh
RUN chmod +x /install.sh

HEALTHCHECK --interval=2s --timeout=3s --start-period=120s --retries=1 \
  CMD [ -f /tmp/.sandbox-ready ] || exit 1

ENTRYPOINT ["/install.sh"]
