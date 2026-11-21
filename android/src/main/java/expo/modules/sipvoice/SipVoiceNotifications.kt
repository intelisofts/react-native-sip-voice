package expo.modules.sipvoice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person

object SipVoiceNotifications {
  const val ONGOING_ID = 7301
  private const val INCOMING_BASE_ID = 7400
  private const val CHANNEL_ONGOING = "sipvoice_ongoing"
  // A channel's sound can't change after it is created, so the ringing channel has a new id; the old one is removed.
  private const val CHANNEL_INCOMING = "sipvoice_incoming_ring"
  private const val CHANNEL_INCOMING_OLD = "sipvoice_incoming"
  const val ACTION_HANGUP = "expo.modules.sipvoice.HANGUP"
  const val ACTION_ANSWER = "expo.modules.sipvoice.ANSWER"
  const val EXTRA_CALL_ID = "callId"

  fun ensureChannels(context: Context, config: SipVoiceConfig) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = context.getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_ONGOING, config.channelName ?: "Ongoing calls", NotificationManager.IMPORTANCE_LOW)
        .apply { setShowBadge(false) }
    )
    nm.deleteNotificationChannel(CHANNEL_INCOMING_OLD)
    val ringtone = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_INCOMING, "Incoming calls", NotificationManager.IMPORTANCE_HIGH).apply {
        setShowBadge(false)
        setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), ringtone)
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 1000, 1000)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }
    )
  }

  private fun smallIcon(context: Context): Int {
    val name = SipVoiceCallManager.config.notificationIcon
    if (name != null) {
      val id = context.resources.getIdentifier(name, "drawable", context.packageName)
      if (id != 0) return id
    }
    return context.applicationInfo.icon.takeIf { it != 0 } ?: android.R.drawable.sym_call_outgoing
  }

  private fun launchIntent(context: Context): PendingIntent? {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
    } ?: return null
    return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun actionIntent(context: Context, action: String, callId: String, requestCode: Int): PendingIntent {
    val intent = Intent(context, SipVoiceActionReceiver::class.java).setAction(action).putExtra(EXTRA_CALL_ID, callId)
    return PendingIntent.getBroadcast(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  fun buildOngoing(context: Context, record: CallRecord): Notification {
    ensureChannels(context, SipVoiceCallManager.config)
    val person = Person.Builder().setName(record.displayName.ifBlank { record.handle }).setImportant(true).build()
    val hangup = actionIntent(context, ACTION_HANGUP, record.callId, record.callId.hashCode())
    val status = when {
      record.held -> "On hold"
      record.connectedAt != null -> "Ongoing call"
      else -> "Calling…"
    }
    val builder = NotificationCompat.Builder(context, CHANNEL_ONGOING)
      .setSmallIcon(smallIcon(context))
      .setContentTitle(record.displayName.ifBlank { record.handle })
      .setContentText(status)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setContentIntent(launchIntent(context))
      .setStyle(NotificationCompat.CallStyle.forOngoingCall(person, hangup))
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
    record.connectedAt?.let {
      builder.setWhen(it).setUsesChronometer(true).setShowWhen(true)
    }
    return builder.build()
  }

  fun showIncoming(context: Context, record: CallRecord) {
    ensureChannels(context, SipVoiceCallManager.config)
    val person = Person.Builder().setName(record.displayName.ifBlank { record.handle }).setImportant(true).build()
    val decline = actionIntent(context, ACTION_HANGUP, record.callId, record.callId.hashCode())
    // Answer opens an activity directly: Android 12+ blocks a broadcast receiver from opening the app
    // ("notification trampoline"), which left the call answered but the app in the background.
    val answer = PendingIntent.getActivity(
      context, record.callId.hashCode() + 1, SipVoiceIncomingCallActivity.answerIntent(context, record.callId),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    // The screen starts a closed app underneath itself, so the app boots, registers and receives the call while
    // the phone is still ringing: Answer then connects at once (see SipVoiceCallManager.startAppUnder).
    val incomingScreen = PendingIntent.getActivity(context, record.callId.hashCode() + 2,
      SipVoiceIncomingCallActivity.intent(context, record.callId).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val notification = NotificationCompat.Builder(context, CHANNEL_INCOMING)
      .setSmallIcon(smallIcon(context))
      .setContentTitle(record.displayName.ifBlank { record.handle })
      .setContentText("Incoming call")
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setOngoing(true)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)) // before Android 8 (no channels)
      .setContentIntent(incomingScreen) // tapping the heads-up opens the same screen
      .setFullScreenIntent(incomingScreen, true) // locked or screen off: shown straight away
      .setStyle(NotificationCompat.CallStyle.forIncomingCall(person, decline, answer))
      .build()
      .apply { flags = flags or Notification.FLAG_INSISTENT } // ring and vibrate until answered, declined or ended
    try {
      NotificationManagerCompat.from(context).notify(INCOMING_BASE_ID + (record.callId.hashCode() and 0xff), notification)
    } catch (e: SecurityException) {
      // POST_NOTIFICATIONS not granted.
    }
  }

  fun cancelIncoming(context: Context, callId: String) {
    NotificationManagerCompat.from(context).cancel(INCOMING_BASE_ID + (callId.hashCode() and 0xff))
  }
}

/** Handles the Hang up / Answer buttons on call notifications. */
class SipVoiceActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    SipVoiceCallManager.init(context.applicationContext)
    val callId = intent.getStringExtra(SipVoiceNotifications.EXTRA_CALL_ID) ?: return
    when (intent.action) {
      SipVoiceNotifications.ACTION_HANGUP -> SipVoiceCallManager.onSystemEnd(callId)
      SipVoiceNotifications.ACTION_ANSWER -> SipVoiceCallManager.answerFromSystem(context, callId)
    }
  }
}
