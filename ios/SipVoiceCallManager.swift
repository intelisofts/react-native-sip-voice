import AVFoundation
import CallKit
import Foundation
import UIKit
import WebRTC

/// Owns the CXProvider and bridges CallKit actions to JavaScript.
///
/// Audio: react-native-webrtc is switched to manual audio so WebRTC only starts the audio unit once
/// CallKit has activated the AVAudioSession (`provider(_:didActivate:)`). Starting audio any
/// earlier is the classic cause of one-way/no audio when calls are answered from the lock screen.
public final class SipVoiceCallManager: NSObject {
  public static let shared = SipVoiceCallManager()

  typealias EventSink = (_ name: String, _ body: [String: Any]) -> Void
  var eventSink: EventSink? {
    didSet { flushBufferedEvents() }
  }

  private(set) var provider: CXProvider?
  /// Off by default: hold needs SBC support for re-INVITE (sendonly/recvonly), which many SBCs lack.
  private var supportsHolding = false
  private let controller = CXCallController()

  private struct CallInfo {
    var outgoing: Bool
    var muted = false
    var held = false
  }
  private var calls: [UUID: CallInfo] = [:]
  private var pendingPushCalls: [[String: Any]] = []
  private var bufferedEvents: [(String, [String: Any])] = []

  private override init() {
    super.init()
  }

  // MARK: - Setup

  func configure(
    appName: String?,
    includesCallsInRecents: Bool = true,
    iconTemplateImageName: String? = nil,
    ringtoneSound: String? = nil,
    supportsHolding: Bool = false,
    supportsDTMF: Bool = true
  ) {
    self.supportsHolding = supportsHolding
    // Since iOS 14 CallKit always shows the app's bundle display name; `appName` only applies on Android.
    _ = appName
    let config = CXProviderConfiguration()
    config.supportsVideo = false
    config.maximumCallGroups = supportsHolding ? 2 : 1
    config.maximumCallsPerCallGroup = 1
    config.supportedHandleTypes = [.phoneNumber, .generic]
    config.includesCallsInRecents = includesCallsInRecents
    if let icon = iconTemplateImageName, let image = UIImage(named: icon) {
      config.iconTemplateImageData = image.pngData()
    }
    if let ringtone = ringtoneSound {
      config.ringtoneSound = ringtone
    }

    if let provider = provider {
      provider.configuration = config
    } else {
      let provider = CXProvider(configuration: config)
      provider.setDelegate(self, queue: nil)
      self.provider = provider
    }

    RTCAudioSession.sharedInstance().useManualAudio = true
    RTCAudioSession.sharedInstance().isAudioEnabled = false
    SipVoiceAudioRouter.startObserving { [weak self] snapshot in
      self?.emit("audioRouteChanged", snapshot)
    }
  }

  /// Synchronous default setup, used when a VoIP push wakes a terminated app before JS runs.
  func ensureProvider() {
    if provider == nil { configure(appName: nil) }
  }

  // MARK: - Outgoing

