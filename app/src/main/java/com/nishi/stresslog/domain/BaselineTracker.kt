package com.nishi.stresslog.domain

import com.nishi.stresslog.data.local.Baseline
import com.nishi.stresslog.data.local.BaselineDao
import javax.inject.Inject
import kotlin.math.sqrt

/**
 * 個人のHRV/心拍ベースラインを指数移動平均でオンライン更新する。
 * 体調・季節変化に追従しつつ、単発の外れ値に過敏に反応しないようにする。
 */
class BaselineTracker @Inject constructor(
    private val baselineDao: BaselineDao
) {
    /** 新しいサンプルでベースラインを更新し、更新後の値を返す */
    suspend fun update(hrvRmssd: Double, heartRate: Int): Baseline {
        val current = baselineDao.get() ?: Baseline.initial()

        // サンプル数が少ないうちは学習を速く（アルファを大きく）、
        // 十分溜まったら安定させる（アルファを小さく）
        val alpha = adaptiveAlpha(current.sampleCount)

        val newMean = current.meanHrv + alpha * (hrvRmssd - current.meanHrv)
        val diff = hrvRmssd - newMean
        val newVariance = (1 - alpha) * (current.stdHrv * current.stdHrv + alpha * diff * diff)
        val newStd = sqrt(newVariance).let { if (it.isFinite() && it > 0) it else current.stdHrv }

        val newMeanHr = current.meanRestingHr + alpha * (heartRate - current.meanRestingHr)

        val updated = current.copy(
            meanHrv = newMean,
            stdHrv = newStd,
            meanRestingHr = newMeanHr,
            sampleCount = current.sampleCount + 1,
            updatedAt = System.currentTimeMillis()
        )
        baselineDao.upsert(updated)
        return updated
    }

    private fun adaptiveAlpha(sampleCount: Int): Double = when {
        sampleCount < 20 -> 0.2
        sampleCount < 100 -> 0.05
        else -> 0.02
    }
}
