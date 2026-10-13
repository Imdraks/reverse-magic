import Foundation
import XCTest
@testable import LanternProtocol

final class ProtocolTests: XCTestCase {
    private func hex(_ data: Data) -> String { data.map { String(format: "%02X", $0) }.joined(separator: " ") }

    func testPowerOnMatchesAPK() {
        XCTAssertEqual(hex(LanternProtocol.power(true)), "7E 04 04 01 00 01 FF 00 EF")
    }
    func testPowerOffMatchesAPK() {
        XCTAssertEqual(hex(LanternProtocol.power(false)), "7E 04 04 00 00 00 FF 00 EF")
    }
    func testGRBOrderAndUnsignedBytes() throws {
        XCTAssertEqual(hex(try LanternProtocol.color(red: 255, green: 0, blue: 128)), "7E 07 05 03 00 FF 80 10 EF")
    }
    func testMusicHasDifferentMarker() throws {
        XCTAssertEqual(hex(try LanternProtocol.color(red: 10, green: 20, blue: 30, music: true)), "7E 07 05 03 14 0A 1E 20 EF")
    }
    func testPrimaryColorsUseControllerGRBOrder() throws {
        XCTAssertEqual(hex(try LanternProtocol.color(red: 255, green: 0, blue: 0)), "7E 07 05 03 00 FF 00 10 EF")
        XCTAssertEqual(hex(try LanternProtocol.color(red: 0, green: 255, blue: 0)), "7E 07 05 03 FF 00 00 10 EF")
        XCTAssertEqual(hex(try LanternProtocol.color(red: 0, green: 0, blue: 255)), "7E 07 05 03 00 00 FF 10 EF")
    }
    func testMusicUsesSameGRBOrder() throws {
        XCTAssertEqual(hex(try LanternProtocol.color(red: 255, green: 0, blue: 0, music: true)), "7E 07 05 03 00 FF 00 20 EF")
        XCTAssertEqual(hex(try LanternProtocol.color(red: 0, green: 255, blue: 0, music: true)), "7E 07 05 03 FF 00 00 20 EF")
    }
    func testNeutralColorsStayNeutral() throws {
        XCTAssertEqual(hex(try LanternProtocol.color(red: 255, green: 255, blue: 255)), "7E 07 05 03 FF FF FF 10 EF")
        XCTAssertEqual(hex(try LanternProtocol.color(red: 0, green: 0, blue: 0)), "7E 07 05 03 00 00 00 10 EF")
    }
    func testBrightnessUsesPercentNot255() throws {
        XCTAssertEqual(hex(try LanternProtocol.brightness(100)), "7E 04 01 64 FF FF FF 00 EF")
        XCTAssertEqual(hex(try LanternProtocol.brightness(0)), "7E 04 01 00 FF FF FF 00 EF")
    }
    func testBrightnessChannels() throws {
        XCTAssertEqual(hex(try LanternProtocol.brightness(50, channel: .rgb)), "7E 04 01 32 01 FF FF 00 EF")
        XCTAssertEqual(hex(try LanternProtocol.brightness(50, channel: .all)), "7E 04 01 32 00 FF FF 00 EF")
    }
    func testModesDoNotUseSceneOpcode() throws {
        XCTAssertEqual(hex(try LanternProtocol.effect(212)), "7E 05 03 D4 06 FF FF 00 EF")
    }
    func testSceneOpcodeAndMarker() throws {
        XCTAssertEqual(hex(try LanternProtocol.scene(1)), "7E 05 31 01 07 FF FF 01 EF")
    }
    func testSpeed() throws {
        XCTAssertEqual(hex(try LanternProtocol.speed(75)), "7E 04 02 4B FF FF FF 00 EF")
    }
    func testControllerMicrophone() {
        XCTAssertEqual(hex(LanternProtocol.controllerMicrophone(true)), "7E 04 07 01 FF FF FF 00 EF")
        XCTAssertEqual(hex(LanternProtocol.controllerMicrophone(false)), "7E 04 07 00 FF FF FF 00 EF")
    }
    func testMicrophoneEffectOffset() throws {
        XCTAssertEqual(hex(try LanternProtocol.microphoneEffect(0)), "7E 07 03 80 04 FF FF 00 EF")
        XCTAssertEqual(hex(try LanternProtocol.microphoneEffect(7)), "7E 07 03 87 04 FF FF 00 EF")
    }
    func testSensitivity() throws {
        XCTAssertEqual(hex(try LanternProtocol.sensitivity(50)), "7E 04 06 32 FF FF FF 00 EF")
    }
    func testRGBRejectsUnderflowAndOverflow() {
        XCTAssertThrowsError(try LanternProtocol.color(red: -1, green: 0, blue: 0))
        XCTAssertThrowsError(try LanternProtocol.color(red: 0, green: 256, blue: 0))
        XCTAssertThrowsError(try LanternProtocol.color(red: 0, green: 0, blue: Int.max))
    }
    func testPercentCommandsRejectOutOfRange() {
        for value in [-1, 101, 255] {
            XCTAssertThrowsError(try LanternProtocol.brightness(value))
            XCTAssertThrowsError(try LanternProtocol.speed(value))
            XCTAssertThrowsError(try LanternProtocol.sensitivity(value))
        }
    }
    func testEffectsRejectOutOfRange() {
        XCTAssertThrowsError(try LanternProtocol.effect(-1))
        XCTAssertThrowsError(try LanternProtocol.effect(256))
        XCTAssertThrowsError(try LanternProtocol.scene(256))
        XCTAssertThrowsError(try LanternProtocol.microphoneEffect(8))
        XCTAssertThrowsError(try LanternProtocol.microphoneEffect(-1))
    }
    func testEveryValidByteColorAndEffectStaysNineBytes() throws {
        for value in 0...255 {
            XCTAssertEqual(try LanternProtocol.color(red: value, green: value, blue: value).count, 9)
            XCTAssertEqual(try LanternProtocol.effect(value).count, 9)
        }
    }
}
