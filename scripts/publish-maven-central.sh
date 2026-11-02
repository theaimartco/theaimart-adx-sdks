#!/usr/bin/env bash
# Sign the Android artifacts Gradle staged and upload them to Maven Central (Central Portal).
#
# Run by the `android` job in release.yml after
#   gradle :adx:publishReleasePublicationToStagingRepository
# which leaves the AAR, POM, Gradle module file and sources jar (each with checksums) under
# packages/android/adx/build/staging. Central additionally requires a javadoc jar and a GPG
# signature for every file; both are added here, then the tree is zipped as a Central bundle.
#
# Env: VERSION, MAVEN_CENTRAL_USERNAME, MAVEN_CENTRAL_PASSWORD (a Central Portal *user token*,
# not the account login), MAVEN_GPG_PRIVATE_KEY (ASCII-armored), MAVEN_GPG_PASSPHRASE.
set -euo pipefail

: "${VERSION:?VERSION is required}"
for v in MAVEN_CENTRAL_USERNAME MAVEN_CENTRAL_PASSWORD MAVEN_GPG_PRIVATE_KEY MAVEN_GPG_PASSPHRASE; do
  if [ -z "${!v:-}" ]; then
    echo "::error::$v is not set in the maven-central environment — see RELEASING.md"
    exit 1
  fi
done

STAGE="packages/android/adx/build/staging"
ARTIFACT_DIR="$STAGE/co/theaimart/adx-android"
DIR="$ARTIFACT_DIR/$VERSION"
BASE="adx-android-$VERSION"
[ -f "$DIR/$BASE.pom" ] || { echo "::error::nothing staged at $DIR"; exit 1; }

# Central builds its own metadata; a staged maven-metadata.xml is rejected.
rm -f "$ARTIFACT_DIR"/maven-metadata.xml*

# Central requires a javadoc jar. Kotlin sources carry KDoc, which javadoc cannot render, so
# ship the README in its place — Central's documented allowance for that case.
tmp="$(mktemp -d)"
cp packages/android/README.md "$tmp/README.md"
(cd "$tmp" && jar cf "$OLDPWD/$DIR/$BASE-javadoc.jar" README.md)

export GNUPGHOME="$(mktemp -d)"
chmod 700 "$GNUPGHOME"
printf '%s' "$MAVEN_GPG_PRIVATE_KEY" | gpg --batch --import

for f in "$DIR"/*; do
  case "$f" in *.md5|*.sha1|*.sha256|*.sha512|*.asc) continue ;; esac
  [ -f "$f.md5" ]  || md5sum  "$f" | cut -d' ' -f1 > "$f.md5"
  [ -f "$f.sha1" ] || sha1sum "$f" | cut -d' ' -f1 > "$f.sha1"
  gpg --batch --yes --pinentry-mode loopback --passphrase "$MAVEN_GPG_PASSPHRASE" \
      --armor --detach-sign --output "$f.asc" "$f"
done

bundle="$(mktemp -d)/bundle.zip"
(cd "$STAGE" && zip -qr "$bundle" co)
echo "bundle contents:"; unzip -l "$bundle"

auth="$(printf '%s:%s' "$MAVEN_CENTRAL_USERNAME" "$MAVEN_CENTRAL_PASSWORD" | base64 -w0)"
deployment="$(curl -sS --fail-with-body \
  -H "Authorization: Bearer $auth" \
  -F "bundle=@$bundle" \
  "https://central.sonatype.com/api/v1/publisher/upload?publishingType=AUTOMATIC&name=adx-android-$VERSION")"
echo "deployment id: $deployment"

# AUTOMATIC publishes once validation passes. Wait for the verdict so a rejected bundle fails
# this job instead of looking like a release.
for _ in $(seq 1 60); do
  status="$(curl -sS --fail-with-body -X POST -H "Authorization: Bearer $auth" \
    "https://central.sonatype.com/api/v1/publisher/status?id=$deployment")"
  state="$(printf '%s' "$status" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("deploymentState",""))')"
  echo "state: $state"
  case "$state" in
    PUBLISHING|PUBLISHED) echo "co.theaimart:adx-android:$VERSION accepted by Maven Central"; exit 0 ;;
    FAILED) echo "::error::Maven Central rejected the bundle"; echo "$status"; exit 1 ;;
  esac
  sleep 20
done
echo "::error::Maven Central did not finish validating within 20 minutes (deployment $deployment)"
exit 1
