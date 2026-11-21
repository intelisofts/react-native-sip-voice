package expo.modules.sipvoice

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Receives expo-callkit-telecom's call-event broadcast, which it sends only for events no JS can receive: the app
 * was closed, so the call was shown natively from the push and no React context is running.
 * (https://expo-callkit-telecom.mfairley.com/platform-notes, "Call ended while the app is killed")
 *
 * Declining such a call happens with no JS to tell the backend, so the caller would ring on until the call times
 * out. The push carries `metadata.declineUrl` (a short-lived, single-call link); this posts to it.
 */
class SipVoiceCallEventReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.getStringExtra("eventName") != "onCallEnded") return
    val url = declineUrl(intent.getStringExtra("payload")) ?: return
    val pending = goAsync()
    Thread {
      try {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.connectTimeout = 5_000
        connection.readTimeout = 5_000
        connection.doOutput = true
        connection.outputStream.close() // empty body
        Log.i(TAG, "Declined while closed: backend answered ${connection.responseCode}")
        connection.disconnect()
      } catch (e: Exception) {
        Log.w(TAG, "Could not tell the backend about the decline", e)
      } finally {
        pending.finish()
      }
    }.start()
  }

  companion object {
    private const val TAG = "SipVoice"

    /** The decline link of an incoming call that ended without being answered, or null. */
    internal fun declineUrl(payload: String?): String? {
      val session = runCatching { JSONObject(payload ?: return null).getJSONObject("session") }.getOrNull() ?: return null
      if (session.optString("origin") != "incoming" || session.has("connectedAt")) return null
      val url = session.optJSONObject("incomingCallEvent")?.optJSONObject("metadata")?.optString("declineUrl")
      return url?.takeIf { it.startsWith("https://") }
    }
  }
}
