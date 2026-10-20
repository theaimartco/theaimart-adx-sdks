// swift-tools-version:5.7
//
// Root manifest so SwiftPM can install the iOS SDK straight from this repository's URL:
// SwiftPM only reads a Package.swift at the root of the repository it clones. It points at the
// same sources as packages/ios/Package.swift, which CI uses to build and test in place.
// Releases are plain SemVer tags at the repository root (`v1.1.0`).
import PackageDescription

let package = Package(
    name: "TheaimartAdx",
    platforms: [
        .iOS(.v12),
        .tvOS(.v12),
    ],
    products: [
        .library(name: "TheaimartAdx", targets: ["TheaimartAdx"]),
    ],
    targets: [
        .target(
            name: "TheaimartAdx",
            path: "packages/ios/Sources/TheaimartAdx"
        ),
        .testTarget(
            name: "TheaimartAdxTests",
            dependencies: ["TheaimartAdx"],
            path: "packages/ios/Tests/TheaimartAdxTests"
        ),
    ]
)
