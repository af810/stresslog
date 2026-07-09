package com.nishi.stresslog.work

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.nishi.stresslog.MainActivity
import com.nishi.stresslog.StressLogApp
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject

class StressNotifier @Inject constructor(
    @ApplicationContext private val context: Context
) {
    fun notifyStressAlert(score: Int, suggestion: String) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, StressLogApp.CHANNEL_STRESS_ALERTS)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("ストレス値が高まっています（$score）")
            .setContentText(suggestion)
            .setStyle(NotificationCompat.BigTextStyle().bigText(suggestion))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        runCatching {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
        }
    }

    companion object {
        private const val NOTIFICATION_ID = 1001
    }
}
