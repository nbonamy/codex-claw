import Foundation

struct SpeakRequest: Codable, Sendable {
  let version: Int
  let id: String
  let text: String
  let voice: String?

  func validatedText() throws -> String {
    guard version == 1 else { throw HelperError.invalidVersion }
    guard !id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      throw HelperError.invalidIdentifier
    }
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, trimmed.count <= 160 else { throw HelperError.invalidText }
    return trimmed
  }

  func validatedVoice() throws -> String {
    let resolved = voice ?? defaultVoiceId
    guard supportedVoiceIds.contains(resolved) else { throw HelperError.invalidVoice }
    return resolved
  }
}

struct HelperResponse: Encodable, Sendable {
  let version = 1
  let id: String?
  let status: String
}

enum HelperError: Error {
  case invalidIdentifier
  case invalidText
  case invalidVoice
  case invalidVersion
  case missingInput
}

func encodeResponse(_ response: HelperResponse) throws -> Data {
  var data = try JSONEncoder().encode(response)
  data.append(0x0A)
  return data
}
