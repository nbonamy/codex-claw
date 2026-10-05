// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "AppTTSHelper",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "app-tts-helper", targets: ["AppTTSHelper"]),
    ],
    dependencies: [
        .package(url: "https://github.com/FluidInference/FluidAudio.git", exact: "0.15.5"),
    ],
    targets: [
        .executableTarget(
            name: "AppTTSHelper",
            dependencies: [.product(name: "FluidAudio", package: "FluidAudio")]
        ),
        .testTarget(
            name: "AppTTSHelperTests",
            dependencies: ["AppTTSHelper"]
        ),
    ]
)
