package expo.modules.sipvoice

import android.content.Context
import android.content.Intent
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * React Native's Headless JS task for an incoming call (https://reactnative.dev/docs/headless-js-android).
 *
 * React Native pauses JS timers, and with them fetch and the app's startup, while its own activity is not the
 * resumed one. During an incoming call the resumed activity is the native call screen, so a closed app started for
 * the call never got as far as registering with the SBC or answering. A running headless task is React Native's own
 * way to keep JS running then. Started when an incoming call is reported, it also starts React Native if it is not
 * running yet, so the app loads while the phone rings. The JS side ends the task once no incoming call is left
 * (see src/native/incomingCallTask.ts).
 */
class SipVoiceCallTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?) =
    // No timeout (the JS task ends with the call); allowed while the app is in the foreground too.
    HeadlessJsTaskConfig(TASK, Arguments.createMap(), 0, true)

  companion object {
    const val TASK = "SipVoiceIncomingCall"

    fun start(context: Context) {
      try {
        context.startService(Intent(context, SipVoiceCallTaskService::class.java))
      } catch (e: IllegalStateException) {
        // Background start not allowed (no wake-up push, no visible screen): the app starts with the call screen.
        Log.w("SipVoice", "Could not start the incoming-call JS task", e)
      }
    }
  }
}
