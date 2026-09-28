package expo.modules.sipvoice

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
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
import androidx.core.content.ContextCompat
import java.util.concurrent.ConcurrentHashMap

data class SipVoiceConfig(
  val appName: String? = null,
  val channelName: String? = null,
  val notificationIcon: String? = null,
  val useConnectionService: Boolean = true,
  // Off by default: hold needs SBC support for re-INVITE (sendonly/recvonly).
  val supportsHolding: Boolean = false
)

data class CallRecord(
  val callId: String,
  var handle: String,
  var displayName: String,
  val outgoing: Boolean,
  var connectedAt: Long? = null,
  var muted: Boolean = false,
  var held: Boolean = false
)

/**
 * Process-wide call state for Android. Uses a self-managed ConnectionService (API 26+) so the OS
 * treats our VoIP call like a phone call (audio focus, Bluetooth/car routing, no interruption by
 * other apps), plus a foreground service whose CallStyle notification is the background call UI.
 */
object SipVoiceCallManager {
  private const val TAG = "SipVoice"
  private const val ACCOUNT_ID = "SipVoiceAccount"
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
    if (!::appContext.isInitialized) appContext = context.applicationContext
  }

  fun appContextOrNull(): Context? = if (::appContext.isInitialized) appContext else null

  fun emit(name: String, body: Map<String, Any?>) {
    main.post { eventSink?.invoke(name, body) }
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
    connections[callId]?.setDialing()
    SipVoiceForegroundService.update(appContext, callId)
  }

  fun reportConnected(callId: String) {
    val record = calls[callId] ?: return
    record.connectedAt = System.currentTimeMillis()
    connections[callId]?.setActive()
    SipVoiceForegroundService.update(appContext, callId)
    emit("audioSessionActivated", emptyMap())
  }

  // ---- Incoming -------------------------------------------------------------

  fun reportIncomingCall(callId: String, handle: String, displayName: String, extras: Bundle) {
    if (calls.containsKey(callId)) return
    calls[callId] = CallRecord(callId, handle, displayName, outgoing = false)
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

  // ---- Common ---------------------------------------------------------------

  /** reason: local | remoteEnded | failed | unanswered | answeredElsewhere | declinedElsewhere */
  fun reportEnded(callId: String, reason: String) {
    calls.remove(callId) ?: return
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
    SipVoiceNotifications.cancelIncoming(appContext, callId)
    if (calls.isEmpty()) {
      SipVoiceForegroundService.stop(appContext)
      exitCommunicationMode()
      emit("audioSessionDeactivated", emptyMap())
    } else {
      calls.keys.firstOrNull()?.let { SipVoiceForegroundService.update(appContext, it) }
    }
  }

  /** User action from the OS (notification hang-up, Bluetooth, car, wearable). */
  fun onSystemEnd(callId: String) {
    if (calls.containsKey(callId)) {
      emit("endCall", mapOf("callId" to callId))
      reportEnded(callId, "local")
    }
  }

  fun onSystemAnswer(callId: String) {
    SipVoiceNotifications.cancelIncoming(appContext, callId)
    SipVoiceForegroundService.start(appContext, callId)
    emit("answerCall", mapOf("callId" to callId))
  }

  fun setMuted(callId: String, muted: Boolean) {
    calls[callId]?.muted = muted
    if (connections[callId] == null) audioManager.isMicrophoneMute = muted
  }

  fun setHeld(callId: String, held: Boolean) {
    val record = calls[callId] ?: return
    if (record.held == held) return
    record.held = held
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
