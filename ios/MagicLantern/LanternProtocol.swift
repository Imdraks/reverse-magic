import Foundation

/// Commands reconstructed from Magic Lantern 6.11.10's BluetoothLEService.
/// Static analysis establishes bytes, not compatibility with every controller.
public enum LanternProtocol {
    public static let serviceUUID = "0000FFF0-0000-1000-8000-00805F9B34FB"
    public static let characteristicUUID = "0000FFF3-0000-1000-8000-00805F9B34FB"

    public enum Channel: UInt8, Sendable { case all = 0, rgb = 1, white = 2, temperature = 3, automatic = 255 }

    public enum EncodingError: Error, LocalizedError, Equatable {
        case outOfRange(String, Int)
        public var errorDescription: String? {
            switch self { case let .outOfRange(name, value): return "Valeur invalide pour \(name) : \(value)." }
        }
    }

    private static func byte(_ value: Int, range: ClosedRange<Int>, name: String) throws -> UInt8 {
        guard range.contains(value) else { throw EncodingError.outOfRange(name, value) }
        return UInt8(value)
    }

    public static func power(_ on: Bool) -> Data {
        Data([0x7E, 0x04, 0x04, on ? 1 : 0, 0, on ? 1 : 0, 0xFF, 0, 0xEF])
    }

    public static func color(red: Int, green: Int, blue: Int, music: Bool = false) throws -> Data {
        let r = try byte(red, range: 0...255, name: "rouge")
        let g = try byte(green, range: 0...255, name: "vert")
        let b = try byte(blue, range: 0...255, name: "bleu")
        return Data([0x7E, 0x07, 0x05, 0x03, r, g, b, music ? 0x20 : 0x10, 0xEF])
    }

    public static func brightness(_ percent: Int, channel: Channel = .automatic) throws -> Data {
        let value = try byte(percent, range: 0...100, name: "luminosité")
        return Data([0x7E, 0x04, 0x01, value, channel.rawValue, 0xFF, 0xFF, 0, 0xEF])
    }

    public static func effect(_ id: Int) throws -> Data {
        let value = try byte(id, range: 0...255, name: "effet")
        return Data([0x7E, 0x05, 0x03, value, 0x06, 0xFF, 0xFF, 0, 0xEF])
    }

    public static func scene(_ id: Int) throws -> Data {
        let value = try byte(id, range: 0...255, name: "scène")
        return Data([0x7E, 0x05, 0x31, value, 0x07, 0xFF, 0xFF, 1, 0xEF])
    }

    public static func speed(_ percent: Int) throws -> Data {
        let value = try byte(percent, range: 0...100, name: "vitesse")
        return Data([0x7E, 0x04, 0x02, value, 0xFF, 0xFF, 0xFF, 0, 0xEF])
    }

    public static func controllerMicrophone(_ on: Bool) -> Data {
        Data([0x7E, 0x04, 0x07, on ? 1 : 0, 0xFF, 0xFF, 0xFF, 0, 0xEF])
    }

    public static func microphoneEffect(_ id: Int) throws -> Data {
        let value = try byte(id, range: 0...7, name: "effet musical")
        return Data([0x7E, 0x07, 0x03, value + 0x80, 0x04, 0xFF, 0xFF, 0, 0xEF])
    }

    public static func sensitivity(_ percent: Int) throws -> Data {
        let value = try byte(percent, range: 0...100, name: "sensibilité")
        return Data([0x7E, 0x04, 0x06, value, 0xFF, 0xFF, 0xFF, 0, 0xEF])
    }
}
