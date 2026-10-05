import AVFoundation
import FluidAudio
import Foundation

@main
struct AppTTSHelper {
  static func main() async {
    var requestId: String?
    do {
      let data = FileHandle.standardInput.readDataToEndOfFile()
      guard !data.isEmpty else { throw HelperError.missingInput }
      let request = try JSONDecoder().decode(SpeakRequest.self, from: data)
      requestId = request.id
      let text = try request.validatedText()
      let voice = try request.validatedVoice()

      try await installVoicePackIfNeeded(voice)
      let manager = KokoroAneManager()
      try await manager.initialize(preloadVoices: [voice])
      let wav = try await manager.synthesize(text: text, voice: voice)
      let player = try AVAudioPlayer(data: wav)
      guard player.play() else { throw CocoaError(.fileReadUnknown) }
      while player.isPlaying {
        try await Task.sleep(for: .milliseconds(50))
      }
      try FileHandle.standardOutput.write(
        contentsOf: encodeResponse(
          HelperResponse(id: request.id, status: "completed")
        ))
    } catch {
      try? FileHandle.standardOutput.write(
        contentsOf: encodeResponse(
          HelperResponse(id: requestId, status: "failed")
        ))
      FileHandle.standardError.write(Data("tts helper failed: \(error)\n".utf8))
      Foundation.exit(1)
    }
  }
}
