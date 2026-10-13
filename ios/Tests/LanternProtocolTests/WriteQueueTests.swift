import Foundation
import XCTest
@testable import LanternProtocol

final class WriteQueueTests: XCTestCase {
    func testCommandsKeepTheirOrder() throws {
        var queue = WriteQueue()
        try queue.enqueue(.init(LanternProtocol.power(true)))
        try queue.enqueue(.init(try LanternProtocol.color(red: 1, green: 2, blue: 3)))
        try queue.enqueue(.init(LanternProtocol.power(false)))
        XCTAssertEqual(queue.pop()?.bytes, LanternProtocol.power(true))
        XCTAssertEqual(queue.pop()?.bytes, try LanternProtocol.color(red: 1, green: 2, blue: 3))
        XCTAssertEqual(queue.pop()?.bytes, LanternProtocol.power(false))
        XCTAssertNil(queue.pop())
    }
    func testSliderStormKeepsLatestSample() throws {
        var queue = WriteQueue()
        for value in 0...100 { try queue.enqueue(.init(try LanternProtocol.brightness(value), key: "brightness")) }
        XCTAssertEqual(queue.count, 1)
        XCTAssertEqual(queue.pop()?.bytes, try LanternProtocol.brightness(100))
    }
    func testCoalescingDoesNotReorderOlderPowerCommand() throws {
        var queue = WriteQueue()
        try queue.enqueue(.init(try LanternProtocol.brightness(10), key: "brightness"))
        try queue.enqueue(.init(LanternProtocol.power(false)))
        try queue.enqueue(.init(try LanternProtocol.brightness(90), key: "brightness"))
        XCTAssertEqual(queue.pop()?.bytes, LanternProtocol.power(false))
        XCTAssertEqual(queue.pop()?.bytes, try LanternProtocol.brightness(90))
    }
    func testDifferentKeysDoNotOverwriteEachOther() throws {
        var queue = WriteQueue()
        try queue.enqueue(.init(try LanternProtocol.brightness(10), key: "brightness"))
        try queue.enqueue(.init(try LanternProtocol.speed(80), key: "speed"))
        XCTAssertEqual(queue.count, 2)
    }
    func testUnkeyedCommandsAreNeverDropped() throws {
        var queue = WriteQueue()
        try queue.enqueue(.init(LanternProtocol.power(true)))
        try queue.enqueue(.init(LanternProtocol.power(false)))
        XCTAssertEqual(queue.count, 2)
    }
    func testCapacityRejectsWithoutDestroyingPendingCommand() throws {
        var queue = WriteQueue(capacity: 1)
        try queue.enqueue(.init(LanternProtocol.power(true)))
        XCTAssertThrowsError(try queue.enqueue(.init(LanternProtocol.power(false))))
        XCTAssertEqual(queue.count, 1)
        XCTAssertEqual(queue.pop()?.bytes, LanternProtocol.power(true))
    }
    func testReplacementAllowedWhenFull() throws {
        var queue = WriteQueue(capacity: 1)
        try queue.enqueue(.init(try LanternProtocol.brightness(10), key: "brightness"))
        try queue.enqueue(.init(try LanternProtocol.brightness(80), key: "brightness"))
        XCTAssertEqual(queue.pop()?.bytes, try LanternProtocol.brightness(80))
    }
    func testClearDropsStaleWritesBeforeReconnect() throws {
        var queue = WriteQueue()
        try queue.enqueue(.init(LanternProtocol.power(true)))
        queue.clear()
        XCTAssertNil(queue.pop())
        XCTAssertEqual(queue.count, 0)
    }
    func testInvalidFramesRejected() throws {
        var queue = WriteQueue()
        XCTAssertThrowsError(try queue.enqueue(.init(Data())))
        XCTAssertThrowsError(try queue.enqueue(.init(Data(repeating: 0, count: 9))))
        XCTAssertEqual(queue.count, 0)
    }
}
