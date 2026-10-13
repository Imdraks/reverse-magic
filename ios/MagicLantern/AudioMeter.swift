import Foundation
import Combine
import AVFoundation

/// Live level detection only: no recording file and no network transmission.
@MainActor
final class AudioMeter: ObservableObject {
    @Published private(set) var isRunning = false
    @Published private(set) var level = 0.0
    @Published var errorMessage: String?
    var onLevel: ((Double) -> Void)?
    private var engine: AVAudioEngine?
    private var tapInstalled = false
    private var lastEmission = Date.distantPast
    private var interruptionObserver: NSObjectProtocol?
    private var generation = 0
    private var isStarting = false

    init() {
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
        ) { [weak self] _ in Task { @MainActor in self?.stop() } }
    }

    func start() async {
        guard !isRunning, !isStarting else { return }
        isStarting = true
        generation += 1
        let sessionGeneration = generation
        let session = AVAudioSession.sharedInstance()
        let allowed = await withCheckedContinuation { continuation in
            session.requestRecordPermission { continuation.resume(returning: $0) }
        }
        guard generation == sessionGeneration else { return }
        isStarting = false
        guard allowed else {
            errorMessage = "Autorisez le microphone dans Réglages pour le mode musical de l’iPhone."
            return
        }
        do {
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.mixWithOthers, .defaultToSpeaker])
            try session.setActive(true)
            let nextEngine = AVAudioEngine()
            let input = nextEngine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else {
                throw NSError(domain: "LanternAudio", code: 1, userInfo: [NSLocalizedDescriptionKey: "Aucun microphone disponible."])
            }
            engine = nextEngine
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                guard let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return }
                var sum = 0.0
                for i in 0..<Int(buffer.frameLength) { sum += Double(samples[i] * samples[i]) }
                let rms = sqrt(sum / Double(buffer.frameLength))
                let normalized = max(0, min(1, (20 * log10(max(rms, 0.00001)) + 55) / 45))
                Task { @MainActor [weak self] in
                    guard let self, self.isRunning, self.generation == sessionGeneration else { return }
                    guard Date().timeIntervalSince(self.lastEmission) >= 0.1 else { return }
                    self.lastEmission = Date()
                    self.level = normalized
                    self.onLevel?(normalized)
                }
            }
            tapInstalled = true
            nextEngine.prepare()
            try nextEngine.start()
            lastEmission = .distantPast
            isRunning = true
        } catch {
            stop()
            errorMessage = error.localizedDescription
        }
    }

    func stop() {
        generation += 1
        isStarting = false
        isRunning = false
        engine?.stop()
        if tapInstalled { engine?.inputNode.removeTap(onBus: 0) }
        tapInstalled = false
        engine = nil
        level = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
