package expo.modules.sipvoice

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Keeps the process (microphone + WebSocket) alive while a call is in progress and shows the
 * ongoing-call notification, which is the "background call screen" on Android.
 */
class SipVoiceForegroundService : Service() {

  companion object {
    private const val TAG = "SipVoiceFgs"
    private const val ACTION_START = "expo.modules.sipvoice.START"
    private const val ACTION_UPDATE = "expo.modules.sipvoice.UPDATE"
    private const val EXTRA_CALL_ID = "callId"

    fun start(context: Context, callId: String) {
      val intent = Intent(context, SipVoiceForegroundService::class.java)
        .setAction(ACTION_START).putExtra(EXTRA_CALL_ID, callId)
      try {
        ContextCompat.startForegroundService(context, intent)
      } catch (e: Exception) {
        // e.g. ForegroundServiceStartNotAllowedException when started from the background.
        Log.w(TAG, "Could not start foreground service", e)
      }
    }

    fun update(context: Context, callId: String) {
      val intent = Intent(context, SipVoiceForegroundService::class.java)
        .setAction(ACTION_UPDATE).putExtra(EXTRA_CALL_ID, callId)
      try {
        context.startService(intent)
      } catch (e: Exception) {
        Log.w(TAG, "Could not update foreground service", e)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, SipVoiceForegroundService::class.java))
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    SipVoiceCallManager.init(applicationContext)
    val callId = intent?.getStringExtra(EXTRA_CALL_ID)
    val record = callId?.let { SipVoiceCallManager.calls[it] }
    if (record == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    val notification = SipVoiceNotifications.buildOngoing(this, record)
    try {
      val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        var t = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        if (SipVoiceCallManager.connections.containsKey(record.callId)) {
          t = t or ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
        }
        t
      } else 0
      ServiceCompat.startForeground(this, SipVoiceNotifications.ONGOING_ID, notification, type)
    } catch (e: Exception) {
      Log.w(TAG, "startForeground failed", e)
      stopSelf()
    }
    return START_NOT_STICKY
  }
}
