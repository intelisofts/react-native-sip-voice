package expo.modules.sipvoice

import android.app.Activity
import android.app.Application
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.ToneGenerator
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.telecom.CallAudioState
import android.telecom.DisconnectCause
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log
import android.view.WindowManager
import java.lang.ref.WeakReference
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

data class SipVoiceConfig(
  val appName: String? = null,
  val channelName: String? = null,
  val notificationIcon: String? = null,
  val useConnectionService: Boolean = true,
  // Off by default: hold needs SBC support for re-INVITE (sendonly/recvonly).
  val supportsHolding: Boolean = false
)

/** Where a call is. Native owns it, so it is right even while React Native is not running. */
object CallState {
  const val RINGING = "ringing"       // incoming, not answered yet
  const val DIALING = "dialing"       // outgoing, the other side is not ringing yet
  const val REMOTE_RINGING = "remoteRinging"
  const val CONNECTING = "connecting" // answered here, media not up yet
  const val ACTIVE = "active"
  const val HELD = "held"
}

data class CallRecord(
  val callId: String,
  var handle: String,
  var displayName: String,
  val outgoing: Boolean,
  var connectedAt: Long? = null,
  var muted: Boolean = false,
  var held: Boolean = false,
  var state: String = if (outgoing) CallState.DIALING else CallState.RINGING
)

/**
 * Process-wide call state for Android. Uses a self-managed ConnectionService (API 26+) so the OS
 * treats our VoIP call like a phone call (audio focus, Bluetooth/car routing, no interruption by
 * other apps), plus a foreground service whose CallStyle notification is the background call UI.
 */
object SipVoiceCallManager {
  private const val TAG = "SipVoice"
  private const val ACCOUNT_ID = "SipVoiceAccount"
  private const val PUSH_PREFS = "sipvoice_push_calls"
  private const val PUSH_CALLS = "pending"
  private const val PUSH_CALL_TTL_MS = 60_000L
  const val EXTRA_CALL_ID = "expo.modules.sipvoice.CALL_ID"
  const val EXTRA_DISPLAY_NAME = "expo.modules.sipvoice.DISPLAY_NAME"

  private lateinit var appContext: Context
  private val main = Handler(Looper.getMainLooper())
  var config = SipVoiceConfig()
    private set

  var eventSink: ((String, Map<String, Any?>) -> Unit)? = null
  val calls = ConcurrentHashMap<String, CallRecord>()
  val connections = ConcurrentHashMap<String, SipVoiceConnection>()
  private var accountRegistered = false

