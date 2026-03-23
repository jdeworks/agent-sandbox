########################################
# Java: resolve dependencies
########################################
JAVA_VER="${JAVA_VERSION:-21}"
export JAVA_HOME="/usr/lib/jvm/java-${JAVA_VER}-openjdk-amd64"

if [ -f "pom.xml" ]; then
    current_md5=$(md5sum pom.xml | awk '{print $1}')
    stored_md5=""
    [ -f /workspace/.m2/.pom.md5 ] && stored_md5=$(cat /workspace/.m2/.pom.md5)
    if [ "$current_md5" != "$stored_md5" ]; then
        echo "[sandbox] Resolving Maven dependencies..."
        mvn dependency:resolve -q -B
        echo "$current_md5" > /workspace/.m2/.pom.md5
    else
        echo "[sandbox] Maven dependencies up to date."
    fi
elif [ -f "gradlew" ]; then
    chmod +x gradlew
    build_file=""
    [ -f "build.gradle" ] && build_file="build.gradle"
    [ -f "build.gradle.kts" ] && build_file="build.gradle.kts"

    if [ -n "$build_file" ]; then
        current_md5=$(md5sum "$build_file" | awk '{print $1}')
        stored_md5=""
        [ -f /workspace/.gradle/.build-gradle.md5 ] && stored_md5=$(cat /workspace/.gradle/.build-gradle.md5)
        if [ "$current_md5" != "$stored_md5" ]; then
            echo "[sandbox] Resolving Gradle dependencies..."
            ./gradlew dependencies --no-daemon -q 2>/dev/null || true
            echo "$current_md5" > /workspace/.gradle/.build-gradle.md5
        else
            echo "[sandbox] Gradle dependencies up to date."
        fi
    fi
fi

[ -d /workspace/.m2 ] && chmod -R a+rwX /workspace/.m2
[ -d /workspace/.gradle ] && chmod -R a+rwX /workspace/.gradle
