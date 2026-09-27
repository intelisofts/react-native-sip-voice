import ExpoModulesCore
import Foundation
import PushKit

/// Registers for VoIP pushes and hands incoming ones to CallKit.
final class SipVoicePushRegistry: NSObject, PKPushRegistryDelegate {
  static let shared = SipVoicePushRegistry()
  static let tokenDefaultsKey = "SipVoiceVoipPushToken"

  private var registry: PKPushRegistry?

  var token: String? {
    UserDefaults.standard.string(forKey: Self.tokenDefaultsKey)
  }

  func register() {
    guard registry == nil else { return }
    let registry = PKPushRegistry(queue: .main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    self.registry = registry
  }

  func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
    let token = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
    UserDefaults.standard.set(token, forKey: Self.tokenDefaultsKey)
    SipVoiceCallManager.shared.emit("voipPushToken", ["token": token])
  }

  func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
    UserDefaults.standard.removeObject(forKey: Self.tokenDefaultsKey)
  }

  func pushRegistry(
    _ registry: PKPushRegistry, didReceiveIncomingPushWith payload: PKPushPayload, for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    guard type == .voIP else {
      completion()
      return
    }
    SipVoiceCallManager.shared.reportIncomingPush(payload: payload.dictionaryPayload, completion: completion)
  }
}

/// Registers PushKit at launch (required for pushes to wake a terminated app) when
/// `SipVoiceEnableVoipPush` is true in Info.plist; the config plugin sets it via `voipPush: true`.
public class SipVoiceAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    if Bundle.main.object(forInfoDictionaryKey: "SipVoiceEnableVoipPush") as? Bool == true {
      SipVoicePushRegistry.shared.register()
    }
    return true
  }
}
