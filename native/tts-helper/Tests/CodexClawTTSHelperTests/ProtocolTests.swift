import Foundation
import Testing

@testable import CodexClawTTSHelper

@Test func acceptsAndTrimsBoundedText() throws {
  let request = SpeakRequest(version: 1, id: "request-1", text: "  On it.  ", voice: nil)
  #expect(try request.validatedText() == "On it.")
  #expect(try request.validatedVoice() == "af_heart")
}

@Test func acceptsOnlyCuratedNeuralVoices() throws {
  #expect(
    try SpeakRequest(
      version: 1, id: "request-1", text: "On it.", voice: "bf_emma"
    ).validatedVoice() == "bf_emma")
  #expect(throws: HelperError.self) {
    try SpeakRequest(
      version: 1, id: "request-1", text: "On it.", voice: "system_voice"
    ).validatedVoice()
  }
}

@Test func rejectsEmptyAndOversizedText() {
  #expect(throws: HelperError.self) {
    try SpeakRequest(version: 1, id: "request-1", text: "  ", voice: nil).validatedText()
  }
  #expect(throws: HelperError.self) {
    try SpeakRequest(
      version: 1, id: "request-1", text: String(repeating: "x", count: 161), voice: nil
    ).validatedText()
  }
}

@Test func extractsTheBoundedRawTensorFromAStoredPytorchArchive() throws {
  let payload = Data([0x10, 0x20, 0x30, 0x40])
  let archive = storedZip(name: "voice/data/0", payload: payload)
  #expect(try extractStoredVoicePack(from: archive) == payload)
  #expect(throws: VoicePackError.self) {
    try extractStoredVoicePack(from: Data("not a zip".utf8))
  }
}

private func storedZip(name: String, payload: Data) -> Data {
  let nameData = Data(name.utf8)
  var archive = Data()
  appendUInt32(0x0403_4b50, to: &archive)
  appendUInt16(20, to: &archive)
  appendUInt16(0, to: &archive)
  appendUInt16(0, to: &archive)
  appendUInt16(0, to: &archive)
  appendUInt16(0, to: &archive)
  appendUInt32(0, to: &archive)
  appendUInt32(UInt32(payload.count), to: &archive)
  appendUInt32(UInt32(payload.count), to: &archive)
  appendUInt16(UInt16(nameData.count), to: &archive)
  appendUInt16(0, to: &archive)
  archive.append(nameData)
  archive.append(payload)

  let centralOffset = archive.count
  appendUInt32(0x0201_4b50, to: &archive)
  appendUInt16(20, to: &archive)
  appendUInt16(20, to: &archive)
  appendUInt16(0, to: &archive)
  appendUInt16(0, to: &archive)
  appendUInt16(0, to: &archive)
  appendUInt16(0, to: &archive)
  appendUInt32(0, to: &archive)
  appendUInt32(UInt32(payload.count), to: &archive)
  appendUInt32(UInt32(payload.count), to: &archive)
  appendUInt16(UInt16(nameData.count), to: &archive)
  appendUInt16(0, to: &archive)
  appendUInt16(0, to: &archive)
  appendUInt16(0, to: &archive)
  appendUInt16(0, to: &archive)
  appendUInt32(0, to: &archive)
  appendUInt32(0, to: &archive)
  archive.append(nameData)

  let centralSize = archive.count - centralOffset
  appendUInt32(0x0605_4b50, to: &archive)
  appendUInt16(0, to: &archive)
  appendUInt16(0, to: &archive)
  appendUInt16(1, to: &archive)
  appendUInt16(1, to: &archive)
  appendUInt32(UInt32(centralSize), to: &archive)
  appendUInt32(UInt32(centralOffset), to: &archive)
  appendUInt16(0, to: &archive)
  return archive
}

private func appendUInt16(_ value: UInt16, to data: inout Data) {
  data.append(UInt8(value & 0xff))
  data.append(UInt8((value >> 8) & 0xff))
}

private func appendUInt32(_ value: UInt32, to data: inout Data) {
  data.append(UInt8(value & 0xff))
  data.append(UInt8((value >> 8) & 0xff))
  data.append(UInt8((value >> 16) & 0xff))
  data.append(UInt8((value >> 24) & 0xff))
}

@Test func emitsBoundedCompletionResponse() throws {
  let data = try encodeResponse(HelperResponse(id: "request-1", status: "completed"))
  #expect(data.count < 128)
  #expect(data.last == 0x0A)
}
