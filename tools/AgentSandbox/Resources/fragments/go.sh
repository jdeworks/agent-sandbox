########################################
# Go: download module dependencies
########################################
export GOPATH=/workspace/go

if [ -f "/workspace/src/go.sum" ]; then
    current_md5=$(md5sum /workspace/src/go.sum | awk '{print $1}')
    stored_md5=""
    [ -f /workspace/go/.gosum.md5 ] && stored_md5=$(cat /workspace/go/.gosum.md5)
    if [ "$current_md5" != "$stored_md5" ]; then
        echo "[sandbox] Downloading Go modules..."
        (cd /workspace/src && go mod download)
        echo "$current_md5" > /workspace/go/.gosum.md5
    else
        echo "[sandbox] Go modules up to date."
    fi
fi

[ -d /workspace/go ] && chmod -R a+rwX /workspace/go
export PATH="/workspace/go/bin:$PATH"
