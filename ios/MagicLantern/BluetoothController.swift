import Foundation
import Combine
@preconcurrency import CoreBluetooth

struct DiscoveredLED: Identifiable {
    let id: UUID
    var name: String
    var rssi: Int
}

@MainActor
final class BluetoothController: NSObject, ObservableObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    @Published private(set) var devices: [DiscoveredLED] = []
    @Published private(set) var status = "Initialisation du Bluetooth…"
    @Published private(set) var isScanning = false
    @Published private(set) var isReady = false
    @Published private(set) var isConnecting = false
    @Published private(set) var connectedName: String?
    @Published private(set) var bluetoothAvailable = false
    @Published private(set) var lastFrame = ""
    @Published var errorMessage: String?

    private var central: CBCentralManager!
    private var discovered: [UUID: CBPeripheral] = [:]
    private var peripheral: CBPeripheral?
    private var characteristic: CBCharacteristic?
    private var queue = WriteQueue()
    private var inFlight: Data?
    private var preferResponse = true
    private var showAll = false
    private var scanTimeout: DispatchWorkItem?
    private var connectionTimeout: DispatchWorkItem?
    private var writeTimeout: DispatchWorkItem?
    private var nextWrite: DispatchWorkItem?
    private var delayedPump = false
    private let service = CBUUID(string: LanternProtocol.serviceUUID)
    private let commandUUID = CBUUID(string: LanternProtocol.characteristicUUID)

    var hasSavedDevice: Bool { UserDefaults.standard.string(forKey: "lastLED") != nil }

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
    }

    func startScan(showAll: Bool = false) {
        guard central.state == .poweredOn else {
            report("Activez le Bluetooth et autorisez son accès dans Réglages.")
            return
        }
        guard !isConnecting, !isReady else { return }
        self.showAll = showAll
        devices.removeAll()
        discovered.removeAll()
        central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
        isScanning = true
        status = "Recherche de contrôleurs LED…"
        scanTimeout?.cancel()
        let timeout = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.stopScan()
            self.status = self.devices.isEmpty ? "Aucun contrôleur trouvé. Rapprochez-vous des LED et fermez l’app Android." : "Choisissez votre contrôleur."
        }
        scanTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 12, execute: timeout)
    }

    func stopScan() {
        central?.stopScan()
        scanTimeout?.cancel()
        isScanning = false
    }

    func connect(_ id: UUID) {
        guard central.state == .poweredOn, peripheral == nil else { return }
        guard let device = discovered[id] ?? central.retrievePeripherals(withIdentifiers: [id]).first else {
            report("Ce contrôleur n’est plus disponible. Lancez une nouvelle recherche.")
            return
        }
        stopScan()
        resetWrites()
        peripheral = device
        device.delegate = self
        isConnecting = true
        connectedName = device.name ?? "Contrôleur LED"
        status = "Connexion à \(connectedName!)…"
        central.connect(device, options: nil)
        let timeout = DispatchWorkItem { [weak self] in
            guard let self, self.isConnecting else { return }
            self.report("Connexion expirée. Vérifiez que les LED sont alimentées et libres de toute autre connexion.")
            self.disconnect()
        }
        connectionTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 20, execute: timeout)
    }

    func reconnectSaved() {
        guard let value = UserDefaults.standard.string(forKey: "lastLED"), let id = UUID(uuidString: value) else { return }
        connect(id)
    }

    func disconnect() {
        stopScan()
        connectionTimeout?.cancel()
        isReady = false
        // Keep the peripheral until didDisconnect to avoid reconnecting over an old session.
        isConnecting = peripheral != nil
        characteristic = nil
        resetWrites()
        if let peripheral { central.cancelPeripheralConnection(peripheral) }
    }

    func send(_ bytes: Data, key: String? = nil) {
        guard isReady else { report("Connectez un contrôleur avant d’envoyer un réglage."); return }
        do {
            try queue.enqueue(.init(bytes, key: key))
            pump()
        } catch { report("Trop de commandes en attente. Attendez avant de réessayer.") }
    }

    func encodeAndSend(key: String? = nil, _ encode: () throws -> Data) {
        do { send(try encode(), key: key) }
        catch { report(error.localizedDescription) }
    }

    private func pump() {
        guard isReady, !delayedPump, inFlight == nil,
              let peripheral, let characteristic else { return }
        if !preferResponse && !peripheral.canSendWriteWithoutResponse { return }
        guard let frame = queue.pop() else { return }
        let type: CBCharacteristicWriteType = preferResponse ? .withResponse : .withoutResponse
        guard frame.bytes.count <= peripheral.maximumWriteValueLength(for: type) else {
            report("Le contrôleur refuse les trames de neuf octets.")
            disconnect()
            return
        }
        if preferResponse { inFlight = frame.bytes }
        peripheral.writeValue(frame.bytes, for: characteristic, type: type)
        lastFrame = frame.bytes.map { String(format: "%02X", $0) }.joined(separator: " ")
        if preferResponse {
            let timeout = DispatchWorkItem { [weak self] in
                guard let self, self.inFlight != nil else { return }
                self.report("Le contrôleur n’a pas accusé réception. Connexion arrêtée ; aucun renvoi automatique.")
                self.disconnect()
            }
            writeTimeout = timeout
            DispatchQueue.main.asyncAfter(deadline: .now() + 4, execute: timeout)
        } else { schedulePump() }
    }

    private func schedulePump() {
        delayedPump = true
        let job = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.delayedPump = false
            self.pump()
        }
        nextWrite = job
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.06, execute: job)
    }

    private func resetWrites() {
        queue.clear()
        inFlight = nil
        writeTimeout?.cancel()
        nextWrite?.cancel()
        delayedPump = false
    }

    private func report(_ message: String) { errorMessage = message; status = message }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        bluetoothAvailable = central.state == .poweredOn
        if !bluetoothAvailable {
            stopScan()
            connectionTimeout?.cancel()
            resetWrites()
            characteristic = nil
            peripheral = nil
            connectedName = nil
            isReady = false
            isConnecting = false
        }
        switch central.state {
        case .poweredOn: status = "Bluetooth prêt. Recherchez vos LED."
        case .poweredOff: status = "Bluetooth désactivé."
        case .unauthorized: status = "Accès Bluetooth refusé. Autorisez Lantern Direct dans Réglages."
        case .unsupported: status = "Cet appareil ne prend pas en charge le Bluetooth LE."
        case .resetting: status = "Réinitialisation du Bluetooth…"
        default: status = "Initialisation du Bluetooth…"
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        guard isScanning else { return }
        let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? peripheral.name ?? "Appareil sans nom"
        let advertised = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] ?? []
        guard showAll || name.hasPrefix("MELK-") || name.hasPrefix("MELK_") || advertised.contains(service) else { return }
        discovered[peripheral.identifier] = peripheral
        let device = DiscoveredLED(id: peripheral.identifier, name: name, rssi: RSSI.intValue)
        if let i = devices.firstIndex(where: { $0.id == device.id }) { devices[i] = device }
        else { devices.append(device) }
        devices.sort { $0.rssi > $1.rssi }
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        guard self.peripheral === peripheral else { return }
        status = "Vérification du service LED…"
        peripheral.discoverServices([service])
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        guard self.peripheral === peripheral else { return }
        connectionTimeout?.cancel()
        self.peripheral = nil
        characteristic = nil
        isConnecting = false
        isReady = false
        connectedName = nil
        resetWrites()
        report(error?.localizedDescription ?? "Connexion impossible.")
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        guard self.peripheral === peripheral else { return }
        connectionTimeout?.cancel()
        self.peripheral = nil
        characteristic = nil
        isReady = false
        isConnecting = false
        connectedName = nil
        resetWrites()
        if let error { report("Connexion perdue : \(error.localizedDescription)") }
        else { status = "Déconnecté." }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard self.peripheral === peripheral else { return }
        guard error == nil, let ledService = peripheral.services?.first(where: { $0.uuid == service }) else {
            report(error?.localizedDescription ?? "Ce contrôleur n’expose pas le service Magic Lantern FFF0.")
            disconnect()
            return
        }
        peripheral.discoverCharacteristics([commandUUID], for: ledService)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard self.peripheral === peripheral else { return }
        guard error == nil, let output = service.characteristics?.first(where: { $0.uuid == commandUUID }),
              output.properties.contains(.write) || output.properties.contains(.writeWithoutResponse) else {
            report(error?.localizedDescription ?? "La caractéristique FFF3 ne permet pas les commandes LED.")
            disconnect()
            return
        }
        characteristic = output
        preferResponse = output.properties.contains(.write)
        connectionTimeout?.cancel()
        isConnecting = false
        isReady = true
        status = "Connecté à \(connectedName ?? "vos LED")."
        UserDefaults.standard.set(peripheral.identifier.uuidString, forKey: "lastLED")
        // No unsolicited writes or guessed handshake: discovery alone enables controls.
    }

    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        guard self.peripheral === peripheral, characteristic === self.characteristic, inFlight != nil else { return }
        writeTimeout?.cancel()
        inFlight = nil
        if let error {
            report("Échec d’envoi : \(error.localizedDescription)")
            disconnect()
        } else { schedulePump() }
    }

    func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
        guard self.peripheral === peripheral else { return }
        pump()
    }
}
