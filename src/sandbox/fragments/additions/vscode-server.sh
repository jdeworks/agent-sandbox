########################################
# VS Code Server (code-server)
########################################
if command -v code-server >/dev/null 2>&1; then
  echo "[sandbox] Starting VS Code Server on port 4040..."
  code-server \
    --bind-addr 0.0.0.0:4040 \
    --auth none \
    --disable-telemetry \
    --user-data-dir /workspace/.vscode-server/data \
    --extensions-dir /workspace/.vscode-server/extensions \
    $PWD &
fi
