########################################
# Cursor CLI
########################################
# Install may put binary in ~/.cursor/bin or ~/.local/bin
RUN ( curl https://cursor.com/install -fsS | bash ) 2>/dev/null || true \
    && if [ -f /root/.cursor/bin/agent ]; then \
        ln -sf /root/.cursor/bin/agent /usr/local/bin/agent; \
    elif [ -f /root/.local/bin/agent ]; then \
        ln -sf /root/.local/bin/agent /usr/local/bin/agent; \
    elif AGENT="$(find /root/.cursor /root/.local -name agent -type f 2>/dev/null | head -1)" && [ -n "$AGENT" ]; then \
        ln -sf "$AGENT" /usr/local/bin/agent; \
    else \
        printf '%s\n' '#!/bin/bash' 'echo "Cursor CLI is not installed." >&2' 'exit 1' > /usr/local/bin/agent && chmod +x /usr/local/bin/agent; \
    fi