  fun init(context: Context) {
    if (::appContext.isInitialized) return
    appContext = context.applicationContext
    (appContext as? Application)?.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
      // The app's own activity, not the incoming call screen, is the one that must show over the lock screen.
      override fun onActivityCreated(a: Activity, b: Bundle?) { track(a) }
      override fun onActivityStarted(a: Activity) { track(a) }
      // Also on resume: init can run after the app's activity was created and started (app opened by the user).
      override fun onActivityResumed(a: Activity) {
        if (!track(a)) return
        // The app is up as it is when opened by hand (see startAppUnder): the call screen goes back on top.
        pendingScreen?.let { pendingScreen = null; a.startActivity(it) }
      }

      override fun onActivityPaused(a: Activity) {}
      override fun onActivityStopped(a: Activity) {}
      override fun onActivitySaveInstanceState(a: Activity, b: Bundle) {}
      override fun onActivityDestroyed(a: Activity) {}
    })
  }

  private var activity: WeakReference<Activity>? = null

  fun trackOnMain(a: Activity) = main.post { track(a) }

  /** The app's own activity (not a call screen). Also called by the module for the one already open at startup. */
  fun track(a: Activity): Boolean {
    if (a is SipVoiceIncomingCallActivity || a is SipVoiceActiveCallActivity) return false // these set their own
    if (activity?.get() !== a) {
      activity = WeakReference(a)
      applyLockScreen(a) // now, not posted: a closed app started for a call must show over the lock screen to resume
    }
    return true
  }
  private var pendingScreen: Intent? = null

  /**
   * The app carries the call (SIP, audio), so a native call screen needs it running underneath. When the app's
   * activity is not alive (app closed) this starts it and opens [screen] on top once it has resumed, and returns
   * true. A stack started in one go (startActivities / getActivities) is no substitute: Android only creates its
   * top activity, so the app would not start, register or answer until the user pressed Back.
   */
  fun startAppUnder(context: Context, screen: Intent): Boolean {
    if (activity?.get()?.let { !it.isFinishing && !it.isDestroyed } == true) return false
    val app = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return false
    pendingScreen = screen
    context.startActivity(app.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
    return true
  }

  /** Opens a native call screen over the app, starting the app first when it is closed. */
  fun openCallScreen(context: Context, screen: Intent) {
    if (!startAppUnder(context, screen)) context.startActivity(screen.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  /**
   * While a call is live the app may show over the lock screen and wake the screen, so the incoming-call
   * notification's full-screen intent opens the call screen instead of leaving it behind the keyguard.
   * Cleared once no call is left, so the rest of the app still needs an unlock.
   */
  private fun applyLockScreen() = main.post { activity?.get()?.let(::applyLockScreen) }

  private fun applyLockScreen(a: Activity) {
    val on = calls.isNotEmpty()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      a.setShowWhenLocked(on)
      a.setTurnScreenOn(on)
    } else {
      @Suppress("DEPRECATION")
      val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      if (on) a.window.addFlags(flags) else a.window.clearFlags(flags)
    }
  }

  fun appContextOrNull(): Context? = if (::appContext.isInitialized) appContext else null

  fun emit(name: String, body: Map<String, Any?>) {
    main.post { eventSink?.invoke(name, body) }
  }

  private fun setState(callId: String, state: String) {
    val record = calls[callId] ?: return
    if (record.state == state) return
    record.state = state
    emit("callStateChanged", mapOf("callId" to callId, "state" to state))
  }

  /** Every live call and its state, for the app to catch up after starting (e.g. answered from the lock screen). */
  fun callsSnapshot(): List<Map<String, Any?>> = calls.values.map {
    mapOf(
      "callId" to it.callId, "handle" to it.handle, "displayName" to it.displayName, "outgoing" to it.outgoing,
      "state" to it.state, "connectedAt" to it.connectedAt?.toDouble(), "muted" to it.muted
    )
  }

  private val telecom: TelecomManager?
    get() = ContextCompat.getSystemService(appContext, TelecomManager::class.java)

  private val audioManager: AudioManager
    get() = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private val connectionServiceUsable: Boolean
    get() = config.useConnectionService &&
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      appContext.packageManager.hasSystemFeature(telecomFeature) &&
      ContextCompat.checkSelfPermission(appContext, android.Manifest.permission.MANAGE_OWN_CALLS) ==
      PackageManager.PERMISSION_GRANTED

  private val telecomFeature: String
    get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) PackageManager.FEATURE_TELECOM
            else @Suppress("DEPRECATION") PackageManager.FEATURE_CONNECTION_SERVICE

  val phoneAccountHandle: PhoneAccountHandle by lazy {
    PhoneAccountHandle(ComponentName(appContext, SipVoiceConnectionService::class.java), ACCOUNT_ID)
  }

  fun configure(newConfig: SipVoiceConfig) {
    config = newConfig
    SipVoiceNotifications.ensureChannels(appContext, newConfig)
    if (connectionServiceUsable) registerPhoneAccount()
  }

  private fun registerPhoneAccount() {
    if (accountRegistered || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    try {
      val label = config.appName ?: appContext.applicationInfo.loadLabel(appContext.packageManager).toString()
      val account = PhoneAccount.builder(phoneAccountHandle, label)
        .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
        .setSupportedUriSchemes(listOf(PhoneAccount.SCHEME_TEL, PhoneAccount.SCHEME_SIP))
        .build()
      telecom?.registerPhoneAccount(account)
      accountRegistered = true
    } catch (e: Exception) {
      Log.w(TAG, "PhoneAccount registration failed; falling back to foreground service only", e)
    }
  }

  // ---- Outgoing -------------------------------------------------------------

  fun startOutgoingCall(callId: String, handle: String, displayName: String) {
    calls[callId] = CallRecord(callId, handle, displayName, outgoing = true)
    SipVoiceForegroundService.start(appContext, callId)

    if (connectionServiceUsable && accountRegistered && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      try {
        val callExtras = Bundle().apply {
          putString(EXTRA_CALL_ID, callId)
          putString(EXTRA_DISPLAY_NAME, displayName)
        }
        val extras = Bundle().apply {
          putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, phoneAccountHandle)
          putBundle(TelecomManager.EXTRA_OUTGOING_CALL_EXTRAS, callExtras)
        }
        val uri = if (handle.contains("@")) Uri.fromParts(PhoneAccount.SCHEME_SIP, handle, null)
                  else Uri.fromParts(PhoneAccount.SCHEME_TEL, handle, null)
        telecom?.placeCall(uri, extras)
        return
      } catch (e: SecurityException) {
        Log.w(TAG, "placeCall rejected; continuing without ConnectionService", e)
      } catch (e: Exception) {
        Log.w(TAG, "placeCall failed; continuing without ConnectionService", e)
      }
    }
    // Fallback path: manage audio mode ourselves.
    enterCommunicationMode()
    emit("startCall", mapOf("callId" to callId))
  }

  fun reportRinging(callId: String) {
    setState(callId, CallState.REMOTE_RINGING)
    connections[callId]?.setDialing()
    SipVoiceForegroundService.update(appContext, callId)
  }

  // ---- Ring-back (the caller hears the other phone ringing) ------------------

  private var ringback: ToneGenerator? = null
  private var ringbackCallId: String? = null

  /**
   * Plays the standard ring-back tone on the call audio stream, like the phone's own dialler. Played natively
   * because app audio (media stream) is paused or silenced once the call has taken the audio over.
   */
  fun startRingback(callId: String) = main.post {
    if (ringbackCallId == callId && ringback != null) return@post
    stopRingbackNow()
    if (calls[callId]?.connectedAt != null) return@post
    try {
      ringback = ToneGenerator(AudioManager.STREAM_VOICE_CALL, 80).apply { startTone(ToneGenerator.TONE_SUP_RINGTONE) }
      ringbackCallId = callId
    } catch (e: RuntimeException) {
      Log.w(TAG, "Ring-back tone unavailable", e)
    }
  }

  fun stopRingback() = main.post { stopRingbackNow() }

  private fun stopRingbackNow() {
    ringback?.let {
      try { it.stopTone(); it.release() } catch (_: RuntimeException) {}
    }
    ringback = null
    ringbackCallId = null
  }

  fun reportConnected(callId: String) {
    val record = calls[callId] ?: return
    stopRingback()
    record.connectedAt = System.currentTimeMillis()
    setState(callId, if (record.held) CallState.HELD else CallState.ACTIVE)
    SipVoiceNotifications.cancelIncoming(appContext, callId) // stop ringing however the call was answered
    SipVoiceIncomingCallActivity.close(callId)
    connections[callId]?.setActive()
    SipVoiceForegroundService.update(appContext, callId)
    emit("audioSessionActivated", emptyMap())
  }

  // ---- Incoming -------------------------------------------------------------

  fun reportIncomingCall(callId: String, handle: String, displayName: String, extras: Bundle) {
    if (calls.containsKey(callId)) return
    calls[callId] = CallRecord(callId, handle, displayName, outgoing = false)
    applyLockScreen()
    SipVoiceCallTaskService.start(appContext) // keeps the app's JS running while this call is live
    if (connectionServiceUsable && accountRegistered && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      try {
        val bundle = Bundle(extras).apply {
          putString(EXTRA_CALL_ID, callId)
          putString(EXTRA_DISPLAY_NAME, displayName)
          putParcelable(TelecomManager.EXTRA_INCOMING_CALL_ADDRESS, Uri.fromParts(PhoneAccount.SCHEME_TEL, handle, null))
        }
        val incomingExtras = Bundle().apply { putBundle(TelecomManager.EXTRA_INCOMING_CALL_EXTRAS, bundle) }
        telecom?.addNewIncomingCall(phoneAccountHandle, incomingExtras)
        return
      } catch (e: Exception) {
        Log.w(TAG, "addNewIncomingCall failed; showing notification directly", e)
      }
    }
    SipVoiceNotifications.showIncoming(appContext, calls[callId]!!)
  }

  fun handlePushMessage(context: Context, data: Map<String, String>) {
    init(context.applicationContext)
    when (data["type"]) {
      "incoming_call" -> {
        val callId = data["call_uuid"]?.takeIf(String::isNotBlank)
          ?: data["call_id"]?.takeIf(String::isNotBlank)
          ?: return
        val callerNumber = data["caller_number"]?.takeIf(String::isNotBlank) ?: return
        val payload = data.mapValues { it.value as Any? }

        if (eventSink == null) savePendingPush(callId, payload)

        val appName = appContext.applicationInfo.loadLabel(appContext.packageManager).toString()
        configure(config.copy(appName = appName))
        reportIncomingCall(callId, callerNumber, data["caller_name"].orEmpty(), Bundle())
        emit("pushIncomingCall", mapOf("callId" to callId, "payload" to payload))
      }
      "call_cancelled", "call_ended" -> {
        val callId = data["call_uuid"]?.takeIf(String::isNotBlank)
          ?: data["call_id"]?.takeIf(String::isNotBlank)
          ?: return
        removePendingPush(callId)
        // Same as iOS: also tell JS, so the SIP call and the app's call screen end, not only the system UI.
        if (calls.containsKey(callId)) emit("endCall", mapOf("callId" to callId))
        reportEnded(callId, if (data["type"] == "call_ended") "remoteEnded" else "unanswered")
      }
    }
  }

  fun takePendingPushCalls(): List<Map<String, Any?>> {
    val prefs = appContext.getSharedPreferences(PUSH_PREFS, Context.MODE_PRIVATE)
    val pending = prefs.getString(PUSH_CALLS, null) ?: return emptyList()
    prefs.edit().remove(PUSH_CALLS).apply()

    val now = System.currentTimeMillis()
    return try {
      val array = JSONArray(pending)
      (0 until array.length()).mapNotNull { index ->
        val item = array.optJSONObject(index) ?: return@mapNotNull null
        if (now - item.optLong("receivedAt") > PUSH_CALL_TTL_MS) return@mapNotNull null
        mapOf(
          "callId" to item.optString("callId"),
          "payload" to jsonObjectMap(item.optJSONObject("payload") ?: JSONObject()),
          "answered" to item.optBoolean("answered"),
          "declined" to item.optBoolean("declined"),
        )
      }
    } catch (e: Exception) {
      Log.w(TAG, "Could not read pending push calls", e)
      emptyList()
    }
  }

  private fun savePendingPush(callId: String, payload: Map<String, Any?>) {
    val prefs = appContext.getSharedPreferences(PUSH_PREFS, Context.MODE_PRIVATE)
    val array = try {
      JSONArray(prefs.getString(PUSH_CALLS, "[]"))
    } catch (_: Exception) {
      JSONArray()
    }
    val updated = JSONArray()
    for (index in 0 until array.length()) {
      val item = array.optJSONObject(index) ?: continue
      if (item.optString("callId") != callId) updated.put(item)
    }
    updated.put(
      JSONObject()
        .put("callId", callId)
        .put("payload", JSONObject(payload))
        .put("receivedAt", System.currentTimeMillis())
        .put("answered", false)
    )
    prefs.edit().putString(PUSH_CALLS, updated.toString()).apply()
  }

  /** Records Answer or Decline on a push call JS has not picked up yet, for it to act on once the INVITE arrives. */
  private fun markPendingPush(callId: String, action: String) {
    val prefs = appContext.getSharedPreferences(PUSH_PREFS, Context.MODE_PRIVATE)
    val array = try {
      JSONArray(prefs.getString(PUSH_CALLS, "[]"))
    } catch (_: Exception) {
      return
    }
    var changed = false
    for (index in 0 until array.length()) {
      val item = array.optJSONObject(index) ?: continue
      if (item.optString("callId") == callId) {
        item.put(action, true)
        changed = true
      }
    }
    if (changed) prefs.edit().putString(PUSH_CALLS, array.toString()).apply()
  }

  private fun removePendingPush(callId: String) {
    val prefs = appContext.getSharedPreferences(PUSH_PREFS, Context.MODE_PRIVATE)
    val array = try {
      JSONArray(prefs.getString(PUSH_CALLS, "[]"))
    } catch (_: Exception) {
      return
    }
    val updated = JSONArray()
    for (index in 0 until array.length()) {
      val item = array.optJSONObject(index) ?: continue
      if (item.optString("callId") != callId) updated.put(item)
    }
    prefs.edit().putString(PUSH_CALLS, updated.toString()).apply()
  }

  private fun jsonObjectMap(json: JSONObject): Map<String, Any?> =
    json.keys().asSequence().associateWith { key ->
      when (val value = json.opt(key)) {
        JSONObject.NULL -> null
        else -> value
      }
    }

  // ---- Common ---------------------------------------------------------------

  /** reason: local | remoteEnded | failed | unanswered | answeredElsewhere | declinedElsewhere */
  fun reportEnded(callId: String, reason: String) {
    val record = calls.remove(callId)
    if (ringbackCallId == callId) stopRingback()
    applyLockScreen()
    if (reason != "local") removePendingPush(callId) // a local end (Decline) is kept for JS, see onSystemEnd
    SipVoiceNotifications.cancelIncoming(appContext, callId)
    SipVoiceIncomingCallActivity.close(callId)
    if (record != null) emit("callStateChanged", mapOf("callId" to callId, "state" to "ended", "reason" to reason))
    if (record == null) return
    connections.remove(callId)?.let { connection ->
      val cause = when (reason) {
        "local" -> DisconnectCause.LOCAL
        "remoteEnded" -> DisconnectCause.REMOTE
        "unanswered" -> DisconnectCause.MISSED
        "answeredElsewhere" -> DisconnectCause.ANSWERED_ELSEWHERE
        "declinedElsewhere" -> DisconnectCause.REJECTED
        else -> DisconnectCause.ERROR
      }
      connection.setDisconnected(DisconnectCause(cause))
      connection.destroy()
    }
    if (calls.isEmpty()) {
      pendingScreen = null // the app was still starting: it opens on its own, with no call screen over it
      SipVoiceForegroundService.stop(appContext)
      exitCommunicationMode()
      emit("audioSessionDeactivated", emptyMap())
    } else {
      calls.keys.firstOrNull()?.let { SipVoiceForegroundService.update(appContext, it) }
    }
  }

  /** User action from the OS (notification hang-up, Bluetooth, car, wearable). */
  fun onSystemEnd(callId: String) {
    // JS not running yet: it still has to reject the INVITE when it arrives, and tell the backend.
    markPendingPush(callId, "declined")
    if (calls.containsKey(callId)) {
      emit("endCall", mapOf("callId" to callId))
      reportEnded(callId, "local")
    }
  }

  fun onSystemAnswer(callId: String) {
    markPendingPush(callId, "answered")
    setState(callId, CallState.CONNECTING)
    SipVoiceNotifications.cancelIncoming(appContext, callId)
    SipVoiceIncomingCallActivity.close(callId)
    SipVoiceForegroundService.start(appContext, callId)
    emit("answerCall", mapOf("callId" to callId))
  }

  /**
   * Answer pressed outside the app (notification, incoming call screen, lock screen): answer, then show the native
   * in-call screen at once. The app is started underneath it in the same task: it carries the call (SIP, audio)
   * and is what Back returns to.
   */
  fun answerFromSystem(context: Context, callId: String) {
    connections[callId]?.setActive()
    onSystemAnswer(callId)
    openCallScreen(context, SipVoiceActiveCallActivity.intent(context, callId))
  }

  /** Mute pressed on the native call screen: the app mutes the call's microphone. */
  fun muteFromSystem(callId: String, muted: Boolean) {
    val record = calls[callId] ?: return
    record.muted = muted
    emit("setMuted", mapOf("callId" to callId, "muted" to muted))
  }

  fun setMuted(callId: String, muted: Boolean) {
    calls[callId]?.muted = muted
    if (connections[callId] == null) audioManager.isMicrophoneMute = muted
  }

  fun setHeld(callId: String, held: Boolean) {
    val record = calls[callId] ?: return
    if (record.held == held) return
    record.held = held
    if (record.connectedAt != null) setState(callId, if (held) CallState.HELD else CallState.ACTIVE)
    connections[callId]?.let { if (held) it.setOnHold() else it.setActive() }
    SipVoiceForegroundService.update(appContext, callId)
  }

  fun updateDisplay(callId: String, displayName: String, handle: String) {
    val record = calls[callId] ?: return
    record.displayName = displayName
    record.handle = handle
    connections[callId]?.setCallerDisplayName(displayName, TelecomManager.PRESENTATION_ALLOWED)
    SipVoiceForegroundService.update(appContext, callId)
  }

  // ---- Audio ----------------------------------------------------------------

  private var savedAudioMode: Int? = null

  private fun enterCommunicationMode() {
    if (savedAudioMode == null) savedAudioMode = audioManager.mode
    audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
  }

  private fun exitCommunicationMode() {
    savedAudioMode?.let { audioManager.mode = it }
    savedAudioMode = null
    audioManager.isMicrophoneMute = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) audioManager.clearCommunicationDevice()
    @Suppress("DEPRECATION")
    audioManager.isSpeakerphoneOn = false
  }

  fun setAudioRoute(route: String) {
    val connection = connections.values.firstOrNull()
    if (connection != null) {
      val target = when (route) {
        "speaker" -> CallAudioState.ROUTE_SPEAKER
        "bluetooth" -> CallAudioState.ROUTE_BLUETOOTH
        "headset" -> CallAudioState.ROUTE_WIRED_HEADSET
        else -> CallAudioState.ROUTE_EARPIECE
      }
      @Suppress("DEPRECATION")
      connection.setAudioRoute(target)
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val wanted = when (route) {
        "speaker" -> listOf(AudioDeviceInfo.TYPE_BUILTIN_SPEAKER)
        "bluetooth" -> listOf(AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_BLE_HEADSET)
        "headset" -> listOf(AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_USB_HEADSET)
        else -> listOf(AudioDeviceInfo.TYPE_BUILTIN_EARPIECE)
      }
      audioManager.availableCommunicationDevices.firstOrNull { it.type in wanted }
        ?.let { audioManager.setCommunicationDevice(it) }
    } else {
      @Suppress("DEPRECATION")
      audioManager.isSpeakerphoneOn = route == "speaker"
    }
    emit("audioRouteChanged", audioRouteSnapshot())
  }

  fun audioRouteSnapshot(connectionState: CallAudioState? = null): Map<String, Any> {
    val state = connectionState ?: connections.values.firstOrNull()?.callAudioStateCompat()
    if (state != null) {
      val available = mutableListOf<String>()
      if (state.supportedRouteMask and CallAudioState.ROUTE_EARPIECE != 0) available += "earpiece"
      if (state.supportedRouteMask and CallAudioState.ROUTE_SPEAKER != 0) available += "speaker"
      if (state.supportedRouteMask and CallAudioState.ROUTE_BLUETOOTH != 0) available += "bluetooth"
      if (state.supportedRouteMask and CallAudioState.ROUTE_WIRED_HEADSET != 0) available += "headset"
      val current = when (state.route) {
        CallAudioState.ROUTE_SPEAKER -> "speaker"
        CallAudioState.ROUTE_BLUETOOTH -> "bluetooth"
        CallAudioState.ROUTE_WIRED_HEADSET -> "headset"
        else -> "earpiece"
      }
      return mapOf("route" to current, "available" to available)
    }
    val available = mutableListOf("earpiece", "speaker")
    var current = "earpiece"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val devices = audioManager.availableCommunicationDevices
      if (devices.any { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || it.type == AudioDeviceInfo.TYPE_BLE_HEADSET }) available += "bluetooth"
      if (devices.any { it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET || it.type == AudioDeviceInfo.TYPE_USB_HEADSET }) available += "headset"
      current = when (audioManager.communicationDevice?.type) {
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_BLE_HEADSET -> "bluetooth"
        AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_USB_HEADSET -> "headset"
        else -> "earpiece"
      }
    } else {
      @Suppress("DEPRECATION")
      if (audioManager.isSpeakerphoneOn) current = "speaker"
    }
    return mapOf("route" to current, "available" to available)
  }
}