  func startOutgoingCall(callId: String, handle: String, displayName: String, completion: @escaping (Error?) -> Void) {
    ensureProvider()
    guard let uuid = UUID(uuidString: callId) else {
      completion(NSError(domain: "SipVoice", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid call id"]))
      return
    }
    calls[uuid] = CallInfo(outgoing: true)
    let action = CXStartCallAction(call: uuid, handle: Self.makeHandle(handle))
    action.contactIdentifier = displayName
    action.isVideo = false
    controller.request(CXTransaction(action: action)) { [weak self] error in
      if let error = error {
        self?.calls.removeValue(forKey: uuid)
        completion(error)
        return
      }
      let update = CXCallUpdate()
      update.remoteHandle = Self.makeHandle(handle)
      update.localizedCallerName = displayName
      update.hasVideo = false
      update.supportsDTMF = true
      update.supportsHolding = self?.supportsHolding ?? false
      update.supportsGrouping = false
      update.supportsUngrouping = false
      self?.provider?.reportCall(with: uuid, updated: update)
      completion(nil)
    }
  }

  func reportOutgoingCallConnecting(callId: String) {
    guard let uuid = UUID(uuidString: callId) else { return }
    provider?.reportOutgoingCall(with: uuid, startedConnectingAt: Date())
  }

  func reportCallConnected(callId: String) {
    guard let uuid = UUID(uuidString: callId), let info = calls[uuid], info.outgoing else { return }
    provider?.reportOutgoingCall(with: uuid, connectedAt: Date())
  }

  // MARK: - Incoming

  func reportIncomingCall(callId: String, handle: String, displayName: String, completion: @escaping (Error?) -> Void) {
    ensureProvider()
    guard let uuid = UUID(uuidString: callId) else {
      completion(NSError(domain: "SipVoice", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid call id"]))
      return
    }
    if calls[uuid] != nil {
      completion(nil)  // Already reported by the push handler.
      return
    }
    calls[uuid] = CallInfo(outgoing: false)
    provider?.reportNewIncomingCall(with: uuid, update: makeUpdate(handle: handle, name: displayName)) {
      [weak self] error in
      if error != nil { self?.calls.removeValue(forKey: uuid) }
      completion(error)
    }
  }

  /// Called from PushKit. Must report to CallKit before `completion` or iOS terminates the app.
  func reportIncomingPush(payload: [AnyHashable: Any], completion: @escaping () -> Void) {
    ensureProvider()
    let meta = (payload["metadata"] as? [AnyHashable: Any]) ?? payload
    let callerNumber = (meta["caller_number"] as? String) ?? (meta["from"] as? String) ?? "Unknown"
    let callerName = (meta["caller_name"] as? String) ?? callerNumber
    let uuid = (meta["call_uuid"] as? String).flatMap(UUID.init(uuidString:)) ?? UUID()

    var jsonPayload: [String: Any] = [:]
    for (k, v) in meta {
      if let key = k as? String, JSONSerialization.isValidJSONObject([key: v]) { jsonPayload[key] = v }
    }

    calls[uuid] = CallInfo(outgoing: false)
    provider?.reportNewIncomingCall(with: uuid, update: makeUpdate(handle: callerNumber, name: callerName)) {
      [weak self] error in
      guard let self = self else {
        completion()
        return
      }
      if error != nil {
        self.calls.removeValue(forKey: uuid)
      } else {
        let entry: [String: Any] = ["callId": uuid.uuidString.lowercased(), "payload": jsonPayload]
        self.pendingPushCalls.append(entry)
        self.emit("pushIncomingCall", entry)
      }
      completion()
    }
  }

  func drainPendingPushCalls() -> [[String: Any]] {
    let pending = pendingPushCalls
    pendingPushCalls.removeAll()
    return pending
  }

  // MARK: - Common

  func reportCallEnded(callId: String, reason: String) {
    guard let uuid = UUID(uuidString: callId) else { return }
    let r: CXCallEndedReason
    switch reason {
    case "remoteEnded": r = .remoteEnded
    case "unanswered": r = .unanswered
    case "answeredElsewhere": r = .answeredElsewhere
    case "declinedElsewhere": r = .declinedElsewhere
    default: r = .failed
    }
    calls.removeValue(forKey: uuid)
    provider?.reportCall(with: uuid, endedAt: Date(), reason: r)
  }

  func endCall(callId: String, completion: @escaping (Error?) -> Void) {
    guard let uuid = UUID(uuidString: callId), calls[uuid] != nil else {
      completion(nil)
      return
    }
    controller.request(CXTransaction(action: CXEndCallAction(call: uuid))) { [weak self] error in
      if error != nil {
        // CallKit no longer knows the call; make sure it is gone from the system UI.
        self?.reportCallEnded(callId: callId, reason: "remoteEnded")
      }
      completion(error)
    }
  }

  func setMuted(callId: String, muted: Bool) {
    guard let uuid = UUID(uuidString: callId), let info = calls[uuid], info.muted != muted else { return }
    calls[uuid]?.muted = muted
    controller.request(CXTransaction(action: CXSetMutedCallAction(call: uuid, muted: muted))) { _ in }
  }

  func setHeld(callId: String, held: Bool) {
    guard let uuid = UUID(uuidString: callId), let info = calls[uuid], info.held != held else { return }
    calls[uuid]?.held = held
    controller.request(CXTransaction(action: CXSetHeldCallAction(call: uuid, onHold: held))) { _ in }
  }

  func updateDisplay(callId: String, displayName: String, handle: String) {
    guard let uuid = UUID(uuidString: callId) else { return }
    provider?.reportCall(with: uuid, updated: makeUpdate(handle: handle, name: displayName))
  }

  // MARK: - Helpers

  func emit(_ name: String, _ body: [String: Any]) {
    if let sink = eventSink {
      sink(name, body)
    } else if name == "pushIncomingCall" || name == "voipPushToken" {
      // JS not ready yet (cold start from push); replay once the module is created.
      bufferedEvents.append((name, body))
    }
  }

  private func flushBufferedEvents() {
    guard let sink = eventSink, !bufferedEvents.isEmpty else { return }
    let events = bufferedEvents
    bufferedEvents.removeAll()
    events.forEach { sink($0.0, $0.1) }
  }

  private static func makeHandle(_ value: String) -> CXHandle {
    let isNumber = value.range(of: "^[+0-9*#]+$", options: .regularExpression) != nil
    return CXHandle(type: isNumber ? .phoneNumber : .generic, value: value)
  }

  private func makeUpdate(handle: String, name: String) -> CXCallUpdate {
    let update = CXCallUpdate()
    update.remoteHandle = Self.makeHandle(handle)
    update.localizedCallerName = name
    update.hasVideo = false
    update.supportsDTMF = true
    update.supportsHolding = supportsHolding
    update.supportsGrouping = false
    update.supportsUngrouping = false
    return update
  }

  private static func id(_ uuid: UUID) -> String { uuid.uuidString.lowercased() }

  private func configureAudioSession() {
    let session = RTCAudioSession.sharedInstance()
    session.lockForConfiguration()
    defer { session.unlockForConfiguration() }
    do {
      try session.setCategory(AVAudioSession.Category.playAndRecord, with: [.allowBluetoothHFP, .allowBluetoothA2DP])
      try session.setMode(AVAudioSession.Mode.voiceChat)
    } catch {
      NSLog("[SipVoice] Failed to configure audio session: \(error)")
    }
  }
}

// MARK: - CXProviderDelegate

extension SipVoiceCallManager: CXProviderDelegate {
  public func providerDidReset(_ provider: CXProvider) {
    for uuid in calls.keys { emit("endCall", ["callId": Self.id(uuid)]) }
    calls.removeAll()
    RTCAudioSession.sharedInstance().isAudioEnabled = false
  }

  public func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
    configureAudioSession()
    provider.reportOutgoingCall(with: action.callUUID, startedConnectingAt: nil)
    emit("startCall", ["callId": Self.id(action.callUUID)])
    action.fulfill()
  }

  public func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    configureAudioSession()
    emit("answerCall", ["callId": Self.id(action.callUUID)])
    action.fulfill()
  }

  public func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    calls.removeValue(forKey: action.callUUID)
    emit("endCall", ["callId": Self.id(action.callUUID)])
    action.fulfill()
  }

  public func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
    calls[action.callUUID]?.muted = action.isMuted
    emit("setMuted", ["callId": Self.id(action.callUUID), "muted": action.isMuted])
    action.fulfill()
  }

  public func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
    guard supportsHolding else {
      action.fail()
      return
    }
    calls[action.callUUID]?.held = action.isOnHold
    emit("setHeld", ["callId": Self.id(action.callUUID), "held": action.isOnHold])
    action.fulfill()
  }

  public func provider(_ provider: CXProvider, perform action: CXPlayDTMFCallAction) {
    emit("playDTMF", ["callId": Self.id(action.callUUID), "digits": action.digits])
    action.fulfill()
  }

  public func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
    RTCAudioSession.sharedInstance().audioSessionDidActivate(audioSession)
    RTCAudioSession.sharedInstance().isAudioEnabled = true
    emit("audioSessionActivated", [:])
    emit("audioRouteChanged", SipVoiceAudioRouter.snapshot())
  }

  public func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
    RTCAudioSession.sharedInstance().audioSessionDidDeactivate(audioSession)
    RTCAudioSession.sharedInstance().isAudioEnabled = false
    emit("audioSessionDeactivated", [:])
  }
}
