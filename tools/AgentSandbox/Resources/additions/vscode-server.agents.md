
## VS Code Server

A browser-based VS Code editor (code-server) is running in this container on port 4040. The user can access it at `http://localhost:4040` on the host (the host port may differ if 4040 was already in use — check the sandbox startup log for remapping messages). Extensions and user data persist across container restarts via named volumes.

If the user asks you to install VS Code extensions, use:
```bash
code-server --install-extension <extension-id>
```
