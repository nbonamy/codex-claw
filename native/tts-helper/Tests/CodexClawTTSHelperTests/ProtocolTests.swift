import Foundation
import Testing
@testable import CodexClawTTSHelper

@Test func acceptsAndTrimsBoundedText() throws {
    let request = SpeakRequest(version: 1, id: "request-1", text: "  On it.  ")
    #expect(try request.validatedText() == "On it.")
}

@Test func rejectsEmptyAndOversizedText() {
    #expect(throws: HelperError.self) {
        try SpeakRequest(version: 1, id: "request-1", text: "  ").validatedText()
    }
    #expect(throws: HelperError.self) {
        try SpeakRequest(version: 1, id: "request-1", text: String(repeating: "x", count: 161)).validatedText()
    }
}

@Test func emitsBoundedCompletionResponse() throws {
    let data = try encodeResponse(HelperResponse(id: "request-1", status: "completed"))
    #expect(data.count < 128)
    #expect(data.last == 0x0A)
}
