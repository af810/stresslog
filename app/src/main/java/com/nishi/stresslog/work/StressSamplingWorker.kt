package com.nishi.stresslog.work

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.nishi.stresslog.data.repository.StressRepository
import com.nishi.stresslog.data.repository.SettingsRepository
import com.nishi.stresslog.domain.SuggestionEngine
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.flow.first

/**
 * 定期的にデータ源からサンプルを取得し、ストレス値を算出・記録する。
 * 閾値を超えていればストレス瞬間として自動記録し、通知する。
 */
@HiltWorker
class StressSamplingWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val repository: StressRepository,
    private val settingsRepository: SettingsRepository,
    private val suggestionEngine: SuggestionEngine,
    private val notifier: StressNotifier
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        return try {
            val settings = settingsRepository.settings.first()
            val result = repository.sampleOnce()
            val reading = result.reading

            if (reading.stressScore >= settings.stressThreshold) {
                val lastAuto = repository.getLastAutoMomentTime()
                val cooldownMs = settings.notificationCooldownMinutes * 60_000L
                val cooledDown = lastAuto == null || (reading.timestamp - lastAuto) >= cooldownMs

                if (cooledDown) {
                    val suggestion = suggestionEngine.suggest(reading.stressScore, reading.timestamp)
                    repository.recordAutoMoment(reading, suggestion)
                    if (settings.notificationsEnabled) {
                        notifier.notifyStressAlert(reading.stressScore, suggestion)
                    }
                }
            }
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    companion object {
        const val WORK_NAME = "stress_sampling_periodic"
    }
}
