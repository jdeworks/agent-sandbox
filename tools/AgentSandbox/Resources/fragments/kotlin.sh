########################################
# Kotlin: resolve Gradle dependencies
########################################
JAVA_VER="${JAVA_VERSION:-${KOTLIN_VERSION:-21}}"
export JAVA_HOME="/usr/lib/jvm/java-${JAVA_VER}-openjdk-amd64"

if [ -f "gradlew" ]; then
    chmod +x gradlew
    build_file=""
    [ -f "build.gradle.kts" ] && build_file="build.gradle.kts"
    [ -f "build.gradle" ] && build_file="build.gradle"

    if [ -n "$build_file" ]; then
        current_md5=$(md5sum "$build_file" | awk '{print $1}')
        stored_md5=""
        [ -f /workspace/.gradle/.build-gradle.md5 ] && stored_md5=$(cat /workspace/.gradle/.build-gradle.md5)
        if [ "$current_md5" != "$stored_md5" ]; then
            echo "[sandbox] Resolving Gradle/Kotlin dependencies..."
            ./gradlew dependencies --no-daemon -q 2>/dev/null || true
            echo "$current_md5" > /workspace/.gradle/.build-gradle.md5
        else
            echo "[sandbox] Gradle/Kotlin dependencies up to date."
        fi
    fi
fi

[ -d /workspace/.gradle ] && chmod -R a+rwX /workspace/.gradle
