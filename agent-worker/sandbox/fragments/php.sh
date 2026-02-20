########################################
# PHP: install Composer dependencies
########################################
export COMPOSER_HOME=/workspace/.composer

if [ -f "/workspace/src/composer.json" ]; then
    current_md5=$(md5sum /workspace/src/composer.json | awk '{print $1}')
    stored_md5=""
    [ -f /workspace/.composer/.composer-json.md5 ] && stored_md5=$(cat /workspace/.composer/.composer-json.md5)
    if [ "$current_md5" != "$stored_md5" ]; then
        echo "[sandbox] Installing Composer dependencies..."
        (cd /workspace/src && composer install --no-interaction -q)
        echo "$current_md5" > /workspace/.composer/.composer-json.md5
    else
        echo "[sandbox] Composer dependencies up to date."
    fi
fi

[ -d /workspace/.composer ] && chmod -R a+rwX /workspace/.composer
export PATH="/workspace/src/vendor/bin:$PATH"
