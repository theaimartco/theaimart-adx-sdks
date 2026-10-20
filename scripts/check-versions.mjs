#!/usr/bin/env node
// Every SDK reports its version on the wire (User-Agent + X-Adx-Sdk, CONTRACT.md §6/§11), and
// that string is hand-written next to the registry manifest. This fails when the two disagree,
// so a release can never publish 1.2.0 that tells the ad server it is 1.1.0.
//
//   node scripts/check-versions.mjs            # check
//   node scripts/check-versions.mjs 1.2.0      # set every package to 1.2.0, then check
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages');
const SEMVER = String.raw`(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)`;

// [package, file, regex whose group 1 is the version]
const SITES = [
  ['node', 'package.json', String.raw`^  "version": "${SEMVER}"`],
  ['node', 'src/constants.ts', String.raw`^export const VERSION = '${SEMVER}'`],
  ['web', 'package.json', String.raw`^  "version": "${SEMVER}"`],
  ['web', 'src/constants.ts', String.raw`^export const VERSION = '${SEMVER}'`],
  ['react-native', 'package.json', String.raw`^  "version": "${SEMVER}"`],
  ['react-native', 'src/constants.ts', String.raw`^export const VERSION = '${SEMVER}'`],
  ['python', 'pyproject.toml', String.raw`^version = "${SEMVER}"`],
  ['python', 'src/theaimart_adx/_version.py', String.raw`^__version__ = "${SEMVER}"`],
  ['rust', 'Cargo.toml', String.raw`^version = "${SEMVER}"`],
  ['android', 'adx/build.gradle.kts', String.raw`^ +version = "${SEMVER}"`],
  ['android', 'adx/src/main/kotlin/co/theaimart/adx/Constants.kt', String.raw`^public const val SDK_VERSION: String = "${SEMVER}"`],
  ['ios', '../../TheaimartAdx.podspec', String.raw`^  s\.version +?= '${SEMVER}'`],
  ['ios', 'Sources/TheaimartAdx/Constants.swift', String.raw`^    public static let version = "${SEMVER}"`],
  ['ios', 'Sources/TheaimartAdx/Constants.swift', String.raw`^    static let sdkIdentifier = "theaimart-adx-ios/${SEMVER}"`],
  ['flutter', 'pubspec.yaml', String.raw`^version: ${SEMVER}`],
  ['flutter', 'lib/src/constants.dart', String.raw`^const String sdkVersion = '${SEMVER}'`],
  ['unity', 'package.json', String.raw`^  "version": "${SEMVER}"`],
  ['unity', 'Runtime/Constants.cs', String.raw`^        public const string Version = "${SEMVER}"`],
];

const target = process.argv[2];
if (target !== undefined && !new RegExp(`^${SEMVER}$`).test(target)) {
  console.error(`not a version: ${target}`);
  process.exit(2);
}

const found = new Map();
let failed = false;
for (const [pkg, file, pattern] of SITES) {
  const path = join(root, pkg, file);
  let text = readFileSync(path, 'utf8');
  const re = new RegExp(pattern, 'm');
  const m = re.exec(text);
  if (!m) {
    console.error(`✖ ${pkg}/${file}: version line not found`);
    failed = true;
    continue;
  }
  if (target !== undefined && m[1] !== target) {
    text = text.slice(0, m.index) + m[0].replace(m[1], target) + text.slice(m.index + m[0].length);
    writeFileSync(path, text);
  }
  const version = target ?? m[1];
  if (!found.has(pkg)) found.set(pkg, new Map());
  found.get(pkg).set(`${file}`, version);
}

for (const [pkg, files] of found) {
  const versions = new Set(files.values());
  if (versions.size !== 1) {
    failed = true;
    console.error(`✖ ${pkg}: versions disagree`);
    for (const [file, v] of files) console.error(`    ${v}  ${file}`);
  } else {
    console.log(`✓ ${pkg.padEnd(13)} ${[...versions][0]}`);
  }
}
process.exit(failed ? 1 : 0);
