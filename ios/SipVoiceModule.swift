import ExpoModulesCore

struct NativeCallUIConfigRecord: Record {
  @Field var appName: String?
  @Field var includesCallsInRecents: Bool = true
  @Field var iconTemplateImageName: String?
  @Field var ringtoneSound: String?
  @Field var supportsHolding: Bool = false
  @Field var supportsDTMF: Bool = true
}

public class SipVoiceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SipVoice")

    Events(
      "answerCall",
      "endCall",
      "setMuted",
      "setHeld",
      "playDTMF",
      "startCall",
      "audioSessionActivated",
      "audioSessionDeactivated",
      "audioRouteChanged",
      "voipPushToken",
      "pushIncomingCall"
    )

    OnCreate { [weak self] in
      SipVoiceCallManager.shared.eventSink = { name, body in
        self?.sendEvent(name, body)
      }
    }

    OnDestroy {
      SipVoiceCallManager.shared.eventSink = nil
    }

    AsyncFunction("configure") { (config: NativeCallUIConfigRecord) in
      SipVoiceCallManager.shared.configure(
        appName: config.appName,
        includesCallsInRecents: config.includesCallsInRecents,
        iconTemplateImageName: config.iconTemplateImageName,
        ringtoneSound: config.ringtoneSound,
        supportsHolding: config.supportsHolding,
        supportsDTMF: config.supportsDTMF
      )
    }.runOnQueue(.main)

    AsyncFunction("startOutgoingCall") { (callId: String, handle: String, displayName: String, promise: Promise) in
      SipVoiceCallManager.shared.startOutgoingCall(callId: callId, handle: handle, displayName: displayName) { error in
        if let error = error {
          promise.reject("E_START_CALL", error.localizedDescription)
        } else {
          promise.resolve(nil)
        }
      }
    }.runOnQueue(.main)

    Function("reportOutgoingCallConnecting") { (callId: String) in
      DispatchQueue.main.async { SipVoiceCallManager.shared.reportOutgoingCallConnecting(callId: callId) }
    }

    Function("reportCallConnected") { (callId: String) in
      DispatchQueue.main.async { SipVoiceCallManager.shared.reportCallConnected(callId: callId) }
    }

    AsyncFunction("reportIncomingCall") { (callId: String, handle: String, displayName: String, promise: Promise) in
      SipVoiceCallManager.shared.reportIncomingCall(callId: callId, handle: handle, displayName: displayName) { error in
        if let error = error {
          promise.reject("E_INCOMING_CALL", error.localizedDescription)
        } else {
          promise.resolve(nil)
        }
      }
    }.runOnQueue(.main)

    Function("reportCallEnded") { (callId: String, reason: String) in
      DispatchQueue.main.async { SipVoiceCallManager.shared.reportCallEnded(callId: callId, reason: reason) }
    }

    AsyncFunction("endCall") { (callId: String, promise: Promise) in
      SipVoiceCallManager.shared.endCall(callId: callId) { _ in promise.resolve(nil) }
    }.runOnQueue(.main)

    Function("setMuted") { (callId: String, muted: Bool) in
      DispatchQueue.main.async { SipVoiceCallManager.shared.setMuted(callId: callId, muted: muted) }
    }

    Function("setHeld") { (callId: String, held: Bool) in
      DispatchQueue.main.async { SipVoiceCallManager.shared.setHeld(callId: callId, held: held) }
    }

    Function("updateDisplay") { (callId: String, displayName: String, handle: String) in
      DispatchQueue.main.async { SipVoiceCallManager.shared.updateDisplay(callId: callId, displayName: displayName, handle: handle) }
    }

    AsyncFunction("setAudioRoute") { (route: String) in
      try SipVoiceAudioRouter.setRoute(route)
    }.runOnQueue(.main)

    AsyncFunction("getAudioRoutes") { () -> [String: Any] in
      return SipVoiceAudioRouter.snapshot()
    }.runOnQueue(.main)

    Function("registerVoipPush") {
      DispatchQueue.main.async { SipVoicePushRegistry.shared.register() }
    }

    AsyncFunction("getVoipPushToken") { () -> String? in
      return SipVoicePushRegistry.shared.token
    }

    AsyncFunction("getPendingPushCalls") { () -> [[String: Any]] in
      return SipVoiceCallManager.shared.drainPendingPushCalls()
    }.runOnQueue(.main)
  }
}
