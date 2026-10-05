import CryptoKit
import FluidAudio
import Foundation

let defaultVoiceId = "af_heart"

let supportedVoiceIds: Set<String> = [
  "af_heart",
  "af_bella",
  "af_nicole",
  "af_sarah",
  "am_adam",
  "am_michael",
  "bf_emma",
  "bm_george",
]

private let upstreamRevision = "f3ff3571791e39611d31c381e3a41a3af07b4987"
private let expectedVoiceHashes = [
  "af_heart": "d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b",
  "af_bella": "f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b",
  "af_nicole": "cd2191ab31b914ed7b318416b0e4440fdf392ddad9106a060819aa600a64f59a",
  "af_sarah": "4409fbc125afabacc615d94db5398d847006a737b0247d6892b7a9a0007a2f0a",
  "am_adam": "162b035ed91cfc48b6046982184c645f72edcdd1b82843347f605d7bf7b15716",
  "am_michael": "1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1",
  "bf_emma": "669fe0647f9dd04fcab92f1439a40eeb4c8b4ab1f82e4996fe3d918ce4a63b73",
  "bm_george": "c4b235a4c1f2cd3b939fed08b899ce9385638b763f7b73a59616c4fc9bd6c9bc",
]

enum VoicePackError: Error {
  case archiveMalformed
  case downloadFailed
  case integrityCheckFailed
}

func installVoicePackIfNeeded(_ voice: String) async throws {
  guard voice != defaultVoiceId else { return }
  guard let expectedHash = expectedVoiceHashes[voice] else { throw HelperError.invalidVoice }

  let repoDirectory = try await KokoroAneResourceDownloader.ensureModels()
  let destination = repoDirectory.appendingPathComponent("\(voice).bin")
  if let existing = try? Data(contentsOf: destination), sha256(existing) == expectedHash {
    return
  }

  let url = URL(
    string:
      "https://huggingface.co/hexgrad/Kokoro-82M/resolve/\(upstreamRevision)/voices/\(voice).pt"
  )!
  let (archive, response) = try await URLSession.shared.data(from: url)
  guard let http = response as? HTTPURLResponse,
    http.statusCode == 200,
    archive.count < 1_000_000
  else {
    throw VoicePackError.downloadFailed
  }
  let voicePack = try extractStoredVoicePack(from: archive)
  guard voicePack.count == 510 * 256 * MemoryLayout<Float>.size,
    sha256(voicePack) == expectedHash
  else {
    throw VoicePackError.integrityCheckFailed
  }
  try voicePack.write(to: destination, options: .atomic)
}

func extractStoredVoicePack(from archive: Data) throws -> Data {
  guard let end = findEndOfCentralDirectory(in: archive) else {
    throw VoicePackError.archiveMalformed
  }
  let entryCount = try archive.uint16(at: end + 10)
  var cursor = try archive.uint32(at: end + 16)

  for _ in 0..<entryCount {
    guard try archive.uint32(at: cursor) == 0x0201_4b50 else {
      throw VoicePackError.archiveMalformed
    }
    let compression = try archive.uint16(at: cursor + 10)
    let compressedSize = try archive.uint32(at: cursor + 20)
    let uncompressedSize = try archive.uint32(at: cursor + 24)
    let nameLength = try archive.uint16(at: cursor + 28)
    let extraLength = try archive.uint16(at: cursor + 30)
    let commentLength = try archive.uint16(at: cursor + 32)
    let localHeader = try archive.uint32(at: cursor + 42)
    let nameStart = cursor + 46
    let nameEnd = nameStart + nameLength
    guard nameEnd <= archive.count,
      let name = String(data: archive.subdata(in: nameStart..<nameEnd), encoding: .utf8)
    else {
      throw VoicePackError.archiveMalformed
    }

    if name.hasSuffix("/data/0") {
      guard compression == 0,
        compressedSize == uncompressedSize,
        try archive.uint32(at: localHeader) == 0x0403_4b50
      else {
        throw VoicePackError.archiveMalformed
      }
      let localNameLength = try archive.uint16(at: localHeader + 26)
      let localExtraLength = try archive.uint16(at: localHeader + 28)
      let dataStart = localHeader + 30 + localNameLength + localExtraLength
      let dataEnd = dataStart + compressedSize
      guard dataEnd <= archive.count else { throw VoicePackError.archiveMalformed }
      return archive.subdata(in: dataStart..<dataEnd)
    }
    cursor = nameEnd + extraLength + commentLength
  }
  throw VoicePackError.archiveMalformed
}

private func findEndOfCentralDirectory(in data: Data) -> Int? {
  guard data.count >= 22 else { return nil }
  let lowerBound = max(0, data.count - 65_557)
  for offset in stride(from: data.count - 22, through: lowerBound, by: -1) {
    if (try? data.uint32(at: offset)) == 0x0605_4b50 { return offset }
  }
  return nil
}

private func sha256(_ data: Data) -> String {
  SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

extension Data {
  fileprivate func uint16(at offset: Int) throws -> Int {
    guard offset >= 0, offset + 2 <= count else { throw VoicePackError.archiveMalformed }
    return Int(self[offset]) | Int(self[offset + 1]) << 8
  }

  fileprivate func uint32(at offset: Int) throws -> Int {
    guard offset >= 0, offset + 4 <= count else { throw VoicePackError.archiveMalformed }
    return Int(self[offset])
      | Int(self[offset + 1]) << 8
      | Int(self[offset + 2]) << 16
      | Int(self[offset + 3]) << 24
  }
}
