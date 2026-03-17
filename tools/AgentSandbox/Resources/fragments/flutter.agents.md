## Flutter Environment

- Flutter SDK at /opt/flutter (channel: stable)
- Dart SDK included with Flutter (at /opt/flutter/bin/cache/dart-sdk)
- Android SDK at /opt/android-sdk (platform 34, build-tools 34.0.0)
- Build Android APK: `flutter build apk`
- Build Android App Bundle: `flutter build appbundle`
- Run tests: `flutter test`
- Dev server for web: `flutter run -d web-server --web-port=8080 --web-hostname=0.0.0.0`
- Dependencies managed via pubspec.yaml — run `flutter pub get` after changes
- **iOS builds require macOS with Xcode** — build iOS on the host machine, not in this sandbox
