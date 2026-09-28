package expo.modules.sipvoice

import android.os.Bundle
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class AndroidConfigRecord : Record {
  @Field var channelName: String? = null
  @Field var notificationIcon: String? = null
  @Field var useConnectionService: Boolean = true
}

class NativeCallUIConfigRecord : Record {
  @Field var appName: String? = null
  @Field var ringtoneSound: String? = null
  @Field var supportsHolding: Boolean = false
  @Field var android: AndroidConfigRecord? = null
}

class SipVoiceModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext) { "React context unavailable" }

  override fun definition() = ModuleDefinition {
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

    OnCreate {
      SipVoiceCallManager.init(context.applicationContext)
      SipVoiceCallManager.eventSink = { name, body -> sendEvent(name, body) }
    }

    OnDestroy {
      SipVoiceCallManager.eventSink = null
    }

    AsyncFunction("configure") { config: NativeCallUIConfigRecord ->
      SipVoiceCallManager.configure(
        SipVoiceConfig(
          appName = config.appName,
          channelName = config.android?.channelName,
          notificationIcon = config.android?.notificationIcon,
          useConnectionService = config.android?.useConnectionService ?: true,
          supportsHolding = config.supportsHolding
        )
      )
    }

    AsyncFunction("startOutgoingCall") { callId: String, handle: String, displayName: String, promise: Promise ->
      try {
        SipVoiceCallManager.startOutgoingCall(callId, handle, displayName)
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("E_START_CALL", e.message, e)
      }
    }

    Function("reportOutgoingCallConnecting") { callId: String ->
      SipVoiceCallManager.reportRinging(callId)
    }

    Function("reportCallConnected") { callId: String ->
      SipVoiceCallManager.reportConnected(callId)
    }

    AsyncFunction("reportIncomingCall") { callId: String, handle: String, displayName: String, promise: Promise ->
      try {
        SipVoiceCallManager.reportIncomingCall(callId, handle, displayName, Bundle())
        promise.resolve(null)
      } catch (e: Exception) {
        promise.reject("E_INCOMING_CALL", e.message, e)
      }
    }

    Function("reportCallEnded") { callId: String, reason: String ->
      SipVoiceCallManager.reportEnded(callId, reason)
    }

    AsyncFunction("endCall") { callId: String ->
      SipVoiceCallManager.reportEnded(callId, "local")
    }

    Function("setMuted") { callId: String, muted: Boolean ->
      SipVoiceCallManager.setMuted(callId, muted)
    }

    Function("setHeld") { callId: String, held: Boolean ->
      SipVoiceCallManager.setHeld(callId, held)
    }

    Function("updateDisplay") { callId: String, displayName: String, handle: String ->
      SipVoiceCallManager.updateDisplay(callId, displayName, handle)
    }

    AsyncFunction("setAudioRoute") { route: String ->
      SipVoiceCallManager.setAudioRoute(route)
    }

    AsyncFunction("getAudioRoutes") {
      SipVoiceCallManager.audioRouteSnapshot()
    }

    // Android VoIP push is delivered by the app's own FCM handler, which calls reportIncomingCall.
    Function("registerVoipPush") {}

    AsyncFunction("getVoipPushToken") { null as String? }

    AsyncFunction("getPendingPushCalls") {
      emptyList<Map<String, Any>>()
    }
  }
}
