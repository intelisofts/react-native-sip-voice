package expo.modules.sipvoice

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.LinearLayout
import java.lang.ref.WeakReference

/**
 * Full-screen incoming call screen, the Android counterpart of the CallKit ringing screen. It is opened by the
 * incoming-call notification's full-screen intent (locked or screen-off phone) or by tapping the notification,
 * and is drawn natively from the push, so it appears before React Native has started. The notification keeps
 * ringing until the call is answered, declined or ends; the screen closes itself in each of those cases.
 * Answering opens the native in-call screen straight away (SipVoiceActiveCallActivity).
 */
class SipVoiceIncomingCallActivity : Activity() {
  private var callId: String? = null
  private var avatar: CallScreenUi.Avatar? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    SipVoiceCallManager.init(applicationContext)
    CallScreenUi.showOverLockScreen(this)
    if (!bind(intent)) return
    if (intent.getBooleanExtra(EXTRA_ANSWER, false)) return answer() // the notification's Answer button
    // A closed app must start now, while the phone rings, so it registers and receives the call before Answer.
    // The app is opened first and this screen again on top of it (see SipVoiceCallManager.startAppUnder).
    if (SipVoiceCallManager.startAppUnder(this, intent(this, callId!!))) return finish()
    setContentView(buildView())
  }

  override fun onDestroy() {
    avatar?.stop()
    if (current?.get() === this) current = null
    super.onDestroy()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    if (!bind(intent)) return
    if (intent.getBooleanExtra(EXTRA_ANSWER, false)) answer() else setContentView(buildView())
  }

  /** Takes the call from the intent; closes straight away when it is no longer ringing. */
  private fun bind(intent: Intent?): Boolean {
    val id = intent?.getStringExtra(EXTRA_CALL_ID)
    if (id == null || SipVoiceCallManager.calls[id]?.state != CallState.RINGING) {
      finish()
      return false
    }
    callId = id
    current = WeakReference(this)
    return true
  }

  private fun answer() {
    val id = callId ?: return finish()
    SipVoiceCallManager.answerFromSystem(this, id)
    finish()
  }

  private fun decline() {
    callId?.let { SipVoiceCallManager.onSystemEnd(it) }
    finish()
  }

  /** Same layout as the app's IncomingCallScreen: pulsing avatar, name, caption, Decline and Accept at the bottom. */
  private fun buildView(): View {
    val record = callId?.let { SipVoiceCallManager.calls[it] }
    val name = CallScreenUi.displayName(record)
    val (frame, root) = CallScreenUi.screen(this)
    avatar?.stop()
    avatar = CallScreenUi.Avatar(this, name, pulsing = true).also { root.addView(it.view, it.params()) }
    root.addView(CallScreenUi.text(this, name, 36f, CallScreenUi.TEXT, bold = true))
    root.addView(CallScreenUi.text(this, "Incoming voice call", 18f, CallScreenUi.CAPTION).apply {
      setPadding(0, px(10), 0, 0)
    })
    val (space, spaceParams) = CallScreenUi.spacer(this)
    root.addView(space, spaceParams)

    val (decline, _) = CallScreenUi.roundButton(this, "Decline", CallScreenUi.RED, R.drawable.sipvoice_ic_call, 72,
      rotation = 135f) { decline() }
    val (answer, _) = CallScreenUi.roundButton(this, "Accept", CallScreenUi.GREEN, R.drawable.sipvoice_ic_call, 72) { answer() }
    root.addView(CallScreenUi.row(this, decline, answer), LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    return frame
  }

  private fun px(dp: Int) = CallScreenUi.dp(this, dp)

  companion object {
    const val EXTRA_CALL_ID = "expo.modules.sipvoice.INCOMING_CALL_ID"
    private const val EXTRA_ANSWER = "expo.modules.sipvoice.ANSWER_NOW"
    private var current: WeakReference<SipVoiceIncomingCallActivity>? = null

    /** Opened on top of the app (see SipVoiceNotifications.showIncoming), in the app's task. */
    fun intent(context: Context, callId: String): Intent =
      Intent(context, SipVoiceIncomingCallActivity::class.java)
        .putExtra(EXTRA_CALL_ID, callId)
        .addFlags(Intent.FLAG_ACTIVITY_NO_USER_ACTION or Intent.FLAG_ACTIVITY_SINGLE_TOP)

    /** Answers straight away, without showing the screen, then opens the in-call screen. */
    fun answerIntent(context: Context, callId: String): Intent =
      intent(context, callId).putExtra(EXTRA_ANSWER, true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    /** Closes the screen for this call (answered, declined, cancelled or ended), whichever way it happened. */
    fun close(callId: String) {
      val screen = current?.get() ?: return
      if (screen.callId == callId) screen.runOnUiThread { screen.finish() }
    }
  }
}
