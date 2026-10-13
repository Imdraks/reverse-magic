import SwiftUI

@main
struct LanternApp: App {
    @StateObject private var bluetooth = BluetoothController()
    @StateObject private var audio = AudioMeter()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView(bluetooth: bluetooth, audio: audio)
                .onChange(of: scenePhase) { phase in
                    if phase != .active {
                        audio.stop()
                        bluetooth.stopScan()
                    }
                }
        }
    }
}
