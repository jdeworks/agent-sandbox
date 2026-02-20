########################################
# Node: install project dependencies
########################################
if [ -f "/workspace/src/package.json" ]; then
    current_md5=$(md5sum /workspace/src/package.json | awk '{print $1}')
    stored_md5=""
    [ -f /workspace/src/node_modules/.package.md5 ] && stored_md5=$(cat /workspace/src/node_modules/.package.md5)
    if [ "$current_md5" != "$stored_md5" ]; then
        echo "[sandbox] Installing Node dependencies..."
        (cd /workspace/src && npm install --silent)
        echo "$current_md5" > /workspace/src/node_modules/.package.md5
    else
        echo "[sandbox] Node dependencies up to date."
    fi
fi
