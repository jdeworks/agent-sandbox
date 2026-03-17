########################################
# Dart: fetch pub dependencies
########################################
export PUB_CACHE=/workspace/.pub-cache
export PATH="/opt/dart-sdk/bin:/workspace/.pub-cache/bin:$PATH"

if [ -f "/workspace/src/pubspec.yaml" ]; then
    current_md5=$(md5sum /workspace/src/pubspec.yaml | awk '{print $1}')
    stored_md5=""
    [ -f /workspace/.pub-cache/.pubspec.md5 ] && stored_md5=$(cat /workspace/.pub-cache/.pubspec.md5)
    if [ "$current_md5" != "$stored_md5" ]; then
        echo "[sandbox] Fetching Dart dependencies..."
        (cd /workspace/src && dart pub get)
        echo "$current_md5" > /workspace/.pub-cache/.pubspec.md5
    else
        echo "[sandbox] Dart dependencies up to date."
    fi
fi

[ -d /workspace/.pub-cache ] && chmod -R a+rwX /workspace/.pub-cache
