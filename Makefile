# Convenience targets for every SDK whose tests can run on a Linux workstation
# (Python, Node, Web, React Native, Rust, Flutter, Android).
#
# `make test` deliberately excludes the two that cannot run here:
#   * iOS   — needs a macOS host + Xcode (`swift test` in packages/ios); run in CI.
#   * Unity — needs a licensed Unity Editor (Window > General > Test Runner > EditMode).
# `make test-android` needs a local Android SDK; point ANDROID_HOME at it.

.PHONY: versions test test-python test-node test-web test-rn test-rust test-flutter test-android

test: versions test-python test-node test-web test-rn test-rust test-flutter
	@echo "All runnable SDK test suites passed (iOS + Unity need their own toolchains)."

versions:
	@node scripts/check-versions.mjs

test-python:
	@echo "== python =="
	cd packages/python && PYTHONPATH=src python3 -m unittest discover -s tests

test-node:
	@echo "== node =="
	cd packages/node && node --test test/*.test.ts

test-web:
	@echo "== web =="
	cd packages/web && node --test test/*.test.ts

test-rn:
	@echo "== react-native =="
	cd packages/react-native && node --test test/*.test.ts

test-rust:
	@echo "== rust =="
	cd packages/rust && cargo test

test-flutter:
	@echo "== flutter =="
	cd packages/flutter && flutter analyze && flutter test

test-android:
	@echo "== android (needs ANDROID_HOME) =="
	cd packages/android && gradle :adx:testDebugUnitTest --console=plain
