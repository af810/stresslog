package com.nishi.stresslog.data.repository

import com.nishi.stresslog.data.local.Baseline
import com.nishi.stresslog.data.local.BaselineDao
import com.nishi.stresslog.data.local.DailyStressAggregate
import com.nishi.stresslog.data.local.StressMoment
import com.nishi.stresslog.data.local.StressMomentDao
import com.nishi.stresslog.data.local.StressReading
import com.nishi.stresslog.data.local.StressReadingDao
import com.nishi.stresslog.data.local.TriggerType
import com.nishi.stresslog.data.source.StressDataSource
import com.nishi.stresslog.domain.BaselineTracker
import com.nishi.stresslog.domain.StressCalculator
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject
import javax.inject.Singleton

data class SampleResult(
    val reading: StressReading,
    val baseline: Baseline
)

/**
 * データ層への単一の窓口。UI/Worker はこの Repository のみを介して
 * ストレスデータ（サンプリング・記録・集計）にアクセスする。
 */
@Singleton
class StressRepository @Inject constructor(
    private val readingDao: StressReadingDao,
    private val momentDao: StressMomentDao,
    private val baselineDao: BaselineDao,
    private val dataSource: StressDataSource,
    private val calculator: StressCalculator,
    private val baselineTracker: BaselineTracker
) {
    // ---- Readings ----

    fun observeLatestReading(): Flow<StressReading?> = readingDao.observeLatest()

    fun observeReadingsInRange(from: Long, to: Long): Flow<List<StressReading>> =
        readingDao.observeInRange(from, to)

    suspend fun getReadingsInRange(from: Long, to: Long): List<StressReading> =
        readingDao.getInRange(from, to)

    suspend fun getDailyAggregates(from: Long, to: Long): List<DailyStressAggregate> =
        readingDao.getDailyAggregates(from, to)

    /** データ源から1点取得し、ベースライン更新→スコア算出→記録までの一連の処理を行う */
    suspend fun sampleOnce(): SampleResult {
        val sample = dataSource.readLatestSample()
        val baseline = baselineTracker.update(sample.hrvRmssd, sample.heartRate)
        val score = calculator.calculate(sample.hrvRmssd, sample.heartRate, baseline)

        val reading = StressReading(
            timestamp = sample.timestamp,
            stressScore = score,
            hrvRmssd = sample.hrvRmssd,
            heartRate = sample.heartRate,
            baselineHrv = baseline.meanHrv,
            source = dataSource.sourceId
        )
        val id = readingDao.insert(reading)
        return SampleResult(reading.copy(id = id), baseline)
    }

    // ---- Baseline ----

    fun observeBaseline(): Flow<Baseline?> = baselineDao.observe()

    // ---- Moments ----

    fun observeMoments(): Flow<List<StressMoment>> = momentDao.observeAll()

    suspend fun getMoment(id: Long): StressMoment? = momentDao.getById(id)

    suspend fun getMomentsInRange(from: Long, to: Long): List<StressMoment> =
        momentDao.getInRange(from, to)

    suspend fun getLastAutoMomentTime(): Long? = momentDao.getLastAutoMomentTime()

    suspend fun recordManualMoment(
        score: Int,
        note: String?,
        tags: List<String>,
        currentHr: Int?
    ): Long = momentDao.insert(
        StressMoment(
            timestamp = System.currentTimeMillis(),
            stressScore = score,
            trigger = TriggerType.MANUAL,
            note = note,
            tags = tags,
            hrBefore = currentHr
        )
    )

    suspend fun recordAutoMoment(
        reading: StressReading,
        appliedSuggestion: String?
    ): Long = momentDao.insert(
        StressMoment(
            timestamp = reading.timestamp,
            stressScore = reading.stressScore,
            trigger = TriggerType.AUTO,
            hrBefore = reading.heartRate,
            appliedSuggestion = appliedSuggestion
        )
    )

    suspend fun updateMoment(moment: StressMoment) = momentDao.update(moment)
}
