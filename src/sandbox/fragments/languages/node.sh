########################################
# Node: ensure esbuild is available
########################################
command -v esbuild >/dev/null 2>&1 || npm install -g esbuild --silent 2>/dev/null

########################################
# Node: install project dependencies
########################################
if [ -f "package.json" ]; then
    current_md5=$(md5sum package.json | awk '{print $1}')
    stored_md5=""
    [ -f node_modules/.package.md5 ] && stored_md5=$(cat node_modules/.package.md5)
    if [ "$current_md5" != "$stored_md5" ]; then
        echo "[sandbox] Installing Node dependencies..."
        npm install --silent
        echo "$current_md5" > node_modules/.package.md5
    else
        echo "[sandbox] Node dependencies up to date."
    fi
fi
