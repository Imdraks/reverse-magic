// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "LanternProtocol",
    products: [.library(name: "LanternProtocol", targets: ["LanternProtocol"])],
    targets: [
        .target(name: "LanternProtocol", path: "MagicLantern", exclude: [
            "BluetoothController.swift", "ContentView.swift", "LanternApp.swift",
            "AudioMeter.swift", "EffectCatalog.swift", "Info.plist"
        ], sources: ["LanternProtocol.swift", "WriteQueue.swift"]),
        .testTarget(name: "LanternProtocolTests", dependencies: ["LanternProtocol"])
    ]
)
