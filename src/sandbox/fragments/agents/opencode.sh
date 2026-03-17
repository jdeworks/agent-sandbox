########################################
# OpenCode
########################################
RUN curl -fsSL https://opencode.ai/install | bash \
    && mv /root/.opencode /opt/opencode \
    && chmod -R a+rX /opt/opencode \
    && ln -sf /opt/opencode/bin/opencode /usr/local/bin/opencode
ENV PATH="/opt/opencode/bin:${PATH}"
