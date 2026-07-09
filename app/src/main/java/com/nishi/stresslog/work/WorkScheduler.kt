package com.nishi.stresslog.work

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * 定期サンプリングの起動口。設定変更時（サンプリング間隔変更）にも呼び直す。
 * WorkManager の PeriodicWork は最短15分間隔という制約があるため、
 * 15分未満が指定された場合は15分に丸める。
 */
object WorkScheduler {

    fun schedule(context: Context, intervalMinutes: Int) {
        val interval = intervalMinutes.coerceAtLeast(15)
        val request = PeriodicWorkRequestBuilder<StressSamplingWorker>(
            interval.toLong(), TimeUnit.MINUTES
        ).build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            StressSamplingWorker.WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        )
    }
}
