package com.nishi.stresslog.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/** 定期サンプリングで記録される、算出済みのストレス値1点分 */
@Entity(tableName = "stress_readings")
data class StressReading(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val timestamp: Long,
    val stressScore: Int,
    val hrvRmssd: Double?,
    val heartRate: Int?,
    val baselineHrv: Double?,
    val source: String
)
