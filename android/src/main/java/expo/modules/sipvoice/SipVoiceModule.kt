package expo.modules.sipvoice

import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
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
      "pushIncomingCall",
      "callStateChanged"
    )

    OnCreate {
      SipVoiceCallManager.init(context.applicationContext)
      SipVoiceCallManager.eventSink = { name, body -> sendEvent(name, body) }
      // The app was opened by hand: its activity was up before the manager was, so the manager missed it.
      appContext.currentActivity?.let { SipVoiceCallManager.trackOnMain(it) }
    }

    OnDestroy {
      SipVoiceCallManager.eventSink = null
      SipVoiceCallManager.stopRingback()
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

    Function("startRingback") { callId: String ->
      SipVoiceCallManager.startRingback(callId)
    }

    Function("stopRingback") {
      SipVoiceCallManager.stopRingback()
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

    AsyncFunction("getCalls") {
      SipVoiceCallManager.callsSnapshot()
    }

    // Android 14+: without this the incoming call is only a heads-up notification, even on a locked phone.
    Function("canUseFullScreenIntent") {
      Build.VERSION.SDK_INT < 34 ||
        context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
    }

    Function("openFullScreenIntentSettings") {
      if (Build.VERSION.SDK_INT >= 34) {
        openSettings(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + context.packageName)))
      }
    }

    // Some manufacturers delay or drop wake-up pushes for apps under battery optimisation.
    Function("isIgnoringBatteryOptimizations") {
      context.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(context.packageName)
    }

    Function("openBatteryOptimizationSettings") {
      openSettings(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }

    AsyncFunction("getPendingPushCalls") {
      SipVoiceCallManager.takePendingPushCalls()
    }
  }

  private fun openSettings(intent: Intent) {
    val start = intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      context.startActivity(start)
    } catch (_: Exception) {
      // The setting screen does not exist on this phone: fall back to the app's own settings page.
      context.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + context.packageName))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }
  }
}
