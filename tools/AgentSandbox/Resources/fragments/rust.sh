########################################
# Rust: ensure toolchain is accessible
########################################
export PATH="/opt/cargo/bin:$PATH"

if [ -f "/workspace/src/Cargo.toml" ] && [ -f "/workspace/src/Cargo.lock" ]; then
    current_md5=$(md5sum /workspace/src/Cargo.lock | awk '{print $1}')
    stored_md5=""
    [ -f /opt/cargo/registry/.cargo-lock.md5 ] && stored_md5=$(cat /opt/cargo/registry/.cargo-lock.md5)
    if [ "$current_md5" != "$stored_md5" ]; then
        echo "[sandbox] Fetching Rust dependencies..."
        (cd /workspace/src && cargo fetch)
        echo "$current_md5" > /opt/cargo/registry/.cargo-lock.md5
    else
        echo "[sandbox] Rust dependencies up to date."
    fi
fi
