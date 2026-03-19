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

# Node (always included — required for plugin runtime)
RUN curl -fsSL https://deb.nodesource.com/setup_{{NODE_VERSION}}.x | bash - \
    && apt install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# {{AGENT_LAYERS}}

# Ensure all CLI agent bin dirs are on PATH (installers may use ~/.local/bin)
ENV PATH="/root/.local/bin:/root/.cursor/bin:/root/.claude/bin:/root/.npm-global/bin:/opt/opencode/bin:${PATH}"

# {{LANGUAGE_LAYERS}}

# {{ADDITION_LAYERS}}

# {{CUSTOM_DOCKERFILE_LINES}}

# Stub any agent binaries not installed so "exec: not found" never happens
RUN for cmd in opencode claude agent gh; do \
      if [ ! -x "/usr/local/bin/$cmd" ]; then \
        printf '#!/bin/bash\necho "%s not installed in this profile." >&2\nexit 1\n' "$cmd" > "/usr/local/bin/$cmd" && chmod +x "/usr/local/bin/$cmd"; \
      fi; \
    done

WORKDIR /workspace

COPY install.sh /install.sh
COPY install-vscode.sh /install-vscode.sh
RUN chmod +x /install.sh /install-vscode.sh

HEALTHCHECK --interval=2s --timeout=3s --start-period=120s --retries=1 \
  CMD [ -f /tmp/.sandbox-ready ] || exit 1

ENTRYPOINT ["/install.sh"]
