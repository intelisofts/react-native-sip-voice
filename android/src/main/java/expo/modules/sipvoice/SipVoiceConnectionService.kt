package expo.modules.sipvoice

import android.os.Build
import android.telecom.CallAudioState
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import androidx.annotation.RequiresApi

@RequiresApi(Build.VERSION_CODES.O)
class SipVoiceConnectionService : ConnectionService() {

  override fun onCreateOutgoingConnection(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest
  ): Connection {
    SipVoiceCallManager.init(applicationContext)
    val callId = request.extras.getString(SipVoiceCallManager.EXTRA_CALL_ID)
      ?: request.extras.getBundle(TelecomManager.EXTRA_OUTGOING_CALL_EXTRAS)?.getString(SipVoiceCallManager.EXTRA_CALL_ID)
      ?: return Connection.createFailedConnection(DisconnectCause(DisconnectCause.ERROR, "Missing call id"))
    val record = SipVoiceCallManager.calls[callId]

    val connection = SipVoiceConnection(callId).apply {
      setAddress(request.address, TelecomManager.PRESENTATION_ALLOWED)
      setCallerDisplayName(record?.displayName ?: "", TelecomManager.PRESENTATION_ALLOWED)
      setDialing()
    }
    SipVoiceCallManager.connections[callId] = connection
    SipVoiceCallManager.emit("startCall", mapOf("callId" to callId))
    return connection
  }

  override fun onCreateOutgoingConnectionFailed(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest?
  ) {
    // Telecom refused (e.g. an emergency call is active). The SIP call carries on without system integration.
  }

  override fun onCreateIncomingConnection(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest
  ): Connection {
    SipVoiceCallManager.init(applicationContext)
    val extras = request.extras.getBundle(TelecomManager.EXTRA_INCOMING_CALL_EXTRAS) ?: request.extras
    val callId = extras.getString(SipVoiceCallManager.EXTRA_CALL_ID)
      ?: return Connection.createFailedConnection(DisconnectCause(DisconnectCause.ERROR, "Missing call id"))
    val displayName = extras.getString(SipVoiceCallManager.EXTRA_DISPLAY_NAME) ?: ""

    val connection = SipVoiceConnection(callId).apply {
      setAddress(request.address, TelecomManager.PRESENTATION_ALLOWED)
      setCallerDisplayName(displayName, TelecomManager.PRESENTATION_ALLOWED)
      setRinging()
    }
    SipVoiceCallManager.connections[callId] = connection
    return connection
  }

  override fun onCreateIncomingConnectionFailed(
    connectionManagerPhoneAccount: PhoneAccountHandle?,
    request: ConnectionRequest?
  ) {
    val extras = request?.extras?.getBundle(TelecomManager.EXTRA_INCOMING_CALL_EXTRAS)
    extras?.getString(SipVoiceCallManager.EXTRA_CALL_ID)?.let { SipVoiceCallManager.onSystemEnd(it) }
  }
}

@RequiresApi(Build.VERSION_CODES.O)
class SipVoiceConnection(val callId: String) : Connection() {
  private var lastAudioState: CallAudioState? = null

  init {
    connectionProperties = PROPERTY_SELF_MANAGED
    audioModeIsVoip = true
    connectionCapabilities =
      if (SipVoiceCallManager.config.supportsHolding) CAPABILITY_MUTE or CAPABILITY_SUPPORT_HOLD or CAPABILITY_HOLD
      else CAPABILITY_MUTE
  }

  fun callAudioStateCompat(): CallAudioState? = lastAudioState

  override fun onShowIncomingCallUi() {
    SipVoiceCallManager.calls[callId]?.let { SipVoiceNotifications.showIncoming(SipVoiceCallManager.appContextOrNull() ?: return, it) }
  }

  override fun onAnswer() {
    setActive()
    SipVoiceCallManager.onSystemAnswer(callId)
  }

  override fun onAnswer(videoState: Int) = onAnswer()

  override fun onReject() = SipVoiceCallManager.onSystemEnd(callId)

  override fun onDisconnect() = SipVoiceCallManager.onSystemEnd(callId)

  override fun onAbort() = SipVoiceCallManager.onSystemEnd(callId)

  override fun onHold() {
    if (!SipVoiceCallManager.config.supportsHolding) return
    setOnHold()
    SipVoiceCallManager.calls[callId]?.held = true
    SipVoiceCallManager.emit("setHeld", mapOf("callId" to callId, "held" to true))
  }

  override fun onUnhold() {
    if (!SipVoiceCallManager.config.supportsHolding) return
    setActive()
    SipVoiceCallManager.calls[callId]?.held = false
    SipVoiceCallManager.emit("setHeld", mapOf("callId" to callId, "held" to false))
  }

  override fun onPlayDtmfTone(c: Char) {
    SipVoiceCallManager.emit("playDTMF", mapOf("callId" to callId, "digits" to c.toString()))
  }

  @Deprecated("Deprecated in API 34")
  override fun onCallAudioStateChanged(state: CallAudioState) {
    lastAudioState = state
    val record = SipVoiceCallManager.calls[callId]
    if (record != null && record.muted != state.isMuted) {
      record.muted = state.isMuted
      SipVoiceCallManager.emit("setMuted", mapOf("callId" to callId, "muted" to state.isMuted))
    }
    SipVoiceCallManager.emit("audioRouteChanged", SipVoiceCallManager.audioRouteSnapshot(state))
  }
}
