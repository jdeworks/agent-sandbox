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

# {{LANGUAGE_LAYERS}}

WORKDIR /workspace

COPY install.sh /install.sh
RUN chmod +x /install.sh

ENTRYPOINT ["/install.sh"]
