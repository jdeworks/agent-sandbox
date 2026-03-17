## React Native Environment

- React Native CLI installed globally (`react-native-cli`, `@react-native-community/cli`)
- Node.js and npm are available (base image)
- Run JS/TS development, Metro bundler, and tests inside the sandbox
- Metro bundler needs port 8081 — bind to `0.0.0.0` for access from host
- Run tests: `npm test` or `npx jest`
- **Android builds** require JDK + Android SDK which are NOT included by default (too heavy). Build Android on the host or add JDK via Dockerfile.extension
- **iOS builds** require macOS with Xcode — build iOS on the host machine
