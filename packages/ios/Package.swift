// swift-tools-version:5.7
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
            path: "Sources/TheaimartAdx"
        ),
        .testTarget(
            name: "TheaimartAdxTests",
            dependencies: ["TheaimartAdx"],
            path: "Tests/TheaimartAdxTests"
        ),
    ]
)
