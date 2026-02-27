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

# Claude Code CLI (install may put binary in ~/.claude/bin or ~/.local/bin)
RUN curl -fsSL https://claude.ai/install.sh | bash \
    && ( [ -f /root/.claude/bin/claude ] && ln -sf /root/.claude/bin/claude /usr/local/bin/claude ) \
    || ( [ -f /root/.local/bin/claude ] && ln -sf /root/.local/bin/claude /usr/local/bin/claude ) \
    || ( CLAUDE="$(find /root/.claude /root/.local -name claude -type f 2>/dev/null | head -1)" && [ -n "$CLAUDE" ] && ln -sf "$CLAUDE" /usr/local/bin/claude ) || true

# Cursor CLI (install may put binary in ~/.cursor/bin or ~/.local/bin; ensure /usr/local/bin/agent always exists)
RUN ( curl https://cursor.com/install -fsS | bash ) 2>/dev/null || true \
    && if [ -f /root/.cursor/bin/agent ]; then \
        ln -sf /root/.cursor/bin/agent /usr/local/bin/agent; \
    elif [ -f /root/.local/bin/agent ]; then \
        ln -sf /root/.local/bin/agent /usr/local/bin/agent; \
    elif AGENT="$(find /root/.cursor /root/.local -name agent -type f 2>/dev/null | head -1)" && [ -n "$AGENT" ]; then \
        ln -sf "$AGENT" /usr/local/bin/agent; \
    else \
        printf '%s\n' '#!/bin/bash' 'echo "Cursor CLI is not installed in this image (install failed or unsupported). Use Settings to choose OpenCode or another agent." >&2' 'exit 1' > /usr/local/bin/agent && chmod +x /usr/local/bin/agent; \
    fi

# GitHub Copilot CLI (gh is used as "gh copilot agent")
RUN npm install -g @github/copilot \
    && ( [ -f /usr/local/bin/gh ] && ln -sf /usr/local/bin/gh /usr/local/bin/gh-copilot ) || true

# Ensure all CLI agent bin dirs are on PATH (installers may use ~/.local/bin)
ENV PATH="/root/.local/bin:/root/.cursor/bin:/root/.claude/bin:/root/.npm-global/bin:/opt/opencode/bin:${PATH}"

# Environment variables for CLI agents
ENV ANTHROPIC_API_KEY=""
ENV CURSOR_API_KEY=""
ENV GITHUB_COPILOT_API_KEY=""

# {{LANGUAGE_LAYERS}}

# Ensure agent/claude/gh exist so "exec: agent not found" never happens (stub if install failed)
RUN if [ ! -x /usr/local/bin/agent ]; then printf '%s\n' '#!/bin/bash' 'echo "Cursor CLI not available. Use Settings to choose OpenCode or another agent." >&2' 'exit 1' > /usr/local/bin/agent && chmod +x /usr/local/bin/agent; fi; \
    if [ ! -x /usr/local/bin/claude ]; then printf '%s\n' '#!/bin/bash' 'echo "Claude CLI not available. Use OpenCode or another agent." >&2' 'exit 1' > /usr/local/bin/claude && chmod +x /usr/local/bin/claude; fi; \
    if [ ! -x /usr/local/bin/gh ]; then printf '%s\n' '#!/bin/bash' 'echo "GitHub Copilot CLI not available. Use OpenCode or another agent." >&2' 'exit 1' > /usr/local/bin/gh && chmod +x /usr/local/bin/gh; fi

WORKDIR /workspace

COPY install.sh /install.sh
RUN chmod +x /install.sh

HEALTHCHECK --interval=2s --timeout=3s --start-period=120s --retries=1 \
  CMD [ -f /tmp/.sandbox-ready ] || exit 1

ENTRYPOINT ["/install.sh"]
