########################################
# Flutter dependency installation
########################################
if [ -f "pubspec.yaml" ]; then
    PUBSPEC_HASH=$(md5sum pubspec.yaml 2>/dev/null | cut -d' ' -f1)
    CACHED_HASH=$(cat /workspace/.sandbox/.pubspec_hash 2>/dev/null)

    if [ "$PUBSPEC_HASH" != "$CACHED_HASH" ]; then
        echo "[sandbox] Installing Flutter dependencies..."
        flutter pub get
        echo "$PUBSPEC_HASH" > /workspace/.sandbox/.pubspec_hash
    fi
fi

# Accept Android licenses non-interactively
yes | flutter doctor --android-licenses 2>/dev/null || true

export PATH="/opt/flutter/bin:/opt/flutter/bin/cache/dart-sdk/bin:/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:$PATH"
