import SwiftUI
import UIKit

struct ContentView: View {
    @ObservedObject var bluetooth: BluetoothController
    @ObservedObject var audio: AudioMeter
    @State private var showAll = false
    @State private var color = Color(red: 1, green: 0.2, blue: 0.1)
    @State private var brightness = 100.0
    @State private var speed = 50.0
    @State private var sensitivity = 50.0
    @State private var effectGroup = "Basic"
    @State private var selectedEffect = 0
    @State private var controllerMic = false
    @State private var microphoneEffect = 0

    private let micEffects = ["Énergie", "Rythme", "Spectre", "Défilement", "Énergie 2", "Rythme 2", "Spectre 2", "Défilement 2"]

    var body: some View {
        NavigationStack {
            Form {
                connectionSection
                if bluetooth.isReady {
                    lightSection
                    effectSection
                    musicSection
                }
                Section {
                    Text("Commande directe en Bluetooth, sans compte ni cloud. Utilisez les LED à portée de l’iPhone.")
                        .font(.footnote).foregroundStyle(.secondary)
                    Text("Cette app pilote vos LED ; elle ne les ajoute pas à l’app Maison.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Lantern Direct")
            .onAppear {
                audio.onLevel = { level in
                    guard bluetooth.isReady else { audio.stop(); return }
                    let rgb = rgbComponents()
                    let gain = level * brightness / 100
                    bluetooth.encodeAndSend(key: "color") {
                        try LanternProtocol.color(red: Int(Double(rgb.0) * gain), green: Int(Double(rgb.1) * gain), blue: Int(Double(rgb.2) * gain), music: true)
                    }
                }
            }
            .onChange(of: bluetooth.isReady) { ready in
                if !ready { audio.stop(); controllerMic = false }
            }
            .onChange(of: effectGroup) { group in
                selectedEffect = EffectCatalog.items.firstIndex(where: { $0.group == group }) ?? 0
            }
            .alert("Bluetooth", isPresented: Binding(
                get: { bluetooth.errorMessage != nil },
                set: { if !$0 { bluetooth.errorMessage = nil } }
            )) { Button("OK", role: .cancel) { bluetooth.errorMessage = nil } }
            message: { Text(bluetooth.errorMessage ?? "") }
            .alert("Microphone", isPresented: Binding(
                get: { audio.errorMessage != nil },
                set: { if !$0 { audio.errorMessage = nil } }
            )) { Button("OK", role: .cancel) { audio.errorMessage = nil } }
            message: { Text(audio.errorMessage ?? "") }
        }
    }

    private var connectionSection: some View {
        Section("Contrôleur LED") {
            Label(bluetooth.status, systemImage: bluetooth.isReady ? "checkmark.circle.fill" : "antenna.radiowaves.left.and.right")
                .foregroundStyle(bluetooth.isReady ? Color.green : Color.secondary)
            if bluetooth.isReady || bluetooth.isConnecting {
                Button(bluetooth.isConnecting ? "Annuler la connexion" : "Déconnecter", role: .destructive) {
                    audio.stop()
                    bluetooth.disconnect()
                }
            } else {
                Toggle("Afficher tous les appareils Bluetooth", isOn: $showAll)
                    .onChange(of: showAll) { value in
                        if bluetooth.isScanning { bluetooth.startScan(showAll: value) }
                    }
                Button(bluetooth.isScanning ? "Arrêter la recherche" : "Rechercher mes LED") {
                    if bluetooth.isScanning { bluetooth.stopScan() }
                    else { bluetooth.startScan(showAll: showAll) }
                }.disabled(!bluetooth.bluetoothAvailable)
                if bluetooth.hasSavedDevice {
                    Button("Reconnecter le dernier contrôleur") { bluetooth.reconnectSaved() }
                        .disabled(!bluetooth.bluetoothAvailable)
                }
                ForEach(bluetooth.devices) { device in
                    Button { bluetooth.connect(device.id) } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(device.name)
                                Text(device.id.uuidString.suffix(8)).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("\(device.rssi) dBm").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private var lightSection: some View {
        Section("Lumière") {
            HStack {
                Button("Allumer", systemImage: "lightbulb.fill") { bluetooth.send(LanternProtocol.power(true)) }
                Spacer()
                Button("Éteindre", systemImage: "lightbulb.slash") {
                    stopMusic()
                    bluetooth.send(LanternProtocol.power(false))
                }
            }.buttonStyle(.bordered)
            ColorPicker("Couleur", selection: $color, supportsOpacity: false)
                .onChange(of: color) { _ in if !audio.isRunning { sendColor() } }
            Button("Appliquer la couleur") { sendColor() }
            VStack(alignment: .leading) {
                Text("Luminosité : \(Int(brightness)) %")
                Slider(value: $brightness, in: 0...100, step: 1) { editing in
                    if !editing { sendBrightness() }
                }
            }
            Text("Les réglages affichent vos consignes ; le contrôleur ne confirme pas ici la couleur ou la luminosité réelles.")
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    private var effectSection: some View {
        Section("Effets RGBIC") {
            Picker("Famille", selection: $effectGroup) {
                ForEach(EffectCatalog.groups, id: \.self) { Text($0).tag($0) }
            }
            Picker("Effet", selection: $selectedEffect) {
                ForEach(EffectCatalog.items.indices.filter { EffectCatalog.items[$0].group == effectGroup }, id: \.self) { i in
                    Text(EffectCatalog.items[i].name).tag(i)
                }
            }
            Button("Lancer l’effet") {
                stopMusic()
                let effect = EffectCatalog.items[selectedEffect]
                bluetooth.encodeAndSend {
                    effect.isScene ? try LanternProtocol.scene(effect.code) : try LanternProtocol.effect(effect.code)
                }
                sendBrightness()
            }
            VStack(alignment: .leading) {
                Text("Vitesse : \(Int(speed)) %")
                Slider(value: $speed, in: 0...100, step: 1) { editing in
                    if !editing { bluetooth.encodeAndSend(key: "speed") { try LanternProtocol.speed(Int(speed)) } }
                }
            }
            Text("Le catalogue provient de l’APK. Les effets disponibles dépendent du contrôleur.")
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    private var musicSection: some View {
        Section("Réaction à la musique") {
            Toggle("Microphone du contrôleur", isOn: $controllerMic)
                .onChange(of: controllerMic) { enabled in
                    guard bluetooth.isReady else { return }
                    if enabled { audio.stop() }
                    bluetooth.send(LanternProtocol.controllerMicrophone(enabled), key: "microphone")
                    if enabled {
                        bluetooth.encodeAndSend { try LanternProtocol.microphoneEffect(microphoneEffect) }
                        bluetooth.encodeAndSend(key: "sensitivity") { try LanternProtocol.sensitivity(Int(sensitivity)) }
                    }
                }
            if controllerMic {
                Picker("Effet musical", selection: $microphoneEffect) {
                    ForEach(micEffects.indices, id: \.self) { Text(micEffects[$0]).tag($0) }
                }.onChange(of: microphoneEffect) { value in
                    bluetooth.encodeAndSend { try LanternProtocol.microphoneEffect(value) }
                }
                VStack(alignment: .leading) {
                    Text("Sensibilité : \(Int(sensitivity)) %")
                    Slider(value: $sensitivity, in: 0...100, step: 1) { editing in
                        if !editing { bluetooth.encodeAndSend(key: "sensitivity") { try LanternProtocol.sensitivity(Int(sensitivity)) } }
                    }
                }
            }
            Button(audio.isRunning ? "Arrêter le micro de l’iPhone" : "Utiliser le micro de l’iPhone") {
                if audio.isRunning { audio.stop(); sendColor() }
                else {
                    controllerMic = false
                    // Streaming scales RGB itself: reset the global dimmer once.
                    bluetooth.encodeAndSend { try LanternProtocol.brightness(100) }
                    Task { await audio.start() }
                }
            }
            if audio.isRunning { ProgressView(value: audio.level).tint(color) }
            Text("Le micro du contrôleur nécessite un modèle équipé. Avec le micro de l’iPhone, gardez cette app ouverte : le niveau sonore module la couleur choisie. Aucun son n’est enregistré.")
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    private func rgbComponents() -> (Int, Int, Int) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a) else { return (255, 255, 255) }
        return (Int((r * 255).rounded()), Int((g * 255).rounded()), Int((b * 255).rounded()))
    }

    private func stopMusic() {
        audio.stop()
        if controllerMic {
            bluetooth.send(LanternProtocol.controllerMicrophone(false), key: "microphone")
            controllerMic = false
        }
    }

    private func sendColor() {
        stopMusic()
        let (r, g, b) = rgbComponents()
        bluetooth.encodeAndSend(key: "color") { try LanternProtocol.color(red: r, green: g, blue: b) }
        sendBrightness()
    }

    private func sendBrightness() {
        guard !audio.isRunning else { return }
        bluetooth.encodeAndSend(key: "brightness") { try LanternProtocol.brightness(Int(brightness)) }
    }
}
