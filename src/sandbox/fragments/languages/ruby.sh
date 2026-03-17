########################################
# Ruby: install Bundler dependencies
########################################
export GEM_HOME=/workspace/.gems
export PATH="/workspace/.gems/bin:$PATH"

if ! command -v bundler &>/dev/null; then
    echo "[sandbox] Installing Bundler..."
    gem install bundler --no-document -q
fi

if [ -f "/workspace/src/Gemfile" ]; then
    fingerprint="/workspace/src/Gemfile"
    [ -f "/workspace/src/Gemfile.lock" ] && fingerprint="/workspace/src/Gemfile.lock"
    current_md5=$(md5sum "$fingerprint" | awk '{print $1}')
    stored_md5=""
    [ -f /workspace/.gems/.gemfile.md5 ] && stored_md5=$(cat /workspace/.gems/.gemfile.md5)
    if [ "$current_md5" != "$stored_md5" ]; then
        echo "[sandbox] Installing Ruby dependencies..."
        (cd /workspace/src && bundle config set --local path /workspace/.gems && bundle install -q)
        echo "$current_md5" > /workspace/.gems/.gemfile.md5
    else
        echo "[sandbox] Ruby dependencies up to date."
    fi
fi

[ -d /workspace/.gems ] && chmod -R a+rwX /workspace/.gems
