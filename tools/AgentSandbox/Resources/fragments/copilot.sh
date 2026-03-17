########################################
# GitHub Copilot CLI
########################################
RUN npm install -g @github/copilot \
    && ( [ -f /usr/local/bin/gh ] && ln -sf /usr/local/bin/gh /usr/local/bin/gh-copilot ) || true
