########################################
# React Native dependency installation
########################################
if [ -f "/workspace/src/package.json" ] && grep -q "react-native" /workspace/src/package.json 2>/dev/null; then
    cd /workspace/src
    PKG_HASH=$(md5sum package.json 2>/dev/null | cut -d' ' -f1)
    CACHED_HASH=$(cat /workspace/.sandbox/.rn_pkg_hash 2>/dev/null)

    if [ "$PKG_HASH" != "$CACHED_HASH" ]; then
        echo "[sandbox] Installing React Native dependencies..."
        npm install
        echo "$PKG_HASH" > /workspace/.sandbox/.rn_pkg_hash
    fi
fi

