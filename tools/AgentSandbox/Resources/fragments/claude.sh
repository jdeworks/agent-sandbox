########################################
# Claude Code CLI
########################################
# Install may put binary in ~/.claude/bin or ~/.local/bin
RUN curl -fsSL https://claude.ai/install.sh | bash \
    && ( [ -f /root/.claude/bin/claude ] && ln -sf /root/.claude/bin/claude /usr/local/bin/claude ) \
    || ( [ -f /root/.local/bin/claude ] && ln -sf /root/.local/bin/claude /usr/local/bin/claude ) \
    || ( CLAUDE="$(find /root/.claude /root/.local -name claude -type f 2>/dev/null | head -1)" && [ -n "$CLAUDE" ] && ln -sf "$CLAUDE" /usr/local/bin/claude ) || true
