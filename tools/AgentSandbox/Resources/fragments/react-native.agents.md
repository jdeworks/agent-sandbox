## React Native Environment

- React Native CLI installed globally
- Android SDK at /opt/android-sdk (platform 34, build-tools 34.0.0, NDK 26.1)
- JDK 17 at /usr/lib/jvm/java-17-openjdk-amd64
- Build Android: `npx react-native build-android --mode=release`
- Run tests: `npm test` or `npx jest`
- Metro bundler needs port 8081 — bind to `0.0.0.0` for access from host
- **iOS builds require macOS with Xcode** — build iOS on the host machine, not in this sandbox
