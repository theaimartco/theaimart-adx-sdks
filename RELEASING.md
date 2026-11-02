# Releasing

Releases are automatic. To ship a new version of any SDK:

1. Change its version: `node scripts/check-versions.mjs 1.2.0` sets **every** package to 1.2.0,
   or edit one package's version sites by hand (the script lists them).
2. Push to `main`.

`auto-release.yml` sees which versions changed, tags each one (`web-v1.2.0`, `python-v1.2.0`,
…, `v1.2.0` for iOS + Unity) and starts `release.yml`, which runs that package's tests and
publishes it. A push that changes no version publishes nothing.

| Tag | Registry | Package |
|---|---|---|
| `node-v*` | npm | `@theaimart/adx` |
| `web-v*` | npm | `@theaimart/adx-web` |
| `react-native-v*` | npm | `@theaimart/adx-react-native` |
| `python-v*` | PyPI | `theaimart-adx` |
| `rust-v*` | crates.io | `theaimart-adx` |
| `flutter-v*` | pub.dev | `theaimart_adx` |
| `android-v*` | Maven Central | `co.theaimart:adx-android` |
| `v*` | SwiftPM + Unity (the tag itself), CocoaPods | `TheaimartAdx`, `co.theaimart.adx` |

To release whatever is not released yet (the first time, or after fixing a failed setup):
**Actions → Auto release → Run workflow → mode `all-untagged`.** To retry one failed release:
**Actions → Release → Run workflow**, and pick the tag under "Use workflow from".

## One-time setup

Each registry has to be told, once, from its owner's account, that this repository may publish
in its name. No CI can do this step for you — that is the point of it. Everything below uses:

- Repository owner: `theaimartco`
- Repository: `theaimart-adx-sdks`
- Workflow file: `release.yml`

GitHub secrets go in **Settings → Environments → _environment name_ → Add environment secret**
(create the environment if it is not listed).

### PyPI — `theaimart-adx`
pypi.org → Your projects → theaimart-adx → **Publishing** → Add a new publisher → GitHub:
owner `theaimartco`, repository `theaimart-adx-sdks`, workflow `release.yml`, environment `pypi`.

### crates.io — `theaimart-adx`
crates.io → theaimart-adx → **Settings → Trusted Publishing** → Add → GitHub:
owner `theaimartco`, repository `theaimart-adx-sdks`, workflow `release.yml`, environment `crates-io`.

### pub.dev — `theaimart_adx`
pub.dev → theaimart_adx → **Admin → Automated publishing** → Enable publishing from GitHub
Actions: repository `theaimartco/theaimart-adx-sdks`, tag pattern `flutter-v{{version}}`,
tick **Require GitHub Actions environment** = `pub.dev`, and tick **Enable publishing from
workflow_dispatch events** (auto-release starts releases that way).

### npm — `@theaimart/adx`, `@theaimart/adx-web`, `@theaimart/adx-react-native`
npm can only trust a package that already exists, and `adx-web` / `adx-react-native` do not
yet. So:

1. npmjs.com → avatar → **Access Tokens → Generate New Token → Granular Access Token**:
   packages and scopes **Read and write** for `@theaimart`, tick *Bypass two-factor
   authentication*, expiry 30 days.
2. Add it as secret `NPM_TOKEN` in environment `npm`.
3. Run the first release (above). After it succeeds, for **each** of the three packages:
   npmjs.com → package → **Settings → Trusted Publisher → GitHub Actions**: organization
   `theaimartco`, repository `theaimart-adx-sdks`, workflow `release.yml`, environment `npm`.
4. Delete the `NPM_TOKEN` secret and revoke the token. Releases now use Trusted Publishing.

### Maven Central — `co.theaimart:adx-android`
1. Sign in at central.sonatype.com → **Namespaces → Add Namespace** `co.theaimart`. It shows a
   verification key; add it as a **DNS TXT record on `theaimart.co`**, then press Verify.
2. **Account → Generate User Token**. Save the two values as secrets `MAVEN_CENTRAL_USERNAME`
   and `MAVEN_CENTRAL_PASSWORD` in environment `maven-central`.
3. Make a signing key (any machine with `gpg`):
   ```sh
   gpg --batch --passphrase 'CHOOSE-A-PASSPHRASE' --quick-gen-key "theaimart adx <contact@theaimart.co>" rsa4096 sign 5y
   gpg --list-secret-keys --keyid-format long contact@theaimart.co   # note the key id
   gpg --keyserver keyserver.ubuntu.com --send-keys KEYID           # Central checks signatures against it
   gpg --armor --export-secret-keys KEYID                           # → secret MAVEN_GPG_PRIVATE_KEY
   ```
   Save the passphrase as secret `MAVEN_GPG_PASSPHRASE`. Both go in environment `maven-central`.

### CocoaPods — `TheaimartAdx`
On a machine with CocoaPods: `pod trunk register contact@theaimart.co 'theaimart'`, click the
link in the email, then copy the token from `~/.netrc` (the `password` under
`trunk.cocoapods.org`) into secret `COCOAPODS_TRUNK_TOKEN` in environment `cocoapods`.
Until this is done, iOS releases still work through SwiftPM and only the CocoaPods step is
skipped (with a notice).

### SwiftPM and Unity
Nothing to set up: both install straight from the `v<version>` git tag.
