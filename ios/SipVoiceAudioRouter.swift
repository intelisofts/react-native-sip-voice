import AVFoundation
import Foundation

/// Maps AVAudioSession routes to the JS `AudioRoute` strings: earpiece | speaker | bluetooth | headset.
enum SipVoiceAudioRouter {
  private static var observer: NSObjectProtocol?

  static func startObserving(_ onChange: @escaping ([String: Any]) -> Void) {
    guard observer == nil else { return }
    observer = NotificationCenter.default.addObserver(
      forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
    ) { _ in
      onChange(snapshot())
    }
  }

  static func snapshot() -> [String: Any] {
    return ["route": currentRoute(), "available": availableRoutes()]
  }

  static func currentRoute() -> String {
    let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
    for output in outputs {
      switch output.portType {
      case .builtInSpeaker: return "speaker"
      case .bluetoothHFP, .bluetoothA2DP, .bluetoothLE, .carAudio: return "bluetooth"
      case .headphones, .usbAudio, .lineOut: return "headset"
      default: continue
      }
    }
    return "earpiece"
  }

  static func availableRoutes() -> [String] {
    var routes = ["earpiece", "speaker"]
    let inputs = AVAudioSession.sharedInstance().availableInputs ?? []
    if inputs.contains(where: { [.bluetoothHFP, .bluetoothLE, .carAudio].contains($0.portType) }) {
      routes.append("bluetooth")
    }
    if inputs.contains(where: { $0.portType == .headsetMic || $0.portType == .usbAudio }) {
      routes.append("headset")
    }
    return routes
  }

  static func setRoute(_ route: String) throws {
    let session = AVAudioSession.sharedInstance()
    let inputs = session.availableInputs ?? []
    switch route {
    case "speaker":
      try session.overrideOutputAudioPort(.speaker)
    case "bluetooth":
      try session.overrideOutputAudioPort(.none)
      if let bt = inputs.first(where: { [.bluetoothHFP, .bluetoothLE, .carAudio].contains($0.portType) }) {
        try session.setPreferredInput(bt)
      }
    case "headset":
      try session.overrideOutputAudioPort(.none)
      if let wired = inputs.first(where: { $0.portType == .headsetMic || $0.portType == .usbAudio }) {
        try session.setPreferredInput(wired)
      }
    default:
      try session.overrideOutputAudioPort(.none)
      if let mic = inputs.first(where: { $0.portType == .builtInMic }) {
        try session.setPreferredInput(mic)
      }
    }
  }
}
