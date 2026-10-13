import Foundation

/// Pending writes only. The BLE controller owns the in-flight request.
/// New slider samples supersede unsent samples with the same key, at the tail.
public struct WriteQueue {
    public struct Frame: Equatable, Sendable {
        public let bytes: Data
        public let key: String?
        public init(_ bytes: Data, key: String? = nil) { self.bytes = bytes; self.key = key }
    }
    public enum QueueError: Error, Equatable { case full, invalidFrame }
    public let capacity: Int
    private var pending: [Frame] = []
    public var count: Int { pending.count }
    public init(capacity: Int = 32) { self.capacity = max(1, capacity) }

    public mutating func enqueue(_ frame: Frame) throws {
        guard frame.bytes.count == 9, frame.bytes.first == 0x7E, frame.bytes.last == 0xEF else {
            throw QueueError.invalidFrame
        }
        var next = pending
        if let key = frame.key { next.removeAll { $0.key == key } }
        guard next.count < capacity else { throw QueueError.full }
        next.append(frame)
        pending = next
    }

    public mutating func pop() -> Frame? {
        pending.isEmpty ? nil : pending.removeFirst()
    }
    public mutating func clear() { pending.removeAll() }
}
