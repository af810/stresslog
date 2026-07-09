package com.nishi.stresslog.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

/** 日別集計の1行（Trend画面の週/月グラフ用） */
data class DailyStressAggregate(
    val dayStart: Long,
    val avgScore: Double,
    val maxScore: Int
)

@Dao
interface StressReadingDao {

    @Insert
    suspend fun insert(reading: StressReading): Long

    @Query("SELECT * FROM stress_readings ORDER BY timestamp DESC LIMIT 1")
    fun observeLatest(): Flow<StressReading?>

    @Query("SELECT * FROM stress_readings WHERE timestamp BETWEEN :from AND :to ORDER BY timestamp ASC")
    fun observeInRange(from: Long, to: Long): Flow<List<StressReading>>

    @Query("SELECT * FROM stress_readings WHERE timestamp BETWEEN :from AND :to ORDER BY timestamp ASC")
    suspend fun getInRange(from: Long, to: Long): List<StressReading>

    /**
     * 日別（ローカルの1日粒度）の平均・最大スコアを集計する。
     * timestamp は epoch millis、dayStart は同じくその日の 00:00 の epoch millis（呼び出し側で日境界を渡す方式ではなく、
     * SQLite の時刻関数でUTCベースに丸める簡易実装。厳密なタイムゾーン処理はRepository側で補正する）。
     */
    @Query(
        """
        SELECT
            (timestamp / 86400000) * 86400000 AS dayStart,
            AVG(stressScore) AS avgScore,
            MAX(stressScore) AS maxScore
        FROM stress_readings
        WHERE timestamp BETWEEN :from AND :to
        GROUP BY dayStart
        ORDER BY dayStart ASC
        """
    )
    suspend fun getDailyAggregates(from: Long, to: Long): List<DailyStressAggregate>

    @Query("DELETE FROM stress_readings WHERE timestamp < :before")
    suspend fun deleteOlderThan(before: Long)
}
