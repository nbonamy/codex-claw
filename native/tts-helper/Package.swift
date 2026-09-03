// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "CodexClawTTSHelper",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "codex-claw-tts-helper", targets: ["CodexClawTTSHelper"]),
    ],
    dependencies: [
        .package(url: "https://github.com/FluidInference/FluidAudio.git", exact: "0.15.5"),
    ],
    targets: [
        .executableTarget(
            name: "CodexClawTTSHelper",
            dependencies: [.product(name: "FluidAudio", package: "FluidAudio")]
        ),
        .testTarget(
            name: "CodexClawTTSHelperTests",
            dependencies: ["CodexClawTTSHelper"]
        ),
    ]
)
