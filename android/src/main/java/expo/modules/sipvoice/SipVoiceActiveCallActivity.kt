package expo.modules.sipvoice

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Native in-call screen, opened the moment a call is answered from the incoming call screen or notification
 * (WhatsApp-style: no wait for the app to load). The app runs behind it and carries the call (SIP and audio);
 * this screen shows its state and sends Mute, Speaker and End to it. When the call ends it shows "Call ended"
 * briefly and closes, leaving the app's own post-call screen.
 */
class SipVoiceActiveCallActivity : Activity() {
  private var callId: String? = null
  private val ui = Handler(Looper.getMainLooper())
  private lateinit var status: TextView
  private lateinit var dot: View
  private lateinit var timer: TextView
  private var avatar: CallScreenUi.Avatar? = null
  private lateinit var muteButton: ImageView
  private lateinit var speakerButton: ImageView
  private var proximity: PowerManager.WakeLock? = null
  private var ended = false

  // ponytail: polls the call once a second (also drives the timer); push updates if more state is added.
  private val tick = object : Runnable {
    override fun run() {
      refresh()
      if (!ended) ui.postDelayed(this, 1000)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    SipVoiceCallManager.init(applicationContext)
    CallScreenUi.showOverLockScreen(this)
    callId = intent.getStringExtra(EXTRA_CALL_ID)
    val record = callId?.let { SipVoiceCallManager.calls[it] }
    if (record == null) return finish()
    setContentView(buildView(record))
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    val id = intent.getStringExtra(EXTRA_CALL_ID) ?: return
    val record = SipVoiceCallManager.calls[id] ?: return
    callId = id
    ended = false
    setContentView(buildView(record))
  }

  override fun onResume() {
    super.onResume()
    ui.removeCallbacks(tick)
    ui.post(tick)
  }

  override fun onPause() {
    ui.removeCallbacks(tick)
    super.onPause()
  }

  override fun onDestroy() {
    avatar?.stop()
    ui.removeCallbacksAndMessages(null)
    setProximity(false)
    super.onDestroy()
  }

  private fun refresh() {
    val id = callId ?: return
    val record = SipVoiceCallManager.calls[id]
    if (record == null) {
      if (!ended) {
        ended = true
        status.text = "Call ended"
        status.setTextColor(Color.parseColor(CallScreenUi.TEXT))
        dot.visibility = View.GONE
        avatar?.stop()
        setProximity(false)
        ui.postDelayed({ finish() }, 1200)
      }
      return
    }
    val connectedAt = record.connectedAt
    status.text = when {
      record.state == CallState.HELD -> "On hold"
      connectedAt != null -> "Connected"
      else -> "Connecting…"
    }
    status.setTextColor(Color.parseColor(when {
      record.state == CallState.HELD -> CallScreenUi.HELD
      connectedAt != null -> CallScreenUi.CONNECTED
      else -> CallScreenUi.TEXT
    }))
    dot.visibility = if (connectedAt != null && record.state != CallState.HELD) View.VISIBLE else View.GONE
    timer.visibility = if (connectedAt != null) View.VISIBLE else View.GONE
    if (connectedAt != null) {
      timer.text = formatDuration(System.currentTimeMillis() - connectedAt)
      avatar?.stop()
    }
    CallScreenUi.setToggled(muteButton, record.muted)
    muteButton.setImageResource(if (record.muted) R.drawable.sipvoice_ic_mic_off else R.drawable.sipvoice_ic_mic)
    val speaker = SipVoiceCallManager.audioRouteSnapshot()["route"] == "speaker"
    CallScreenUi.setToggled(speakerButton, speaker)
    setProximity(!speaker) // screen off at the ear, like the phone app (not on speaker)
  }

  /** Same layout as the app's ActiveCallScreen: avatar, name, number, status and timer; controls on a frosted panel. */
  private fun buildView(record: CallRecord): View {
    val (frame, root) = CallScreenUi.screen(this)
    val name = CallScreenUi.displayName(record)
    avatar?.stop()
    avatar = CallScreenUi.Avatar(this, name, pulsing = record.connectedAt == null).also { root.addView(it.view, it.params()) }
    root.addView(CallScreenUi.text(this, name, 27f, CallScreenUi.TEXT, bold = true))
    if (record.displayName.isNotBlank() && record.handle != name) {
      root.addView(CallScreenUi.text(this, record.handle, 16f, CallScreenUi.TEXT).apply {
        setPadding(0, px(4), 0, 0)
      })
    }
    dot = View(this).apply {
      background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor(CallScreenUi.CONNECTED)) }
      visibility = View.GONE
    }
    status = CallScreenUi.text(this, "Connecting…", 14f, CallScreenUi.TEXT, bold = true)
    val phase = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      addView(dot, LinearLayout.LayoutParams(px(10), px(10)).apply {
        marginEnd = px(8)
      })
      addView(status)
    }
    root.addView(phase, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
      topMargin = px(12)
    })
    timer = CallScreenUi.text(this, "", 28f, CallScreenUi.TEXT, bold = true).apply { visibility = View.GONE }
    root.addView(timer)
    val (space, spaceParams) = CallScreenUi.spacer(this)
    root.addView(space, spaceParams)

    val (speaker, speakerCircle) = CallScreenUi.control(this, "Speaker", R.drawable.sipvoice_ic_speaker) { toggleSpeaker() }
    val (mute, muteCircle) = CallScreenUi.control(this, "Mute", R.drawable.sipvoice_ic_mic) { toggleMute() }
    muteButton = muteCircle
    speakerButton = speakerCircle
    val panel = CallScreenUi.panel(this)
    panel.addView(CallScreenUi.row(this, speaker, mute), LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    val (end, _) = CallScreenUi.roundButton(this, "End", CallScreenUi.RED, R.drawable.sipvoice_ic_call, 58,
      rotation = 135f) { endCall() }
    panel.addView(CallScreenUi.row(this, end), LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
      topMargin = px(16)
    })
    root.addView(panel, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    return frame
  }

  private fun toggleMute() {
    val id = callId ?: return
    val record = SipVoiceCallManager.calls[id] ?: return
    SipVoiceCallManager.muteFromSystem(id, !record.muted)
    refresh()
  }

  private fun toggleSpeaker() {
    val speaker = SipVoiceCallManager.audioRouteSnapshot()["route"] == "speaker"
    SipVoiceCallManager.setAudioRoute(if (speaker) "earpiece" else "speaker")
    ui.postDelayed({ refresh() }, 300) // the route change is applied asynchronously
  }

  private fun endCall() {
    callId?.let { SipVoiceCallManager.onSystemEnd(it) }
    refresh()
  }

  @Suppress("WakelockTimeout") // released when the call ends or the screen closes
  private fun setProximity(on: Boolean) {
    if (on && proximity == null) {
      val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
      if (!pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) return
      proximity = pm.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "sipvoice:call").apply { acquire() }
    } else if (!on) {
      proximity?.let { if (it.isHeld) it.release() }
      proximity = null
    }
  }

  private fun formatDuration(ms: Long): String {
    val s = ms / 1000
    return if (s >= 3600) "%d:%02d:%02d".format(s / 3600, s / 60 % 60, s % 60) else "%02d:%02d".format(s / 60, s % 60)
  }

  private fun px(dp: Int) = CallScreenUi.dp(this, dp)

  companion object {
    const val EXTRA_CALL_ID = "expo.modules.sipvoice.ACTIVE_CALL_ID"

    fun intent(context: Context, callId: String): Intent =
      Intent(context, SipVoiceActiveCallActivity::class.java)
        .putExtra(EXTRA_CALL_ID, callId)
        .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
  }
}
